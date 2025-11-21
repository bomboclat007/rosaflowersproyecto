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
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', replaceFooterLogo); else replaceFooterLogo();
})();
