const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('\n========================================');
  console.log('  ROAD RESCUE — Supabase API Health Check');
  console.log('========================================\n');

  // 1. Analytics
  let r = await request('GET', '/api/analytics');
  console.log(`[1] GET /api/analytics → ${r.status === 200 ? '✅' : '❌'} ${r.status}`);
  if (r.data) console.log(`    safetyScore: ${r.data.safetyScore}, totalSOS: ${r.data.totalSOS}, totalAssistance: ${r.data.totalAssistance}`);

  // 2. Services
  r = await request('GET', '/api/services');
  console.log(`\n[2] GET /api/services → ${r.status === 200 ? '✅' : '❌'} ${r.status}`);
  if (Array.isArray(r.data)) {
    const fromSupabase = r.data[0]?.id && !r.data[0]?.id.startsWith('hosp-');
    console.log(`    Count: ${r.data.length} | Source: ${fromSupabase ? '🟢 Supabase DB' : '🟡 Local Fallback'}`);
    r.data.forEach(s => console.log(`    - ${s.name} (${s.type})`));
  }

  // 3. Hazards
  r = await request('GET', '/api/hazards');
  console.log(`\n[3] GET /api/hazards → ${r.status === 200 ? '✅' : '❌'} ${r.status}`);
  if (Array.isArray(r.data)) {
    console.log(`    Count: ${r.data.length} | Source: ${r.data.length > 0 && r.data[0].id && !r.data[0].id.startsWith('hz-') ? '🟢 Supabase DB' : r.data.length > 0 ? '🟡 Local Fallback' : '🟢 Supabase DB (empty)'}`);
    r.data.forEach(h => console.log(`    - ${h.type}: ${h.description}`));
  }

  // 4. SOS History
  r = await request('GET', '/api/sos/history');
  console.log(`\n[4] GET /api/sos/history → ${r.status === 200 ? '✅' : '❌'} ${r.status}`);
  console.log(`    Records: ${Array.isArray(r.data) ? r.data.length : 'error'}`);

  // 5. Assistance History
  r = await request('GET', '/api/assistance/history');
  console.log(`\n[5] GET /api/assistance/history → ${r.status === 200 ? '✅' : '❌'} ${r.status}`);
  console.log(`    Records: ${Array.isArray(r.data) ? r.data.length : 'error'}`);

  // 6. Login (demo user)
  r = await request('POST', '/api/login', { email: 'alex@rescue.com', password: 'password123' });
  console.log(`\n[6] POST /api/login (demo user) → ${r.status === 200 ? '✅' : '❌'} ${r.status}`);
  if (r.data && r.data.name) {
    console.log(`    User: ${r.data.name} | Email: ${r.data.email}`);
    const fromSupabase = r.data.id && !r.data.id.startsWith('usr-demo');
    console.log(`    Source: ${fromSupabase ? '🟢 Supabase DB' : '🟡 Local Fallback'}`);
  } else {
    console.log(`    Error: ${JSON.stringify(r.data)}`);
  }

  console.log('\n========================================');
  console.log('  Check complete!');
  console.log('========================================\n');
}

run().catch(console.error);
