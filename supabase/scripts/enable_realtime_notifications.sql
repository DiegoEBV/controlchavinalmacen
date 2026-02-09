-- Enable Realtime for the 'notifications' table
-- This allows the Frontend (React) to subscribe to INSERT events.

BEGIN;

-- 1. Add table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 2. Ensure RLS is enabled (which it is from previous script, but good to double check)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

COMMIT;
