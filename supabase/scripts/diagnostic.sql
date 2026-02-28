-- Diagnostic query for solicitors and profiles
SELECT 'SOLICITANTES' as source, solicitante as name FROM requerimientos WHERE item_correlativo IN (1, 2)
UNION ALL
SELECT 'PROFILES' as source, nombre as name FROM profiles;
