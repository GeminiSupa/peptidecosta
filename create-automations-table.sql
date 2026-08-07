CREATE TABLE IF NOT EXISTS public.automations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT false,
    workflow_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Set up RLS (Row Level Security) if needed
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- Allow read/write access to authenticated users (e.g. admins)
CREATE POLICY "Allow full access to authenticated admins" ON public.automations
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
