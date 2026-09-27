-- Vial size for the catalog chip. The product name can stay "AHK-CU";
-- 50mg goes in this column. Names that already include the size still work
-- when this column is empty.
ALTER TABLE products ADD COLUMN IF NOT EXISTS vial_size TEXT;
