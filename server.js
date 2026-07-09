require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Supabase Client ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log(`[SUPABASE] Connecting to: ${supabaseUrl}`);

app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files from 'www' directory
app.use(express.static(path.join(__dirname, 'www')));

// -------------------------------------------------------
// LOCAL FALLBACK USER STORE (used when Supabase tables not set up yet)
// -------------------------------------------------------
const localUsers = [
  {
    id: 'usr-demo',
    name: 'Alex Rivera',
    email: 'alex@rescue.com',
    password: 'password123',
    vehicleModel: 'Tesla Model Y (2023)',
    licensePlate: '8XYZ98',
    bloodGroup: 'O-Positive (O+)',
    allergies: 'Penicillin, Nuts',
    conditions: 'Mild Asthma (Inhaler in glovebox)'
  }
];

function findLocalUser(email, password) {
  return localUsers.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
}

function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

// -------------------------------------------------------
// AUTH - Login
// -------------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  // Try Supabase users table first
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('password', password)
    .maybeSingle();

  if (error) {
    // Supabase unavailable or table not created yet — fall back to local store
    console.warn('[LOGIN] Supabase unavailable, using local fallback:', error.message);
    const localUser = findLocalUser(email, password);
    if (localUser) return res.json(safeUser(localUser));
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!data) {
    // Not found in Supabase — check local fallback store
    const localUser = findLocalUser(email, password);
    if (localUser) return res.json(safeUser(localUser));
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Map snake_case DB fields to camelCase for frontend
  res.json({
    id: data.id,
    name: data.name,
    email: data.email,
    vehicleModel: data.vehicle_model || data.vehicleModel,
    licensePlate: data.license_plate || data.licensePlate,
    bloodGroup: data.blood_group || data.bloodGroup,
    allergies: data.allergies,
    conditions: data.conditions
  });
});

// -------------------------------------------------------
// AUTH - Register
// -------------------------------------------------------
app.post('/api/register', async (req, res) => {
  const { name, email, password, vehicleModel, licensePlate, bloodGroup, allergies, conditions } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });

  // Build user object
  const newUser = {
    id: `usr-${Date.now()}`,
    name,
    email: email.toLowerCase(),
    password,
    vehicleModel,
    licensePlate,
    bloodGroup: bloodGroup || 'O-Positive (O+)',
    allergies: allergies || 'None',
    conditions: conditions || 'None'
  };

  // Try Supabase first
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) return res.status(400).json({ error: 'Email already registered.' });

  const { data, error } = await supabase
    .from('users')
    .insert([{
      name,
      email: email.toLowerCase(),
      password,
      vehicle_model: vehicleModel,
      license_plate: licensePlate,
      blood_group: bloodGroup || 'O-Positive (O+)',
      allergies: allergies || 'None',
      conditions: conditions || 'None',
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    // Supabase table not ready — store in local fallback and succeed
    console.warn('[REGISTER] Supabase unavailable, storing locally:', error.message);
    const alreadyExists = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (alreadyExists) return res.status(400).json({ error: 'Email already registered.' });
    localUsers.push(newUser);
    return res.json(safeUser(newUser));
  }

  // Also save to local fallback for cross-session use
  if (!localUsers.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    localUsers.push(newUser);
  }

  res.json({
    id: data.id,
    name: data.name,
    email: data.email,
    vehicleModel: data.vehicle_model,
    licensePlate: data.license_plate,
    bloodGroup: data.blood_group,
    allergies: data.allergies,
    conditions: data.conditions
  });
});

// -------------------------------------------------------
// ANALYTICS
// -------------------------------------------------------
app.get('/api/analytics', async (req, res) => {
  // Fetch SOS and assistance counts for analytics
  const { data: sosList } = await supabase.from('sos_history').select('id');
  const { data: astList } = await supabase.from('assistance_history').select('id');

  res.json({
    safetyScore: 88,
    suddenBraking: 3,
    overspeeding: 2,
    weeklyScores: [85, 90, 84, 89, 92, 88],
    totalSOS: sosList ? sosList.length : 0,
    totalAssistance: astList ? astList.length : 0
  });
});

// -------------------------------------------------------
// NEARBY SERVICES
// -------------------------------------------------------
app.get('/api/services', async (req, res) => {
  const lat = parseFloat(req.query.lat) || 13.0827;
  const lng = parseFloat(req.query.lng) || 80.2707;

  // Try to fetch from services table first
  const { data, error } = await supabase.from('services').select('*').limit(10);

  if (error || !data || data.length === 0) {
    // Fallback to seeded data near user's GPS
    return res.json([
      { id: 'hosp-1', name: 'Apollo Hospital', type: 'hospital', lat: lat + 0.005, lng: lng + 0.008, rating: 4.7, distance: '0.6 mi', phone: '+91 44 2829 0200' },
      { id: 'hosp-2', name: 'Royapettah Govt Hospital', type: 'hospital', lat: lat - 0.006, lng: lng - 0.003, rating: 4.5, distance: '0.8 mi', phone: '+91 44 2864 3000' },
      { id: 'pol-1', name: 'Chennai Central Police Station', type: 'police', lat: lat + 0.002, lng: lng - 0.007, rating: 4.2, distance: '0.5 mi', phone: '+91 44 2345 2500' },
      { id: 'resc-1', name: 'TNFRS Rescue (Chennai Central)', type: 'rescue', lat: lat - 0.002, lng: lng + 0.003, rating: 4.9, distance: '0.3 mi', phone: '+91 44 2855 1111' },
      { id: 'mech-1', name: 'Chennai Towing & Road Assist', type: 'mechanic', lat: lat + 0.008, lng: lng - 0.002, rating: 4.8, distance: '0.7 mi', phone: '+91 98400 12345' },
      { id: 'mech-2', name: 'Madras Auto Garage & Towing', type: 'mechanic', lat: lat - 0.007, lng: lng + 0.008, rating: 4.6, distance: '0.9 mi', phone: '+91 98840 54321' }
    ]);
  }

  res.json(data);
});

// -------------------------------------------------------
// HAZARDS
// -------------------------------------------------------
app.get('/api/hazards', async (req, res) => {
  const { data, error } = await supabase
    .from('hazards')
    .select('*')
    .eq('status', 'Active')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) {
    // Graceful fallback
    return res.json([
      { id: 'hz-1', type: 'Pothole', description: 'Large deep pothole in middle lane', lat: 13.0857, lng: 80.2687, timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'Active' },
      { id: 'hz-2', type: 'Accident', description: 'Fender bender blocking right lane', lat: 13.0787, lng: 80.2757, timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'Active' }
    ]);
  }

  res.json(data.map(h => ({ ...h, timestamp: h.created_at })));
});

app.post('/api/hazards', async (req, res) => {
  const { type, description, lat, lng, reportedBy } = req.body;

  const payload = {
    type,
    description: description || `Reported ${type}`,
    lat,
    lng,
    reported_by: reportedBy,
    status: 'Active',
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('hazards').insert([payload]).select().single();

  if (error || !data) {
    console.warn('[HAZARD POST] Supabase error:', error?.message);
    return res.json({ id: `hz-${Date.now()}`, ...payload, timestamp: payload.created_at });
  }

  res.json({ ...data, timestamp: data.created_at });
});

// -------------------------------------------------------
// SOS HISTORY
// -------------------------------------------------------
app.get('/api/sos/history', async (req, res) => {
  const { data, error } = await supabase
    .from('sos_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return res.json([]);
  res.json(data.map(i => ({ ...i, timestamp: i.created_at })));
});

app.post('/api/sos', async (req, res) => {
  const { lat, lng, source, sensorData } = req.body;
  const gForce = sensorData?.gForce || 1.0;

  const payload = {
    lat,
    lng,
    source,
    g_force: gForce,
    severity: gForce > 6 ? 'Critical' : 'Moderate',
    status: 'Received',
    description: source === 'sensor' ? `Crash sensor triggered (${gForce} Gs). AI severity predicted.` : 'Manual SOS trigger',
    responder_lat: lat + 0.015,
    responder_lng: lng - 0.015,
    eta: 'Calculating...',
    contacts_notified: ['Family (SMS sent)', 'Rescue dispatcher (En route)', 'Traffic authority'],
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('sos_history').insert([payload]).select().single();

  if (error || !data) {
    console.warn('[SOS POST] Supabase error:', error?.message);
    return res.json({
      id: `sos-${Date.now()}`,
      timestamp: payload.created_at,
      lat, lng, source,
      status: payload.status,
      severity: payload.severity,
      description: payload.description,
      responderLat: payload.responder_lat,
      responderLng: payload.responder_lng,
      eta: payload.eta,
      contactsNotified: payload.contacts_notified
    });
  }

  res.json({
    id: data.id,
    timestamp: data.created_at,
    lat: data.lat,
    lng: data.lng,
    source: data.source,
    status: data.status,
    severity: data.severity,
    description: data.description,
    responderLat: data.responder_lat,
    responderLng: data.responder_lng,
    eta: data.eta,
    contactsNotified: data.contacts_notified
  });
});

app.post('/api/sos/resolve/:id', async (req, res) => {
  const id = req.params.id;
  await supabase.from('sos_history').update({ status: 'Resolved' }).eq('id', id);
  res.json({ success: true });
});

app.get('/api/sos/status/:id', async (req, res) => {
  const { data } = await supabase.from('sos_history').select('status, eta').eq('id', req.params.id).maybeSingle();
  res.json(data || { status: 'Received', eta: 'Calculating...' });
});

// -------------------------------------------------------
// ASSISTANCE HISTORY
// -------------------------------------------------------
app.get('/api/assistance/history', async (req, res) => {
  const { data, error } = await supabase
    .from('assistance_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return res.json([]);
  res.json(data.map(a => ({
    id: a.id,
    type: a.type,
    timestamp: a.created_at,
    lat: a.lat,
    lng: a.lng,
    status: a.status,
    mechanicLat: a.mechanic_lat,
    mechanicLng: a.mechanic_lng,
    eta: a.eta,
    assignedProvider: a.assigned_provider,
    note: a.note
  })));
});

app.post('/api/assistance', async (req, res) => {
  const { type, lat, lng, provider, note } = req.body;

  const angle = Math.random() * Math.PI * 2;
  const distance = 0.012;

  const payload = {
    type,
    lat,
    lng,
    status: 'Requested',
    mechanic_lat: lat + Math.sin(angle) * distance,
    mechanic_lng: lng + Math.cos(angle) * distance,
    eta: 'Calculating...',
    assigned_provider: provider || (type === 'Towing' ? 'Apex Towing Flatbed' : 'Roadside Specialist'),
    note: note || '',
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('assistance_history').insert([payload]).select().single();

  if (error || !data) {
    console.warn('[ASSISTANCE POST] Supabase error:', error?.message);
    return res.json({
      id: `ast-${Date.now()}`,
      type, lat, lng,
      timestamp: payload.created_at,
      status: payload.status,
      mechanicLat: payload.mechanic_lat,
      mechanicLng: payload.mechanic_lng,
      eta: payload.eta,
      assignedProvider: payload.assigned_provider,
      note: payload.note
    });
  }

  res.json({
    id: data.id,
    type: data.type,
    lat: data.lat,
    lng: data.lng,
    timestamp: data.created_at,
    status: data.status,
    mechanicLat: data.mechanic_lat,
    mechanicLng: data.mechanic_lng,
    eta: data.eta,
    assignedProvider: data.assigned_provider,
    note: data.note
  });
});

app.get('/api/assistance/status/:id', async (req, res) => {
  const { data } = await supabase.from('assistance_history').select('status, eta').eq('id', req.params.id).maybeSingle();
  res.json(data || { status: 'Requested', eta: 'Calculating...' });
});

// -------------------------------------------------------
// DIAGNOSTICS
// -------------------------------------------------------
app.post('/api/diagnostics', async (req, res) => {
  const { engine, battery, tyrePressure, brakes } = req.body;

  let scoreImpact = 0;
  if (engine !== 'OK') scoreImpact += 15;
  if (battery < 20) scoreImpact += 10;
  if (tyrePressure < 28) scoreImpact += 10;
  if (brakes !== 'OK') scoreImpact += 20;

  const recommendation = scoreImpact > 10
    ? 'Warning: Vehicle diagnostic flags raised. Request roadside mechanic for quick checkup.'
    : 'All systems operational. Telemetry nominal.';

  // Save diagnostics snapshot to Supabase
  await supabase.from('diagnostics_history').insert([{
    engine,
    battery,
    tyre_pressure: tyrePressure,
    brakes,
    recommendation,
    created_at: new Date().toISOString()
  }]);

  res.json({
    engine,
    battery: `${battery}%`,
    tyres: `${tyrePressure} PSI`,
    brakes,
    recommendation
  });
});

// -------------------------------------------------------
// FALLBACK: 404 on unknown /api routes
// -------------------------------------------------------
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});



// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚑 Road Rescue Backend running on http://localhost:${PORT}`);
    console.log(`📦 Supabase connected: ${supabaseUrl}`);
    console.log(`🌐 Frontend served at http://localhost:${PORT}\n`);
  });
}

module.exports = app;
