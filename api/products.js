const stripe = require('stripe')(require('../config/stripe').STRIPE_SECRET_KEY);

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
      const products = await stripe.products.list({
        expand: ['data.default_price']
      });

      // Format products to include a `prices` array (with Stripe price ids)
      const formattedProducts = products.data.map(product => {
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