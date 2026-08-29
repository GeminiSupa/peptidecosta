-- Fold the retired `self_generated` commission source into `agent_referral`.
-- Both paid the identical combined 20%, but only `agent_referral` was counted by
-- the weekly pay email, the agent dashboard and the analytics referral count, so
-- these orders paid 20% with nothing on the statement explaining why.
-- Run this in Supabase SQL Editor. Safe to re-run.

UPDATE public.orders
SET agent_commission_source = 'agent_referral'
WHERE agent_commission_source = 'self_generated';

-- Expect 0 rows after the update.
SELECT count(*) AS remaining_self_generated
FROM public.orders
WHERE agent_commission_source = 'self_generated';

COMMENT ON COLUMN public.orders.agent_commission_rate_override IS
  'Per-order sales agent commission percentage, stored as whole percent points, e.g. 20 for an agent referral.';

COMMENT ON COLUMN public.orders.agent_commission_source IS
  'Reason for the per-order commission override: agent_referral, customer_history or custom_override.';

-- Step 2: the same value is baked into the order snapshots stored on payouts,
-- which TeamManagement renders directly. Step 1 does not reach JSONB. Amounts are
-- untouched -- both sources always paid the same 20%; only the label changes.
-- COALESCE matters: jsonb_agg over an empty array returns NULL, and both columns
-- are NOT NULL.
UPDATE public.commission_payouts
SET
  orders_data = COALESCE((
    SELECT jsonb_agg(
      CASE WHEN o->>'agent_commission_source' = 'self_generated'
        THEN o || '{"agent_commission_source":"agent_referral","commission_source_label":"Agent referral"}'::jsonb
        ELSE o
      END
    )
    FROM jsonb_array_elements(orders_data) AS o
  ), '[]'::jsonb),
  override_orders_data = COALESCE((
    SELECT jsonb_agg(
      CASE WHEN o->>'agent_commission_source' = 'self_generated'
        THEN o || '{"agent_commission_source":"agent_referral","commission_source_label":"Agent referral"}'::jsonb
        ELSE o
      END
    )
    FROM jsonb_array_elements(override_orders_data) AS o
  ), '[]'::jsonb)
WHERE orders_data @> '[{"agent_commission_source":"self_generated"}]'
   OR override_orders_data @> '[{"agent_commission_source":"self_generated"}]';

-- Expect 0 rows.
SELECT count(*) AS payouts_with_stale_snapshots
FROM public.commission_payouts
WHERE orders_data @> '[{"agent_commission_source":"self_generated"}]'
   OR override_orders_data @> '[{"agent_commission_source":"self_generated"}]';
