-- Default size per compound (run before deploying the code that uses it).
--
-- The catalog groups a compound's sizes onto one card and opens it on the
-- smallest size. GLP-1 sells mostly at 20mg, so the card opened on 5mg and the
-- size people wanted sat in the "More" menu. This column lets the admin pick
-- which size a card opens on, per product row, without a code change.
--
-- Only one size of a compound should carry it. The Products grid clears the
-- tick from the other sizes when you set it; if two ever carry it, the catalog
-- uses the smaller of the two.

alter table products
  add column if not exists is_default_size boolean not null default false;

-- Finding the ticked size for a compound is a tiny subset of the table.
create index if not exists idx_products_default_size
  on products (is_default_size)
  where is_default_size;
