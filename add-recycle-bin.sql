-- The Bin: a holding table for anything a person deletes from the admin.
-- Safe to run more than once.
--
-- RUN IT RIGHT BEFORE THE DEPLOY THAT ADDS /api/admin/recycle-bin.
--   * Run it after, every delete in the admin fails with "column not in schema
--     cache" until it lands, because deletes now write here first.
--   * Run it before, nothing changes — the table simply sits empty until the
--     new code starts using it.
--
-- Why a snapshot table rather than a deleted_at column on all 25 tables: every
-- read in the app would have needed `.is('deleted_at', null)` bolted on, and
-- the one query somebody forgot would quietly show deleted orders to a
-- customer. Here a deleted row is genuinely gone from its own table; the Bin
-- just also holds a copy. See src/lib/recycleBin.mjs.

-- 1. The Bin itself ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.deleted_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Where the row came from, and the primary key it had. Kept as TEXT because
  -- the tables the Bin covers use a mix of UUID and BIGINT ids, and a restore
  -- only ever hands the value straight back to its own table.
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,

  -- Worked out at delete time and stored, because the row cannot be re-read to
  -- build a label once it is gone.
  record_type TEXT NOT NULL,
  label TEXT,

  -- The row itself, whole. `related` holds child rows the database cascade
  -- would have taken with it (an order's items, a chat's messages).
  payload JSONB NOT NULL,
  related JSONB NOT NULL DEFAULT '{}'::JSONB,

  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by_name TEXT,
  deleted_by_email TEXT,
  delete_reason TEXT,

  -- Set when someone puts it back. A restored entry stays in the table as the
  -- record that it happened, and is skipped by the purge.
  restored_at TIMESTAMPTZ,
  restored_by_name TEXT,
  restored_by_email TEXT
);

-- The Bin list is "newest first", and the purge asks for old unrestored rows.
CREATE INDEX IF NOT EXISTS deleted_records_deleted_at_idx
  ON public.deleted_records(deleted_at DESC);

CREATE INDEX IF NOT EXISTS deleted_records_pending_purge_idx
  ON public.deleted_records(deleted_at)
  WHERE restored_at IS NULL;

-- Filtering the Bin by type, and finding whether a given row is already in it.
CREATE INDEX IF NOT EXISTS deleted_records_source_idx
  ON public.deleted_records(source_table, source_id);

-- 2. Lock it to the server --------------------------------------------------

-- Every write here happens through the service role in
-- src/lib/recycleBinServer.js. No browser session may read or write the Bin:
-- the payloads carry customer names, addresses and phone numbers copied out of
-- orders, so a permissive policy here would re-expose data the source tables
-- restrict. The admin UI reaches it through /api/admin/recycle-bin, which
-- checks the session first.
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deleted_records_service_only ON public.deleted_records;
CREATE POLICY deleted_records_service_only ON public.deleted_records
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

-- 3. The retention setting --------------------------------------------------

-- How long the Bin holds things. NULL retention_days means never purge.
-- Only a superadmin can change it, and that check lives in the route —
-- site_settings is already service-role-write-only.
INSERT INTO public.site_settings (id, value)
VALUES ('recycle_bin', '{"retention_days": 30}'::JSONB)
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON TABLE public.deleted_records TO service_role;

-- So the next /api/admin/recycle-bin request sees the table without waiting
-- for PostgREST's cache to expire on its own.
NOTIFY pgrst, 'reload schema';
