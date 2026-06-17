-- Add inventory columns to products
-- inventory_count: A value of NULL means inventory is not tracked (unlimited). A numerical value strictly tracks inventory.
-- low_stock_threshold: The numerical threshold at which a low stock notification is triggered for this specific product.
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_count INTEGER DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;
