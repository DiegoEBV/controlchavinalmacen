-- 1. Enable Realtime for notifications table
BEGIN;
  -- Remove if already there to avoid duplicates (Supabase does this automatically usually but good to be explicit)
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
COMMIT;

-- 2. Check for solicitor name mismatches
-- This is just for my information if I could run it, but since I can't easily see output,
-- I will improve the functions to be more robust or log the miss.
