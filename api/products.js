const stripe = require('stripe')(require('../config/stripe').STRIPE_SECRET_KEY);

export default async function handler(req, res) {
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