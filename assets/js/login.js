// Shim for legacy includes of /assets/js/login.js
// This script forwards legacy includes to the unified /assets/js/site-login.js
// so we don't need to edit hundreds of HTML files.
(function(){
  try{
    if(document.getElementById('site-login-shim')) return;
    var s = document.createElement('script');
    s.id = 'site-login-shim';
    s.src = '/assets/js/site-login.js';
    s.defer = true;
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  }catch(e){
    console.warn('login shim failed', e);
  }
})();