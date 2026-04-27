WITH payment_progress AS (
  SELECT
    T1."baseAbs",
    T1."InstId",
    T0."DocEntry" AS "PaymentDocEntry",
    T0."DocDate",
    T1."SumApplied",
    S."InsTotal",
    SUM(T1."SumApplied") OVER (
      PARTITION BY T1."baseAbs", T1."InstId"
      ORDER BY T0."DocDate", T0."DocEntry"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS "CumulativePaid"
  FROM {{schema}}."ORCT" T0
  JOIN {{schema}}."RCT2" T1 ON T0."DocEntry" = T1."DocNum"
  JOIN {{schema}}."INV6" S
    ON S."DocEntry" = T1."baseAbs"
   AND S."InstlmntID" = T1."InstId"
  WHERE T1."InvType" = 13 -- 13 = OINV
    AND T0."Canceled" = 'N'
    AND T1."baseAbs" = ?
)
SELECT
  payment_progress."baseAbs" AS "DocEntry",
  payment_progress."InstId" AS "RCT2InstID",
  MIN(CASE
    WHEN payment_progress."CumulativePaid" >= payment_progress."InsTotal"
    THEN payment_progress."DocDate"
  END) AS "FullyPaidDate",
  SUM(payment_progress."SumApplied") AS "TotalPaidForInst"
FROM payment_progress
GROUP BY payment_progress."baseAbs", payment_progress."InstId"
ORDER BY payment_progress."InstId" ASC;
