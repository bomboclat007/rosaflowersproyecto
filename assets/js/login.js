// Desactivar funcionalidad de login
document.addEventListener('DOMContentLoaded', function() {
    const loginButtons = document.querySelectorAll('.user-accounts-link');
    loginButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Prevenir la redirección
            console.log('Login temporalmente deshabilitado');
            return false;
        });
    });
});

// ---- Nav injection: add a "Dresses" nav item after "Flowers" ----
// This is best-effort and will run on pages that already include this script.
(function(){
    'use strict';

    function textEquals(node, text){
        if(!node) return false;
        return (node.textContent||'').trim().toLowerCase() === text.trim().toLowerCase();
    }

    function insertAfter(newNode, referenceNode){
        if(!referenceNode || !referenceNode.parentNode) return;
        if(referenceNode.nextSibling) referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
        else referenceNode.parentNode.appendChild(newNode);
    }

    function createNavItem(referenceItem, label, href){
        if(!referenceItem) return null;
        var container = referenceItem.cloneNode(false);
        var anchor = referenceItem.querySelector('a');
        var span = referenceItem.querySelector('.header-nav-folder-title-text');
            if(anchor){
                var newAnchor = anchor.cloneNode(true);
                newAnchor.textContent = label;
                try{ newAnchor.setAttribute('href', '/' + href.replace(/^\/*/, '')); }catch(e){}
                newAnchor.removeAttribute('data-toggle');
                // Force navigation even if other handlers intercept clicks: use capture-phase handler
                try{
                    newAnchor.addEventListener('click', function(evt){ evt.preventDefault(); window.location.href = '/' + href.replace(/^\/*/, ''); }, true);
                }catch(e){}
                container.appendChild(newAnchor);
                return container;
            }
        if(span){
            var a = document.createElement('a');
            a.className = span.className || '';
            a.textContent = label;
            a.setAttribute('href', href);
            container.appendChild(a);
            return container;
        }
        var a2 = document.createElement('a');
        a2.textContent = label;
        a2.setAttribute('href', href);
        container.appendChild(a2);
        return container;
    }

    function alreadyHasDresses(){
        return document.querySelector('a[href$="dresses.html"], a[href="/dresses.html"], a[href*="/dresses"]') !== null ||
                     Array.prototype.some.call(document.querySelectorAll('.header-nav-folder-title-text'), function(n){
                         return (n.textContent||'').trim().toLowerCase() === 'dresses';
                     });
    }

    function tryInsert(){
        try{
            if(alreadyHasDresses()) return;
            var flowersSpans = document.querySelectorAll('.header-nav-folder-title-text');
            for(var i=0;i<flowersSpans.length;i++){
                var sp = flowersSpans[i];
                if(textEquals(sp, 'Flowers')){
                    var folderItem = sp.closest('.header-nav-item') || sp.parentElement;
                    if(folderItem){
                        var newItem = createNavItem(folderItem, 'Dresses', 'dresses.html');
                        if(newItem) insertAfter(newItem, folderItem);
                        break;
                    }
                }
            }
            // mobile/menu overlay
            var mobileCandidates = document.querySelectorAll('.header-menu-nav-item, .header-menu-nav-items .header-menu-nav-item');
            for(var j=0;j<mobileCandidates.length;j++){
                var item = mobileCandidates[j];
                var t = item.querySelector('.header-nav-folder-title-text, a');
                if(t && textEquals(t, 'Flowers')){
                    var newMobile = item.cloneNode(false);
                    var innerAnchor = item.querySelector('a');
                                if(innerAnchor){
                                    var newA = innerAnchor.cloneNode(true);
                                    newA.textContent = 'Dresses';
                                    try{ newA.setAttribute('href', '/dresses.html'); }catch(e){}
                                    try{ newA.addEventListener('click', function(evt){ evt.preventDefault(); window.location.href = '/dresses.html'; }, true); }catch(e){}
                                    newMobile.appendChild(newA);
                                } else {
                                    var a3 = document.createElement('a'); a3.textContent='Dresses'; a3.setAttribute('href','/dresses.html'); try{ a3.addEventListener('click', function(evt){ evt.preventDefault(); window.location.href = '/dresses.html'; }, true); }catch(e){} newMobile.appendChild(a3);
                                }
                    insertAfter(newMobile, item);
                    break;
                }
            }
        }catch(err){
            try{ console && console.error && console.error('nav insertion error', err); }catch(e){}
        }
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', function(){ tryInsert(); setTimeout(tryInsert, 500); });
    } else {
        tryInsert(); setTimeout(tryInsert, 500);
    }

    try{
        var observer = new MutationObserver(function(){ tryInsert(); });
        observer.observe(document.documentElement, {childList:true, subtree:true});
        setTimeout(function(){ try{ observer.disconnect(); }catch(e){} }, 4000);
    }catch(e){}

})();