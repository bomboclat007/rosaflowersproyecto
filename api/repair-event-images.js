const { createClient } = require('@supabase/supabase-js');

// Repairs missing event cover images by searching configured buckets
// Usage: GET /api/repair-event-images?secret=XXXX
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REPAIR_SECRET

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const REPAIR_SECRET = process.env.REPAIR_SECRET || null;
  const BUCKETS = (process.env.REPAIR_BUCKETS || 'invoices,banners').split(',').map(s=>s.trim()).filter(Boolean);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  if (!REPAIR_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: missing REPAIR_SECRET env' });
  }

  const secret = (req.query && req.query.secret) || (req.body && req.body.secret) || null;
  if (!secret || secret !== REPAIR_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid secret' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { 'x-from-api': 'repair-event-images' } }
  });

  try {
    // Fetch all invoices (limit to 2000 to avoid extreme loads)
    const { data: invoices, error } = await supabase.from('event_invoices').select('*').limit(2000);
    if (error) return res.status(500).json({ error: 'Error fetching invoices', details: error });

    const report = { total: invoices.length, checked: 0, updated: [], not_found: [] };

    // helper: list objects in bucket (prefix optional)
    async function listBucket(bucket, prefix = '') {
      try {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
        if (error) return { error };
        return { data };
      } catch (err) { return { error: err }; }
    }

    for (const inv of invoices) {
      report.checked++;
      const invoiceId = inv.id;
      const coverPath = inv.cover_image_path || null;
      const coverName = inv.cover_image_name || null;
      const fallbackFile = (inv.sections && inv.sections.coverfile) ? String(inv.sections.coverfile).replace(/^C:\\fakepath\\/i,'') : null;

      let found = null;

      // Try exact cover_path across configured buckets
      if (coverPath) {
        const cleaned = String(coverPath).replace(/^\/+/, '');
        for (const bucket of BUCKETS) {
          try {
            const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
            if (!error && Array.isArray(data)) {
              const match = data.find(o => (bucket + '/' + o.name).endsWith(cleaned) || o.name === cleaned || o.name.endsWith('/' + cleaned));
              if (match) { found = { bucket, path: match.name }; break; }
            }
          } catch(e){}
        }
      }

      // Try invoiceId/coverName
      if (!found && coverName) {
        const tryPath = `${invoiceId}/${coverName}`.replace(/^\/+/, '');
        for (const bucket of BUCKETS) {
          try {
            const { data, error } = await supabase.storage.from(bucket).list(invoiceId, { limit: 1000 });
            if (!error && Array.isArray(data)) {
              const match = data.find(o => o.name === coverName || o.name.endsWith('/' + coverName) || o.name === tryPath || o.name === invoiceId + '/' + coverName);
              if (match) { found = { bucket, path: invoiceId + '/' + match.name }; break; }
            }
          } catch(e){}
        }
      }

      // Try searching by fallbackFile filename anywhere in buckets
      if (!found && fallbackFile) {
        const filename = fallbackFile.split('\\').pop();
        for (const bucket of BUCKETS) {
          const listing = await listBucket(bucket, '');
          if (listing.error) continue;
          const match = (listing.data || []).find(o => o.name === filename || o.name.endsWith('/' + filename));
          if (match) { found = { bucket, path: match.name }; break; }
        }
      }

      // If found, update invoice cover fields to point at this object
      if (found) {
        const storagePath = found.path.replace(/^\/+/, '');
        const update = {
          cover_image_path: storagePath,
          cover_image_name: storagePath.split('/').pop(),
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase.from('event_invoices').update(update).eq('id', invoiceId).select().single();
        if (!error) {
          report.updated.push({ id: invoiceId, bucket: found.bucket, path: storagePath });
          continue;
        }
      }

      report.not_found.push({ id: invoiceId, coverPath, coverName, fallbackFile });
    }

    return res.status(200).json({ ok: true, report });
  } catch (err) {
    console.error('repair-event-images error', err);
    return res.status(500).json({ error: 'Internal error', details: String(err) });
  }
};
