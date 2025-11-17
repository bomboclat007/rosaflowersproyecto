// Suppress Squarespace account loading overlay/iframe that the exported JS injects.
// This removes any existing overlay and prevents it from appearing again by
// observing DOM mutations. Safer than editing vendor files.
(function(){
  try{
    // Add CSS rule to forcibly hide common overlay/iframe selectors
    var css = '#accountLoadingOverlay, #accountFrame, .Q7Q29OauHksiFEKQ, .pI9pX0r94c8rhLa2 { display: none !important; visibility: hidden !important; pointer-events: none !important; }';
    var s = document.createElement('style'); s.setAttribute('data-generated','disable-account-overlay'); s.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(s);

    function removeOverlayNow(){ try{
      var o = document.getElementById('accountLoadingOverlay'); if(o && o.parentElement) o.parentElement.removeChild(o);
      var f = document.getElementById('accountFrame'); if(f && f.parentElement) f.parentElement.removeChild(f);
    }catch(e){/* ignore */} }

    // Remove immediate instances
    removeOverlayNow();

    // Observe future additions and remove matching nodes
    var mo = new MutationObserver(function(m){ try{
      m.forEach(function(rec){ rec.addedNodes && Array.from(rec.addedNodes).forEach(function(n){
        if(!(n && n.id)) return;
        if(n.id === 'accountLoadingOverlay' || n.id === 'accountFrame'){
          try{ n.parentElement && n.parentElement.removeChild(n); }catch(_){}
        }
      }); });
    }catch(e){/* ignore */} });
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
    // Stop observing after 10s to avoid overhead
    setTimeout(function(){ try{ mo.disconnect(); }catch(e){} }, 10000);
  }catch(e){ console.warn('disable-account-overlay failed', e); }

  
  function openLoginModal(){
    // Ensure the login modal exists and login-modal.js is loaded. If not,
    // dynamically inject the script and a minimal modal markup, then show it.
    function ensureLoginModal(){
      return new Promise(function(resolve){
        if(document.getElementById('loginModal')) return resolve(true);
        if(window.showLoginModal) return resolve(true);

        // Inject minimal modal markup (so pages that lack it still get the UI).
        try{
          var tpl = document.createElement('div');
          tpl.innerHTML = '<div id="loginModal" class="login-modal" style="display:none;">\n  <div class="login-backdrop"></div>\n  <div class="login-dialog">\n    <button class="login-close" aria-label="Close">×</button>\n    <div class="login-container">\n      <h2>Account</h2>\n      <button id="login-btn">Sign In</button>\n    </div>\n  </div>\n</div>';
          document.body.appendChild(tpl.firstChild);
        }catch(e){/* ignore */}

        // If login-modal.js is already requested/loaded, wait a short time for it to initialize
        if(window.showLoginModal) return resolve(true);

        // Dynamically load the canonical login-modal script
        var s = document.createElement('script');
        s.src = '/assets/js/login-modal.js';
        s.defer = true;
        s.async = false;
        s.onload = function(){
          // wait briefly for the module to wire showLoginModal
          var waited = 0;
          var iv = setInterval(function(){
            if(window.showLoginModal || waited > 5000){ clearInterval(iv); resolve(true); }
            waited += 100;
          }, 100);
        };
        s.onerror = function(){ resolve(true); };
        (document.head || document.documentElement).appendChild(s);
      });
    }

    // Use the ensure routine and then open the modal
    ensureLoginModal().then(function(){
      var modal = document.getElementById('loginModal');
      if(modal){ try{ modal.style.display='block'; }catch(e){} }
      if(window.showLoginModal){ try{ window.showLoginModal(); }catch(e){} }
    });
    return true;
  }

  function handleLoginClick(e){
    var el = e.target;
    while(el && el !== document){
      if(el.id === 'siteLoginBtn' || (el.classList && el.classList.contains('header-login-static-link')) || (el.getAttribute && el.getAttribute('data-site-login') !== null)){
        e.preventDefault();
        var ok = openLoginModal();
        if(!ok) alert('Login not ready yet');
        return;
      }
      el = el.parentNode;
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ document.addEventListener('click', handleLoginClick, false); });
  else document.addEventListener('click', handleLoginClick, false);
})();
