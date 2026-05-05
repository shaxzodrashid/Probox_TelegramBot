WITH installment_scope AS (
  SELECT
    OINV."DocEntry",
    INV6."InstlmntID",
    INV6."InsTotal"
  FROM "{{schema}}"."OINV" OINV
  INNER JOIN "{{schema}}"."INV6" INV6 ON INV6."DocEntry" = OINV."DocEntry"
  WHERE OINV."CardCode" IN ({{cardCodes}})
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
  INNER JOIN installment_scope
    ON installment_scope."DocEntry" = T1."baseAbs"
   AND installment_scope."InstlmntID" = T1."InstId"
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
  INNER JOIN installment_scope
    ON installment_scope."DocEntry" = payment_progress."baseAbs"
   AND installment_scope."InstlmntID" = payment_progress."InstId"
  WHERE payment_progress."CumulativePaid" >= installment_scope."InsTotal"
  GROUP BY payment_progress."baseAbs", payment_progress."InstId"
)
SELECT
  OINV."DocEntry" AS "DocEntry",
  OINV."DocNum" AS "DocNum",
  OINV."CardCode" AS "CardCode",
  OINV."CardName" AS "CardName",
  OINV."DocDate" AS "DocDate",
  OINV."DocDueDate" AS "DocDueDate",
  OINV."DocCur" AS "DocCur",
  OINV."DocTotal" AS "DocTotal",
  OINV."DocTotalFC" AS "DocTotalFC",
  OINV."DocTotal" AS "Total",
  OINV."DocCur" AS "TotalCurrency",
  OINV."PaidToDate" AS "TotalPaid",
  OINV."DocCur" AS "TotalPaidCurrency",
  INV6."InstlmntID" AS "InstlmntID",
  INV6."DueDate" AS "InstDueDate",
  INV6."InsTotal" AS "InstTotal",
  OINV."DocCur" AS "InstCurrency",
  INV6."PaidToDate" AS "InstPaidToDate",
  INV6."Status" AS "InstStatus",
  PAY."FullyPaidDate" AS "InstFullyPaidDate",
  COALESCE(items."itemsPairs", '') AS "itemsPairs"
FROM "{{schema}}"."OINV" OINV
INNER JOIN "{{schema}}"."INV6" INV6 ON INV6."DocEntry" = OINV."DocEntry"
INNER JOIN installment_scope
  ON installment_scope."DocEntry" = OINV."DocEntry"
 AND installment_scope."InstlmntID" = INV6."InstlmntID"
LEFT JOIN payment_dates PAY ON PAY."baseAbs" = OINV."DocEntry" AND PAY."InstId" = INV6."InstlmntID"
LEFT JOIN (
  SELECT
    INV1."DocEntry",
    STRING_AGG(
      INV1."ItemCode" || '::' || INV1."Dscription" || '::' || TO_NVARCHAR(INV1."Price"),
      '||'
    ) AS "itemsPairs"
  FROM "{{schema}}"."INV1" INV1
  GROUP BY INV1."DocEntry"
) items ON items."DocEntry" = OINV."DocEntry"
ORDER BY OINV."DocEntry" DESC, INV6."InstlmntID" ASC;
