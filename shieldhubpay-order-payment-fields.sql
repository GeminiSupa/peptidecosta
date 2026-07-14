ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_provider_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_authorization TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_descriptor TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_provider_response JSONB;
