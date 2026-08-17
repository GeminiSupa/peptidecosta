import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../customer-accounts-foundation.sql', import.meta.url), 'utf8');
const legacyRepair = await readFile(new URL('../fix-rls-policies.sql', import.meta.url), 'utf8');

test('customer account migration creates profiles, addresses, and durable order ownership', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.customer_profiles/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.customer_addresses/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth\.users/i);
  assert.match(migration, /orders_customer_user_created_idx/i);
});

test('customers can only read their own orders while active admins retain access', () => {
  assert.match(migration, /CREATE POLICY orders_customer_read_own[\s\S]*customer_user_id = auth\.uid\(\)/i);
  assert.match(migration, /CREATE POLICY orders_admin_all[\s\S]*public\.is_admin_user\(\)/i);
  assert.doesNotMatch(migration, /ON public\.orders FOR (SELECT|UPDATE)[\s\S]{0,80}TO (public|anon)/i);
});

test('customer authentication cannot expose the staff directory', () => {
  assert.match(migration, /tablename = 'admin_profiles'/i);
  assert.match(migration, /CREATE POLICY admin_profiles_active_staff_read[\s\S]*public\.is_admin_user\(\)/i);
  assert.doesNotMatch(migration, /admin_profiles[\s\S]{0,120}TO authenticated[\s\S]{0,80}USING \(true\)/i);
});

test('the legacy RLS repair can no longer reopen the order ledger', () => {
  assert.doesNotMatch(legacyRepair, /CREATE POLICY[\s\S]{0,100}ON public\.orders/i);
  assert.doesNotMatch(legacyRepair, /Allow public (select|update|insert) to orders/i);
});
