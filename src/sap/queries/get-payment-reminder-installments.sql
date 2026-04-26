WITH payment_dates AS (
  SELECT
    T1."baseAbs",
    T1."InstId",
    MAX(T0."DocDate") AS "ActualPaymentDate"
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
    INV6."Status" AS "InstStatus",
    payment_dates."ActualPaymentDate" AS "InstActualPaymentDate"
  FROM "{{schema}}"."OINV" OINV
  INNER JOIN "{{schema}}"."INV6" INV6 ON INV6."DocEntry" = OINV."DocEntry"
  INNER JOIN "{{schema}}"."OCRD" BP ON BP."CardCode" = OINV."CardCode"
  LEFT JOIN payment_dates
    ON payment_dates."baseAbs" = OINV."DocEntry"
   AND payment_dates."InstId" = INV6."InstlmntID"
  WHERE OINV."CANCELED" = 'N'
    AND BP."CardType" = 'C'
    AND (
      INV6."DueDate" BETWEEN ? AND ?
      OR payment_dates."ActualPaymentDate" IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "{{schema}}"."RIN1" CM1
      INNER JOIN "{{schema}}"."ORIN" CM0 ON CM0."DocEntry" = CM1."DocEntry"
      WHERE CM1."BaseType" = 13
        AND CM1."BaseEntry" = OINV."DocEntry"
    )
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
  candidate_installments."InstActualPaymentDate",
  COALESCE(items."itemsPairs", '') AS "itemsPairs"
FROM candidate_installments
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
