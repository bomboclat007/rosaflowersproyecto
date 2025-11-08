// Login modal: Supabase-backed register/login + server-side Stripe customer creation.
(function(){
  window.showLoginModal = function(){ var modal = document.getElementById('loginModal'); if (!modal) return; modal.style.display='block'; };
  window.hideLoginModal = function(){ var m = document.getElementById('loginModal'); if (m) m.style.display='none'; };
  // Enhanced: focus first input when shown
  (function(){
    var originalShow = window.showLoginModal;
    window.showLoginModal = function(){ originalShow(); try { var modal = document.getElementById('loginModal'); if(modal){ var email = modal.querySelector('input[type="email"]'); if(email){ setTimeout(()=>email.focus(), 50); } } } catch(e){} };
  })();

  // Load a script dynamically
  function loadScript(src){
    return new Promise(function(resolve, reject){
      var existing = Array.from(document.getElementsByTagName('script')).find(s=>s.src && s.src.indexOf(src)!==-1);
      if (existing) return resolve();
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function(){ resolve(); };
      s.onerror = function(e){ reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function ensureSupabaseReady(){
    if (window.supabaseClient) return window.supabaseClient;
    try {
      if (!window.supabase) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js');
      }
      try { await loadScript('/assets/js/supabase-config.js'); } catch(e){}
      try { await loadScript('/assets/js/supabase-client.js'); } catch(e){}
      if (window.supabaseClient) return window.supabaseClient;
      if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        try { window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); return window.supabaseClient; } catch(e){ console.warn('Could not create supabase client', e); }
      }
    } catch(err){ console.warn('Supabase load failed', err); }
    return null;
  }

  async function createStripeCustomerServer(accessToken){
    try {
      const r = await fetch('/api/create-stripe-customer-supabase.js', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken }, body: JSON.stringify({}) });
      if (!r.ok) { console.warn('Server stripe creation failed', await r.text()); return null; }
      const j = await r.json(); return j.customerId || null;
    } catch(e){ console.warn('createStripeCustomerServer error', e); return null; }
  }

  function loadUsers(){ try { return JSON.parse(localStorage.getItem('site_users')||'{}'); } catch(e){ return {}; } }
  function saveUsers(u){ localStorage.setItem('site_users', JSON.stringify(u)); }
  function setLocalSession(email, stripeId){ localStorage.setItem('site_session', JSON.stringify({email:email, stripeCustomerId:stripeId})); updateHeaderLogin(); }
  function clearLocalSession(){ localStorage.removeItem('site_session'); updateHeaderLogin(); }
  function getLocalSession(){ try { return JSON.parse(localStorage.getItem('site_session')||'null'); } catch(e){ return null; } }

  async function registerUser(email, password, name){
    email = (email||'').trim().toLowerCase(); name = (name||'').trim(); if (!email || !password) throw new Error('Missing email or password');
    const sb = await ensureSupabaseReady();
    // single stripeId variable for both fallback and Supabase flows
    let stripeId = null;
    if (!sb) {
      var users = loadUsers(); if (users[email]) throw new Error('Account already exists');
      var salt = Math.random().toString(36).slice(2);
      var hash = await (async function(s){ const enc = new TextEncoder(); const data = enc.encode(s); const digest = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(digest)).map(b=>('0'+b.toString(16)).slice(-2)).join(''); })(salt + password);
      try { const r = await fetch('/api/create-stripe-customer.js', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: email }) }); if (r.ok){ const j = await r.json(); stripeId = j.customerId || null; } } catch(e){}
      users[email] = { name: name, salt: salt, hash: hash, stripeCustomerId: stripeId }; saveUsers(users); setLocalSession(email, stripeId); return users[email];
    }

    // Use Supabase to register
    // Pass name into user_metadata when available
    const { data, error } = await sb.auth.signUp({ email: email, password: password }, { data: { full_name: name } });
    if (error) {
      // Better error messaging
      throw new Error(error.message || 'Sign up failed');
    }
    // If signUp returns a session, use it; otherwise try to sign in (if email confirm is off you will get session)
    let accessToken = data?.session?.access_token || null;
    if (!accessToken) {
      const res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) {
        // If email confirmation required, inform the user
        console.warn('Signed up but sign-in failed (might require email confirmation)', res.error.message);
      } else {
        accessToken = res.data?.session?.access_token || null;
      }
    }
    if (accessToken) { stripeId = await createStripeCustomerServer(accessToken); }
    return { email: email, stripeCustomerId: stripeId };
  }

  async function loginUser(email, password){
    email = (email||'').trim().toLowerCase();
    const sb = await ensureSupabaseReady();
    // Admin shortcut: special credentials go to admin menu
    try {
      if (email === 'admin' && String(password) === 'admin'){
        try { hideLoginModal(); } catch(e){}
        // small delay to let modal hide
        setTimeout(function(){ window.location.href = '/admin.html'; }, 150);
        return { email: 'admin' };
      }
    } catch(e) { console.warn('admin shortcut check failed', e); }
    if (!sb) {
      var users = loadUsers(); var u = users[email]; if (!u) throw new Error('No account found');
      var h = await (async function(s){ const enc = new TextEncoder(); const data = enc.encode(s); const digest = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(digest)).map(b=>('0'+b.toString(16)).slice(-2)).join(''); })(u.salt + password);
      if (h !== u.hash) throw new Error('Invalid password'); setLocalSession(email, u.stripeCustomerId || null); return u;
    }

    const res = await sb.auth.signInWithPassword({ email: email, password: password });
    if (res.error) throw new Error(res.error.message || 'Sign in failed');
    const session = res.data?.session || null;
    if (session && session.access_token) { await createStripeCustomerServer(session.access_token); }
    return { email: email };
  }

  async function updateHeaderLogin(){
    var btn = document.getElementById('siteLoginBtn'); if (!btn) return;
    try {
      const sb = await ensureSupabaseReady();
      if (sb) {
        const s = await sb.auth.getSession();
        const user = s?.data?.session?.user || s?.data?.user || null;
        if (user && user.email) { btn.textContent = user.email; btn.onclick = function(e){ e.preventDefault(); showAccountMenu(); }; return; }
      }
    } catch(e){ console.warn('updateHeaderLogin supabase check failed', e); }
    var s = getLocalSession();
    if (s && s.email) { btn.textContent = s.email; btn.onclick = function(e){ e.preventDefault(); showAccountMenu(); }; } else { btn.textContent = 'Login'; btn.onclick = function(e){ e.preventDefault(); showLoginModal(); }; }
  }

  function showAccountMenu(){ (async function(){ try { const sb = await ensureSupabaseReady(); if (sb) { if (!confirm('Signed in. Click OK to log out.')) return; await sb.auth.signOut(); alert('Signed out'); updateHeaderLogin(); return; } } catch(e){ console.warn(e); } if (!confirm('Signed in as ' + (getLocalSession()?.email || '') + '. Click OK to log out.')) return; clearLocalSession(); alert('Logged out'); })(); }

  document.addEventListener('DOMContentLoaded', function(){
    try{
      console.debug('[login-modal] DOMContentLoaded handler start');
      var modal = document.getElementById('loginModal'); if (!modal) { console.debug('[login-modal] modal not found'); return; }
    modal.querySelectorAll('.close, .modal-backdrop').forEach(function(el){ el.addEventListener('click', function(e){ e.preventDefault(); hideLoginModal(); }); });
    var loginTab = document.getElementById('loginTab'); var registerTab = document.getElementById('registerTab');
    // Helper to set active tab visually and show/hide panes. Uses class + inline style fallback for robustness.
    function setActiveTab(name){ try{
      var lp = modal.querySelector('.login-pane'); var rp = modal.querySelector('.register-pane');
      if(name==='register'){
        if(lp) lp.style.display='none'; if(rp) rp.style.display='block';
        registerTab && registerTab.classList.add('active'); loginTab && loginTab.classList.remove('active');
        // inline style fallback
        if(registerTab){ registerTab.style.background='#fff'; registerTab.style.color='#d63384'; }
        if(loginTab){ loginTab.style.background='transparent'; loginTab.style.color=''; }
  // focus name in register
  try{ var e = modal.querySelector('#regName'); if(e){ setTimeout(()=>e.focus(),60); } }catch(e){}
      } else {
        if(lp) lp.style.display='block'; if(rp) rp.style.display='none';
        loginTab && loginTab.classList.add('active'); registerTab && registerTab.classList.remove('active');
        if(loginTab){ loginTab.style.background='#fff'; loginTab.style.color='#d63384'; }
        if(registerTab){ registerTab.style.background='transparent'; registerTab.style.color=''; }
        try{ var le = modal.querySelector('#loginEmail'); if(le){ setTimeout(()=>le.focus(),60); } }catch(e){}
      }
    }catch(err){ console.warn('setActiveTab error', err); } }

    loginTab && loginTab.addEventListener('click', function(e){ e.preventDefault(); setActiveTab('login'); });
    registerTab && registerTab.addEventListener('click', function(e){ e.preventDefault(); setActiveTab('register'); });

  // Helper to open the modal and switch to the register pane
  function openRegisterPane(){ try { modal.style.display='block'; setActiveTab('register'); } catch(e){ console.warn('openRegisterPane failed', e); } }

    // Wire common header/register buttons to open the register pane.
    (function wireHeaderRegisterButtons(){
      try {
        // Common selectors to catch different templates
        var selectors = ['#siteRegisterBtn', '.site-register', '.register-link', 'a[href="#register"]'];
        var els = Array.from(document.querySelectorAll(selectors.join(','))).filter(Boolean);
        // Also look for top-nav anchors that have visible text 'Register'
        var navAnchors = Array.from(document.querySelectorAll('header a, nav a, .header a')) || [];
        navAnchors.forEach(function(a){ try{ if((a.textContent||'').trim().toLowerCase()==='register') els.push(a); }catch(e){} });
        // Deduplicate
        els = els.filter(function(v,i){ return els.indexOf(v)===i; });
  els.forEach(function(el){ el.addEventListener('click', function(ev){ try{ ev.preventDefault(); openRegisterPane(); }catch(e){} }); });
  console.debug('[login-modal] wired header register elements count=', els.length);
  // If nothing found, we intentionally do not create a floating Register button to avoid UI duplicates.
  if(els.length===0){ console.debug('[login-modal] no header register found; skipping floatingRegisterBtn by design'); }
      } catch(e){ console.warn('wireHeaderRegisterButtons failed', e); }
    })();

    var regBtn = document.getElementById('regBtn');
    // Named handler so we can reuse via delegation if direct binding fails
    async function handleRegisterClick(e){
      console.debug('[login-modal] handleRegisterClick invoked');
      try{
        if(e && e.preventDefault) e.preventDefault();
        var name = document.getElementById('regName') ? document.getElementById('regName').value.trim() : '';
        var email = document.getElementById('regEmail') ? document.getElementById('regEmail').value.trim() : '';
        var pass = document.getElementById('regPassword') ? document.getElementById('regPassword').value : '';
        var pass2 = document.getElementById('regConfirmPassword') ? document.getElementById('regConfirmPassword').value : '';
        var msg = document.getElementById('loginMsg'); if(msg) msg.textContent = '';
        // basic validation
        if(!name){ if(msg){ msg.className='msg error'; msg.textContent='Please enter your full name.'; } return; }
        if(!email || !pass){ if(msg) { msg.className='msg error'; msg.textContent='Please enter email and password.'; } return; }
        if(pass !== pass2){ if(msg){ msg.className='msg error'; msg.textContent='Passwords do not match.'; } return; }
        if(regBtn){ regBtn.disabled = true; regBtn.textContent='Registering...'; }
        await registerUser(email, pass, name);
        if(msg){ msg.className='msg success'; msg.textContent='Registered — if email confirmation is required, check your inbox.'; }
        setTimeout(()=>{ hideLoginModal(); }, 900);
      } catch(err){ var msg = document.getElementById('loginMsg'); if(msg){ msg.className='msg error'; msg.textContent = err.message || 'Error'; } }
      finally { if(regBtn){ regBtn.disabled=false; regBtn.textContent='Register'; } updateHeaderLogin(); }
    }
    if (regBtn) { regBtn.addEventListener('click', handleRegisterClick); console.debug('[login-modal] direct regBtn listener attached'); }
    // Delegated fallback: catch clicks on buttons that match #regBtn in case direct binding failed
    document.addEventListener('click', function(ev){ try{ var t = ev.target; var btn = t.closest && t.closest('#regBtn'); if(btn){ if(btn !== regBtn){ console.debug('[login-modal] delegated click on regBtn detected (different element)'); handleRegisterClick(ev); } else { console.debug('[login-modal] delegated click on regBtn detected (same element)'); } } }catch(e){ console.warn('delegated regBtn handler error', e); } });

    // Delegated handler for Register/Login tabs (capture phase) to ensure tab switching works even if template overrides events
    document.addEventListener('click', function(ev){ try{
      var rt = ev.target && ev.target.closest ? ev.target.closest('#registerTab') : null;
      var lt = ev.target && ev.target.closest ? ev.target.closest('#loginTab') : null;
      if(rt){ ev.preventDefault(); console.debug('[login-modal] delegated click on registerTab'); setActiveTab('register'); return; }
      if(lt){ ev.preventDefault(); console.debug('[login-modal] delegated click on loginTab'); setActiveTab('login'); return; }
    }catch(e){ console.warn('delegated tab handler error', e); } }, true);

    // Capture-phase pointerdown/touch handler to give immediate visual feedback and ensure handler runs
    var regClicked = false;
    document.addEventListener('pointerdown', function(ev){
      try{
        var b = ev.target && ev.target.closest ? ev.target.closest('#loginModal button') : null;
        if(!b) return;
        var isReg = (b.id === 'regBtn') || ((b.textContent||'').trim().toLowerCase() === 'register');
        if(isReg){
          console.debug('[login-modal] pointerdown on register button (capture)');
          // immediate visual feedback
          try{ b.dataset.origText = b.textContent; b.textContent = 'Registrando...'; b.disabled = true; }catch(e){}
          // prevent double-invoke
          if(regClicked) return; regClicked = true;
          ev.preventDefault(); ev.stopPropagation();
          // call handler and restore button after
          Promise.resolve().then(()=> handleRegisterClick(ev)).finally(()=>{ try{ b.disabled=false; b.textContent = b.dataset.origText || 'Register'; }catch(e){} regClicked=false; });
        }
      }catch(e){ console.warn('pointerdown handler error', e); }
    }, true);

    console.debug('[login-modal] DOMContentLoaded handler end');
    }catch(err){ console.error('[login-modal] error in DOMContentLoaded handler', err); }

    var loginBtn = document.getElementById('loginBtn'); if (loginBtn) loginBtn.addEventListener('click', async function(e){
      e.preventDefault(); var email = document.getElementById('loginEmail').value; var pass = document.getElementById('loginPassword').value; var msg = document.getElementById('loginMsg'); msg.textContent='';
      if(!email || !pass){ msg.className='msg error'; msg.textContent='Please enter email and password.'; return; }
      try { loginBtn.disabled=true; loginBtn.textContent='Signing in...'; await loginUser(email, pass); msg.className='msg success'; msg.textContent='Signed in'; setTimeout(()=>{ hideLoginModal(); }, 500);
      } catch(err){ msg.className='msg error'; msg.textContent = err.message || 'Error'; }
      finally { loginBtn.disabled=false; loginBtn.textContent='Login'; updateHeaderLogin(); }
    });

    updateHeaderLogin();
  });
})();
