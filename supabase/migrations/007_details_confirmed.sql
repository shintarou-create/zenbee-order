ALTER TABLE orders ADD COLUMN IF NOT EXISTS details_confirmed boolean DEFAULT false;
