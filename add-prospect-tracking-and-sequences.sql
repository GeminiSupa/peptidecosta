-- prospect-tracking-and-sequences.sql
-- Run this in the Supabase SQL Editor to add tracking and sequence features

-- 1. Tracking Events Table
CREATE TABLE IF NOT EXISTS public.prospect_activity_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    prospect_id uuid REFERENCES public.sales_prospects(id) ON DELETE CASCADE NOT NULL,
    activity_type text NOT NULL CHECK (activity_type IN ('email_opened', 'link_clicked')),
    activity_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.prospect_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view prospect activity logs"
    ON public.prospect_activity_logs FOR SELECT
    TO authenticated
    USING (public.is_admin_user());

CREATE POLICY "Admins can insert prospect activity logs"
    ON public.prospect_activity_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin_user());

-- (Service role bypasses RLS for the public API route that logs opens/clicks)


-- 2. Prospect Sequences Tables
CREATE TABLE IF NOT EXISTS public.prospect_sequences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    steps jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of step configs (channel, template, waitDays)
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prospect_sequence_enrollments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    prospect_id uuid REFERENCES public.sales_prospects(id) ON DELETE CASCADE NOT NULL,
    sequence_id uuid REFERENCES public.prospect_sequences(id) ON DELETE CASCADE NOT NULL,
    current_step_index integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL CHECK (status IN ('active', 'completed', 'paused', 'failed')),
    next_execution_at timestamptz DEFAULT now() NOT NULL,
    error_message text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(prospect_id, sequence_id)
);

ALTER TABLE public.prospect_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sequences" ON public.prospect_sequences TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins can manage enrollments" ON public.prospect_sequence_enrollments TO authenticated USING (public.is_admin_user());
