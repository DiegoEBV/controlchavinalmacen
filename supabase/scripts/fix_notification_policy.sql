-- Enable ID-based updates for notifications
-- This ensures that users can mark their own notifications as 'read'.

BEGIN;

-- Policy: Users can update their own notifications (e.g., mark as read)
CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

COMMIT;
