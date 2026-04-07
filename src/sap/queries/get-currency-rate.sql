SELECT
  T0."RateDate",
  T0."Currency",
  T0."Rate"
FROM "{{schema}}"."ORTT" T0
WHERE T0."Currency" = ?
ORDER BY T0."RateDate" DESC
LIMIT 1;
