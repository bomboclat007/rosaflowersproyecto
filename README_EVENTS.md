Event Invoices - Quick Guide

This project includes server endpoints and a suggested DB schema to store and query event invoices.

Endpoints

- POST /api/event-invoice
  - Creates a new invoice. Accepts JSON payload. Returns the inserted invoice.
  - Example payload keys: title, po_number, customer (object or string), event_start (YYYY-MM-DD), event_end, venue (object), sections (object), products (array), ingredients (array), totals (object), status (draft|published)

- GET /api/event-invoice
  - Lists invoices. Query params:
    - page (default 1)
    - page_size (default 20, max 200)
    - status (filter by status)
    - search (partial match against title or po_number)
  - Returns: { invoices: [...], count, page, page_size }

- (Future) GET /api/event-invoice/:id
  - Consider adding a detail endpoint or using query GET with id filter.

Database schema (recommended)

See `sql/create_event_invoices.sql` for a Postgres/Supabase migration that:
- Creates `event_invoices` with JSONB columns for flexible payload
- Adds indexes on `event_start`, `status`, and GIN indexes for JSONB
- Adds `created_at` and `updated_at` timestamps

Security

- Use the Supabase service role key only server-side (in Vercel env vars). Do not expose it to clients.
- Consider adding RLS policies if you plan to allow user-specific reads/writes via anon keys.

Examples

List invoices (client):

```js
const res = await fetch('/api/event-invoice?page=1&page_size=50&search=birthday');
const json = await res.json();
console.log(json.invoices, json.count);
```

Create invoice (client):

```js
const payload = { title: 'Wedding — Lopez', customer: { name: 'Ana Lopez' }, event_start: '2025-12-01', status: 'draft' };
const r = await fetch('/api/event-invoice', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
const j = await r.json();
console.log(j.invoice);
```

Operational notes

- Run the SQL migration in Supabase SQL editor. Ensure `pgcrypto` is enabled for gen_random_uuid.
- After migration, the GET endpoint will benefit from indexes for faster queries.
- For heavy search needs, consider adding a dedicated search table or using Supabase Full Text Search with triggers to materialize searchable text.
