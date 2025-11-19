// Simple serverless sync endpoint for reputation providers
// Supports: Yelp (via API key) - accepts POST JSON with { provider: 'yelp', apiKey, business_id, business_name, location }

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const provider = (body.provider || '').toLowerCase();

    if (provider === 'yelp') {
      const apiKey = body.apiKey || process.env.YELP_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'Yelp API key required (apiKey or YELP_API_KEY env)' });

      const fetch = global.fetch || require('node-fetch');
      let businessId = body.business_id;

      if (!businessId) {
        // need business_name and location to search
        const name = body.business_name;
        const location = body.location || '';
        if (!name) return res.status(400).json({ error: 'business_name required when business_id is not provided' });

        const qs = new URLSearchParams({ term: name, location: location || 'USA', limit: '1' });
        const searchUrl = 'https://api.yelp.com/v3/businesses/search?' + qs.toString();
        const sresp = await fetch(searchUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!sresp.ok) {
          const text = await sresp.text();
          return res.status(502).json({ error: 'Yelp search failed', details: text });
        }
        const sdata = await sresp.json();
        if (!sdata.businesses || sdata.businesses.length === 0) return res.status(404).json({ error: 'Business not found' });
        businessId = sdata.businesses[0].id;
      }

      // fetch reviews
      const reviewsUrl = `https://api.yelp.com/v3/businesses/${businessId}/reviews`;
      const rresp = await fetch(reviewsUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!rresp.ok) {
        const text = await rresp.text();
        return res.status(502).json({ error: 'Yelp reviews fetch failed', details: text });
      }
      const rdata = await rresp.json();

      // Fetch business details for listing
      const bresp = await fetch(`https://api.yelp.com/v3/businesses/${businessId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const bdata = bresp.ok ? await bresp.json() : null;

      // Map reviews to frontend shape
      const mappedReviews = (rdata.reviews || []).map(rv => ({
        id: rv.id,
        provider: 'yelp',
        date: rv.time_created ? rv.time_created.split(' ')[0] : new Date().toISOString().slice(0,10),
        author: rv.user && rv.user.name ? rv.user.name : 'Anonymous',
        rating: rv.rating || 0,
        text: rv.text || '',
        replied: false
      }));

      const listing = {
        id: businessId,
        name: bdata?.name || '',
        website: (bdata && bdata.url) || '',
        address: bdata && bdata.location ? (bdata.location.display_address || []).join('\n') : '',
        phone: bdata?.phone || '',
        hours: (bdata && bdata.hours && bdata.hours[0] && bdata.hours[0].open) ? bdata.hours[0].open.map(o=>`${o.day}:${o.start}-${o.end}`) : [],
        serviceAreas: (bdata && bdata.service_area) ? bdata.service_area : [],
        attributes: [],
        profile: { name: bdata?.name || '', address: bdata && bdata.location ? (bdata.location.display_address || []).join('\n') : '', phone: bdata?.phone || '', website: bdata?.url || '' }
      };

      return res.json({ provider: 'yelp', reviews: mappedReviews, listing: listing, lastSynced: Date.now() });
    }

    if (provider === 'facebook') {
      // Accept either a page access token passed in body.page_access_token or use env FB_PAGE_ACCESS_TOKEN
      const pageToken = body.page_access_token || process.env.FB_PAGE_ACCESS_TOKEN;
      if (!pageToken) return res.status(400).json({ error: 'Facebook page access token required (page_access_token or FB_PAGE_ACCESS_TOKEN env)' });

      const fetch = global.fetch || require('node-fetch');
      // require page id or page url
      let pageId = body.page_id;
      const pageUrl = body.page_url;

      // If pageUrl provided, try to extract id via Graph API (/?)
      if (!pageId && pageUrl) {
        // last segment may be username; we'll attempt to lookup by username
        try {
          const username = pageUrl.replace(/https?:\/\//,'').split('/').filter(Boolean).pop();
          const lookup = await fetch(`https://graph.facebook.com/${username}?access_token=${encodeURIComponent(pageToken)}`);
          if (lookup.ok) {
            const ldata = await lookup.json();
            if (ldata && ldata.id) pageId = ldata.id;
          }
        } catch(e){}
      }

      if (!pageId) return res.status(400).json({ error: 'page_id or page_url required for Facebook sync' });

      // fetch page details
      const fields = 'id,name,about,website,phone,location,connected_instagram_account';
      const pageResp = await fetch(`https://graph.facebook.com/${pageId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`);
      if (!pageResp.ok) {
        const t = await pageResp.text();
        return res.status(502).json({ error: 'Facebook page fetch failed', details: t });
      }
      const pageData = await pageResp.json();

      // try to fetch ratings (may require permissions) - fallback to posts
      let reviews = [];
      try {
        const revResp = await fetch(`https://graph.facebook.com/${pageId}/ratings?access_token=${encodeURIComponent(pageToken)}`);
        if (revResp.ok) {
          const revData = await revResp.json();
          if (revData && Array.isArray(revData.data)) {
            reviews = revData.data.map(r => ({ id: r.id, provider: 'facebook', date: (r.created_time||'').slice(0,10), author: r.reviewer && r.reviewer.name ? r.reviewer.name : 'Facebook user', rating: r.rating || 0, text: r.review_text || r.open_text || '', replied: false }));
          }
        }
      } catch(e){/* ignore */}

      // fallback: fetch recent posts/comments if no reviews
      if (reviews.length === 0) {
        try {
          const postsResp = await fetch(`https://graph.facebook.com/${pageId}/posts?access_token=${encodeURIComponent(pageToken)}&limit=10`);
          if (postsResp.ok) {
            const postsData = await postsResp.json();
            if (postsData && Array.isArray(postsData.data)) {
              reviews = postsData.data.map(p => ({ id: p.id, provider: 'facebook', date: (p.created_time||'').slice(0,10), author: pageData.name || 'Facebook', rating: 5, text: p.message || '', replied: false }));
            }
          }
        } catch(e){}
      }

      const listing = {
        id: pageId,
        name: pageData?.name || '',
        website: pageData?.website || '',
        address: pageData && pageData.location ? (Object.values(pageData.location).filter(Boolean).join('\n')) : '',
        phone: pageData?.phone || '',
        hours: [],
        serviceAreas: [],
        attributes: [],
        profile: { name: pageData?.name || '', address: pageData && pageData.location ? (Object.values(pageData.location).filter(Boolean).join('\n')) : '', phone: pageData?.phone || '', website: pageData?.website || '' }
      };

      return res.json({ provider: 'facebook', reviews, listing, lastSynced: Date.now() });
    }

    if (provider === 'google') {
      // Google Places integration using API key. Accepts { provider: 'google', apiKey, place_id }
      const apiKey = body.apiKey || process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'Google Places API key required (apiKey or GOOGLE_PLACES_API_KEY env)' });

      const fetch = global.fetch || require('node-fetch');
      let placeId = body.place_id;
      const placeInput = body.place_id || body.place_name || '';

      // If placeId not provided, try to find it by text search (Find Place from Text)
      if (!placeId && placeInput) {
        try {
          const q = new URLSearchParams({ input: placeInput, inputtype: 'textquery', fields: 'place_id', key: apiKey });
          const findUrl = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?' + q.toString();
          const findResp = await fetch(findUrl);
          if (!findResp.ok) {
            const t = await findResp.text();
            return res.status(502).json({ error: 'Google find place failed', details: t });
          }
          const findData = await findResp.json();
          if (findData && Array.isArray(findData.candidates) && findData.candidates.length > 0) {
            placeId = findData.candidates[0].place_id;
          }
        } catch (e) {
          console.error('google find place error', e);
        }
      }

      if (!placeId) return res.status(400).json({ error: 'place_id or place_name required for Google sync' });

      // Fetch place details including reviews
      const fields = ['name','rating','reviews','formatted_address','website','international_phone_number','opening_hours'].join(',');
      const detailsQs = new URLSearchParams({ place_id: placeId, fields, key: apiKey });
      const detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json?' + detailsQs.toString();
      const dresp = await fetch(detailsUrl);
      if (!dresp.ok) {
        const t = await dresp.text();
        return res.status(502).json({ error: 'Google place details fetch failed', details: t });
      }
      const ddata = await dresp.json();
      const result = ddata.result || {};

      const mapped = (result.reviews || []).map(rv => ({
        id: rv.time ? String(rv.time) + '-' + (rv.author_name||'') : (rv.author_url || rv.author_name || Math.random().toString(36).slice(2,8)),
        provider: 'google',
        date: rv.time ? (new Date(rv.time * 1000)).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
        author: rv.author_name || 'Google user',
        rating: rv.rating || 0,
        text: rv.text || '',
        replied: false
      }));
