-- Create table to store featured event slugs for homepage
CREATE TABLE IF NOT EXISTS featured_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index on slug for quick lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_events_slug ON featured_events (slug);
