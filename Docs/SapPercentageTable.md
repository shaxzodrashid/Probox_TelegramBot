# SAP `@PERCENTAGE` Table

## Purpose

`PROBOX_PROD_3."@PERCENTAGE"` is an SAP Business One user-defined table that stores a month-to-percentage schedule.

The table appears to define percentages for installment or finance periods. Each row maps one month number to one percentage value.

This table is not currently referenced by the bot codebase. A search across `src`, `Docs`, and `README.md` found no usage of:

- `@PERCENTAGE`
- `Percentage`
- `U_month`
- `U_percentage`

## SAP Metadata

The table is registered in SAP Business One as a user-defined table and UDO.

| Property | Value |
| --- | --- |
| Physical table | `PROBOX_PROD_3."@PERCENTAGE"` |
| SAP UDT name | `PERCENTAGE` |
| SAP UDT description | `Percentage` |
| UDO code | `Percentage` |
| UDO name | `Foiz` |
| Main object/table | `PERCENTAGE` |
| Row object value | `Percentage` |
| HANA table type | Column table |
| HANA created at | `2025-10-23 15:35:33` |

The SAP UDO form exposes these fields:

- `Code`
- `U_month`, caption `Oy`
- `U_percentage`, caption `Foiz`

## Schema

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `Code` | `NVARCHAR(50)` | No | - | Primary key |
| `Name` | `NVARCHAR(100)` | Yes | - | Currently null in all rows |
| `DocEntry` | `INTEGER` | No | - | Unique SAP document entry |
| `Canceled` | `NVARCHAR(1)` | Yes | `N` | All discovered rows are active |
| `Object` | `NVARCHAR(20)` | Yes | - | Value is `Percentage` |
| `LogInst` | `INTEGER` | Yes | - | SAP log instance field |
| `UserSign` | `INTEGER` | Yes | - | All rows were signed by user id `1` |
| `Transfered` | `NVARCHAR(1)` | Yes | `N` | SAP transfer flag |
| `CreateDate` | `TIMESTAMP` | Yes | - | Row creation date |
| `CreateTime` | `SMALLINT` | Yes | - | Row creation time in SAP time format |
| `UpdateDate` | `TIMESTAMP` | Yes | - | Row update date |
| `UpdateTime` | `SMALLINT` | Yes | - | Row update time in SAP time format |
| `DataSource` | `NVARCHAR(1)` | Yes | - | Current rows use `I` |
| `U_month` | `NVARCHAR(10)` | Yes | - | User field `month`, description `Oy` |
| `U_percentage` | `NVARCHAR(10)` | Yes | - | User field `percentage`, description `Foiz` |

### User Fields

SAP field metadata from `CUFD`:

| Field | Alias | Description | Type | Size | Required |
| --- | --- | --- | --- | --- | --- |
| `U_month` | `month` | `Oy` | Alphanumeric | `10` | No |
| `U_percentage` | `percentage` | `Foiz` | Alphanumeric | `10` | No |

There are no valid-value list entries for these fields in `UFD1`.

## Keys And Constraints

| Constraint | Column | Type |
| --- | --- | --- |
| `_SYS_TREE_CS_#2520012_#0_#P0` | `Code` | Primary key, unique |
| `KPERCENTAGE_IK` | `DocEntry` | Unique key |

No foreign keys were found for this table.

No HANA object dependencies were found referencing this table.

## Current Data

The table currently contains 15 rows.

| Month | Percentage |
| ---: | ---: |
| 1 | 5 |
| 2 | 10 |
| 3 | 17 |
| 4 | 25 |
| 5 | 35 |
| 6 | 38 |
| 7 | 43 |
| 8 | 47 |
| 9 | 50 |
| 10 | 55 |
| 11 | 58 |
| 12 | 63 |
| 13 | 65 |
| 14 | 68 |
| 15 | 70 |

All rows:

- have `Canceled = 'N'`
- have `Object = 'Percentage'`
- have `DataSource = 'I'`
- have `UserSign = 1`
- were created on `2025-10-23`
- were last updated on `2025-10-23`

`UserSign = 1` maps to SAP user:

| UserSign | USER_CODE | U_NAME |
| ---: | --- | --- |
| 1 | `manager` | `manager` |

## Data Quality Notes

- `U_month` and `U_percentage` are stored as strings, even though their values are numeric.
- Always cast these columns before sorting or doing numeric comparisons.
- `U_month` has 15 distinct values and no duplicates.
- `U_percentage` has 15 distinct values.
- `Name` is null in all rows.
- `DocEntry` skips `11`: `Code = 11` has `DocEntry = 12`. This can happen if a SAP record was deleted/recreated or if SAP numbering advanced. It is not necessarily an error.
- No canceled rows were found.

## Recommended Query

Use this query when reading the schedule from SAP:

```sql
SELECT
  CAST("U_month" AS INTEGER) AS "month",
  CAST("U_percentage" AS DECIMAL(18, 4)) AS "percentage"
FROM "PROBOX_PROD_3"."@PERCENTAGE"
WHERE COALESCE("Canceled", 'N') = 'N'
ORDER BY CAST("U_month" AS INTEGER);
```

If this is added to `SapService`, keep the schema configurable:

```ts
const sql = `
  SELECT
    CAST("U_month" AS INTEGER) AS "month",
    CAST("U_percentage" AS DECIMAL(18, 4)) AS "percentage"
  FROM ${schema}."@PERCENTAGE"
  WHERE COALESCE("Canceled", 'N') = 'N'
  ORDER BY CAST("U_month" AS INTEGER)
`;
```

## Possible TypeScript Shape

```ts
export interface SapPercentageScheduleRow {
  month: number;
  percentage: number;
}
```

## Integration Notes

If the bot needs to use this table, add a small method to [src/sap/sap-hana.service.ts](D:/Shakhzod/Javascript/Probox_TelegramBot/src/sap/sap-hana.service.ts), for example:

```ts
async getPercentageSchedule(): Promise<SapPercentageScheduleRow[]> {
  const sql = `
    SELECT
      CAST("U_month" AS INTEGER) AS "month",
      CAST("U_percentage" AS DECIMAL(18, 4)) AS "percentage"
    FROM ${this.schema}."@PERCENTAGE"
    WHERE COALESCE("Canceled", 'N') = 'N'
    ORDER BY CAST("U_month" AS INTEGER)
  `;

  const rows = await this.hana.executeOnce<{ month: number | string; percentage: number | string }>(sql);

  return rows.map((row) => ({
    month: Number(row.month),
    percentage: Number(row.percentage),
  }));
}
```

Because this is a small reference table, callers can usually cache it for a short time if it becomes part of a high-traffic flow.

## Exploration Date

Explored on `2026-04-29` using the configured SAP HANA connection for schema `PROBOX_PROD_3`.
