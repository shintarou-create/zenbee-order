ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note_printed boolean DEFAULT false;
