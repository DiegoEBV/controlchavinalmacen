-- Fix RLS error by running the function with owner privileges (SECURITY DEFINER)
-- This allows automatic access to the 'counters' table without exposing it to direct user modification.

ALTER FUNCTION registrar_entrada_masiva_v2(jsonb, text, uuid) SECURITY DEFINER;

-- Best practice: Set search_path to prevent hijacking
ALTER FUNCTION registrar_entrada_masiva_v2(jsonb, text, uuid) SET search_path = public;
