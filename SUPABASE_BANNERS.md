# Supabase Banners - Setup & Usage

This document describes how to configure a Supabase bucket to host public banners and how to use the uploader included in the admin UI.

1) Create a Supabase project
- Go to https://app.supabase.com and create a new project (or use an existing one).

2) Create a storage bucket
- In the Supabase project console, open "Storage" → "Buckets" → "New bucket".
- Create a bucket named `banners` (the uploader expects this name).
- Make the bucket **public** so objects are served without auth. (In the bucket settings, enable "Public".)

3) CORS / Origins
- For public delivery you usually don't need CORS; browsers will fetch public images directly.
- If you use the uploader from a different origin, keep the site origin allowed for uploads (Supabase handles upload CORS for public buckets in most setups).

4) Keys and client config
- In "Settings" → "API" get the `anon` public key and the project URL (the project ref URL like `https://xyzabc.supabase.co`).
- Copy `assets/js/supabase-config.example.js` to `assets/js/supabase-config.js` and fill `url` and `anonKey`.
- WARNING: Do NOT commit `supabase-config.js` with real keys to a public repo. Treat keys as secrets.

5) How the uploader works
- The admin UI at `/admin.html` includes a simple file input + upload button.
- When you upload a file it is stored under the `banners` bucket with the filename you choose (or the original file name).
- The uploader sets `upsert: true` so re-uploading the same filename overwrites the object.
- The public URL format is:

  `https://<your-project-ref>.supabase.co/storage/v1/object/public/banners/<filename>`

6) Loading banners on the public site
- To display a banner site-wide, set the `<img>` `src` to that public URL. Example:

  `<img src="https://xyzabc.supabase.co/storage/v1/object/public/banners/site-banner.png" alt="Banner">`

- If you want automatic updates without editing HTML, use a stable filename (for example `site-banner.png`) and overwrite it from the admin uploader — the public URL remains the same.

7) Security notes
- The anon key allows uploads to public buckets and reading public objects. If you need stricter control (restricted uploads), implement a server-side endpoint that uses the service role key to sign upload URLs and manage access.

8) Troubleshooting
- If uploads fail, ensure the bucket `banners` exists and is public and that the anon key is correct.
- If images don't show publicly, try opening the public URL in a private/incognito window to avoid cached, local preview artifacts.
