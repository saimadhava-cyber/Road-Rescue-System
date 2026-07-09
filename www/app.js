// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

// App State Configuration
const getApiBase = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const paramApi = urlParams.get('api');
  if (paramApi) {
    localStorage.setItem('ROAD_RESCUE_API_URL', paramApi);
    return paramApi;
  }
  const storedApi = localStorage.getItem('ROAD_RESCUE_API_URL');
  if (storedApi) return storedApi;

  return window.location.origin.includes('file://') ? 'http://localhost:5000/api' : `${window.location.origin}/api`;
};

const CONFIG = {
  apiBase: getApiBase(),
  useBackend: false, // Will auto-detect on init
  defaultLat: 13.0827,
  defaultLng: 80.2707
};

// Global App States
const state = {
  currentLat: CONFIG.defaultLat,
  currentLng: CONFIG.defaultLng,
  speed: 45,
  safetyScore: 88,
  gForce: 1.0,
  isOnline: true,
  currentUser: null,
  
  // GPS Tracking States
  gpsWatchId: null,
  isTracking: false,
  
  // Active SOS tracking
  activeSOS: null, // { id, timer, severity, status, source }
  sosSecondsLeft: 5,
  sosInterval: null,
  
  // Active Roadside request tracking
  activeRoadside: null, // { id, type, status, provider }
  
  // Navigation
  activeTab: 'home',
  
  // Map elements
  map: null,
  userMarker: null,
  responderMarker: null,
  serviceMarkers: [],
  hazardMarkers: [],
  routeLine: null,
  
  // History lists
  incidents: [],
  assistanceRequests: [],
  hazards: [],
  diagnosticsHistory: [],
  
  // Chat Room
  chatPartner: 'Emergency Dispatcher',
  chatMessages: [],
  
  // Audio
  audioContext: null
};

// Auto-detect backend on startup
async function checkBackendConnection() {
  try {
    const res = await fetch(`${CONFIG.apiBase}/analytics`, { method: 'GET' });
    if (res.ok) {
      CONFIG.useBackend = true;
      console.log('Successfully connected to Node.js backend. Using Server API.');
    }
  } catch (err) {
    console.warn('Backend server not detected or offline. Running in Local Client Simulation mode.');
    CONFIG.useBackend = false;
  }
}

// Dynamic Address Resolution using OpenStreetMap Nominatim reverse geocoding API
async function fetchAddressFromGPS(lat, lng) {
  const streetEl = document.getElementById('txt-map-street');
  if (!streetEl) return;
  
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    if (!response.ok) throw new Error('OSM geocode request failed');
    
    const data = await response.json();
    if (data && data.address) {
      const addr = data.address;
      const road = addr.road || addr.pedestrian || addr.suburb || '';
      const suburb = addr.suburb || addr.neighbourhood || '';
      const city = addr.city || addr.town || addr.village || addr.county || '';
      const stateName = addr.state || '';
      const country = addr.country || '';
      
      let formattedAddress = '';
      if (road) formattedAddress += road;
      if (suburb) formattedAddress += (formattedAddress ? ', ' : '') + suburb;
      if (city) formattedAddress += (formattedAddress ? ', ' : '') + city;
      if (stateName) formattedAddress += (formattedAddress ? ', ' : '') + stateName;
      if (country) formattedAddress += (formattedAddress ? ', ' : '') + country;
      
      if (!formattedAddress) {
        formattedAddress = data.display_name || `Lat: ${lat.toFixed(5)}°, Lng: ${lng.toFixed(5)}°`;
      }
      
      if (formattedAddress.length > 50) {
        formattedAddress = formattedAddress.substring(0, 47) + '...';
      }
      
      streetEl.innerHTML = `<i class="fa-solid fa-location-dot" style="color:var(--color-blue)"></i> ${formattedAddress}`;
      console.log(`[GEO] Geocoded Address: ${formattedAddress}`);
    } else {
      streetEl.innerHTML = `<i class="fa-solid fa-location-crosshairs" style="color:var(--color-blue)"></i> GPS Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
    }
  } catch (err) {
    console.warn(`[GEO] Reverse Geocoding failed: ${err.message}. Falling back to coordinates.`);
    streetEl.innerHTML = `<i class="fa-solid fa-location-crosshairs" style="color:var(--color-blue)"></i> GPS Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
  }
}

// Live Weather Telemetry using Open-Meteo API
async function fetchWeatherFromGPS(lat, lng) {
  const weatherEl = document.getElementById('txt-map-weather');
  if (!weatherEl) return;
  
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&temperature_unit=fahrenheit`);
    if (!response.ok) throw new Error('Weather API request failed');
    
    const data = await response.json();
    if (data && data.current_weather) {
      const temp = Math.round(data.current_weather.temperature);
      const code = data.current_weather.weathercode;
      
      let icon = 'fa-cloud-sun';
      if (code === 0) icon = 'fa-sun';
      else if (code >= 1 && code <= 3) icon = 'fa-cloud-sun';
      else if (code >= 45 && code <= 48) icon = 'fa-smog';
      else if (code >= 51 && code <= 67) icon = 'fa-cloud-rain';
      else if (code >= 71 && code <= 77) icon = 'fa-snowflake';
      else if (code >= 80 && code <= 82) icon = 'fa-cloud-showers-heavy';
      else if (code >= 95 && code <= 99) icon = 'fa-bolt';
      
      weatherEl.innerHTML = `<i class="fa-solid ${icon}" style="color:var(--color-blue)"></i> <span>${temp}°F</span>`;
      console.log(`[WEATHER] Telemetry resolved: ${temp}°F (Code: ${code})`);
    }
  } catch (err) {
    console.warn(`[WEATHER] Failed to load local weather: ${err.message}`);
  }
}

// Toggle or start continuous/initial GPS tracking
async function toggleGpsTracking(enable, isInitial = false) {
  const trackerBtn = document.getElementById('btn-gps-tracker');
  
  if (!navigator.geolocation) {
    console.warn('[GEO] Geolocation is not supported by this browser.');
    expandDynamicIsland(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-red)"></i> GPS not supported on this device`);
    return;
  }
  
  if (!enable) {
    if (state.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(state.gpsWatchId);
      state.gpsWatchId = null;
    }
    state.isTracking = false;
    if (trackerBtn) trackerBtn.classList.remove('active');
    console.log('[GEO] Continuous GPS tracking stopped.');
    return;
  }
  
  if (trackerBtn) trackerBtn.classList.add('active');
  state.isTracking = true;
  
  const handlePosition = async (position) => {
    state.currentLat = position.coords.latitude;
    state.currentLng = position.coords.longitude;
    
    // Update speedometer if speed information is provided (speed is in meters/second)
    if (position.coords.speed !== null && position.coords.speed > 0) {
      const speedMph = Math.round(position.coords.speed * 2.23694);
      state.speed = speedMph;
      const speedSlider = document.getElementById('sim-speed');
      const lblSpeed = document.getElementById('lbl-speed');
      const appSpeedVal = document.getElementById('app-speed-val');
      if (speedSlider) speedSlider.value = speedMph;
      if (lblSpeed) lblSpeed.textContent = `${speedMph} mph`;
      if (appSpeedVal) appSpeedVal.textContent = `${speedMph} mph`;
      
      if (speedMph > 85) {
        expandDynamicIsland(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-red)"></i> Overspeed Warning: Slow Down!`);
        playBeep(660, 0.15);
      }
    }
    
    console.log(`[GEO] GPS coordinates updated: ${state.currentLat}, ${state.currentLng}`);
    
    if (state.map) {
      state.map.panTo([state.currentLat, state.currentLng]);
    }
    if (state.userMarker) {
      state.userMarker.setLatLng([state.currentLat, state.currentLng]);
      state.userMarker.getPopup().setContent(`<b>Your Location</b><br>Tesla Model Y - Active GPS Track`);
    }
    
    await fetchAddressFromGPS(state.currentLat, state.currentLng);
    await fetchWeatherFromGPS(state.currentLat, state.currentLng);
    await syncData();
  };

  const handleError = (error) => {
    console.warn(`[GEO] Geolocation error: ${error.message}`);
    if (isInitial) {
      fetchAddressFromGPS(state.currentLat, state.currentLng);
      fetchWeatherFromGPS(state.currentLat, state.currentLng);
    } else {
      expandDynamicIsland(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-red)"></i> Geolocation Error: ${error.message}`);
      toggleGpsTracking(false);
    }
  };

  const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
  
  if (isInitial) {
    navigator.geolocation.getCurrentPosition(handlePosition, handleError, options);
  } else {
    if (state.gpsWatchId !== null) {
      if (state.map) {
        state.map.setView([state.currentLat, state.currentLng], 15);
      }
      navigator.geolocation.getCurrentPosition(handlePosition, handleError, options);
    } else {
      state.gpsWatchId = navigator.geolocation.watchPosition(handlePosition, handleError, options);
      expandDynamicIsland(`<i class="fa-solid fa-location-crosshairs" style="color:var(--color-blue)"></i> Real GPS Tracking Enabled`);
    }
  }
}

// Request device's actual GPS location coordinates from browser (Wrapper for compatibility)
async function requestRealLocation() {
  await toggleGpsTracking(true, true);
}

// -------------------------------------------------------------
// Initialize App
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await checkBackendConnection();
  
  initMap();
  
  // Request real device coordinates asynchronously
  await requestRealLocation();
  
  initChart();
  initClock();
  setupEventListeners();
  
  // Perform initial data fetch
  await syncData();
  
  // Start speech triggers check
  initVoiceAssistant();
  
  // Initial page layout setup - check auto-login session
  const storedUser = localStorage.getItem('road_rescue_user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      state.currentUser = user;
      updateUIForAuthenticatedUser(user);
    } catch (e) {
      console.error('Error parsing stored user:', e);
      showAuthScreen('login');
    }
  } else {
    const hasRegistered = localStorage.getItem('has_registered');
    if (hasRegistered === 'true') {
      showAuthScreen('login');
    } else {
      showAuthScreen('register');
    }
  }
});

// Sync clock in Status Bar
function initClock() {
  const clockEl = document.getElementById('status-time');
  const updateClock = () => {
    const d = new Date();
    let hours = d.getHours();
    let mins = d.getMinutes();
    mins = mins < 10 ? '0' + mins : mins;
    hours = hours < 10 ? '0' + hours : hours;
    clockEl.textContent = `${hours}:${mins}`;
  };
  updateClock();
  setInterval(updateClock, 60000);
}

// Sound Synthesizer (Web Audio API)
function playBeep(freq, duration, type = 'sine') {
  try {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, state.audioContext.currentTime);
    
    gain.gain.setValueAtTime(0.15, state.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, state.audioContext.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(state.audioContext.destination);
    
    osc.start();
    osc.stop(state.audioContext.currentTime + duration);
  } catch (e) {
    console.warn('Audio Context initialization failed or not allowed:', e);
  }
}

// Emergency siren loops
let sirenInterval = null;
function startSiren() {
  if (sirenInterval) return;
  const isSirenEnabled = document.getElementById('setting-siren').checked;
  if (!isSirenEnabled) return;
  
  let high = true;
  sirenInterval = setInterval(() => {
    playBeep(high ? 900 : 600, 0.45, 'sawtooth');
    high = !high;
  }, 500);
}

function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
}

// Text-to-speech speaker
function speakText(text) {
  if ('speechSynthesis' in window) {
    const speech = new SpeechSynthesisUtterance(text);
    speech.volume = 1;
    speech.rate = 1;
    speech.pitch = 1.05;
    window.speechSynthesis.speak(speech);
  }
}

// -------------------------------------------------------------
// Interactive Maps Leaflet.js
// -------------------------------------------------------------
function initMap() {
  // Leaflet map initialization
  state.map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([state.currentLat, state.currentLng], 15);

  // CartoDB Dark Matter tile layer for an extremely premium look
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20
  }).addTo(state.map);

  // Add customized zoom control at bottom right
  L.control.zoom({
    position: 'bottomright'
  }).addTo(state.map);

  // Create pulsing user marker
  const userIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="marker-pin mp-user"><i class="fa-solid fa-car"></i></div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42]
  });

  state.userMarker = L.marker([state.currentLat, state.currentLng], { icon: userIcon }).addTo(state.map);
  state.userMarker.bindPopup('<b>Your Location</b><br>Tesla Model Y - Active Protect').openPopup();
}

// Update Map markers
function updateMapMarkers(services, hazards) {
  // Clear old markers
  state.serviceMarkers.forEach(m => state.map.removeLayer(m));
  state.serviceMarkers = [];
  
  state.hazardMarkers.forEach(m => state.map.removeLayer(m));
  state.hazardMarkers = [];

  // Services
  services.forEach(srv => {
    let iconClass = 'mp-mechanic';
    let iconName = 'fa-screwdriver-wrench';

    if (srv.type === 'hospital') {
      iconClass = 'mp-hospital';
      iconName = 'fa-square-h';
    } else if (srv.type === 'police') {
      iconClass = 'mp-police';
      iconName = 'fa-building-shield';
    } else if (srv.type === 'rescue') {
      iconClass = 'mp-rescue';
      iconName = 'fa-fire-extinguisher';
    }

    const customIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="marker-pin ${iconClass}"><i class="fa-solid ${iconName}"></i></div>`,
      iconSize: [30, 42],
      iconAnchor: [15, 42]
    });

    const marker = L.marker([srv.lat, srv.lng], { icon: customIcon }).addTo(state.map);
    marker.bindPopup(`
      <div style="color:#fff; font-family:var(--font-family);">
        <strong style="font-size:0.9rem;">${srv.name}</strong><br>
        <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:capitalize;">${srv.type} • ⭐ ${srv.rating}</span><br>
        <span style="font-size:0.75rem; color:var(--color-blue); font-weight:600;">Dist: ${srv.distance}</span><br>
        <a href="tel:${srv.phone}" style="color:var(--color-green); font-size:0.75rem; text-decoration:none;"><i class="fa-solid fa-phone"></i> ${srv.phone}</a>
      </div>
    `);
    state.serviceMarkers.push(marker);
  });

  // Hazards
  hazards.forEach(hz => {
    const hazardIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="marker-pin" style="background:var(--color-orange);"><i class="fa-solid fa-triangle-exclamation"></i></div>`,
      iconSize: [30, 42],
      iconAnchor: [15, 42]
    });

    const marker = L.marker([hz.lat, hz.lng], { icon: hazardIcon }).addTo(state.map);
    marker.bindPopup(`
      <div style="color:#fff; font-family:var(--font-family);">
        <strong style="color:var(--color-orange); font-size:0.9rem;">Hazard: ${hz.type}</strong><br>
        <span style="font-size:0.75rem; color:var(--text-secondary);">${hz.description}</span><br>
        <span style="font-size:0.65rem; color:var(--text-muted);">Reported: ${new Date(hz.timestamp).toLocaleTimeString()}</span>
      </div>
    `);
    state.hazardMarkers.push(marker);
  });
}

// Draw/Update responder path simulation
function drawResponderPath(responderLat, responderLng) {
  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
  }
  
  if (state.responderMarker) {
    state.map.removeLayer(state.responderMarker);
  }

  // Draw responder pin
  const respIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="marker-pin mp-user" style="background:var(--color-red); animation:none;"><i class="fa-solid fa-truck-moving"></i></div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42]
  });

  state.responderMarker = L.marker([responderLat, responderLng], { icon: respIcon }).addTo(state.map);
  state.responderMarker.bindPopup('<b>Emergency Unit En Route</b>').openPopup();

  // Create route path line
  state.routeLine = L.polyline([
    [state.currentLat, state.currentLng],
    [responderLat, responderLng]
  ], {
    color: '#f43f5e',
    weight: 4,
    opacity: 0.8,
    dashArray: '8, 8',
    lineJoin: 'round'
  }).addTo(state.map);
  
  // Pan map bounds
  const bounds = L.latLngBounds([
    [state.currentLat, state.currentLng],
    [responderLat, responderLng]
  ]);
  state.map.fitBounds(bounds, { padding: [40, 40] });
}

function clearResponderRoute() {
  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
    state.routeLine = null;
  }
  if (state.responderMarker) {
    state.map.removeLayer(state.responderMarker);
    state.responderMarker = null;
  }
}

// -------------------------------------------------------------
// Charts.js Rendering
// -------------------------------------------------------------
let safetyChart = null;
let radarChart = null;

function initChart() {
  const ctx = document.getElementById('safetyChart').getContext('2d');
  
  safetyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Safety Score',
        data: [85, 90, 84, 89, 92, 88, 91],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 9 } }
        },
        y: {
          min: 50,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { size: 9 }, stepSize: 10 }
        }
      }
    }
  });

  const rCtx = document.getElementById('radarChart').getContext('2d');
  radarChart = new Chart(rCtx, {
    type: 'radar',
    data: {
      labels: ['Engine', 'Battery', 'Tyres', 'Brakes', 'Suspension'],
      datasets: [{
        label: 'Health %',
        data: [100, 94, 100, 100, 98],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        r: {
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: { color: '#94a3b8', font: { size: 8, family: 'Outfit' } },
          ticks: { display: false },
          min: 0,
          max: 100
        }
      }
    }
  });
}

function updateChartScore(weeklyScores) {
  if (safetyChart && weeklyScores) {
    // Add current safetyScore as Sunday/Current
    const fullScores = [...weeklyScores];
    if (fullScores.length < 7) {
      fullScores.push(state.safetyScore);
    } else {
      fullScores[fullScores.length - 1] = state.safetyScore;
    }
    safetyChart.data.datasets[0].data = fullScores;
    // Set color based on score
    let strokeColor = '#10b981';
    if (state.safetyScore < 70) strokeColor = '#f43f5e';
    else if (state.safetyScore < 90) strokeColor = '#f59e0b';
    
    safetyChart.data.datasets[0].borderColor = strokeColor;
    safetyChart.data.datasets[0].pointBackgroundColor = strokeColor;
    safetyChart.update();
  }
}

// -------------------------------------------------------------
// Data Coordination & Sync
// -------------------------------------------------------------
async function syncData() {
  if (CONFIG.useBackend) {
    try {
      // 1. Fetch Analytics
      const resAnal = await fetch(`${CONFIG.apiBase}/analytics`);
      const anal = await resAnal.json();
      state.safetyScore = anal.safetyScore;
      document.getElementById('app-safety-val').textContent = `${state.safetyScore}%`;
      document.getElementById('activity-score-badge').textContent = state.safetyScore;
      document.getElementById('app-brake-count').textContent = anal.suddenBraking;
      document.getElementById('app-speed-count').textContent = anal.overspeeding;
      updateChartScore(anal.weeklyScores);
      
      // 2. Fetch Nearby Services
      const resServ = await fetch(`${CONFIG.apiBase}/services?lat=${state.currentLat}&lng=${state.currentLng}`);
      const services = await resServ.json();
      
      // 3. Fetch Hazards
      const resHaz = await fetch(`${CONFIG.apiBase}/hazards?lat=${state.currentLat}&lng=${state.currentLng}`);
      const hazards = await resHaz.json();
      state.hazards = hazards;

      // Update Map
      updateMapMarkers(services, hazards);

      // 4. Fetch Response History
      await refreshHistoryList();
    } catch (err) {
      console.error('Error syncing API data, falling back to local:', err);
      fallbackLocalSync();
    }
  } else {
    fallbackLocalSync();
  }
}

function fallbackLocalSync() {
  const localMock = getLocalMockData();
  
  // Update Analytics
  document.getElementById('app-safety-val').textContent = `${state.safetyScore}%`;
  document.getElementById('activity-score-badge').textContent = state.safetyScore;
  document.getElementById('app-brake-count').textContent = localMock.analytics.suddenBraking;
  document.getElementById('app-speed-count').textContent = localMock.analytics.overspeeding;
  updateChartScore(localMock.analytics.weeklyScores);

  // Parse custom hazards if none pre-populated
  if (state.hazards.length === 0) {
    state.hazards = localMock.hazards;
  }
  
  updateMapMarkers(localMock.nearbyServices, state.hazards);
  refreshHistoryListLocal();
}

function getLocalMockData() {
  const baseLat = state.currentLat;
  const baseLng = state.currentLng;
  return {
    analytics: {
      safetyScore: state.safetyScore,
      suddenBraking: 3,
      overspeeding: 2,
      weeklyScores: [85, 90, 84, 89, 92, 88]
    },
    hazards: [
      { id: 'hz-1', type: 'Pothole', description: 'Large deep pothole in middle lane', lat: baseLat + 0.003, lng: baseLng - 0.002, timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'Active' },
      { id: 'hz-2', type: 'Accident', description: 'Fender bender blocking right lane', lat: baseLat - 0.004, lng: baseLng + 0.005, timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'Active' }
    ],
    nearbyServices: [
      { id: 'hosp-1', name: 'Apollo Greams Road Hospital', type: 'hospital', lat: baseLat + 0.005, lng: baseLng + 0.008, rating: 4.7, distance: '0.6 mi', phone: '+91 44 2829 0200' },
      { id: 'hosp-2', name: 'Royapettah Govt Hospital', type: 'hospital', lat: baseLat - 0.006, lng: baseLng - 0.003, rating: 4.5, distance: '0.8 mi', phone: '+91 44 2864 3000' },
      { id: 'pol-1', name: 'Chennai Central Police Station', type: 'police', lat: baseLat + 0.002, lng: baseLng - 0.007, rating: 4.2, distance: '0.5 mi', phone: '+91 44 2345 2500' },
      { id: 'resc-1', name: 'TNFRS Rescue (Chennai Central)', type: 'rescue', lat: baseLat - 0.002, lng: baseLng + 0.003, rating: 4.9, distance: '0.3 mi', phone: '+91 44 2855 1111' },
      { id: 'mech-1', name: 'Chennai Towing & Road Assist', type: 'mechanic', lat: baseLat + 0.008, lng: baseLng - 0.002, rating: 4.8, distance: '0.7 mi', phone: '+91 98400 12345' },
      { id: 'mech-2', name: 'Madras Auto Garage & Towing', type: 'mechanic', lat: baseLat - 0.007, lng: baseLng + 0.008, rating: 4.6, distance: '0.9 mi', phone: '+91 98840 54321' }
    ]
  };
}

// Refresh past incidents history view
async function refreshHistoryList() {
  if (!CONFIG.useBackend) return refreshHistoryListLocal();
  
  try {
    const resSos = await fetch(`${CONFIG.apiBase}/sos/history`);
    const sosIncidents = await resSos.json();
    
    const resAst = await fetch(`${CONFIG.apiBase}/assistance/history`);
    const astRequests = await resAst.json();
    
    state.incidents = sosIncidents;
    state.assistanceRequests = astRequests;
    
    renderHistoryDOM(sosIncidents, astRequests);
  } catch (err) {
    console.error('Error fetching history from backend:', err);
    refreshHistoryListLocal();
  }
}

function refreshHistoryListLocal() {
  renderHistoryDOM(state.incidents, state.assistanceRequests);
}

function renderHistoryDOM(sosIncidents, astRequests) {
  const container = document.getElementById('activity-history-list');
  container.innerHTML = '';
  
  const allEvents = [
    ...sosIncidents.map(i => ({ ...i, category: 'sos' })),
    ...astRequests.map(a => ({ ...a, category: 'assistance' })),
    ...state.hazards.map(h => ({ ...h, category: 'hazard' }))
  ];
  
  // Sort events newest first
  allEvents.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  if (allEvents.length === 0) {
    container.innerHTML = `<div style="text-align:center; font-size:0.75rem; color:var(--text-muted); padding: 1.5rem 0;">No rescue requests logged. Drive safely!</div>`;
    return;
  }
  
  allEvents.slice(0, 10).forEach(ev => {
    let title = '';
    let icon = '';
    let glowClass = '';
    let detail = '';
    let statusBadge = '';
    
    if (ev.category === 'sos') {
      title = `${ev.source === 'sensor' ? 'Auto-AI' : 'Manual'} SOS Triggered`;
      icon = 'fa-truck-medical';
      glowClass = 'color: var(--color-red); text-shadow:0 0 5px var(--color-red-glow)';
      detail = `Severity: ${ev.severity} • Severity predicted by AI`;
      statusBadge = `<span style="font-size:0.65rem; padding: 2px 6px; border-radius: 8px; background: rgba(244,63,94,0.1); color: var(--color-red); font-weight:700;">${ev.status}</span>`;
    } else if (ev.category === 'assistance') {
      title = `${ev.type} Dispatch`;
      icon = 'fa-truck-pickup';
      glowClass = 'color: var(--color-blue);';
      detail = `Provider: ${ev.assignedProvider}`;
      statusBadge = `<span style="font-size:0.65rem; padding: 2px 6px; border-radius: 8px; background: rgba(14,165,233,0.1); color: var(--color-blue); font-weight:700;">${ev.status}</span>`;
    } else if (ev.category === 'hazard') {
      title = `Hazard: ${ev.type}`;
      icon = 'fa-triangle-exclamation';
      glowClass = 'color: var(--color-orange);';
      detail = `${ev.description}`;
      statusBadge = `<span style="font-size:0.65rem; padding: 2px 6px; border-radius: 8px; background: rgba(245,158,11,0.1); color: var(--color-orange); font-weight:700;">Active</span>`;
    }
    
    const timeStr = new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(ev.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    const card = document.createElement('div');
    card.className = 'dash-card';
    card.style.padding = '0.75rem';
    card.style.marginBottom = '0.5rem';
    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid ${icon}" style="${glowClass}"></i>
          <span style="font-size:0.8rem; font-weight:700;">${title}</span>
        </div>
        ${statusBadge}
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--text-muted);">
        <span>${detail}</span>
        <span>${dateStr}, ${timeStr}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// Interactive Navigation tabs
// -------------------------------------------------------------
function showTab(tabId) {
  state.activeTab = tabId;
  
  // Close any overlay panels first
  document.getElementById('screen-chat').classList.remove('active');
  
  // Update Navbar visual states
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.classList.remove('active');
    // Simple matching index: 0=Home, 1=Services, (skip center SOS), 2=Activity, 3=Contacts
    const text = item.querySelector('span').textContent.toLowerCase();
    if (text === tabId) {
      item.classList.add('active');
    }
  });

  // Toggle Screen Active states
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    screen.classList.remove('active');
  });
  
  const targetScreen = document.getElementById(`screen-${tabId}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Refresh Map rendering inside Home screen
  if (tabId === 'home' && state.map) {
    setTimeout(() => {
      state.map.invalidateSize();
    }, 100);
  }
}

// -------------------------------------------------------------
// Dynamic SOS State Machine & Alerts
// -------------------------------------------------------------
function triggerSOSImmediate() {
  triggerEmergencySequence('manual', 5.0);
}

function triggerEmergencySequence(source, gForce) {
  if (state.sosInterval) return; // already countdown in progress
  
  // Set Notch UI Notification Expanded State
  expandDynamicIsland(`<i class="fa-solid fa-car-burst" style="color:var(--color-red);"></i> Collision Sensors Armed`);
  
  // Setup Overlay details
  state.sosSecondsLeft = 5;
  document.getElementById('sos-secs-left').textContent = state.sosSecondsLeft;
  
  const isSevere = gForce > 6;
  const severityStr = isSevere ? `Critical Collision (${gForce}G)` : `Moderate Impact (${gForce}G)`;
  document.getElementById('sos-severity-val').textContent = severityStr;
  
  // Play initial alert tones
  playBeep(440, 0.2);
  playBeep(880, 0.4);
  
  if (source === 'sensor') {
    speakText("Collision detected. Road Rescue System is triggering automated emergency dispatch in 5 seconds. Hold cancel if you are safe.");
  } else {
    speakText("Manual SOS initiated. Emergency dispatches starting in 5 seconds.");
  }
  
  // Show active countdown screen
  const countdownOverlay = document.getElementById('sos-countdown-screen');
  countdownOverlay.classList.add('active');
  
  // Reset Progress Arc
  const progressArc = document.getElementById('sos-progress-bar');
  progressArc.style.strokeDashoffset = '0';
  
  // Start countdown interval
  state.sosInterval = setInterval(() => {
    state.sosSecondsLeft--;
    document.getElementById('sos-secs-left').textContent = state.sosSecondsLeft;
    
    // Animate stroke circle
    const circumference = 502; // 2 * pi * 80
    const offset = circumference - (state.sosSecondsLeft / 5) * circumference;
    progressArc.style.strokeDashoffset = offset;
    
    // Play countdown beep
    playBeep(600, 0.1);
    
    if (state.sosSecondsLeft <= 0) {
      clearInterval(state.sosInterval);
      state.sosInterval = null;
      executeEmergencyDispatch(source, gForce);
    }
  }, 1000);
}

// Cancel emergency trigger
function cancelActiveSOS() {
  if (state.sosInterval) {
    clearInterval(state.sosInterval);
    state.sosInterval = null;
  }
  
  // Close screen
  document.getElementById('sos-countdown-screen').classList.remove('active');
  collapseDynamicIsland();
  
  speakText("SOS Dispatch cancelled.");
  playBeep(330, 0.3); // low flat tone
}

// Execute Emergency Dispatch after countdown completion
async function executeEmergencyDispatch(source, gForce) {
  // Hide countdown
  document.getElementById('sos-countdown-screen').classList.remove('active');
  
  speakText("Emergency SOS dispatched. Ambulance and rescue teams notified of your exact coordinates.");
  startSiren();
  
  let newIncident = null;
  
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(`${CONFIG.apiBase}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.currentLat,
          lng: state.currentLng,
          source,
          sensorData: { gForce }
        })
      });
      newIncident = await res.json();
    } catch (e) {
      console.error('API SOS post failed, generating locally:', e);
      newIncident = generateLocalSOSIncident(source, gForce);
    }
  } else {
    newIncident = generateLocalSOSIncident(source, gForce);
  }
  
  state.activeSOS = newIncident;
  state.incidents.unshift(newIncident);
  
  // Shift map view to emergency tracking
  showTab('home');
  
  // Setup Tracking Dispatch Overlay
  showEmergencyTrackingOverlay(newIncident);
  
  // Start coordinate movement updater loop for simulation
  startResponderMapSimulation();
}

function generateLocalSOSIncident(source, gForce) {
  return {
    id: `sos-${Date.now()}`,
    timestamp: new Date().toISOString(),
    lat: state.currentLat,
    lng: state.currentLng,
    status: 'Received',
    severity: gForce > 6 ? 'Critical' : 'Moderate',
    description: source === 'sensor' ? `Crash sensor triggered (${gForce} Gs). AI severity predicted.` : 'Manual SOS trigger',
    source,
    responderLat: state.currentLat + 0.015,
    responderLng: state.currentLng - 0.015,
    eta: 'Calculating...',
    contactsNotified: ['Family (SMS sent)', 'Rescue dispatcher (En route)', 'Traffic authority']
  };
}

// Display Emergency Tracking Overlay at bottom
function showEmergencyTrackingOverlay(inc) {
  const overlay = document.getElementById('dispatch-progress-overlay');
  
  document.getElementById('dispatch-title').innerHTML = `<i class="fa-solid fa-truck-medical" style="color:var(--color-red);"></i> Emergency Dispatch`;
  document.getElementById('dispatch-provider-name').textContent = 'Trauma Care Dispatcher';
  document.getElementById('dispatch-eta').textContent = inc.eta;
  
  renderDispatchStepsDOM(inc.status);
  
  overlay.classList.add('active');
  
  // Expand Notch with Status
  expandDynamicIsland(`<i class="fa-solid fa-shield-halved" style="color:var(--color-red);"></i> SOS Units En Route`);
}

function renderDispatchStepsDOM(currentStatus) {
  const stepsList = document.getElementById('dispatch-steps-list');
  stepsList.innerHTML = '';
  
  const timeline = [
    { key: 'Received', label: 'SOS Request Logged', desc: 'Satellite link coordinates verified.' },
    { key: 'Dispatched', label: 'Emergency Responders Dispatched', desc: 'Ambulance & Fire crews assigned.' },
    { key: 'En Route', label: 'Units En Route', desc: 'GPS tracking responder vehicle coordinates.' },
    { key: 'Arrived', label: 'Units Arrived', desc: 'First responders at scene.' }
  ];
  
  let passedActive = false;
  
  timeline.forEach(step => {
    let stepClass = '';
    
    if (step.key === currentStatus) {
      stepClass = 'active';
      passedActive = true;
    } else if (!passedActive) {
      stepClass = 'completed';
    }
    
    const div = document.createElement('div');
    div.className = `dispatch-step ${stepClass}`;
    div.innerHTML = `
      <div class="dispatch-step-dot"></div>
      <div class="dispatch-step-info">
        <h5>${step.label}</h5>
        <p>${step.desc}</p>
      </div>
    `;
    stepsList.appendChild(div);
  });
}

// Simulator for responder coordinate approaching user coordinates
let simulationInterval = null;
function startResponderMapSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);
  
  let tick = 0;
  simulationInterval = setInterval(async () => {
    tick++;
    
    if (state.activeSOS && state.activeSOS.status !== 'Resolved') {
      const inc = state.activeSOS;
      let nextStatus = inc.status;
      let rLat = inc.responderLat;
      let rLng = inc.responderLng;
      
      // Update status simulator
      if (tick > 25) {
        nextStatus = 'Arrived';
        rLat = state.currentLat;
        rLng = state.currentLng;
        stopSiren();
        speakText("First responders have arrived at your location.");
        clearInterval(simulationInterval);
        simulationInterval = null;
      } else if (tick > 12) {
        nextStatus = 'En Route';
        const pct = (tick - 12) / 13; // travel ratio 0 to 1
        const startLat = state.currentLat + 0.015;
        const startLng = state.currentLng - 0.015;
        rLat = startLat + (state.currentLat - startLat) * pct;
        rLng = startLng + (state.currentLng - startLng) * pct;
      } else if (tick > 4) {
        nextStatus = 'Dispatched';
      }
      
      const updatedSOS = {
        ...inc,
        status: nextStatus,
        responderLat: rLat,
        responderLng: rLng,
        eta: nextStatus === 'Arrived' ? '0 min' : nextStatus === 'En Route' ? `${Math.ceil((25 - tick) / 3)} min` : 'Calculating...'
      };
      
      state.activeSOS = updatedSOS;
      
      // Save index in incidents list
      const idx = state.incidents.findIndex(i => i.id === inc.id);
      if (idx !== -1) {
        state.incidents[idx] = updatedSOS;
      }
      
      // Re-render
      document.getElementById('dispatch-eta').textContent = updatedSOS.eta;
      renderDispatchStepsDOM(updatedSOS.status);
      drawResponderPath(rLat, rLng);
      
      if (CONFIG.useBackend) {
        // optionally update backend state
        await fetch(`${CONFIG.apiBase}/sos/status/${inc.id}`);
      }
    } else {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
  }, 1500);
}

// Cancel emergency dispatch
async function cancelRescueRequest() {
  stopSiren();
  
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  
  clearResponderRoute();
  
  if (state.activeSOS) {
    const incId = state.activeSOS.id;
    if (CONFIG.useBackend) {
      try {
        await fetch(`${CONFIG.apiBase}/sos/resolve/${incId}`, { method: 'POST' });
      } catch (e) {
        console.error(e);
      }
    }
    
    const idx = state.incidents.findIndex(i => i.id === incId);
    if (idx !== -1) {
      state.incidents[idx].status = 'Resolved';
    }
    state.activeSOS = null;
  }
  
  document.getElementById('dispatch-progress-overlay').classList.remove('active');
  collapseDynamicIsland();
  
  await syncData();
  speakText("SOS dispatch call closed.");
}

// -------------------------------------------------------------
// Roadside Assistance Request Coordination
// -------------------------------------------------------------
const ROADSIDE_PROVIDERS = {
  'Towing': [
    { name: 'TowMan', phone: '+91 98401 12345', dist: '0.3 mi', rating: 4.7, price: '₹3,000 (Covered by HDFC ERGO Assist)' },
    { name: 'TVS Auto Assist - Roadside Assistance', phone: '+91 44 2822 5555', dist: '0.6 mi', rating: 4.8, price: '₹3,200 (Covered by HDFC ERGO Assist)' },
    { name: 'Elephant Towing Service', phone: '+91 98840 98765', dist: '1.1 mi', rating: 4.5, price: '₹3,500 (Covered by HDFC ERGO Assist)' },
    { name: 'Autoshine recovery Chennai', phone: '+91 94440 87654', dist: '1.5 mi', rating: 4.4, price: '₹3,600 (Covered by HDFC ERGO Assist)' },
    { name: 'STB Recovery Van Service Chennai (Mount Road)', phone: '+91 98402 11223', dist: '1.9 mi', rating: 4.6, price: '₹3,100 (Covered by HDFC ERGO Assist)' },
    { name: 'Sri Ramajayam Towing Service', phone: '+91 94441 22334', dist: '2.4 mi', rating: 4.3, price: '₹3,400 (Covered by HDFC ERGO Assist)' }
  ],
  'Flat Tyre': [
    { name: 'V Garage multi brand car service centre', phone: '+91 98403 33445', dist: '0.2 mi', rating: 4.7, price: '₹600 (Covered by HDFC ERGO Assist)' },
    { name: 'EZRA AUTOMOBILES', phone: '+91 98843 44556', dist: '0.5 mi', rating: 4.5, price: '₹650 (Covered by HDFC ERGO Assist)' },
    { name: 'Sri Vinayaga Car Garage & Solution', phone: '+91 94443 55667', dist: '0.9 mi', rating: 4.3, price: '₹500 (Covered by HDFC ERGO Assist)' },
    { name: 'Perfect AutoTech | Ramapuram', phone: '+91 98404 66778', dist: '1.4 mi', rating: 4.8, price: '₹750 (Covered by HDFC ERGO Assist)' },
    { name: 'MFC Car Care', phone: '+91 98844 77889', dist: '1.8 mi', rating: 4.4, price: '₹620 (Covered by HDFC ERGO Assist)' },
    { name: 'Mohan Garage', phone: '+91 94444 88990', dist: '2.2 mi', rating: 4.2, price: '₹580 (Covered by HDFC ERGO Assist)' }
  ],
  'Jump Start': [
    { name: 'AGNES BATTERY', phone: '+91 98405 99001', dist: '0.3 mi', rating: 4.5, price: '₹700 (Covered by HDFC ERGO Assist)' },
    { name: 'Amaron Battery Annanagar showroom', phone: '+91 44 2622 1122', dist: '0.7 mi', rating: 4.8, price: '₹750 (Covered by HDFC ERGO Assist)' },
    { name: 'Baba Battery House - Exide, Microtek & Amaron', phone: '+91 98845 22334', dist: '1.1 mi', rating: 4.7, price: '₹800 (Covered by HDFC ERGO Assist)' },
    { name: 'Battery & Invertor shop (Aruna House)', phone: '+91 94445 33445', dist: '1.5 mi', rating: 4.3, price: '₹720 (Covered by HDFC ERGO Assist)' },
    { name: 'Exide Care Battery Centre', phone: '+91 98406 44556', dist: '1.9 mi', rating: 4.6, price: '₹780 (Covered by HDFC ERGO Assist)' },
    { name: 'Amaron Pitstop Battery Store', phone: '+91 98846 55667', dist: '2.3 mi', rating: 4.7, price: '₹760 (Covered by HDFC ERGO Assist)' }
  ],
  'Fuel Delivery': [
    { name: 'Indian Oil Corporation (IOCL) - Mount Road', phone: '+91 44 2855 0102', dist: '0.4 mi', rating: 4.8, price: '₹400 + Fuel Cost (Covered by HDFC ERGO Assist)' },
    { name: 'Bharat Petroleum (BPCL) Station - Teynampet', phone: '+91 44 2434 0203', dist: '0.6 mi', rating: 4.5, price: '₹420 + Fuel Cost (Covered by HDFC ERGO Assist)' },
    { name: 'HP Fuel Station - Royapettah', phone: '+91 44 2860 0304', dist: '1.1 mi', rating: 4.6, price: '₹380 + Fuel Cost (Covered by HDFC ERGO Assist)' }
  ]
};

let assistanceSelectedType = '';
let selectedRoadsideProvider = null;

function openAssistanceForm(type) {
  assistanceSelectedType = type;
  
  // Set modal title based on type
  const titleEl = document.getElementById('ast-modal-title');
  if (type === 'Towing') {
    titleEl.innerHTML = `<i class="fa-solid fa-truck-pickup" style="color:var(--color-blue)"></i> Search Flatbed Towing`;
  } else if (type === 'Flat Tyre') {
    titleEl.innerHTML = `<i class="fa-solid fa-screwdriver-wrench" style="color:var(--color-green)"></i> Search Local Garages`;
  } else if (type === 'Jump Start') {
    titleEl.innerHTML = `<i class="fa-solid fa-car-battery" style="color:var(--color-orange)"></i> Search Battery Station`;
  } else if (type === 'Fuel Delivery') {
    titleEl.innerHTML = `<i class="fa-solid fa-gas-pump" style="color:var(--color-red)"></i> Search Fuel Stations`;
  }
  
  // Render providers list
  const listEl = document.getElementById('ast-provider-list');
  listEl.innerHTML = '';
  
  const providers = ROADSIDE_PROVIDERS[type] || [];
  providers.forEach(prov => {
    const card = document.createElement('div');
    card.className = 'provider-card';
    card.dataset.name = prov.name;
    card.innerHTML = `
      <div class="provider-card-details">
        <h5>${prov.name}</h5>
        <p style="font-size:0.65rem; color:var(--text-muted);"><i class="fa-solid fa-phone"></i> ${prov.phone}</p>
      </div>
      <div class="provider-card-meta">
        <div class="dist">${prov.dist}</div>
        <div class="rating"><i class="fa-solid fa-star"></i> ${prov.rating}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      selectRoadsideProvider(prov);
    });
    listEl.appendChild(card);
  });
  
  // Select first provider by default if available
  if (providers.length > 0) {
    selectRoadsideProvider(providers[0]);
  } else {
    selectedRoadsideProvider = null;
    document.getElementById('ast-form-section').style.display = 'none';
  }
  
  document.getElementById('assistance-modal').classList.add('active');
}

function selectRoadsideProvider(provider) {
  selectedRoadsideProvider = provider;
  
  // Highlight card
  const cards = document.querySelectorAll('.provider-card');
  cards.forEach(card => {
    if (card.dataset.name === provider.name) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
  
  // Update fields
  document.getElementById('ast-form-provider-name').value = provider.name;
  document.getElementById('ast-form-cost').textContent = provider.price;
  
  // Clear note input and set placeholder based on service
  const noteEl = document.getElementById('ast-form-note');
  noteEl.value = '';
  if (assistanceSelectedType === 'Towing') {
    noteEl.placeholder = 'e.g. Need flatbed tow to nearest garage.';
  } else if (assistanceSelectedType === 'Flat Tyre') {
    noteEl.placeholder = 'e.g. Need mobile mechanic to fix puncture.';
  } else if (assistanceSelectedType === 'Jump Start') {
    noteEl.placeholder = 'e.g. Dead battery boost. Amaron backup requested.';
  } else if (assistanceSelectedType === 'Fuel Delivery') {
    noteEl.placeholder = 'e.g. Need 5 litres of petrol delivered.';
  }
  
  document.getElementById('ast-form-section').style.display = 'block';
}

function closeAssistanceModal() {
  document.getElementById('assistance-modal').classList.remove('active');
}

function callSelectedProvider() {
  if (!selectedRoadsideProvider) return;
  speakText(`Calling ${selectedRoadsideProvider.name} directly.`);
  window.location.href = `tel:${selectedRoadsideProvider.phone}`;
}

// Submit Roadside request to backend / mock
async function submitAssistanceRequest() {
  if (!selectedRoadsideProvider) return;
  const note = document.getElementById('ast-form-note').value;
  const shareGPS = document.getElementById('ast-share-location').checked;
  closeAssistanceModal();
  
  const providerName = selectedRoadsideProvider.name;
  let speakMsg = `Requesting roadside assistance from ${providerName} for ${assistanceSelectedType}.`;
  if (shareGPS) {
    speakMsg += " Sharing live GPS coordinates.";
  }
  speakText(speakMsg);
  
  let newReq = null;
  
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(`${CONFIG.apiBase}/assistance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: assistanceSelectedType,
          lat: state.currentLat,
          lng: state.currentLng,
          provider: providerName,
          note: note
        })
      });
      newReq = await res.json();
      newReq.assignedProvider = providerName;
    } catch (e) {
      console.error(e);
      newReq = generateLocalAssistanceRequest(assistanceSelectedType, providerName);
    }
  } else {
    newReq = generateLocalAssistanceRequest(assistanceSelectedType, providerName);
  }
  
  state.activeRoadside = newReq;
  state.assistanceRequests.unshift(newReq);
  
  showTab('home');
  showRoadsideTrackingOverlay(newReq);
  startRoadsideSimulation();
}

function generateLocalAssistanceRequest(type, providerName) {
  // Generate slightly randomized responder coordinates near user
  const angle = Math.random() * Math.PI * 2;
  const distance = 0.012; // degrees approx
  const mechLat = state.currentLat + Math.sin(angle) * distance;
  const mechLng = state.currentLng + Math.cos(angle) * distance;
  
  return {
    id: `ast-${Date.now()}`,
    type,
    timestamp: new Date().toISOString(),
    lat: state.currentLat,
    lng: state.currentLng,
    status: 'Requested',
    mechanicLat: mechLat,
    mechanicLng: mechLng,
    eta: 'Calculating...',
    assignedProvider: providerName || (type === 'Towing' ? 'Apex Towing Flatbed' : 'Downtown Roadside Specialist')
  };
}

function showRoadsideTrackingOverlay(req) {
  const overlay = document.getElementById('dispatch-progress-overlay');
  
  document.getElementById('dispatch-title').innerHTML = `<i class="fa-solid fa-truck-pickup" style="color:var(--color-blue);"></i> Roadside Assist`;
  document.getElementById('dispatch-provider-name').textContent = req.assignedProvider;
  document.getElementById('dispatch-eta').textContent = req.eta;
  
  renderRoadsideStepsDOM(req.status);
  
  overlay.classList.add('active');
}

function renderRoadsideStepsDOM(currentStatus) {
  const stepsList = document.getElementById('dispatch-steps-list');
  stepsList.innerHTML = '';
  
  const timeline = [
    { key: 'Requested', label: 'Request Registered', desc: 'Dispatch center looking for driver.' },
    { key: 'Assigned', label: 'Assistant Assigned', desc: 'Apex truck dispatched to coordinates.' },
    { key: 'En Route', label: 'Driver En Route', desc: 'ETA is real-time GPS coordinated.' },
    { key: 'Completed', label: 'Job Completed', desc: 'Services rendered at location.' }
  ];
  
  let passedActive = false;
  
  timeline.forEach(step => {
    let stepClass = '';
    
    if (step.key === currentStatus) {
      stepClass = 'active';
      passedActive = true;
    } else if (!passedActive) {
      stepClass = 'completed';
    }
    
    const div = document.createElement('div');
    div.className = `dispatch-step ${stepClass}`;
    div.innerHTML = `
      <div class="dispatch-step-dot"></div>
      <div class="dispatch-step-info">
        <h5>${step.label}</h5>
        <p>${step.desc}</p>
      </div>
    `;
    stepsList.appendChild(div);
  });
}

// Roadside movement simulation
let roadsideSimInterval = null;
function startRoadsideSimulation() {
  if (roadsideSimInterval) clearInterval(roadsideSimInterval);
  
  // Cache starting coordinates from active request
  const startLat = state.activeRoadside ? state.activeRoadside.mechanicLat : state.currentLat - 0.012;
  const startLng = state.activeRoadside ? state.activeRoadside.mechanicLng : state.currentLng + 0.012;
  
  let tick = 0;
  roadsideSimInterval = setInterval(async () => {
    tick++;
    
    if (state.activeRoadside && state.activeRoadside.status !== 'Completed') {
      const req = state.activeRoadside;
      let nextStatus = req.status;
      let rLat = req.mechanicLat;
      let rLng = req.mechanicLng;
      
      if (tick > 20) {
        nextStatus = 'Completed';
        rLat = state.currentLat;
        rLng = state.currentLng;
        speakText("Roadside mechanic has completed the service request.");
        clearInterval(roadsideSimInterval);
        roadsideSimInterval = null;
      } else if (tick > 8) {
        nextStatus = 'En Route';
        const pct = (tick - 8) / 12;
        rLat = startLat + (state.currentLat - startLat) * pct;
        rLng = startLng + (state.currentLng - startLng) * pct;
      } else if (tick > 3) {
        nextStatus = 'Assigned';
      }
      
      const updatedReq = {
        ...req,
        status: nextStatus,
        mechanicLat: rLat,
        mechanicLng: rLng,
        eta: nextStatus === 'Completed' ? '0 min' : nextStatus === 'En Route' ? `${Math.ceil((20 - tick) / 2)} min` : 'Calculating...'
      };
      
      state.activeRoadside = updatedReq;
      
      // Save index
      const idx = state.assistanceRequests.findIndex(a => a.id === req.id);
      if (idx !== -1) {
        state.assistanceRequests[idx] = updatedReq;
      }
      
      // Re-render overlay and map routes
      document.getElementById('dispatch-eta').textContent = updatedReq.eta;
      renderRoadsideStepsDOM(updatedReq.status);
      drawResponderPath(rLat, rLng);
      
      if (CONFIG.useBackend) {
        await fetch(`${CONFIG.apiBase}/assistance/status/${req.id}`);
      }
    } else {
      clearInterval(roadsideSimInterval);
      roadsideSimInterval = null;
    }
  }, 1500);
}

// -------------------------------------------------------------
// Dispatcher Live Chat Coordination
// -------------------------------------------------------------
function openChatDispatcher(name) {
  state.chatPartner = name;
  document.getElementById('chat-participant-name').textContent = name;
  
  // Close tabs and open chat screen layout
  document.getElementById('screen-chat').classList.add('active');
  
  // Populate message boxes
  renderChatBubbles();
}

function closeChat() {
  document.getElementById('screen-chat').classList.remove('active');
}

function renderChatBubbles() {
  const box = document.getElementById('chat-box');
  box.innerHTML = '';
  
  // Initial dispatcher template messages if room empty
  if (state.chatMessages.length === 0) {
    state.chatMessages.push({
      sender: 'receiver',
      text: `Hello, this is the Road Rescue dispatch coordinates dashboard. We see you are near Chennai, Tamil Nadu. How can we help?`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }
  
  state.chatMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `chat-bubble ${msg.sender}`;
    div.innerHTML = `
      <div>${msg.text}</div>
      <div class="chat-bubble-time">${msg.time}</div>
    `;
    box.appendChild(div);
  });
  
  // Auto scroll
  box.scrollTop = box.scrollHeight;
}

// Chat Send Trigger logic
document.getElementById('btn-send-message').addEventListener('click', () => {
  sendUserChatMessage();
});

document.getElementById('chat-input-text').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendUserChatMessage();
  }
});

function sendUserChatMessage() {
  const inputEl = document.getElementById('chat-input-text');
  const txt = inputEl.value.trim();
  if (!txt) return;
  
  // Push sender msg
  const userMsg = {
    sender: 'sender',
    text: txt,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  state.chatMessages.push(userMsg);
  renderChatBubbles();
  
  inputEl.value = '';

  // Render typing indicator bubble in Chat DOM
  const box = document.getElementById('chat-box');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'typing-indicator';
  typingDiv.id = 'chat-typing-indicator';
  typingDiv.innerHTML = '<span></span><span></span><span></span>';
  box.appendChild(typingDiv);
  box.scrollTop = box.scrollHeight;

  // Visual notify in Dynamic Island notch
  expandDynamicIsland(`<i class="fa-solid fa-ellipsis" style="color:var(--color-blue); animation:pulse 0.8s infinite alternate;"></i> Dispatcher is typing...`);
  
  // Simulate dispatch AI reply matching keywords
  setTimeout(() => {
    // Clean typing indicators
    const indicatorEl = document.getElementById('chat-typing-indicator');
    if (indicatorEl) indicatorEl.remove();
    collapseDynamicIsland();

    let reply = "Understood. Responders have your exact GPS coordinates and are handling your request.";
    const cleanTxt = txt.toLowerCase();
    
    if (cleanTxt.includes('accident') || cleanTxt.includes('crash')) {
      reply = "Medical and Police units have been alerted of a crash. Please stay in your vehicle with seatbelts fastened if safe.";
    } else if (cleanTxt.includes('tow') || cleanTxt.includes('flat')) {
      reply = "We are dispatching a flatbed truck to your exact coordinates. Check your Services screen for status trackers.";
    } else if (cleanTxt.includes('eta') || cleanTxt.includes('where')) {
      reply = `GPS maps show active responders are approximately ${state.activeSOS ? state.activeSOS.eta : '4 min'} away.`;
    }
    
    state.chatMessages.push({
      sender: 'receiver',
      text: reply,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    
    playBeep(520, 0.15);
    renderChatBubbles();
  }, 1600);
}

// -------------------------------------------------------------
// Road Hazard Reporting Form Modal
// -------------------------------------------------------------
function openHazardModal() {
  document.getElementById('hazard-modal').classList.add('active');
}

function closeHazardModal() {
  document.getElementById('hazard-modal').classList.remove('active');
}

async function submitRoadHazard() {
  const type = document.getElementById('hz-form-type').value;
  const desc = document.getElementById('hz-form-desc').value;
  
  closeHazardModal();
  speakText(`Reported road hazard: ${type} at location.`);
  
  let newHz = null;
  const formPayload = {
    type,
    description: desc || `Reported ${type}`,
    lat: state.currentLat + (Math.random() - 0.5) * 0.006, // near user
    lng: state.currentLng + (Math.random() - 0.5) * 0.006,
    reportedBy: 'Alex Rivera'
  };

  if (CONFIG.useBackend) {
    try {
      const res = await fetch(`${CONFIG.apiBase}/hazards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPayload)
      });
      newHz = await res.json();
    } catch (e) {
      console.error(e);
      newHz = generateLocalHazard(formPayload);
    }
  } else {
    newHz = generateLocalHazard(formPayload);
  }
  
  state.hazards.push(newHz);
  await syncData();
  showTab('home');
}

function generateLocalHazard(payload) {
  return {
    id: `hz-${Date.now()}`,
    ...payload,
    timestamp: new Date().toISOString(),
    status: 'Active'
  };
}

// -------------------------------------------------------------
// Diagnostic Controller Functions
// -------------------------------------------------------------
async function updateDiagnostics() {
  const engineWarning = document.getElementById('sim-engine-check').checked;
  const batteryPct = parseInt(document.getElementById('sim-battery').value);
  const tyrePSI = parseInt(document.getElementById('sim-tyre').value);
  const brakeWarning = document.getElementById('sim-brake-alert').checked;

  const payload = {
    engine: engineWarning ? 'Check Engine Light' : 'OK',
    battery: batteryPct,
    tyrePressure: tyrePSI,
    brakes: brakeWarning ? 'Replace Wear pads' : 'OK'
  };
  
  speakText("Updating vehicle diagnostics telemetry.");
  
  if (CONFIG.useBackend) {
    try {
      const res = await fetch(`${CONFIG.apiBase}/diagnostics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const diag = await res.json();
      renderDiagnosticsDOM(diag);
    } catch (e) {
      console.error(e);
      renderDiagnosticsDOMLocal(payload);
    }
  } else {
    renderDiagnosticsDOMLocal(payload);
  }
  
  await syncData();
  
  // Glow status bar dynamic island for warning
  if (engineWarning || batteryPct < 20 || tyrePSI < 25 || brakeWarning) {
    expandDynamicIsland(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-orange)"></i> Diagnostics Warnings`);
  }
}

function renderDiagnosticsDOMLocal(payload) {
  // calculate diagnostic warning severity
  let scoreImpact = 0;
  if (payload.engine !== 'OK') scoreImpact += 15;
  if (payload.battery < 20) scoreImpact += 10;
  if (payload.tyrePressure < 28) scoreImpact += 10;
  if (payload.brakes !== 'OK') scoreImpact += 20;
  
  state.safetyScore = Math.max(40, 100 - scoreImpact);
  
  let rec = 'All systems operational. Telemetry nominal.';
  if (scoreImpact > 10) {
    rec = 'Warning: Vehicle diagnostic flags raised. Request roadside mechanic for quick checkup.';
  }
  
  const diag = {
    engine: payload.engine,
    battery: `${payload.battery}%`,
    tyres: `${payload.tyrePressure} PSI`,
    brakes: payload.brakes,
    recommendation: rec
  };
  
  renderDiagnosticsDOM(diag);
}

function renderDiagnosticsDOM(diag) {
  // Update gauge bubbles inside Services screen
  const dgEngine = document.getElementById('dg-engine');
  const dgBattery = document.getElementById('dg-battery');
  const dgTyre = document.getElementById('dg-tyre');
  
  // Engine
  if (diag.engine !== 'OK') {
    dgEngine.className = 'diag-gauge critical';
    dgEngine.querySelector('.diag-gauge-circle').textContent = 'WARN';
  } else {
    dgEngine.className = 'diag-gauge';
    dgEngine.querySelector('.diag-gauge-circle').textContent = 'OK';
  }
  
  // Battery
  const batVal = parseInt(diag.battery);
  dgBattery.querySelector('.diag-gauge-circle').textContent = diag.battery;
  if (batVal < 20) {
    dgBattery.className = 'diag-gauge critical';
  } else if (batVal < 40) {
    dgBattery.className = 'diag-gauge warning';
  } else {
    dgBattery.className = 'diag-gauge';
  }
  
  // Tyres
  const tyreVal = parseInt(diag.tyres);
  dgTyre.querySelector('.diag-gauge-circle').textContent = tyreVal;
  if (tyreVal < 25 || tyreVal > 42) {
    dgTyre.className = 'diag-gauge critical';
  } else if (tyreVal < 28) {
    dgTyre.className = 'diag-gauge warning';
  } else {
    dgTyre.className = 'diag-gauge';
  }
  
  // Set Text recommendation
  document.getElementById('app-diagnostics-rec').textContent = diag.recommendation;

  // Update Radar Chart datasets if initialized
  if (radarChart) {
    const engHealth = (diag.engine === 'OK' || diag.engine === 'undefined' || !diag.engine) ? 100 : 35;
    const batHealth = isNaN(batVal) ? 94 : batVal;
    const tyreHealth = tyreVal < 25 || tyreVal > 42 ? 30 : tyreVal < 28 ? 65 : 100;
    const brkHealth = (diag.brakes === 'OK' || diag.brakes === 'undefined' || !diag.brakes) ? 100 : 25;
    const suspHealth = 98;
    
    radarChart.data.datasets[0].data = [engHealth, batHealth, tyreHealth, brkHealth, suspHealth];
    
    // Set color based on overall health
    const avgHealth = (engHealth + batHealth + tyreHealth + brkHealth + suspHealth) / 5;
    let strokeColor = '#10b981';
    let fillColor = 'rgba(16, 185, 129, 0.15)';
    if (avgHealth < 70) {
      strokeColor = '#f43f5e';
      fillColor = 'rgba(244, 63, 94, 0.15)';
    } else if (avgHealth < 90) {
      strokeColor = '#f59e0b';
      fillColor = 'rgba(245, 158, 11, 0.15)';
    }
    
    radarChart.data.datasets[0].borderColor = strokeColor;
    radarChart.data.datasets[0].backgroundColor = fillColor;
    radarChart.data.datasets[0].pointBackgroundColor = strokeColor;
    radarChart.update();
  }
}

// -------------------------------------------------------------
// Voice Emergency Activated Listener
// -------------------------------------------------------------
let recognition = null;
function initVoiceAssistant() {
  const switchEl = document.getElementById('setting-voice');
  
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech Recognition API not supported in this browser.');
    switchEl.disabled = true;
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
    console.log('Voice assistant heard:', result);
    
    // Key-phrases: "rescue help" or "SOS emergency"
    if (result.includes('rescue help') || result.includes('emergency sos')) {
      triggerEmergencySequence('voice', 7.5);
    }
  };
  
  recognition.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
  };
  
  switchEl.addEventListener('change', () => {
    if (switchEl.checked) {
      recognition.start();
      speakText("Voice emergency coordinates activated. Say: rescue help, to initiate SOS.");
      expandDynamicIsland(`<i class="fa-solid fa-microphone" style="color:var(--color-green);"></i> Voice SOS Active`);
    } else {
      recognition.stop();
      collapseDynamicIsland();
    }
  });
}

// -------------------------------------------------------------
// Simulator Event Controllers linkages
// -------------------------------------------------------------
function setupEventListeners() {
  // G Force Slider
  const gforceSlider = document.getElementById('sim-gforce');
  gforceSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value).toFixed(1);
    state.gForce = val;
    document.getElementById('lbl-gforce').textContent = `${val} Gs ${val > 4 ? '(High Impact)' : '(Normal)'}`;
    document.getElementById('app-gforce-val').textContent = `${val} G`;
  });

  // Major Crash Simulation
  document.getElementById('btn-crash-high').addEventListener('click', () => {
    state.gForce = 9.5;
    gforceSlider.value = 9.5;
    document.getElementById('lbl-gforce').textContent = '9.5 Gs (Severe Crash)';
    document.getElementById('app-gforce-val').textContent = '9.5 G';
    
    triggerEmergencySequence('sensor', 9.5);
  });

  // Minor Crash Simulation
  document.getElementById('btn-crash-low').addEventListener('click', () => {
    state.gForce = 3.8;
    gforceSlider.value = 3.8;
    document.getElementById('lbl-gforce').textContent = '3.8 Gs (Minor Bump)';
    document.getElementById('app-gforce-val').textContent = '3.8 G';
    
    triggerEmergencySequence('sensor', 3.8);
  });

  // Battery health slider
  const batterySlider = document.getElementById('sim-battery');
  batterySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('lbl-battery').textContent = `${val}% ${val < 20 ? '(Critical)' : '(Good)'}`;
  });

  // Tyre pressure slider
  const tyreSlider = document.getElementById('sim-tyre');
  tyreSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('lbl-tyre').textContent = `${val} PSI ${val < 28 ? '(Low)' : '(Ideal)'}`;
  });

  // Update diagnostics button
  document.getElementById('btn-update-diagnostics').addEventListener('click', () => {
    updateDiagnostics();
  });

  // Network Offline trigger
  const networkSwitch = document.getElementById('sim-network');
  networkSwitch.addEventListener('change', () => {
    state.isOnline = networkSwitch.checked;
    
    const banner = document.getElementById('app-offline-banner');
    const wifiIcon = document.getElementById('status-wifi');
    const sigIcon = document.getElementById('status-signal');
    
    if (state.isOnline) {
      banner.classList.remove('active');
      wifiIcon.className = 'fa-solid fa-wifi';
      sigIcon.className = 'fa-solid fa-signal';
      speakText("GPS link online.");
    } else {
      banner.classList.add('active');
      wifiIcon.className = 'fa-solid fa-plane-slash';
      sigIcon.className = 'fa-solid fa-signal-slash';
      speakText("Network lost. Entering offline emergency backup mode.");
    }
  });

  // Driving speed slider
  const speedSlider = document.getElementById('sim-speed');
  speedSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.speed = val;
    document.getElementById('lbl-speed').textContent = `${val} mph`;
    document.getElementById('app-speed-val').textContent = `${val} mph`;
    
    // Overspeed triggers Alert Notch
    if (val > 85) {
      expandDynamicIsland(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-red)"></i> Overspeed Warning: Slow Down!`);
      playBeep(660, 0.15);
    } else if (val < 50) {
      collapseDynamicIsland();
    }
  });

  // Move Location zone
  document.getElementById('btn-move-loc').addEventListener('click', () => {
    // Chennai coordinates shift (Marina Beach Area)
    state.currentLat = 13.0890;
    state.currentLng = 80.2800;
    state.map.panTo([state.currentLat, state.currentLng]);
    state.userMarker.setLatLng([state.currentLat, state.currentLng]);
    speakText("Arrived in hazard zone. Mapping update.");
    // Temporarily turn off GPS watch if we manually force a move to hazard zone
    if (state.isTracking) {
      toggleGpsTracking(false);
    }
    updateStreetDisplay();
    syncData();
  });

  // Floating GPS Tracker Button
  document.getElementById('btn-gps-tracker').addEventListener('click', () => {
    if (state.isTracking) {
      toggleGpsTracking(false);
      speakText("GPS continuous tracking disabled.");
      expandDynamicIsland(`<i class="fa-solid fa-location-crosshairs" style="color:var(--color-blue)"></i> GPS Tracking Off`);
    } else {
      toggleGpsTracking(true);
      speakText("Real-time GPS tracking enabled.");
    }
  });

  // SOS button triggers (Home and Float SOS)
  document.getElementById('btn-trigger-sos').addEventListener('click', () => {
    triggerSOSImmediate();
  });

  // Auth Form Listeners
  document.getElementById('btn-login-submit').addEventListener('click', () => {
    handleLoginSubmit();
  });

  document.getElementById('btn-login-demo').addEventListener('click', () => {
    handleDemoLogin();
  });

  document.getElementById('btn-register-submit').addEventListener('click', () => {
    handleRegisterSubmit();
  });
  
  // Set initial street coordinate display
  updateStreetDisplay();
}

// -------------------------------------------------------------
// IOS Notch Dynamic Island helper
// -------------------------------------------------------------
function expandDynamicIsland(htmlContent) {
  const island = document.getElementById('dynamic-island');
  const content = document.getElementById('dynamic-island-content');
  
  island.classList.add('expanded');
  content.innerHTML = htmlContent;
  content.style.display = 'flex';
}

function collapseDynamicIsland() {
  const island = document.getElementById('dynamic-island');
  const content = document.getElementById('dynamic-island-content');
  
  island.classList.remove('expanded');
  content.style.display = 'none';
}

// Local helper functions for roadside assistance selection are defined near the main coordination section.

// Dispatch coordinate calling actions
function triggerServiceAction(actionType) {
  if (actionType === 'Ambulance') {
    document.getElementById('ambulance-modal').classList.add('active');
    return;
  }
  
  speakText(`Calling emergency services coordinator for ${actionType}.`);
  openChatDispatcher(`${actionType} Dispatcher`);
  
  // Seed first message matching context
  state.chatMessages.push({
    sender: 'receiver',
    text: `Emergency ${actionType} coordination channel connected. Responders are tracking your GPS. Please confirm details of incident.`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatBubbles();
}

function callAmbulanceDirectly() {
  closeAmbulanceModal();
  speakText("Calling emergency number 1 0 8.");
  window.location.href = 'tel:108';
}

function messageAmbulanceDispatcher() {
  closeAmbulanceModal();
  speakText("Calling emergency services coordinator for Ambulance.");
  openChatDispatcher("Ambulance Dispatcher");
  
  // Seed first message matching context
  state.chatMessages.push({
    sender: 'receiver',
    text: "Emergency Ambulance coordination channel connected. Responders are tracking your GPS. Please confirm details of incident.",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  renderChatBubbles();
}

function closeAmbulanceModal() {
  document.getElementById('ambulance-modal').classList.remove('active');
}

function addNewICEContact() {
  const name = prompt("Enter emergency contact name:");
  if (!name) return;
  const phone = prompt("Enter phone number:");
  if (!phone) return;
  
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  
  const list = document.getElementById('contacts-list');
  const div = document.createElement('div');
  div.className = 'contact-item';
  div.innerHTML = `
    <div class="contact-avatar">${initials}</div>
    <div class="contact-info">
      <h5>${name}</h5>
      <p>ICE Contact • Notify on SOS</p>
    </div>
    <div class="contact-actions">
      <a href="tel:${phone}" class="contact-action-btn call-btn"><i class="fa-solid fa-phone"></i></a>
      <button class="contact-action-btn" onclick="openChatDispatcher('${name}')"><i class="fa-solid fa-message"></i></button>
    </div>
  `;
  list.appendChild(div);
  speakText(`Added emergency contact: ${name}`);
}

// -------------------------------------------------------------
// Premium Feature Additions: Street Address & Emergency Booklet
// -------------------------------------------------------------
function updateStreetDisplay() {
  const streetEl = document.getElementById('txt-map-street');
  if (!streetEl) return;
  
  if (state.currentLat === 13.0827) {
    streetEl.innerHTML = `<i class="fa-solid fa-location-dot" style="color:var(--color-blue)"></i> Mount Road, Chennai, TN, India`;
    fetchWeatherFromGPS(13.0827, 80.2707);
  } else if (state.currentLat === 13.0890) {
    streetEl.innerHTML = `<i class="fa-solid fa-location-dot" style="color:var(--color-blue)"></i> Marina Beach Rd, Triplicane, Chennai`;
    fetchWeatherFromGPS(13.0890, 80.2800);
  } else {
    fetchAddressFromGPS(state.currentLat, state.currentLng);
    fetchWeatherFromGPS(state.currentLat, state.currentLng);
  }
}

function openManualModal() {
  document.getElementById('manual-modal').classList.add('active');
  document.getElementById('manual-detail-view').style.display = 'none';
  speakText("Opened Survival booklet manual.");
}

function closeManualModal() {
  document.getElementById('manual-modal').classList.remove('active');
}

function showManualSection(sectionKey) {
  const detailView = document.getElementById('manual-detail-view');
  const titleEl = document.getElementById('manual-detail-title');
  const textEl = document.getElementById('manual-detail-text');
  
  let title = '';
  let content = '';
  
  if (sectionKey === 'cpr') {
    title = 'CPR & Bleeding Guide';
    content = `<b>1. Cardiac Arrest (CPR):</b><br>
      • Call emergency services immediately.<br>
      • Push hard and fast in the center of the chest (100-120 compressions per minute). Use the beat of "Stayin Alive".<br>
      • Keep going until help arrives.<br><br>
      <b>2. Severe Bleeding:</b><br>
      • Apply direct, firm pressure on the wound using a clean cloth.<br>
      • Elevate the limb if possible. Keep constant pressure.`;
  } else if (sectionKey === 'tyre') {
    title = 'Highway flat tyre guides';
    content = `<b>How to change flat wheel safely:</b><br>
      • Pull off the highway to a flat, safe surface as far from traffic as possible. Turn on hazard warnings.<br>
      • Secure wheel blocks/chocks.<br>
      • Loosen the wheel nuts slightly before raising the car with the jack.<br>
      • Lift the vehicle, remove nuts, swap tyre, tighten nuts gently, lower the vehicle, then tighten nuts fully in a star pattern.`;
  } else if (sectionKey === 'heat') {
    title = 'Overheating Engine safety tips';
    content = `<b>What to do if engine temp spikes:</b><br>
      • Pull over immediately in a safe spot and turn off the engine.<br>
      • <b>CAUTION:</b> Do NOT open the radiator cap while the engine is hot. Steam pressure can cause severe burns.<br>
      • Let the engine cool down for at least 15-20 minutes.<br>
      • Inspect coolant levels and check for leaks beneath the engine block. Refill if coolant is low.`;
  }
  
  titleEl.innerHTML = title;
  textEl.innerHTML = content;
  detailView.style.display = 'block';
  speakText(`Showing emergency tips for: ${title}`);
}

// -------------------------------------------------------------
// Authentication Flow Handlers
// -------------------------------------------------------------
function showAuthScreen(screenName) {
  // Hide bottom navigation
  document.getElementById('app-bottom-navbar').style.display = 'none';
  
  // Deactivate all screens
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));
  
  // Show target auth screen
  const target = document.getElementById(`screen-${screenName}`);
  if (target) {
    target.classList.add('active');
  }
}

async function handleLoginSubmit() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorEl = document.getElementById('login-error-msg');
  
  errorEl.style.display = 'none';

  if (!email || !password) {
    errorEl.textContent = 'Please fill in all fields.';
    errorEl.style.display = 'block';
    return;
  }

  if (CONFIG.useBackend) {
    try {
      const res = await fetch(`${CONFIG.apiBase}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed.');
      }
      
      const user = await res.json();
      localStorage.setItem('road_rescue_user', JSON.stringify(user));
      localStorage.setItem('has_registered', 'true');
      state.currentUser = user;
      updateUIForAuthenticatedUser(user);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  } else {
    // Check locally registered users list first!
    let localUsers = [];
    try {
      const stored = localStorage.getItem('road_rescue_registered_users');
      if (stored) localUsers = JSON.parse(stored);
    } catch (e) {}
    
    const user = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (user) {
      localStorage.setItem('road_rescue_user', JSON.stringify(user));
      localStorage.setItem('has_registered', 'true');
      state.currentUser = user;
      updateUIForAuthenticatedUser(user);
    } else if (email === 'alex@rescue.com' && password === 'password123') {
      const demoUser = {
        name: 'Alex Rivera',
        email: 'alex@rescue.com',
        vehicleModel: 'Tesla Model Y (2023)',
        licensePlate: '8XYZ98',
        bloodGroup: 'O-Positive (O+)',
        allergies: 'Penicillin, Nuts',
        conditions: 'Mild Asthma (Inhaler in glovebox)'
      };
      localStorage.setItem('road_rescue_user', JSON.stringify(demoUser));
      localStorage.setItem('has_registered', 'true');
      state.currentUser = demoUser;
      updateUIForAuthenticatedUser(demoUser);
    } else {
      errorEl.textContent = 'Invalid credentials. Hint: use alex@rescue.com / password123';
      errorEl.style.display = 'block';
    }
  }
}

async function handleRegisterSubmit() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const vehicleModel = document.getElementById('reg-vehicle').value.trim();
  const licensePlate = document.getElementById('reg-plate').value.trim();
  const bloodGroup = document.getElementById('reg-blood').value;
  const errorEl = document.getElementById('reg-error-msg');

  errorEl.style.display = 'none';

  if (!name || !email || !password || !vehicleModel || !licensePlate) {
    errorEl.textContent = 'All fields are required.';
    errorEl.style.display = 'block';
    return;
  }

  const payload = {
    name,
    email,
    password,
    vehicleModel,
    licensePlate,
    bloodGroup,
    allergies: 'None reported',
    conditions: 'None reported'
  };

  if (CONFIG.useBackend) {
    try {
      const res = await fetch(`${CONFIG.apiBase}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed.');
      }
      
      const user = await res.json();
      
      // Store user details in local storage registered users backup
      let localUsers = [];
      try {
        const stored = localStorage.getItem('road_rescue_registered_users');
        if (stored) localUsers = JSON.parse(stored);
      } catch (e) {}
      if (!localUsers.some(u => u.email.toLowerCase() === user.email.toLowerCase())) {
        localUsers.push(user);
        localStorage.setItem('road_rescue_registered_users', JSON.stringify(localUsers));
      }
      
      // Mark as registered
      localStorage.setItem('has_registered', 'true');
      
      // Prefill login email
      document.getElementById('login-email').value = user.email;
      
      // Transition to Login Screen sequential flow
      showAuthScreen('login');
      
      // Notch Notify Success
      expandDynamicIsland(`<i class="fa-solid fa-circle-check" style="color:var(--color-green);"></i> Account Created!`);
      speakText("Account created successfully. Please enter your password to sign in.");
      document.getElementById('login-error-msg').style.display = 'none';
      
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  } else {
    // Local memory register backup
    const user = {
      ...payload,
      id: `usr-${Date.now()}`
    };
    
    // Save in localStorage registered users
    let localUsers = [];
    try {
      const stored = localStorage.getItem('road_rescue_registered_users');
      if (stored) localUsers = JSON.parse(stored);
    } catch (e) {}
    localUsers.push(user);
    localStorage.setItem('road_rescue_registered_users', JSON.stringify(localUsers));
    
    // Mark as registered
    localStorage.setItem('has_registered', 'true');
    
    // Prefill login email
    document.getElementById('login-email').value = user.email;
    
    // Show login screen
    showAuthScreen('login');
    
    expandDynamicIsland(`<i class="fa-solid fa-circle-check" style="color:var(--color-green);"></i> Account Created!`);
    speakText("Account created successfully. Please enter your password to sign in.");
  }
}

function handleDemoLogin() {
  const demoUser = {
    name: 'Alex Rivera',
    email: 'alex@rescue.com',
    vehicleModel: 'Tesla Model Y (2023)',
    licensePlate: '8XYZ98',
    bloodGroup: 'O-Positive (O+)',
    allergies: 'Penicillin, Nuts',
    conditions: 'Mild Asthma (Inhaler in glovebox)'
  };
  localStorage.setItem('road_rescue_user', JSON.stringify(demoUser));
  state.currentUser = demoUser;
  updateUIForAuthenticatedUser(demoUser);
}

function updateUIForAuthenticatedUser(user) {
  // Update header text in Home tab
  const welcomeHeaders = document.querySelectorAll('#screen-home .screen-header h2');
  welcomeHeaders.forEach(h2 => {
    h2.textContent = user.name;
  });

  // Update Profile fields dynamically
  const profileScreen = document.getElementById('screen-profile');
  if (profileScreen) {
    // Medical updates
    const medParagraphs = profileScreen.querySelectorAll('.dash-card:nth-child(2) p');
    if (medParagraphs.length >= 3) {
      medParagraphs[0].textContent = user.bloodGroup;
      medParagraphs[1].textContent = user.allergies || 'None';
      medParagraphs[2].textContent = user.conditions || 'None';
    }
    
    // Vehicle updates
    const vehParagraphs = profileScreen.querySelectorAll('.dash-card:nth-child(3) p');
    if (vehParagraphs.length >= 4) {
      vehParagraphs[0].textContent = user.vehicleModel;
      vehParagraphs[1].textContent = user.licensePlate;
    }
  }

  speakText(`Welcome, ${user.name.split(' ')[0]}. Active Protect is armed.`);
  
  // Show bottom navigation bar
  document.getElementById('app-bottom-navbar').style.display = 'flex';
  
  // Redirect to Home tab
  showTab('home');
}

function handleLogout() {
  localStorage.removeItem('road_rescue_user');
  state.currentUser = null;
  
  // Reset fields
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-email').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-vehicle').value = '';
  document.getElementById('reg-plate').value = '';
  
  expandDynamicIsland(`<i class="fa-solid fa-right-from-bracket" style="color:var(--color-orange)"></i> Logged Out`);
  speakText("Signed out of your profile.");
  
  showAuthScreen('register');
}

function toggleSimulatorCollapse() {
  const content = document.getElementById('simulator-collapse-content');
  const chevron = document.getElementById('simulator-chevron');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    chevron.style.transform = 'rotate(180deg)';
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}
