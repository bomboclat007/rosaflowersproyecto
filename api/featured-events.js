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
        const slugs = payload.slugs.map(s => String(s).trim()).filter(Boolean);
        // Replace: delete all existing then insert provided slugs
        const { error: delErr } = await supabase.from('featured_events').delete().not('slug', 'in', `(${slugs.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`);
        // The above deletes rows whose slug is NOT in the new list. To simplify, if slugs is empty delete all.
        if (delErr) {
          // If delete with filter failed, fallback to deleting all when slugs empty
          console.error('Supabase delete featured_events error:', delErr);
        }
        if (slugs.length === 0) {
          // remove everything
          await supabase.from('featured_events').delete();
          return res.status(200).json({ slugs: [] });
        }

        // Upsert provided slugs (insert missing)
        const rows = slugs.map(s => ({ slug: s }));
        const { data: insData, error: insErr } = await supabase.from('featured_events').upsert(rows, { onConflict: 'slug' }).select('slug');
        if (insErr) {
          console.error('Supabase upsert featured_events error:', insErr);
          return res.status(500).json({ error: 'Error saving featured events', details: insErr });
        }
        return res.status(200).json({ slugs: (insData || []).map(r => r.slug) });
      }

      if (payload.action === 'add' && payload.slug) {
        const slug = String(payload.slug).trim();
        const { data, error } = await supabase.from('featured_events').upsert([{ slug }], { onConflict: 'slug' }).select('slug');
        if (error) return res.status(500).json({ error: 'Error adding slug', details: error });
        return res.status(200).json({ slugs: (data || []).map(r => r.slug) });
      }

      if (payload.action === 'remove' && payload.slug) {
        const slug = String(payload.slug).trim();
        const { error } = await supabase.from('featured_events').delete().eq('slug', slug);
        if (error) return res.status(500).json({ error: 'Error removing slug', details: error });
        const { data } = await supabase.from('featured_events').select('slug');
        return res.status(200).json({ slugs: (data || []).map(r => r.slug) });
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
