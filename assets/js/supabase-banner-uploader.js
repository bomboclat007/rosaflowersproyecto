// REMOVED: Banner uploader script — removed per request to delete banner functionality.
// If you need to restore it later, re-add the uploader implementation or revert the commit/branch.
// This file intentionally left minimal to remove banner-related functionality and secrets.

console.warn('supabase-banner-uploader.js removed: banner uploader disabled.');
// END OF REMOVAL
                  status.textContent = 'Estableciendo banner activo...';
                  try{
                    var meta = { name: item.name };
                    var blob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
                    var up = await supabaseClient.storage.from(bucketName).upload('active-banner.json', blob, { upsert: true });
                    if(up.error){ status.textContent = 'Error al activar: ' + (up.error.message || JSON.stringify(up.error)); return; }
                        status.innerHTML = 'Banner activado: ' + item.name;
                        // update localStorage hint so homepage can apply the banner immediately
                        try{
                          var pubUrl = '';
                          try{ pubUrl = supabaseClient.storage.from(bucketName).getPublicUrl(item.name).data.publicUrl; }catch(_){ pubUrl = ''; }
                          if(pubUrl){ try{ localStorage.setItem('website_banners', JSON.stringify([{ active:true, data: pubUrl + '?v=' + Date.now() }])); }catch(_){ } }
                          try{ window.dispatchEvent(new CustomEvent('banner-updated')); }catch(_){ }
                          try{ if(typeof BroadcastChannel !== 'undefined'){ var _bc = new BroadcastChannel('banner-channel'); _bc.postMessage({ type: 'updated', url: pubUrl + '?v=' + Date.now() }); _bc.close(); } }catch(_){ }
                        }catch(_){ }
                        await refreshList();
                  }catch(e){ status.textContent = 'Error al activar: ' + (e.message||e); }
                } else {
                  // Desactivar
                  if(!confirm('Desactivar el banner activo?')) return;
                  status.textContent = 'Desactivando...';
                  try{
                    var rm = await supabaseClient.storage.from(bucketName).remove(['active-banner.json']);
                    if(rm.error){ status.textContent = 'Error al desactivar: ' + (rm.error.message || JSON.stringify(rm.error)); return; }
                    status.textContent = 'Banner desactivado.';
                    await refreshList();
                  }catch(e){ status.textContent = 'Error al desactivar: ' + (e.message||e); }
                }
              });

              // wire delete: remove the image from storage and also remove active-banner.json if it referenced this file
              delBtn.addEventListener('click', async function(){
                if(!confirm('Eliminar ' + item.name + ' del bucket?')) return;
                status.textContent = 'Eliminando...';
                try{
                  var rm = await supabaseClient.storage.from(bucketName).remove([item.name]);
                  if(rm.error){ console.error('remove error', rm); status.textContent = 'Error al eliminar: ' + (rm.error.message || JSON.stringify(rm.error)); return; }

                  // if deleted file was active, remove active-banner.json
                  if(activeName && item.name === activeName){
                    try{
                      var rm2 = await supabaseClient.storage.from(bucketName).remove(['active-banner.json']);
                      if(rm2.error){ console.error('remove active-banner error', rm2); status.textContent = 'Archivo eliminado. Error al limpiar active-banner: ' + (rm2.error.message||JSON.stringify(rm2.error)); await refreshList(); return; }
                      // clear client-side hint too
                      try{ localStorage.removeItem('website_banners'); }catch(_){ }
                      try{ window.dispatchEvent(new CustomEvent('banner-updated')); }catch(_){ }
                      try{ if(typeof BroadcastChannel !== 'undefined'){ var _bc2 = new BroadcastChannel('banner-channel'); _bc2.postMessage({ type: 'cleared' }); _bc2.close(); } }catch(_){ }
                    }catch(e){ console.error('remove active-banner exception', e); }
                  }

                  status.textContent = 'Archivo eliminado.';
                  await refreshList();
                }catch(e){ status.textContent = 'Error al eliminar: ' + (e.message||e); }
              });
            });
          }catch(e){ list.textContent = 'Error al listar: ' + e.message; }
        }

        // initial list
        refreshList();

      }catch(err){
        console.error('Error inicializando supabase client', err);
        document.getElementById('uploadStatus').textContent = 'Error inicializando Supabase: ' + (err.message || err);
      }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
