WITH recent_payment_keys AS (
  SELECT
    T1."baseAbs",
    T1."InstId"
  FROM "{{schema}}"."ORCT" T0
  JOIN "{{schema}}"."RCT2" T1 ON T0."DocEntry" = T1."DocNum"
  WHERE T1."InvType" = 13
    AND T0."Canceled" = 'N'
    AND T0."DocDate" BETWEEN ? AND ?
  GROUP BY T1."baseAbs", T1."InstId"
),
candidate_installments AS (
  SELECT
    OINV."DocEntry" AS "DocEntry",
    OINV."DocNum" AS "DocNum",
    OINV."CardCode" AS "CardCode",
    OINV."CardName" AS "CardName",
    BP."Phone1" AS "Phone1",
    BP."Phone2" AS "Phone2",
    BP."Cellular" AS "Cellular",
    OINV."DocDate" AS "DocDate",
    OINV."DocDueDate" AS "DocDueDate",
    OINV."DocCur" AS "DocCur",
    OINV."DocTotal" AS "Total",
    OINV."PaidToDate" AS "TotalPaid",
    INV6."InstlmntID" AS "InstlmntID",
    INV6."DueDate" AS "InstDueDate",
    INV6."InsTotal" AS "InstTotal",
    INV6."PaidToDate" AS "InstPaidToDate",
    INV6."Status" AS "InstStatus"
  FROM "{{schema}}"."OINV" OINV
  INNER JOIN "{{schema}}"."INV6" INV6 ON INV6."DocEntry" = OINV."DocEntry"
  INNER JOIN "{{schema}}"."OCRD" BP ON BP."CardCode" = OINV."CardCode"
  LEFT JOIN recent_payment_keys
    ON recent_payment_keys."baseAbs" = OINV."DocEntry"
   AND recent_payment_keys."InstId" = INV6."InstlmntID"
  WHERE OINV."CANCELED" = 'N'
    AND BP."CardType" = 'C'
    AND (
      INV6."DueDate" BETWEEN ? AND ?
      OR recent_payment_keys."baseAbs" IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "{{schema}}"."RIN1" CM1
      INNER JOIN "{{schema}}"."ORIN" CM0 ON CM0."DocEntry" = CM1."DocEntry"
      WHERE CM1."BaseType" = 13
        AND CM1."BaseEntry" = OINV."DocEntry"
    )
),
payment_applications AS (
  SELECT
    T1."baseAbs",
    T1."InstId",
    T0."DocEntry" AS "PaymentDocEntry",
    T0."DocDate",
    T1."SumApplied"
  FROM "{{schema}}"."ORCT" T0
  JOIN "{{schema}}"."RCT2" T1 ON T0."DocEntry" = T1."DocNum"
  INNER JOIN candidate_installments
    ON candidate_installments."DocEntry" = T1."baseAbs"
   AND candidate_installments."InstlmntID" = T1."InstId"
  WHERE T1."InvType" = 13
    AND T0."Canceled" = 'N'
    AND T0."DocDate" <= ?
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
  INNER JOIN candidate_installments
    ON candidate_installments."DocEntry" = payment_progress."baseAbs"
   AND candidate_installments."InstlmntID" = payment_progress."InstId"
  WHERE payment_progress."CumulativePaid" >= candidate_installments."InstTotal"
  GROUP BY payment_progress."baseAbs", payment_progress."InstId"
)
SELECT
  candidate_installments."DocEntry",
  candidate_installments."DocNum",
  candidate_installments."CardCode",
  candidate_installments."CardName",
  candidate_installments."Phone1",
  candidate_installments."Phone2",
  candidate_installments."Cellular",
  candidate_installments."DocDate",
  candidate_installments."DocDueDate",
  candidate_installments."DocCur",
  candidate_installments."Total",
  candidate_installments."TotalPaid",
  candidate_installments."InstlmntID",
  candidate_installments."InstDueDate",
  candidate_installments."InstTotal",
  candidate_installments."InstPaidToDate",
  candidate_installments."InstStatus",
  payment_dates."FullyPaidDate" AS "InstFullyPaidDate",
  COALESCE(items."itemsPairs", '') AS "itemsPairs"
FROM candidate_installments
LEFT JOIN payment_dates
  ON payment_dates."baseAbs" = candidate_installments."DocEntry"
 AND payment_dates."InstId" = candidate_installments."InstlmntID"
LEFT JOIN (
  SELECT
    INV1."DocEntry",
    STRING_AGG(
      INV1."ItemCode" || '::' || INV1."Dscription" || '::' || TO_NVARCHAR(INV1."Price"),
      '||'
    ) AS "itemsPairs"
  FROM "{{schema}}"."INV1" INV1
  WHERE INV1."DocEntry" IN (SELECT "DocEntry" FROM candidate_installments)
  GROUP BY INV1."DocEntry"
) items ON items."DocEntry" = candidate_installments."DocEntry"
ORDER BY candidate_installments."DocEntry" DESC, candidate_installments."InstlmntID" ASC;
