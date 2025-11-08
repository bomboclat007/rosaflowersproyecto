// Webhook endpoint to handle Stripe events and send order emails.
// Supports SendGrid (SENDGRID_API_KEY) or SMTP (SMTP_URL or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)
// Requires these environment vars to be set in Vercel:
// - STRIPE_SECRET_KEY (already used elsewhere)
// - STRIPE_WEBHOOK_SECRET (the webhook signing secret from Stripe)
// - ADMIN_EMAIL (email that receives order notifications)
// - optionally SENDGRID_API_KEY or SMTP_URL (or SMTP_HOST / SMTP_USER / SMTP_PASS)

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.warn('STRIPE_SECRET_KEY not set; webhook will fail without it');
}
const stripe = require('stripe')(secretKey);

const sendgridKey = process.env.SENDGRID_API_KEY;
let sendgridAvailable = false;
try {
  require.resolve('@sendgrid/mail');
  sendgridAvailable = true;
} catch (e) {
  sendgridAvailable = false;
}
// Support common env names used in this project (EMAIL_TO, EMAIL_FROM)
const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_MAIL || process.env.EMAIL_TO;
const defaultFrom = process.env.EMAIL_FROM || adminEmail || 'no-reply@example.com';

// Helper to parse raw body for signature verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

async function sendEmail({ subject, html, to, replyTo }) {
  // Try SendGrid first if available and configured
  if (sendgridKey && sendgridAvailable) {
    const sg = require('@sendgrid/mail');
    sg.setApiKey(sendgridKey);
    const msg = {
      to: to,
      from: defaultFrom,
      subject,
      html,
    };
    if (replyTo) msg.replyTo = replyTo;
    await sg.send(msg);
    return;
  }

  // Fallback to Nodemailer with SMTP_URL or host config
  const nodemailer = require('nodemailer');
  let transporter;
  if (process.env.SMTP_URL) {
    transporter = nodemailer.createTransport(process.env.SMTP_URL);
  } else if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined
    });
  } else {
    throw new Error('No email provider configured (SENDGRID_API_KEY or SMTP_URL/SMTP_HOST)');
  }

  await transporter.sendMail({
    from: defaultFrom,
    to,
    subject,
    html,
    replyTo
  });
}

module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    // Get raw body for verification
    const raw = await getRawBody(req);
    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not set; skipping signature verification');
      // If secret missing, try to parse JSON body (less secure)
      event = req.body && typeof req.body === 'object' ? req.body : JSON.parse(raw.toString('utf8'));
    } else {
      if (!sig) throw new Error('Missing stripe-signature header');
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err && err.message ? err.message : err);
    return res.status(400).send(`Webhook Error: ${err && err.message ? err.message : 'Invalid payload'}`);
  }

  // Handle the event types we care about
  if (event.type === 'checkout.session.completed') {
    try {
      const sessionObj = event.data.object;
      // Retrieve the full session to get line items, customer details, payment info and product images
      // expand payment_intent and its charges so we can inspect payment method details for POS/terminal payments
      const session = await stripe.checkout.sessions.retrieve(sessionObj.id, {
        expand: ['line_items', 'customer_details', 'payment_intent', 'payment_intent.charges.data', 'line_items.data.price.product']
      });

      const customer = session.customer_details || {};
      const items = (session.line_items && session.line_items.data) ? session.line_items.data : [];

      // Build item list and collect image and amounts
      let itemsHtml = '';
      let thumbnail = '';
      let currency = (session.currency || '').toUpperCase();
      let subtotalAmount = 0;
      let taxAmount = 0;
      let shippingAmount = 0;

      items.forEach(li => {
        const prod = li.price && li.price.product;
        const name = li.description || (prod && prod.name) || (li.price && li.price.nickname) || 'Item';
        const qty = li.quantity || 1;
        const amount = (li.amount_total != null) ? li.amount_total : ((li.price && li.price.unit_amount) ? (li.price.unit_amount * qty) : 0);
        const price = amount !== null ? (amount/100).toFixed(2) : '—';
        itemsHtml += `<tr><td style="vertical-align:middle;padding:8px 12px"><img src="${escapeHtml((prod && prod.images && prod.images[0]) || '')}" width="60" style="border-radius:4px"></td><td style="vertical-align:middle;padding:8px 12px">${escapeHtml(name)}</td><td style="vertical-align:middle;padding:8px 12px;text-align:right">${currency} ${price}</td></tr>`;
        subtotalAmount += (li.amount_subtotal != null) ? li.amount_subtotal : amount;
        // pick first image as thumbnail
        if (!thumbnail && prod && Array.isArray(prod.images) && prod.images.length) thumbnail = prod.images[0];
      });

      // Totals fallback to session fields when available
      if (session.amount_subtotal != null) subtotalAmount = session.amount_subtotal;
      if (session.total_details && session.total_details.amount_tax != null) taxAmount = session.total_details.amount_tax;
      if (session.total_details && session.total_details.amount_shipping != null) shippingAmount = session.total_details.amount_shipping;
      // Other fallbacks
      if (session.total_details && session.total_details.amount_tax === undefined && session.tax && session.tax !== null) {
        taxAmount = session.tax;
      }

      const subtotal = subtotalAmount ? (subtotalAmount/100).toFixed(2) : '0.00';
      const taxes = taxAmount ? (taxAmount/100).toFixed(2) : '0.00';
      const shipping = shippingAmount ? (shippingAmount/100).toFixed(2) : '0.00';
      const total = session.amount_total ? (session.amount_total/100).toFixed(2) : ((parseFloat(subtotal) + parseFloat(taxes) + parseFloat(shipping)).toFixed(2));

      // Payment method details (from payment_intent if available)
      let paymentLine = '';
      try {
        const pi = session.payment_intent || {};
        const charge = (pi.charges && pi.charges.data && pi.charges.data[0]) || {};
        const pm = (charge.payment_method_details) || (pi.payment_method_details) || {};
        const cardBrand = (pm.card && pm.card.brand) || '';
        const last4 = (pm.card && pm.card.last4) || (charge.payment_method_details && charge.payment_method_details.card && charge.payment_method_details.card.last4) || '';
        paymentLine = `${escapeHtml(cardBrand)} • ${escapeHtml(last4 ? '•••• ' + last4 : '')}`.trim();
      } catch (e) {
        paymentLine = '';
      }

      // Additional metadata fields (delivery date, special instructions, card message)
      const deliveryDate = session.metadata && session.metadata.delivery_date ? session.metadata.delivery_date : session.metadata && session.metadata.delivery ? session.metadata.delivery : '';
      const specialInstructions = session.metadata && session.metadata.special_instructions ? session.metadata.special_instructions : '';
      const cardMessage = session.metadata && session.metadata.card_message ? session.metadata.card_message : '';

      const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:680px;margin:0 auto;padding:16px">
        <h2 style="text-align:center">Payment Summary</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px">
          ${itemsHtml}
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e6e6;padding-top:12px">
          <tr><td>Subtotal</td><td style="text-align:right">${currency} ${subtotal}</td></tr>
          <tr><td>Delivery</td><td style="text-align:right">${currency} ${shipping}</td></tr>
          <tr><td>Tax</td><td style="text-align:right">${currency} ${taxes}</td></tr>
          <tr style="font-weight:bold"><td>Total</td><td style="text-align:right">${currency} ${total}</td></tr>
        </table>

        <h3 style="margin-top:18px">Payment Method</h3>
        <p>${escapeHtml(paymentLine)}</p>

        <hr style="margin:18px 0">

        <h3>Order Details</h3>
        <p><strong>Order ID:</strong> ${escapeHtml(session.id)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(customer.name || 'N/A')} (${escapeHtml(customer.email || 'sin email')})</p>
        <p><strong>Delivery Date:</strong> ${escapeHtml(deliveryDate)}</p>
        <h4>Delivery Information</h4>
        <p>${escapeHtml(customer.name || '')}<br>${escapeHtml((customer.address && formatAddress(customer.address)) || '')}<br>${escapeHtml(customer.phone || '')}</p>

        ${specialInstructions ? `<h4>Special Instructions</h4><p>${escapeHtml(specialInstructions)}</p>` : ''}

        ${cardMessage ? `<h4>Card Information</h4><p>${escapeHtml(cardMessage)}</p>` : ''}

        ${(() => {
          // Render any metadata fields sent from the frontend as a small table
          if (session.metadata && Object.keys(session.metadata).length) {
            let m = '<h4>Form Data</h4><table style="width:100%;border-collapse:collapse">';
            Object.keys(session.metadata).forEach(k => {
              const v = session.metadata[k];
              m += `<tr><td style="padding:6px 8px;border:1px solid #f0f0f0;width:40%;font-weight:600">${escapeHtml(k)}</td><td style="padding:6px 8px;border:1px solid #f0f0f0">${escapeHtml(v)}</td></tr>`;
            });
            m += '</table>';
            return m;
          }
          return '';
        })()}

        <p style="font-size:12px;color:#666;margin-top:18px">Contact your customer if there are questions or issues with this order.</p>
      </div>
      `;

      // Persist the order to Supabase pos_orders table if available.
      // NOTE: run persistence BEFORE returning response so upsert actually executes.
      if (supabaseAdmin) {
        try {
          // Build a plain-text delivery address
          const addrObj = (session.shipping || session.shipping_details || (session.customer_details && session.customer_details.address)) || null;
          const addrParts = [];
          if (addrObj) {
            if (addrObj.name) addrParts.push(addrObj.name);
            if (addrObj.line1) addrParts.push(addrObj.line1);
            if (addrObj.line2) addrParts.push(addrObj.line2);
            if (addrObj.city) addrParts.push(addrObj.city);
            if (addrObj.state) addrParts.push(addrObj.state);
            if (addrObj.postal_code) addrParts.push(addrObj.postal_code);
            if (addrObj.country) addrParts.push(addrObj.country);
          }
          const delivery_address_plain = addrParts.join(', ');

          // parse checkout_info from metadata if present
          const parseCheckoutInfo = (md) => {
            if (!md) return null;
            const ci = md.checkout_info;
            if (!ci) return null;
            try { return (typeof ci === 'string') ? JSON.parse(ci) : ci; } catch (e) { return null; }
          };
          const ci = parseCheckoutInfo(session.metadata);
          const recipientFromMeta = (session.metadata && (session.metadata.recipient_name || session.metadata.recipient)) || (ci && ((ci.rFirst || ci.firstName) ? [ci.rFirst || ci.firstName, ci.rLast || ci.lastName].filter(Boolean).join(' ') : (ci.recipientName || ci.recipient))) || null;

          const normalizeOrderType = (v) => {
            if (!v) return null;
            const s = String(v).toLowerCase().trim();
            if (!s) return null;
            if (s.includes('deliv') || s === 'delivery') return 'delivery';
            if (s.includes('pick')) return 'pickup';
            if (s.includes('pos') || s.includes('in-person') || s.includes('in person') || s.includes('store') || s.includes('in_store')) return 'pos';
            return s;
          };

          let orderTypeFromMeta = normalizeOrderType((session.metadata && (session.metadata.order_type || session.metadata.fulfillment)) || (ci && (ci.order_type || ci.fulfillment || ci.fulfillmentType || ci.fulfillment_type)) || null);
          // if still not present, infer from payment intent (card_present -> in-person POS)
          if (!orderTypeFromMeta) {
            try {
              const pi = session.payment_intent || {};
              const pmTypes = Array.isArray(pi.payment_method_types) ? pi.payment_method_types.join(' ') : '';
              const charge = (pi.charges && pi.charges.data && pi.charges.data[0]) || {};
              const pmDetails = (charge.payment_method_details) || (pi.payment_method_details) || {};
              const pmType = pmDetails.type || null;
              if (pmType && /present|card_present|terminal|pos|in-person|in_person|eftpos/i.test(pmType)) orderTypeFromMeta = 'pos';
              else if (pmTypes && /present|card_present|terminal|pos|in-person|in_person|eftpos/i.test(pmTypes)) orderTypeFromMeta = 'pos';
              else if (pmDetails && pmDetails.card_present) orderTypeFromMeta = 'pos';
            } catch (e) {
              // ignore
            }
          }

          const orderRow = {
            id: session.id,
            session_created: session.created || null,
            amount_total: session.amount_total || null,
            currency: session.currency || null,
            payment_status: session.payment_status || (session.payment_intent && session.payment_intent.status) || null,
            payment_method: paymentLine || null,
            customer_name: (customer && customer.name) || null,
            customer_email: (customer && customer.email) || null,
            recipient: recipientFromMeta,
            delivery_address: delivery_address_plain || null,
            designer: (session.metadata && session.metadata.designer) || null,
            order_type: orderTypeFromMeta,
            bloomsnap: (session.metadata && (session.metadata.bloomsnap || session.metadata.bloomsnap_url)) || null,
            fulfillment_date: (session.metadata && session.metadata.fulfillment_date) || null,
            time_due: (session.metadata && session.metadata.time_due) || null,
            order_status: (session.metadata && session.metadata.order_status) || null,
            line_items: items.map(li => ({
              id: li.id,
              description: li.description || (li.price && li.price.product && li.price.product.name) || null,
              quantity: li.quantity || 1,
              amount_total: li.amount_total != null ? li.amount_total : (li.price && li.price.unit_amount ? li.price.unit_amount * (li.quantity || 1) : null)
            })),
            metadata: session.metadata || {}
          };

          // Upsert so repeated webhook events don't create duplicates
          await supabaseAdmin.from('pos_orders').upsert(orderRow, { onConflict: 'id' });
        } catch (e) {
          console.error('Failed to persist order to Supabase pos_orders:', e && e.message ? e.message : e);
        }
      }

      // Send to admin and optionally to customer
      // Send only to admin (EMAIL_TO / ADMIN_EMAIL). Keep customer email as replyTo so admin can respond if needed.
      if (!adminEmail) {
        console.warn('No admin recipient configured; set EMAIL_TO or ADMIN_EMAIL in environment variables');
      } else {
        await sendEmail({
          subject: `Nueva orden / ${session.id}`,
          html,
          to: adminEmail,
          replyTo: customer.email || undefined
        });
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Error handling checkout.session.completed:', err);
      return res.status(500).json({ error: 'Error procesando la orden' });
    }
  }

  // Other event types not handled here
  res.status(200).json({ received: true });
};

// Small HTML-escaping helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format Stripe address object into a single HTML-friendly string
function formatAddress(addr) {
  if (!addr) return '';
  const parts = [];
  if (addr.line1) parts.push(addr.line1);
  if (addr.line2) parts.push(addr.line2);
  const cityParts = [];
  if (addr.city) cityParts.push(addr.city);
  if (addr.state) cityParts.push(addr.state);
  if (addr.postal_code) cityParts.push(addr.postal_code);
  if (cityParts.length) parts.push(cityParts.join(', '));
  if (addr.country) parts.push(addr.country);
  return parts.join('<br>');
}
