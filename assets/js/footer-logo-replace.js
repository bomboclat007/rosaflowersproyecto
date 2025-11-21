// Minimal footer logo replacement (banners removed)
(function(){
  function replaceFooterLogo(){
    try{
      // Use the small footer logo file. If your filename contains an accent,
      // use the accented name. README suggests `logopequeno.jpg` without
      // accents for compatibility, but the site will accept `logopequeño.jpg`.
      var newSrc = 'assets/img/logopequeño.jpg';
      var selectors = ['footer img','.footer img','.site-footer img','.footer-logo img','.sqs-footer img'];
      selectors.forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(img){
          try{ if(!img.getAttribute('data-prev-src')) img.setAttribute('data-prev-src', img.getAttribute('src')||''); img.setAttribute('src', newSrc); }catch(e){}
        });
      });
    }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', replaceFooterLogo); else replaceFooterLogo();
})();
