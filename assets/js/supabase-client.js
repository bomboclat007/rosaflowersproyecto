// Initializes window.supabaseClient if SUPABASE_URL and SUPABASE_ANON_KEY are present.
(function(){
  try {
    if (window.supabaseClient) return;
    if (!window.supabase) {
      console.warn('Supabase library not found on window. Please include @supabase/supabase-js or let login-modal load it dynamically.');
      return;
    }
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      console.warn('Supabase config missing: edit assets/js/supabase-config.js and set SUPABASE_URL and SUPABASE_ANON_KEY');
      return;
    }
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  } catch(e){ console.warn('Failed to initialize supabase client', e); }
})();
