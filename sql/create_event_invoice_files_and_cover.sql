-- Migration: create attachments table and add cover image columns to event_invoices
-- Run this in Supabase SQL editor (or psql) as a privileged user.

-- Ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Add cover image columns to event_invoices (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_invoices') THEN
    ALTER TABLE public.event_invoices
    ADD COLUMN IF NOT EXISTS cover_image_path text,
    ADD COLUMN IF NOT EXISTS cover_image_name text,
    ADD COLUMN IF NOT EXISTS cover_image_content_type text,
    ADD COLUMN IF NOT EXISTS cover_image_size bigint;
  END IF;
END$$;

-- 2) Create attachments table for multiple files per invoice
CREATE TABLE IF NOT EXISTS public.event_invoice_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.event_invoices(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  content_type text,
  size bigint,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_invoice_files_invoice_id ON public.event_invoice_files (invoice_id);
CREATE INDEX IF NOT EXISTS idx_event_invoice_files_created_at ON public.event_invoice_files (created_at DESC);

-- 3) Example helper: update an invoice to set the cover image (useful after upload)
-- Replace :invoice_id and :storage_path with actual values when running this statement.
-- Example:
-- UPDATE public.event_invoices
-- SET cover_image_path = 'invoices/<invoice-id>/cover-1600000000.jpg',
--     cover_image_name = 'cover-1600000000.jpg',
--     cover_image_content_type = 'image/jpeg',
--     cover_image_size = 123456
-- WHERE id = 'your-invoice-uuid';

-- 4) Example insert for attachments metadata
-- INSERT INTO public.event_invoice_files (invoice_id, storage_path, file_name, content_type, size)
-- VALUES ('your-invoice-uuid', 'invoices/your-invoice-uuid/photo1.jpg', 'photo1.jpg', 'image/jpeg', 345678);

-- 5) Optional: a view that returns invoices with an attachments array
CREATE MATERIALIZED VIEW IF NOT EXISTS public.event_invoices_with_files AS
SELECT ei.*, coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'file_name', f.file_name, 'content_type', f.content_type, 'size', f.size, 'created_at', f.created_at)) FILTER (WHERE f.id IS NOT NULL), '[]'::jsonb) AS attachments
FROM public.event_invoices ei
LEFT JOIN public.event_invoice_files f ON f.invoice_id = ei.id
GROUP BY ei.id;

-- To refresh the materialized view after new uploads:
-- REFRESH MATERIALIZED VIEW public.event_invoices_with_files;

-- Note: Supabase Storage buckets are not created via SQL. Create a bucket named 'invoices' (or your chosen name) in the Storage UI.
