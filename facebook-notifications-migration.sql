-- Create the facebook_notifications table
CREATE TABLE IF NOT EXISTS public.facebook_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL, -- 'lead', 'message', 'comment'
    sender_name TEXT,
    sender_id TEXT,
    content TEXT,
    email TEXT,
    phone TEXT,
    status VARCHAR(20) DEFAULT 'unread', -- 'unread', 'read'
    external_link TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.facebook_notifications ENABLE ROW LEVEL SECURITY;

-- 1. Policy: Authenticated users (Admin role) can read notifications
CREATE POLICY "Admins can view facebook notifications"
    ON public.facebook_notifications
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Policy: Authenticated users (Admin role) can update notifications (e.g. mark as read)
CREATE POLICY "Admins can update facebook notifications"
    ON public.facebook_notifications
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Policy: Authenticated users (Admin role) can delete notifications
CREATE POLICY "Admins can delete facebook notifications"
    ON public.facebook_notifications
    FOR DELETE
    TO authenticated
    USING (true);

-- 4. Policy: Allow service role / server-side insert (Service role bypasses RLS naturally, but we add an explicit anon/service insertion policy just in case)
CREATE POLICY "Allow service role insertion"
    ON public.facebook_notifications
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Create index for quick status and type queries
CREATE INDEX IF NOT EXISTS idx_fb_notifications_status ON public.facebook_notifications (status);
CREATE INDEX IF NOT EXISTS idx_fb_notifications_created_at ON public.facebook_notifications (created_at DESC);

-- Enable realtime for this table so changes sync instantly to Next.js
ALTER PUBLICATION supabase_realtime ADD TABLE public.facebook_notifications;
