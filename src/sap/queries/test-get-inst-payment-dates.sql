SELECT 
    T1."baseAbs" AS "DocEntry", 
    T1."InstId" AS "RCT2InstID",
    MAX(T0."DocDate") AS "ActualPaymentDate",
    SUM(T1."SumApplied") AS "TotalPaidForInst"
FROM {{schema}}."ORCT" T0
JOIN {{schema}}."RCT2" T1 ON T0."DocEntry" = T1."DocNum"
WHERE T1."InvType" = 13 -- 13 = OINV
  AND T0."Canceled" = 'N'
  AND T1."baseAbs" = ?
GROUP BY T1."baseAbs", T1."InstId"
ORDER BY T1."InstId" ASC;
