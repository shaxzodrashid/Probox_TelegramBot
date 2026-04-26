SELECT
  OINV."DocEntry" AS "DocEntry",
  OINV."DocNum" AS "DocNum",
  OINV."CardCode" AS "CardCode",
  OINV."CardName" AS "CardName",
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
LEFT JOIN (
  SELECT
    T1."baseAbs",
    T1."InstId",
    MAX(T0."DocDate") AS "ActualPaymentDate"
  FROM "{{schema}}"."ORCT" T0
  JOIN "{{schema}}"."RCT2" T1 ON T0."DocEntry" = T1."DocNum"
  WHERE T1."InvType" = 13
    AND T0."Canceled" = 'N'
  GROUP BY T1."baseAbs", T1."InstId"
) PAY ON PAY."baseAbs" = OINV."DocEntry" AND PAY."InstId" = INV6."InstlmntID"
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
WHERE OINV."CardCode" IN ({{cardCodes}})
ORDER BY OINV."DocEntry" DESC, INV6."InstlmntID" ASC;
