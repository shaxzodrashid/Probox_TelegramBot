# SAP `getItems` Use Case

## Purpose

`SapService.getItems()` is the repository-facing query builder used to search SAP Business One inventory in SAP HANA and return a paginated list of available items together with a total count.

The method lives in [src/sap/sap-hana.service.ts](D:/Shakhzod/Javascript/Probox_TelegramBot/src/sap/sap-hana.service.ts) and is currently consumed directly by:

- [src/services/support-item-availability.service.ts](D:/Shakhzod/Javascript/Probox_TelegramBot/src/services/support-item-availability.service.ts)
- [src/scripts/check-items.ts](D:/Shakhzod/Javascript/Probox_TelegramBot/src/scripts/check-items.ts)

In practice, the main business flow is item availability lookup for support or assistant-style queries.

## Main Flow

1. A caller provides a free-text query plus optional filters such as `storeName`, `whsCode`, `model`, `memory`, `condition`, and pagination.
2. `getItems()` normalizes and interprets that input before building SQL.
3. The method decides whether the search should behave like:
   - a structured product search, such as `iphone 16 pro max 256 black`
   - a generic keyword search, such as `galaxy s24`
   - an IMEI search, when the search text is numeric and at least 4 digits long
4. It builds two SQL statements:
   - a data query returning item rows
   - a count query returning the total number of matching groups
5. Both queries are executed in parallel through `HanaService.executeOnce()`.
6. The method returns `{ data, total }`.

## Inputs

`getItems()` accepts:

```ts
{
  search?: string;
  filters?: Record<string, string | number | boolean | undefined>;
  limit?: number;
  offset?: number;
  whsCode?: string;
  storeName?: string;
  includeZeroOnHand?: boolean;
  groupByWarehouse?: boolean;
}
```

### Important parameters

- `search`: free-text search string
- `filters.model`: exact normalized match against `U_Model`
- `filters.deviceType`: supports aliases like `pro-max`, `standard`, `regular`, `-`
- `filters.condition`: supports aliases like `new`, `used`, `bu`, `b/u`
- `whsCode`: exact warehouse code filter
- `storeName`: normalized `LIKE` match on warehouse name
- `includeZeroOnHand`: defaults to `false`, so only in-stock rows are returned
- `groupByWarehouse`: when `true`, item totals are split by warehouse; otherwise they are aggregated across warehouses

## Search Interpretation Rules

### 1. Structured iPhone parsing

The service attempts to extract structured intent from the search string:

- model, for example `iphone 16`
- device type, for example `Pro` or `Pro Max`
- condition, for example `Yangi` or `B/U`
- residual descriptors, for example `256 black`

Example:

- input: `iphone 16 pro max 256 black`
- interpreted as:
  - `U_Model = iphone 16`
  - `U_DeviceType = pro max`
  - residual text search for `256 black`

If the query is `iphone 17` with no device type, the code intentionally treats it as the base variant and applies a blank-device-type clause:

- `U_DeviceType IS NULL`
- or empty string
- or `-`

### 2. Condition normalization

Condition aliases are normalized before building SQL.

- `new` or `yangi` becomes `Yangi`
- `used`, `bu`, or `b/u` becomes `B/U`

This applies both to the search text and to `filters.condition`.

### 3. Device type normalization

Device type aliases are normalized before SQL is built.

- `pro-max` or `promax` becomes `Pro Max`
- `pro` becomes `Pro`
- `standard`, `regular`, `base`, `none`, `null`, or `-` become the blank/base variant

### 4. Generic keyword fallback

If the search is not recognized as a structured iPhone query, the service falls back to a broad keyword search across:

- `ItemCode`
- `ItemName`
- `U_Model`
- `U_DeviceType`
- `U_Memory`
- `U_Color`
- `U_Sim_type`
- `U_PROD_CONDITION`

### 5. IMEI mode

If `search` is numeric and at least 4 digits long, the method switches to IMEI mode.

In IMEI mode it joins:

- `OSRN` for serial numbers
- `OSRQ` for serial quantities by warehouse

And applies additional rules:

- `R."DistNumber" LIKE '%search%'`
- `Q."Quantity" > 0`
- optional warehouse restriction on `Q."WhsCode"`
- grouping and counting by IMEI instead of by item

This mode also includes:

- `IMEI` in the select list
- `PurchasePrice` from `R."CostTotal"`

## SQL Shape

The base query always starts from SAP inventory and item metadata tables:

- `OITW` as inventory by warehouse
- `OITM` as item master
- `OWHS` as warehouse metadata
- `OITB` as item group metadata
- `ITM1` as sales price list

The method builds:

- a dynamic `WHERE` clause
- an optional IMEI join block
- an order-by strategy tailored to the search type

## Ranking and Sorting

The ordering is designed to surface the most relevant results first.

### Structured searches

For structured searches, the ranking prefers:

1. exact `U_Model` match
2. exact `U_DeviceType` match, when present
3. exact normalized condition match, when present
4. higher stock
5. higher sale price, except in IMEI mode
6. alphabetical item name

### Generic searches

For generic searches, the ranking prefers:

1. exact item code match
2. exact model match
3. item names containing the search text
4. default condition ordering:
   - `Yangi` first
   - `B/U` second
   - everything else last
5. higher stock
6. higher sale price
7. alphabetical item name

## Output Contract

The method returns:

```ts
Promise<{ data: ISapItem[]; total: number }>
```

Each row can include:

- item identity: `ItemCode`, `ItemName`
- warehouse context: `WhsCode`, `WhsName`
- stock: `OnHand`
- grouping metadata: `ItemGroupCode`, `ItemGroupName`
- device descriptors: `U_Model`, `U_DeviceType`, `U_Memory`, `U_Color`, `U_Sim_type`
- condition: `U_PROD_CONDITION` and legacy `U_Condition`
- pricing: `SalePrice`
- IMEI-mode fields: `IMEI`, `PurchasePrice`

## Real Business Use Case

The most important use case today is [src/services/support-item-availability.service.ts](D:/Shakhzod/Javascript/Probox_TelegramBot/src/services/support-item-availability.service.ts).

That service:

1. accepts a user-facing product query and optional store name
2. calls `sapService.getItems()` with:
   - `search = query`
   - `storeName = store`
   - `includeZeroOnHand = false`
   - `groupByWarehouse = true`
   - `limit` capped to a small support-friendly value
3. maps SAP rows into an API-friendly support response
4. sorts returned matches by `on_hand` descending for the final payload

This means `getItems()` is the core inventory retrieval layer, while `SupportItemAvailabilityService` is the presentation layer for support workflows.

## Failure Handling

If either HANA query fails:

- the original error is logged
- the method throws a stable application-level error:

```ts
new Error('SAP query failed (getItems)');
```

This gives callers a predictable failure contract without leaking raw SAP driver details.

## Test Coverage

Dedicated tests for this use case now live in:

- [src/sap/sap-hana.get-items.spec.ts](D:/Shakhzod/Javascript/Probox_TelegramBot/src/sap/sap-hana.get-items.spec.ts)

That spec covers:

- structured iPhone query parsing
- device type and condition normalization
- generic fallback search
- IMEI mode
- pagination and warehouse grouping
- zero-stock inclusion behavior
- escaping of quotes and `LIKE` wildcards
- total parsing
- stable error wrapping
