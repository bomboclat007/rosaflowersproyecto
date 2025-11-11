-- SQL migration for Supabase / Postgres
-- Creates table event_invoices with JSONB payloads and useful indexes

CREATE TABLE IF NOT EXISTS public.event_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  po_number text,
  customer jsonb,
  event_start date,
  event_end date,
  venue jsonb,
  note_to_customer text,
  sections jsonb,
  products jsonb,
  ingredients jsonb,
  totals jsonb,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger to update updated_at on change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_invoices_updated_at ON public.event_invoices;
CREATE TRIGGER trg_event_invoices_updated_at
BEFORE UPDATE ON public.event_invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_invoices_event_start ON public.event_invoices (event_start DESC);
CREATE INDEX IF NOT EXISTS idx_event_invoices_status ON public.event_invoices (status);

-- GIN index for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_event_invoices_customer_gin ON public.event_invoices USING gin (customer jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_event_invoices_sections_gin ON public.event_invoices USING gin (sections jsonb_path_ops);

-- Optional full-text search index on title
CREATE INDEX IF NOT EXISTS idx_event_invoices_title_ft ON public.event_invoices USING gin (to_tsvector('english', coalesce(title, '')));

-- Notes:
-- Run this in the Supabase SQL editor or via psql as a user with privileges.
-- Ensure the pgcrypto extension (for gen_random_uuid) is enabled: 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
