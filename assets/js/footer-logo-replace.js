// Minimal footer logo replacement (banners removed)
(function(){
  function replaceFooterLogo(){
    try{
      // Use the small footer logo file without accents (safer cross-platform).
      var newSrc = 'assets/img/logopequeno.jpg';
      // Also replace any inline Squarespace logo images that use the round logo
      // filename (round+logo or round%2Blogo) so the center/footer logo is replaced.
      var selectors = ['footer img','.footer img','.site-footer img','.footer-logo img','.sqs-footer img'];
      selectors.forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(img){
          try{ if(!img.getAttribute('data-prev-src')) img.setAttribute('data-prev-src', img.getAttribute('src')||''); img.setAttribute('src', newSrc); }catch(e){}
        });
      });
      // Replace images whose src or data-image references the Squarespace round logo
      try{
        document.querySelectorAll('img').forEach(function(img){
          try{
            var src = (img.getAttribute('src')||'') + ' ' + (img.getAttribute('data-image')||'');
            if(/round(\+|%2B)?logo/i.test(src) || /round%2blogo/i.test(src)){
              if(!img.getAttribute('data-prev-src')) img.setAttribute('data-prev-src', img.getAttribute('src')||'');
              img.setAttribute('src', newSrc);
              // remove srcset to avoid browser picking CDN variants
              if(img.hasAttribute('srcset')) img.removeAttribute('srcset');
            }
          }catch(e){}
        });
      }catch(e){}
    }catch(e){}
    // Inject site-wide contact information and a small floating contact bar
    try{
      var ADDRESS = '8950 Krewstown Rd,\nPhiladelphia, PA 19115';
      var EMAIL = 'rosasflowers.events@gmail.com';
      var PHONE = '(215) 552-5113';

      // Helper to set text/html safely
      function setText(selArr, html) {
        selArr.forEach(function(sel){
          document.querySelectorAll(sel).forEach(function(el){
            try{ el.innerHTML = html; }catch(e){}
          });
        });
      }

      // Common selectors where contact info may appear
      setText(['.site-address','.address','.footer-address','[data-contact="address"], .contact-address'], ADDRESS.replace(/\n/g,'<br/>'));
      setText(['.site-email','a[href^="mailto:"]','.footer-email','[data-contact="email"], .contact-email'], '<a href="mailto:'+EMAIL+'">'+EMAIL+'</a>');
      setText(['.site-phone','a[href^="tel:"]','.footer-phone','[data-contact="phone"], .contact-phone'], '<a href="tel:'+PHONE.replace(/[^0-9+]/g,'')+'">'+PHONE+'</a>');

      // Add floating contact bar (if not already present)
      if(!document.getElementById('site-contact-bar')){
        var bar = document.createElement('div');
        bar.id = 'site-contact-bar';
        bar.style.position = 'fixed';
        bar.style.right = '18px';
        bar.style.bottom = '18px';
        bar.style.background = 'rgba(255,255,255,0.95)';
        bar.style.border = '1px solid rgba(0,0,0,0.06)';
        bar.style.padding = '10px 14px';
        bar.style.borderRadius = '8px';
        bar.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
        bar.style.zIndex = 9999;
        bar.style.fontFamily = 'sans-serif';
        bar.style.fontSize = '13px';
        bar.innerHTML = '<div style="text-align:right"><strong>Contact</strong></div>'+
                        '<div style="margin-top:6px">'+ADDRESS.replace(/\n/g,'<br/>')+'</div>'+
                        '<div style="margin-top:6px"><a href="mailto:'+EMAIL+'">'+EMAIL+'</a> · <a href="tel:'+PHONE.replace(/[^0-9+]/g,'')+'">'+PHONE+'</a></div>';
        document.body.appendChild(bar);
      }
    }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', replaceFooterLogo); else replaceFooterLogo();
})();
