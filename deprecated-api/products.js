// NOTE: choose the secret key dynamically inside the handler so we can
// support `use_test=1` when a STRIPE_TEST_SECRET_KEY is provided in env.
module.exports = async function handler(req, res) {
  // Allow CORS from any origin (adjust in production to limit origins)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    try {
      // Allow requesting the test Stripe key via ?use_test=1 (only works
      // when STRIPE_TEST_SECRET_KEY is configured in the environment).
      const useTest = !!(req.query && (req.query.use_test === '1' || req.query.use_test === 'true'));
      const secretKey = useTest
        ? (process.env.STRIPE_TEST_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY)
        : (process.env.STRIPE_SECRET_KEY || require('../config/stripe').STRIPE_SECRET_KEY);
      const stripe = require('stripe')(secretKey);

      // Log incoming query for diagnostics
      console.info('api/products request', { collection: (req.query||{}).collection, use_test: useTest });

      // Only fetch active products so archived/inactive products don't show on the site/POS
      const products = await stripe.products.list({
        active: true,
        expand: ['data.default_price']
      });

      // Format products to include a `prices` array (with Stripe price ids)
      // If a collection query param is provided, filter products by their
      // Stripe metadata. Support metadata keys like `collection` (single)
      // or `collections` (comma-separated list).
      const { collection } = req.query || {};

      const filtered = (collection && collection.length)
        ? products.data.filter(product => {
          try {
            const meta = product.metadata || {};
            const single = (meta.collection || '').trim();
            if (single && single === collection) return true;
            const multi = (meta.collections || '').split(',').map(s=>s.trim()).filter(Boolean);
            if (multi.indexOf(collection) !== -1) return true;
            // Also support JSON array stored in metadata.collections
            if (meta.collections) {
              try{
                const parsed = JSON.parse(meta.collections);
                if (Array.isArray(parsed) && parsed.indexOf(collection) !== -1) return true;
              }catch(e){}
            }
            return false;
          } catch (e) { return false; }
        })
        : products.data;

      const formattedProducts = filtered.map(product => {
        const defaultPrice = product.default_price || null;
        const prices = [];
        if (defaultPrice) {
          prices.push({
            id: defaultPrice.id,
            unit_amount: defaultPrice.unit_amount,
            currency: defaultPrice.currency
          });
        }

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          images: product.images || [],
          prices,
          default_price_id: defaultPrice ? defaultPrice.id : null
        };
      });

      // Diagnostic logging: total products returned by Stripe and filtered count
      try{ console.info('api/products: stripe_total=', products.data.length, 'filtered=', filtered.length); }catch(e){}

      // If caller asked for debug info include simple counts (safe, optional)
      if(req.query && (req.query.debug === '1' || req.query.debug === 'true')){
        return res.status(200).json({ products: formattedProducts, _debug: { stripe_total: products.data.length, filtered: filtered.length, collection: req.query.collection, use_test: useTest } });
      }

      // Return an object with a `products` key so the frontend loader can read `data.products`
      res.status(200).json({ products: formattedProducts });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Error al obtener los productos' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
