// Serverless endpoint: /api/products
// Returns { products: [...] } by querying Stripe using the secret key from env.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const useTest = !!(req.query && (req.query.use_test === '1' || req.query.use_test === 'true'));
    const secretKey = useTest ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      console.warn('api/products: missing STRIPE_SECRET_KEY (or STRIPE_TEST_SECRET_KEY for test)');
      return res.status(500).json({ error: 'Server misconfigured: STRIPE_SECRET_KEY not set' });
    }

    const Stripe = require('stripe');
    const stripe = Stripe(secretKey);

    console.info('api/products request', { collection: (req.query||{}).collection, use_test: useTest });

    const products = await stripe.products.list({ active: true, expand: ['data.default_price'] });

    const { collection } = req.query || {};

    const filtered = (collection && collection.length)
      ? products.data.filter(product => {
        try {
          const meta = product.metadata || {};
          const single = (meta.collection || '').trim();
          if (single && single === collection) return true;
          const multi = (meta.collections || '').split(',').map(s=>s.trim()).filter(Boolean);
          if (multi.indexOf(collection) !== -1) return true;
          if (meta.collections) {
            try{ const parsed = JSON.parse(meta.collections); if (Array.isArray(parsed) && parsed.indexOf(collection) !== -1) return true; }catch(e){}
          }
          return false;
        } catch (e) { return false; }
      })
      : products.data;

    const formattedProducts = filtered.map(product => {
      const defaultPrice = product.default_price || null;
      const prices = [];
      if (defaultPrice) {
        prices.push({ id: defaultPrice.id, unit_amount: defaultPrice.unit_amount, currency: defaultPrice.currency });
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

    if(req.query && (req.query.debug === '1' || req.query.debug === 'true')){
      return res.status(200).json({ products: formattedProducts, _debug: { stripe_total: products.data.length, filtered: filtered.length, collection: req.query.collection, use_test: useTest } });
    }

    res.status(200).json({ products: formattedProducts });
  } catch (error) {
    console.error('api/products error', error);
    res.status(500).json({ error: 'Error fetching products' });
  }
};
