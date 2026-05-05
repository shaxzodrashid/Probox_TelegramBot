WITH base_bp AS (
  SELECT
    NULLIF(TRIM(BP."U_jshshir"), '') AS "U_jshshir",
    NULLIF(TRIM(BP."Cellular"), '')  AS "Cellular"
  FROM {{schema}}."OCRD" BP
  WHERE BP."CardCode" = ?
  LIMIT 1
),
bp_codes AS (
  SELECT BP2."CardCode"
  FROM {{schema}}."OCRD" BP2
  CROSS JOIN base_bp B
  WHERE B."U_jshshir" IS NOT NULL
    AND TRIM(BP2."U_jshshir") = B."U_jshshir"

  UNION

  SELECT BP3."CardCode"
  FROM {{schema}}."OCRD" BP3
  CROSS JOIN base_bp B
  WHERE B."U_jshshir" IS NULL
    AND B."Cellular" IS NOT NULL
    AND TRIM(BP3."Cellular") = B."Cellular"
),

inv_base AS (
  SELECT
    I."DocEntry",
    I."DocNum",
    I."CardCode",
    I."CardName",
    I."DocDate",
    I."DocDueDate",
    I."DocCur",
    I."DocRate",
    I."DocTotal",
    I."DocTotalFC",
    I."PaidToDate",
    I."PaidFC",
    I."CANCELED"
  FROM {{schema}}."OINV" I
  WHERE I."CANCELED" = 'N'
    AND I."CardCode" IN (SELECT "CardCode" FROM bp_codes)
    AND NOT EXISTS (
      SELECT 1
      FROM {{schema}}."RIN1" CM1
      INNER JOIN {{schema}}."ORIN" CM0
        ON CM0."DocEntry" = CM1."DocEntry"
      WHERE CM1."BaseType"  = 13
        AND CM1."BaseEntry" = I."DocEntry"
    )
),

items_by_invoice AS (
  SELECT
    L."DocEntry",
    SUM(L."Quantity") AS "itemsQty",
    /* DISTINCT kerak bo‘lsa: avval DISTINCT qilib keyin STRING_AGG */
    (
      SELECT STRING_AGG(X."pair", '||')
      FROM (
        SELECT DISTINCT
          IFNULL(L2."ItemCode", '') || '::' ||
          IFNULL(L2."Dscription", '') || '::' ||
          L2."Price" AS "pair"  
        FROM {{schema}}."INV1" L2 INNER JOIN {{schema}}."OITM" I
          ON I."ItemCode" = L2."ItemCode"
          JOIN {{schema}}."OITB" B ON B."ItmsGrpCod" = I."ItmsGrpCod"
        WHERE L2."DocEntry" = L."DocEntry"
      ) X
    ) AS "itemsPairs"
  FROM {{schema}}."INV1" L
  GROUP BY L."DocEntry"
),

payment_applications AS (
  SELECT
    T1."baseAbs",
    T1."InstId",
    T0."DocEntry" AS "PaymentDocEntry",
    T0."DocDate",
    T1."SumApplied"
  FROM {{schema}}."ORCT" T0
  JOIN {{schema}}."RCT2" T1 ON T0."DocEntry" = T1."DocNum"
  JOIN inv_base B ON B."DocEntry" = T1."baseAbs"
  JOIN {{schema}}."INV6" S
    ON S."DocEntry" = T1."baseAbs"
   AND S."InstlmntID" = T1."InstId"
  WHERE T1."InvType" = 13
    AND T0."Canceled" = 'N'
),

payment_progress AS (
  SELECT
    payment_applications."baseAbs",
    payment_applications."InstId",
    payment_applications."PaymentDocEntry",
    payment_applications."DocDate",
    SUM(payment_applications."SumApplied") OVER (
      PARTITION BY payment_applications."baseAbs", payment_applications."InstId"
      ORDER BY payment_applications."DocDate", payment_applications."PaymentDocEntry"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS "CumulativePaid"
  FROM payment_applications
),

payment_dates AS (
  SELECT
    payment_progress."baseAbs",
    payment_progress."InstId",
    MIN(payment_progress."DocDate") AS "FullyPaidDate"
  FROM payment_progress
  JOIN {{schema}}."INV6" S
    ON S."DocEntry" = payment_progress."baseAbs"
   AND S."InstlmntID" = payment_progress."InstId"
  WHERE payment_progress."CumulativePaid" >= S."InsTotal"
  GROUP BY payment_progress."baseAbs", payment_progress."InstId"
)

SELECT
  B."DocEntry",
  B."DocNum",
  B."CardCode",
  B."CardName",
  B."DocDate",
  B."DocDueDate",
  B."DocCur",
  B."DocTotal"    AS "DocTotal",
  B."DocTotalFC"  AS "DocTotalFC",
  B."DocTotal"    AS "Total",
  B."DocCur"      AS "TotalCurrency",
  B."PaidToDate"  AS "TotalPaid",
  B."DocCur"      AS "TotalPaidCurrency",

  -- Installment info (INV6)
  S."InstlmntID",
  S."DueDate"     AS "InstDueDate",
  S."InsTotal"    AS "InstTotal",
  B."DocCur"      AS "InstCurrency",

  S."PaidToDate"  AS "InstPaidToDate",
  S."Status"      AS "InstStatus",
  PAY."FullyPaidDate" AS "InstFullyPaidDate",

  I."itemsPairs"

FROM inv_base B
JOIN {{schema}}."INV6" S
  ON S."DocEntry" = B."DocEntry"
LEFT JOIN payment_dates PAY
  ON PAY."baseAbs" = B."DocEntry"
 AND PAY."InstId" = S."InstlmntID"
LEFT JOIN items_by_invoice I
  ON I."DocEntry" = B."DocEntry"

ORDER BY
  B."DocEntry",
  S."InstlmntID";
