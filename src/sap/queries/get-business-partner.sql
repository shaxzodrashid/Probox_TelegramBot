SELECT
    T0."CardCode",
    T0."CardName",
    T0."CardType",
    T0."Phone1",
    T0."Phone2",
    T0."U_admin"
FROM {{schema}}."OCRD" T0
WHERE T0."CardType" = 'C'
  AND (
    RIGHT(
    REPLACE_REGEXPR('[^0-9]' IN T0."Phone1" WITH ''),
    9
    ) = ?
   OR
    RIGHT(
    REPLACE_REGEXPR('[^0-9]' IN T0."Phone2" WITH ''),
    9
    ) = ?
    );
