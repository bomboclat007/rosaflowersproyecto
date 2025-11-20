(function(){
  async function applyActiveBanner(){
    try{
      const resp = await fetch('/api/upload-cover?action=active');
      if(!resp.ok) return;
      const j = await resp.json();
      if(!j || !j.active || !j.active.publicURL) return;
      const url = j.active.publicURL;

      // find the element that contains the hero text
      const candidates = Array.from(document.querySelectorAll('h1, h2, p, div'));
      let targetEl = null;
      for(const el of candidates){
        try{
          const txt = (el.textContent||'').trim();
          if(!txt) continue;
          if(txt.indexOf('Unique, Whimsical, Cottage') !== -1 || txt.indexOf('Unique, Whimsical, Cottage Florals') !== -1){ targetEl = el; break; }
        }catch(e){ }
      }
      if(!targetEl) return;

      // climb up to find a container with size we can set background on
      let container = targetEl;
      for(let i=0;i<8;i++){
        if(!container) break;
        const rect = container.getBoundingClientRect();
        if(rect.width > 200 && rect.height > 100) break;
        container = container.parentElement;
      }
      if(!container) container = targetEl.parentElement || document.body;

      // apply background styles
      container.style.backgroundImage = 'url("' + url + '")';
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center center';
      container.style.backgroundRepeat = 'no-repeat';

      // optionally add an overlay for text readability
      const overlayId = 'active-banner-overlay';
      if(!document.getElementById(overlayId)){
        const o = document.createElement('div');
        o.id = overlayId;
        o.style.position = 'absolute';
        o.style.inset = '0';
        o.style.background = 'rgba(255,255,255,0.25)';
        o.style.pointerEvents = 'none';
        // ensure container is positioned
        const pos = window.getComputedStyle(container).position;
        if(pos === 'static') container.style.position = 'relative';
        container.insertBefore(o, container.firstChild);
      }
    }catch(e){ console.warn('applyActiveBanner failed', e); }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyActiveBanner); else applyActiveBanner();
})();
