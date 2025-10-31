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

      const formattedProducts = products.data.map(product => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.default_price ? product.default_price.unit_amount / 100 : 0,
        currency: product.default_price ? product.default_price.currency : 'usd',
        image: product.images[0]
      }));

      res.status(200).json(formattedProducts);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Error al obtener los productos' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}