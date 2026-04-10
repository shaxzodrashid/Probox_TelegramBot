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
  PAY."ActualPaymentDate" AS "InstActualPaymentDate",
  COALESCE(items."itemsPairs", '') AS "itemsPairs"
FROM "{{schema}}"."OINV" OINV
INNER JOIN "{{schema}}"."INV6" INV6 ON INV6."DocEntry" = OINV."DocEntry"
INNER JOIN "{{schema}}"."OCRD" BP ON BP."CardCode" = OINV."CardCode"
LEFT JOIN (
  SELECT
    T1."baseAbs",
    T1."InstId",
    MAX(T0."DocDate") AS "ActualPaymentDate"
  FROM "{{schema}}"."ORCT" T0
  JOIN "{{schema}}"."RCT2" T1 ON T0."DocEntry" = T1."DocEntry"
  WHERE T1."InvType" = 13
    AND T0."Canceled" = 'N'
  GROUP BY T1."baseAbs", T1."InstId"
) PAY ON PAY."baseAbs" = OINV."DocEntry" AND PAY."InstId" = (INV6."InstlmntID" - 1)
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
WHERE OINV."CANCELED" = 'N'
  AND BP."CardType" = 'C'
  AND INV6."DueDate" BETWEEN ? AND ?
  AND NOT EXISTS (
    SELECT 1
    FROM "{{schema}}"."RIN1" CM1
    INNER JOIN "{{schema}}"."ORIN" CM0 ON CM0."DocEntry" = CM1."DocEntry"
    WHERE CM1."BaseType" = 13
      AND CM1."BaseEntry" = OINV."DocEntry"
  )
ORDER BY OINV."DocEntry" DESC, INV6."InstlmntID" ASC;
