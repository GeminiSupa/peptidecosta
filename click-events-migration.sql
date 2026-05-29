-- Create Click Events table to store visitor heatmap coordinates
CREATE TABLE IF NOT EXISTS public.click_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    element_name text NOT NULL,
    x_pct integer NOT NULL, -- Relative X position (0 to 100)
    y_pct integer NOT NULL, -- Relative Y position (0 to 100)
    path text NOT NULL,
    is_mobile boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;

-- Policy to allow anonymous inserts (from storefront clicks)
CREATE POLICY "Allow anonymous inserts" ON public.click_events
    FOR INSERT WITH CHECK (true);

-- Policy to allow authenticated reads (from admin panel)
CREATE POLICY "Allow authenticated select" ON public.click_events
    FOR SELECT TO authenticated USING (true);
