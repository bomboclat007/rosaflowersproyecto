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

      // Replace known legacy contact blocks that were copied from the original
      // Squarespace export so the index contact matches across all pages.
      try{
        var legacyRegex = /38480|Prairieville|thefloralcottageflorist@gmail.com|\(225\)|LA-42|Prairieville, LA/ig;
        var contactHtml = '<strong>The Floral Cottage</strong><br/>' + ADDRESS.replace(/\n/g,'<br/>') + '<br/><br/>' + '<a href="mailto:'+EMAIL+'">'+EMAIL+'</a><br/>' + '<a href="tel:'+PHONE.replace(/[^0-9+]/g,'')+'">'+PHONE+'</a>';
        document.querySelectorAll('p,div,span,li').forEach(function(el){
          try{
            if(el && el.textContent && legacyRegex.test(el.textContent)){
              el.innerHTML = contactHtml;
            }
          }catch(e){}
        });

        // Fix mailto/tel anchors that still point to old addresses/numbers
        document.querySelectorAll('a[href^="mailto:"]').forEach(function(a){ try{ if(/thefloralcottageflorist@gmail.com/i.test(a.href)) { a.href = 'mailto:'+EMAIL; a.textContent = EMAIL; } }catch(e){} });
        document.querySelectorAll('a[href^="tel:"]').forEach(function(a){ try{ if(/225/.test(a.getAttribute('href'))) { a.href = 'tel:'+PHONE.replace(/[^0-9+]/g,''); a.textContent = PHONE; } }catch(e){} });
      }catch(e){}
    }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', replaceFooterLogo); else replaceFooterLogo();
})();
