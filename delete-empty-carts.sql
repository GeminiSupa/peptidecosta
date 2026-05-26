-- Run this in your Supabase SQL Editor to delete existing anonymous carts that have no contact info
DELETE FROM public.abandoned_carts 
WHERE customer_name IS NULL 
  AND customer_phone IS NULL 
  AND customer_email IS NULL;
