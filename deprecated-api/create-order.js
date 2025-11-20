// Simple serverless endpoint to record an order (non-persistent)
// For production, replace with database persistence.
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body || {};
  try { if (!body || Object.keys(body).length === 0) body = JSON.parse(req.rawBody || '{}'); } catch(e){}

  const { items, payment_method, customer_email, total_cents, metadata, mode } = body;

  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Missing items' });
  if (!payment_method) return res.status(400).json({ error: 'Missing payment_method' });

  // Compute total if not provided
  let calcTotal = 0;
  for (const it of items) {
    const qty = parseInt(it.quantity || it.qty || 1, 10) || 1;
    const unit = parseInt(it.unit_amount || it.unit_amount_cents || it.unitAmount || 0, 10) || 0;
    calcTotal += qty * unit;
  }

  const total = parseInt(total_cents, 10) || calcTotal;

  // Create a simple order id
  const orderId = 'ord_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');

  // In this simple implementation we only log the order. Persist to DB in production.
  console.log('New POS order:', { orderId, payment_method, customer_email, total, items, metadata, mode });

  return res.status(200).json({ ok: true, orderId, total, mode: mode || 'delivery', message: 'Order recorded (non-persistent).' });
};
