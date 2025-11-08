// Minimal Leaflet-based delivery overview interactivity
document.addEventListener('DOMContentLoaded', function () {
  if (!document.getElementById('deliveryMap')) return;

  // create map centered near Philadelphia
  var map = L.map('deliveryMap', { scrollWheelZoom: false }).setView([39.95, -75.16], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // storage for zones: {id, name, postalCodes:[], pricing:{method, fee}, center:[lat,lng], radius}
  var zones = [];
  var mapLayers = {}; // id -> L.Layer
  var editingZoneId = null;
  var geocodeCache = {};
  try { geocodeCache = JSON.parse(localStorage.getItem('geocode_cache')||'{}'); } catch (e) { geocodeCache = {}; }
  var postalMarkers = {}; // zip -> L.Marker

  // helpers
  function uid() { return 'z' + Math.random().toString(36).slice(2,9); }

  function saveZones() { localStorage.setItem('delivery_zones', JSON.stringify(zones)); }
  function loadZones() { var s = localStorage.getItem('delivery_zones'); return s ? JSON.parse(s) : []; }

  function renderZoneList() {
    var container = document.getElementById('zonesContainer');
    if (!container) return;
    container.innerHTML = '';
    zones.forEach(function(z){
      var card = document.createElement('div');
      card.className = 'zone-card';
      card.setAttribute('data-zone-id', z.id);
  var h = document.createElement('div');
  h.innerHTML = '<div><span class="zone-price">' + (z.pricing.method === 'static' ? '$' + z.pricing.fee.toFixed(2) : 'Dynamic') + '</span><span class="zone-edit">Edit</span></div>';
      var places = document.createElement('div');
      places.className = 'zone-places';
      places.textContent = z.postalCodes.join(', ');
      card.appendChild(h);
      card.appendChild(places);
      // click handler to focus map
      card.addEventListener('click', function(){
        // highlight
        document.querySelectorAll('.zone-card').forEach(c=>c.classList.remove('active'));
        card.classList.add('active');
        // focus map
        if (z.center && z.radius) {
          var layer = mapLayers[z.id];
          if (layer) {
            layer.openPopup && layer.openPopup();
            map.fitBounds(layer.getBounds(), { maxZoom: 13 });
          }
        }
      });
      // add delete button
      var del = document.createElement('button'); del.className='btn ghost'; del.textContent='Delete';
      del.style.marginLeft='8px';
      del.addEventListener('click', function(e){ e.stopPropagation(); deleteZone(z.id); });
      h.appendChild(del);

      // edit handler
      var editBtn = h.querySelector('.zone-edit');
      if (editBtn) {
        editBtn.style.cursor = 'pointer';
        editBtn.addEventListener('click', function(e){
          e.stopPropagation(); startEditingZone(z.id);
        });
      }
      container.appendChild(card);
    });
  }

  function deleteZone(id) {
    zones = zones.filter(z => z.id !== id);
    // remove layer
    if (mapLayers[id]) { map.removeLayer(mapLayers[id]); delete mapLayers[id]; }
    saveZones(); renderZoneList();
  }

  // Geocode postal code using Nominatim (client-side), with caching
  function geocodePostalCode(zip) {
    return new Promise(function(resolve, reject){
      if (!zip) return resolve(null);
      var key = zip.trim().toUpperCase();
      if (geocodeCache[key]) return resolve(geocodeCache[key]);
      var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&postalcode=' + encodeURIComponent(key) + '&countrycodes=us';
      fetch(url, { headers: { 'Accept': 'application/json' } }).then(function(res){ return res.json(); }).then(function(json){
        if (json && json.length>0) {
          var lat = parseFloat(json[0].lat), lon = parseFloat(json[0].lon);
          var latlng = [lat, lon];
          geocodeCache[key] = latlng; localStorage.setItem('geocode_cache', JSON.stringify(geocodeCache));
          resolve(latlng);
        } else {
          var q = 'postal code ' + key + ' usa';
          var url2 = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
          fetch(url2).then(r=>r.json()).then(function(j2){ if (j2 && j2.length>0) { var lat=parseFloat(j2[0].lat), lon=parseFloat(j2[0].lon); var latlng=[lat,lon]; geocodeCache[key]=latlng; localStorage.setItem('geocode_cache', JSON.stringify(geocodeCache)); resolve(latlng); } else resolve(null); }).catch(()=>resolve(null));
        }
      }).catch(function(){ resolve(null); });
    });
  }

  // Compute convex hull (Monotone chain) for array of [lat,lng]
  function computeHullLatLng(points) {
    if (!points || points.length===0) return [];
    if (points.length===1) return [points[0]];
    var pts = points.map(p=>[p[1], p[0]]);
    pts.sort(function(a,b){ return a[0]===b[0] ? a[1]-b[1] : a[0]-b[0]; });
    function cross(o,a,b){ return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }
    var lower = [];
    for (var i=0;i<pts.length;i++){ while (lower.length>=2 && cross(lower[lower.length-2], lower[lower.length-1], pts[i]) <= 0) lower.pop(); lower.push(pts[i]); }
    var upper = [];
    for (var i=pts.length-1;i>=0;i--){ while (upper.length>=2 && cross(upper[upper.length-2], upper[upper.length-1], pts[i]) <= 0) upper.pop(); upper.push(pts[i]); }
    upper.pop(); lower.pop(); var hull = lower.concat(upper);
    return hull.map(p=>[p[1], p[0]]);
  }

  function renderZonesOnMap() {
    // clear
    Object.keys(mapLayers).forEach(function(k){ if (mapLayers[k]) map.removeLayer(mapLayers[k]); });
    mapLayers = {};
    zones.forEach(function(z){
      // If zone has postalCoordinates (from geocoding), render hull polygon; else fallback to center/radius circle
      if (z.postalCoordinates && z.postalCoordinates.length>0) {
        var hull = computeHullLatLng(z.postalCoordinates);
        if (hull.length === 1) {
          var c = L.circle(hull[0], { radius: 400, color: '#6c9ef8', fillColor: '#6c9ef8', fillOpacity:0.12 }).addTo(map);
          c.bindPopup('<strong>' + (z.name || 'Zone') + '</strong><br/>' + (z.pricing.method==='static' ? '$' + z.pricing.fee.toFixed(2) : 'Dynamic'));
          mapLayers[z.id] = c;
        } else {
          var poly = L.polygon(hull, { color:'#6c9ef8', fillColor:'#6c9ef8', fillOpacity:0.12 }).addTo(map);
          poly.bindPopup('<strong>' + (z.name || 'Zone') + '</strong><br/>' + (z.pricing.method==='static' ? '$' + z.pricing.fee.toFixed(2) : 'Dynamic'));
          mapLayers[z.id] = poly;
        }
        // also add small markers for each postal point
        (z.postalCoordinates||[]).forEach(function(p){ var mk = L.circleMarker(p, { radius:4, color:'#ff6b6b', fillColor:'#ff6b6b', fillOpacity:0.9 }).addTo(map); });
        // bind click highlight
        mapLayers[z.id].on && mapLayers[z.id].on('click', function(){ document.querySelectorAll('.zone-card').forEach(c=>c.classList.remove('active')); var el = document.querySelector('[data-zone-id="'+z.id+'"]'); if (el) el.classList.add('active'); });
      } else if (z.center && z.radius) {
        var c = L.circle(z.center, { radius: z.radius, color: '#6c9ef8', fillColor: '#6c9ef8', fillOpacity:0.12 }).addTo(map);
        c.bindPopup('<strong>' + (z.name || 'Zone') + '</strong><br/>' + (z.pricing.method==='static' ? '$' + z.pricing.fee.toFixed(2) : 'Dynamic'));
        mapLayers[z.id] = c;
        c.on('click', function(){ document.querySelectorAll('.zone-card').forEach(c=>c.classList.remove('active')); var el = document.querySelector('[data-zone-id="'+z.id+'"]'); if (el) el.classList.add('active'); });
      }
    });
  }

  // load existing
  zones = loadZones();
  renderZonesOnMap(); renderZoneList();

  // UI: accordion controls
  document.querySelectorAll('.accordion .section-head').forEach(function(h){
    h.addEventListener('click', function(){
      var body = h.nextElementSibling; if (!body) return; body.style.display = (body.style.display==='none' || !body.style.display) ? 'block' : 'none';
    });
    // open by default
    var b = h.nextElementSibling; if (b) b.style.display='block';
  });

  // Chips: add postal code
  function createChip(value) {
    // avoid duplicate chips
    var existing = chipsContainer && chipsContainer.querySelector('[data-zip="' + value + '"]');
    if (existing) return existing;
    var chip = document.createElement('span'); chip.className='chip'; chip.textContent = value;
    var rem = document.createElement('span'); rem.className='remove'; rem.textContent='×'; rem.addEventListener('click', function(){ chip.remove(); });
    chip.appendChild(rem);
    chip.setAttribute('data-zip', value);
    // geocode and add marker (async, cache-aware)
    geocodePostalCode(value).then(function(latlng){
      if (!latlng) return;
      try {
        var m = L.circleMarker(latlng, { radius:6, color:'#ff6b6b', fillColor:'#ff6b6b', fillOpacity:0.9 }).addTo(map);
        m.bindPopup('Postal: ' + value + '<br/>' + latlng[0].toFixed(4)+', '+latlng[1].toFixed(4));
        postalMarkers[value] = m;
        // fit map to markers
        var group = Object.values(postalMarkers).filter(Boolean);
        if (group.length) map.fitBounds(L.featureGroup(group).getBounds(), { maxZoom: 13 });
      } catch(e) { /* ignore map errors */ }
    }).catch(function(){ /* ignore */ });
    return chip;
  }

  function clearPostalChips() {
    // remove chip elements and markers
    if (!chipsContainer) return;
    chipsContainer.querySelectorAll('.chip').forEach(function(c){
      var zip = c.getAttribute('data-zip');
      if (zip && postalMarkers[zip]) { try { map.removeLayer(postalMarkers[zip]); } catch(e){} delete postalMarkers[zip]; }
      c.remove();
    });
  }

  // Haversine distance in miles between two [lat,lng]
  function distanceMiles(a, b) {
    if (!a || !b) return Infinity;
    var toRad = Math.PI/180;
    var lat1 = a[0]*toRad, lon1 = a[1]*toRad, lat2 = b[0]*toRad, lon2 = b[1]*toRad;
    var dlat = lat2-lat1, dlon = lon2-lon1;
    var sinDlat = Math.sin(dlat/2), sinDlon = Math.sin(dlon/2);
    var hav = sinDlat*sinDlat + Math.cos(lat1)*Math.cos(lat2)*sinDlon*sinDlon;
    var c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1-hav));
    var R = 3958.8; // miles
    return R * c;
  }

  // Add postal codes from geocodeCache that are between min and max miles from pendingCenter
  var addRangeBtn = document.getElementById('addRangeBtn');
  var clearChipsBtn = document.getElementById('clearChipsBtn');
  if (addRangeBtn) addRangeBtn.addEventListener('click', function(e){
    e.preventDefault();
    if (!pendingCenter) { alert('Please choose a center on the map first.'); return; }
    var min = parseFloat(document.getElementById('minMiles').value) || 0;
    var max = parseFloat(document.getElementById('maxMiles').value) || 0;
    if (min > max) { alert('Min must be <= Max'); return; }
    var found = 0;
    Object.keys(geocodeCache).forEach(function(zip){
      var coord = geocodeCache[zip];
      if (!coord) return;
      var d = distanceMiles(pendingCenter, coord);
      if (d >= min && d <= max) {
        // add chip if not present
        var displayZip = zip;
        if (!chipsContainer.querySelector('[data-zip="' + displayZip + '"]')) {
          var chip = createChip(displayZip);
          chipsContainer.appendChild(chip);
          found++;
        }
      }
    });
    if (!found) alert('No cached postal codes found in that range. Add postal codes manually or geocode some first.');
  });
  if (clearChipsBtn) clearChipsBtn.addEventListener('click', function(e){ e.preventDefault(); clearPostalChips(); });

  var chipsContainer = document.getElementById('postalChips');
  var addZipBtn = document.getElementById('addZipBtn');
  var zipInput = document.getElementById('zipInput');
  if (addZipBtn) addZipBtn.addEventListener('click', function(){ var v = zipInput.value.trim(); if (!v) return; var chip = createChip(v); chipsContainer.appendChild(chip); zipInput.value=''; });

  // Add by radius: user clicks map to choose center
  var chooseCenterBtn = document.getElementById('chooseCenterBtn');
  var centerDisplay = document.getElementById('centerInfo');
  var pendingCenter = null;
  if (chooseCenterBtn) {
    chooseCenterBtn.addEventListener('click', function(){
      alert('Click on map to set the center for the new zone');
      var handler = function(e){ pendingCenter = [e.latlng.lat, e.latlng.lng]; centerDisplay.textContent = 'Center set: ' + pendingCenter[0].toFixed(4) + ', ' + pendingCenter[1].toFixed(4); map.off('click', handler); };
      map.on('click', handler);
    });
  }

  // Save zone
  var saveZoneBtn = document.getElementById('saveZoneBtn');
  if (saveZoneBtn) saveZoneBtn.addEventListener('click', async function(){
    // Async save: ensure all postal codes are geocoded before saving so polygons can be built
    saveZoneBtn.disabled = true; saveZoneBtn.textContent = editingZoneId ? 'Updating...' : 'Saving...';
    var name = document.getElementById('zoneName').value.trim();
    // collect postal codes from chips
    var postal = [];
    chipsContainer.querySelectorAll('.chip').forEach(function(c){ postal.push(c.firstChild ? c.firstChild.nodeValue.trim() : c.textContent.trim()); });

    // Ensure geocoding for all postal codes (await missing ones)
    var postalCoords = [];
    try {
      var geocodePromises = postal.map(function(p){
        var key = p.trim().toUpperCase();
        if (geocodeCache[key]) return Promise.resolve(geocodeCache[key]);
        return geocodePostalCode(key).then(function(latlng){ return latlng; });
      });
      var results = await Promise.all(geocodePromises);
      results.forEach(function(r){ if (r) postalCoords.push(r); });
    } catch (e) { /* ignore geocode errors, continue with what we have */ }

    var method = document.querySelector('.toggle .active') ? document.querySelector('.toggle .active').getAttribute('data-method') : 'static';
    var fee = parseFloat(document.getElementById('deliveryFee').value) || 0;
    var radiusMiles = parseFloat(document.getElementById('radiusMiles').value) || 0;

    var currentZoneId = editingZoneId;
    if (editingZoneId) {
      // update existing
      var z = zones.find(x=>x.id===editingZoneId);
      if (z) {
        z.name = name;
        z.postalCodes = postal;
        z.postalCoordinates = postalCoords;
        z.pricing = { method: method, fee: fee };
        z.center = pendingCenter;
        z.radius = radiusMiles ? radiusMiles * 1609.34 : null;
      }
      editingZoneId = null;
    } else {
      var newZone = { id: uid(), name: name, postalCodes: postal, postalCoordinates: postalCoords, pricing: { method: method, fee: fee }, center: pendingCenter, radius: radiusMiles ? radiusMiles * 1609.34 : null };
      zones.push(newZone);
      currentZoneId = newZone.id;
    }

    saveZones(); renderZonesOnMap(); renderZoneList();

    // center map on the newly saved zone
    try {
      var layer = mapLayers[currentZoneId];
      if (layer && layer.getBounds) {
        map.fitBounds(layer.getBounds(), { maxZoom: 13 });
      } else if (layer && layer.getLatLng) {
        map.setView(layer.getLatLng(), 13);
      }
    } catch (e) { /* ignore focusing errors */ }

    // reset form and UI
    document.getElementById('zoneName').value=''; chipsContainer.innerHTML=''; document.getElementById('deliveryFee').value=''; document.getElementById('radiusMiles').value=''; centerDisplay.textContent=''; pendingCenter=null;
    saveZoneBtn.disabled = false; saveZoneBtn.textContent = 'Save Zone';
  });

  function startEditingZone(id) {
    var z = zones.find(x=>x.id===id); if (!z) return;
    editingZoneId = id;
    document.getElementById('zoneName').value = z.name || '';
    // populate chips
    chipsContainer.innerHTML = '';
    (z.postalCodes||[]).forEach(function(p){ chipsContainer.appendChild(createChip(p)); });
    // pricing
    document.getElementById('deliveryFee').value = z.pricing && z.pricing.fee ? z.pricing.fee : '';
    // toggle
    document.querySelectorAll('.toggle button').forEach(b=>b.classList.remove('active'));
    var tb = document.querySelector('.toggle button[data-method="'+(z.pricing && z.pricing.method ? z.pricing.method : 'static')+'"]'); if (tb) tb.classList.add('active');
    // center & radius
    pendingCenter = z.center || null; if (pendingCenter) centerDisplay.textContent = 'Center set: ' + pendingCenter[0].toFixed(4) + ', ' + pendingCenter[1].toFixed(4);
    document.getElementById('radiusMiles').value = z.radius ? (z.radius / 1609.34).toFixed(2) : '';
    // change save button to indicate update
    if (saveZoneBtn) { saveZoneBtn.textContent = 'Update Zone'; }
  }

  // Toggle buttons
  document.querySelectorAll('.toggle button').forEach(function(b){ b.addEventListener('click', function(){ document.querySelectorAll('.toggle button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }); });

});
