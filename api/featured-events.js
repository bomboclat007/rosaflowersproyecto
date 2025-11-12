const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // normalize slug helper: lowercase, trim, ensure .html suffix for non-UUIDs
  function normalizeSlugValue(s){
    if (!s) return s;
    let v = String(s).trim().toLowerCase();
    // keep uuids as-is
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
    if (!v.endsWith('.html')) v = v + '.html';
    return v;
  }

  try {
    if (req.method === 'GET') {
      // Return list of slugs
      const { data, error } = await supabase.from('featured_events').select('slug').order('created_at', { ascending: true });
      if (error) {
        console.error('Supabase GET featured_events error:', error);
        return res.status(500).json({ error: 'Error fetching featured events', details: error });
      }
      const slugs = (data || []).map(r => r.slug);
      return res.status(200).json({ slugs });
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      // Accept either { slugs: [] } or { action: 'add'|'remove', slug }
      if (Array.isArray(payload.slugs)) {
        // normalize and dedupe incoming slugs
        const raw = payload.slugs.map(s => String(s || '').trim()).filter(Boolean);
        const normalizedSet = new Set(raw.map(normalizeSlugValue));
        const slugs = Array.from(normalizedSet);

        // if empty, remove all and return empty list
        if (slugs.length === 0) {
          const { error: delAllErr } = await supabase.from('featured_events').delete();
          if (delAllErr) console.error('Supabase delete all featured_events error:', delAllErr);
          return res.status(200).json({ slugs: [] });
        }

        // Delete any existing rows whose slug is NOT in the new list
        try {
          const { error: delErr } = await supabase.from('featured_events').delete().not('slug', 'in', slugs);
          if (delErr) console.error('Supabase delete featured_events (not in) error:', delErr);
        } catch (e) {
          // best-effort delete; log and continue
          console.error('Error during delete(not in):', e);
        }

        // Upsert the provided slugs so any missing rows are added
        const rows = slugs.map(s => ({ slug: s }));
        const { error: insErr } = await supabase.from('featured_events').upsert(rows, { onConflict: 'slug' });
        if (insErr) {
          console.error('Supabase upsert featured_events error:', insErr);
          return res.status(500).json({ error: 'Error saving featured events', details: insErr });
        }

        // Return the canonical list from the DB
        const { data: allRows, error: selErr } = await supabase.from('featured_events').select('slug').order('created_at', { ascending: true });
        if (selErr) {
          console.error('Supabase select featured_events error:', selErr);
          return res.status(500).json({ error: 'Error fetching featured events after save', details: selErr });
        }
        const canonical = (allRows || []).map(r => normalizeSlugValue(r.slug)).filter(Boolean);
        return res.status(200).json({ slugs: canonical });
      }

      if (payload.action === 'add' && payload.slug) {
        const slug = normalizeSlugValue(payload.slug);
        const { error } = await supabase.from('featured_events').upsert([{ slug }], { onConflict: 'slug' });
        if (error) return res.status(500).json({ error: 'Error adding slug', details: error });
        const { data } = await supabase.from('featured_events').select('slug').order('created_at', { ascending: true });
        return res.status(200).json({ slugs: (data || []).map(r => normalizeSlugValue(r.slug)) });
      }

      if (payload.action === 'remove' && payload.slug) {
        const slug = normalizeSlugValue(payload.slug);
        const { error } = await supabase.from('featured_events').delete().eq('slug', slug);
        if (error) return res.status(500).json({ error: 'Error removing slug', details: error });
        const { data } = await supabase.from('featured_events').select('slug').order('created_at', { ascending: true });
        return res.status(200).json({ slugs: (data || []).map(r => normalizeSlugValue(r.slug)) });
      }

      return res.status(400).json({ error: 'Invalid request payload' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).end('Method Not Allowed');
  } catch (err) {
    console.error('api/featured-events error', err);
    return res.status(500).json({ error: 'Internal server error', details: (err && err.message) || String(err) });
  }
};
