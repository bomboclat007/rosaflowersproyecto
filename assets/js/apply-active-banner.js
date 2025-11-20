(function(){
  async function applyActiveBanner(){
    try{
      const resp = await fetch('/api/upload-cover?action=active');
      if(!resp.ok) return;
      const j = await resp.json();
      if(!j || !j.active || !j.active.publicURL) return;
      const url = j.active.publicURL;

      // Try a few common hero selectors first for better compatibility
      const selectorCandidates = ['#hero', '.hero', '.site-hero', '.masthead', '.hero-container', '.page-hero', '.home-hero'];
      let container = null;
      for(const sel of selectorCandidates){
        const el = document.querySelector(sel);
        if(el){ container = el; break; }
      }

      // If not found, try to locate a large heading (heuristic)
      if(!container){
        const headers = Array.from(document.querySelectorAll('h1, h2'));
        // choose the header with the largest computed font size / area
        let best = null; let bestScore = 0;
        for(const h of headers){
          try{
            const rect = h.getBoundingClientRect();
            const style = window.getComputedStyle(h);
            const fontSize = parseFloat(style.fontSize||0);
            const score = (rect.width * rect.height) + fontSize * 100;
            if(score > bestScore){ bestScore = score; best = h; }
          }catch(e){ }
        }
        if(best){
          // climb up until we find a container with reasonable size
          let c = best;
          for(let i=0;i<8;i++){
            if(!c) break;
            const r = c.getBoundingClientRect();
            if(r.width > 300 && r.height > 120){ container = c; break; }
            c = c.parentElement;
          }
          if(!container) container = best.parentElement || document.body;
        }
      }

      if(!container) return;

      // apply background styles
      container.style.backgroundImage = 'url("' + url + '")';
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center center';
      container.style.backgroundRepeat = 'no-repeat';

      // ensure container can position overlay
      const pos = window.getComputedStyle(container).position;
      if(pos === 'static') container.style.position = 'relative';

      // add a subtle overlay to improve text readability if not present
      const overlayId = 'active-banner-overlay';
      if(!document.getElementById(overlayId)){
        const o = document.createElement('div');
        o.id = overlayId;
        o.style.position = 'absolute';
        o.style.left = '0'; o.style.top = '0'; o.style.right = '0'; o.style.bottom = '0';
        o.style.background = 'rgba(255,255,255,0.22)';
        o.style.pointerEvents = 'none';
        container.insertBefore(o, container.firstChild);
      }
    }catch(e){ console.warn('applyActiveBanner failed', e); }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyActiveBanner); else applyActiveBanner();
})();
