// Minimal footer logo replacement (banners removed)
(function(){
  function replaceFooterLogo(){
    try{
      var newSrc = 'assets/img/logopequeno.jpg';
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
