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
    // Replace footer contact block that contains the old business info
    try{
      var newContactHTML = '8950 Krewstown Rd<br>Philadelphia, PA 19115<br><br><a href="mailto:rosasflowers.events@gmail.com" target="_blank">rosasflowers.events@gmail.com</a><br><a href="tel:2155525113" target="_blank">(215) 552-5113</a>';
      document.querySelectorAll('p').forEach(function(p){
        try{
          var txt = (p.textContent || '').trim();
          if(!txt) return;
          if(txt.indexOf('The Floral Cottage Florist') !== -1 || txt.indexOf('thefloralcottageflorist@gmail.com') !== -1 || txt.indexOf('(225) 677-2600') !== -1){
            p.innerHTML = newContactHTML;
            p.style.textAlign = 'center';
            p.style.whiteSpace = 'pre-wrap';
          }
        }catch(e){}
      });

      // Also update any mailto/tel anchors site-wide that reference the old contact
      document.querySelectorAll('a[href^="mailto:"]').forEach(function(a){
        try{
          var href = a.getAttribute('href') || '';
          if(href.indexOf('thefloralcottageflorist') !== -1){
            a.setAttribute('href', 'mailto:rosasflowers.events@gmail.com');
            if(!a.textContent || a.textContent.indexOf('thefloralcottage') !== -1) a.textContent = 'rosasflowers.events@gmail.com';
          }
        }catch(e){}
      });
      document.querySelectorAll('a[href^="tel:"]').forEach(function(a){
        try{
          var href = a.getAttribute('href') || '';
          if(href.indexOf('2256772600') !== -1 || href.indexOf('225') !== -1){
            a.setAttribute('href', 'tel:2155525113');
            if(!a.textContent || a.textContent.indexOf('(225)') !== -1) a.textContent = '(215) 552-5113';
          }
        }catch(e){}
      });
    }catch(e){}
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', replaceFooterLogo); else replaceFooterLogo();
})();
