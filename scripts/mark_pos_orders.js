#!/usr/bin/env node
// Script para reprocesar órdenes persistidas en Supabase y marcar order_type = 'pos'
// Requisitos: setear SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y STRIPE_SECRET_KEY en el entorno antes de ejecutar.
// Uso (PowerShell):
// $env:SUPABASE_URL='https://...'; $env:SUPABASE_SERVICE_ROLE_KEY='...'; $env:STRIPE_SECRET_KEY='sk_...'; node .\scripts\mark_pos_orders.js

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || null;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno. Cancelando.');
    process.exit(1);
  }
  if (!STRIPE_SECRET_KEY) {
    console.error('Falta STRIPE_SECRET_KEY en el entorno. Cancelando.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const stripe = Stripe(STRIPE_SECRET_KEY);

  console.log('Conectando a Supabase y Stripe...');

  // Leer filas en pos_orders que no tienen order_type definido (null, '' o '-')
  const batchSize = 200; // ajustar si es necesario
  const dryRun = process.argv.includes('--dry-run');
  let offset = 0;
  let totalProcessed = 0;
  let totalMarked = 0;

  while (true) {
    console.log(`Fetching rows ${offset}..${offset + batchSize - 1}`);
    // Select rows where order_type is null, empty string or just '-'
    const filterExpr = "order_type.is.null,order_type.eq.'',order_type.eq.'-'";
    const { data: rows, error } = await supabase
      .from('pos_orders')
      .select('id, order_type')
      .or(filterExpr)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error leyendo pos_orders:', error.message || error);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      totalProcessed++;
      const sessionId = r.id;
      try {
        // retrieve session from Stripe with expanded charges
        const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent', 'payment_intent.charges.data'] });
        const pi = s.payment_intent || {};
        const charge = (pi.charges && pi.charges.data && pi.charges.data[0]) || {};
        const pmDetails = charge.payment_method_details || pi.payment_method_details || {};

        const isPos = (pmDetails && (pmDetails.card_present || pmDetails.type === 'card_present')) || false;
        if (isPos) {
            // update supabase row (or dry-run)
            if (dryRun) {
              console.log(`[dry-run] Would mark ${sessionId} as pos`);
              totalMarked++;
            } else {
              const upd = { id: sessionId, order_type: 'pos' };
              const { error: upserr } = await supabase.from('pos_orders').upsert(upd, { onConflict: 'id' });
              if (upserr) {
                console.error('Failed to upsert', sessionId, upserr.message || upserr);
              } else {
                totalMarked++;
                console.log(`Marked ${sessionId} as pos`);
              }
            }
        } else {
          console.log(`${sessionId} -> not POS (no card_present)`);
        }
      } catch (e) {
        console.error('Error processing session', sessionId, e && e.message ? e.message : e);
      }
    }

    offset += batchSize;
  }

  console.log(`Done. Processed ${totalProcessed} rows. Marked ${totalMarked} as pos.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
