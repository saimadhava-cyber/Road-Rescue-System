/**
 * ============================================================
 * ROAD RESCUE SYSTEM — BASELINE / LOAD TEST
 * ============================================================
 * Strategy  : autocannon HTTP benchmarker
 * Users     : 100 virtual connections (concurrent)
 * Duration  : 60 seconds (1 minute)
 * Targets   : All major API endpoints (round-robin pipelining)
 * Metrics   : RPS, Latency (avg / min / max / p50 / p95 / p99)
 * SLA       : Avg latency < 1000ms | p99 < 5000ms | 0 timeouts
 * ============================================================
 */

'use strict';

const autocannon = require('autocannon');
const ExcelJS    = require('exceljs');
const fs         = require('fs');
const path       = require('path');
const http       = require('http');

// ──────────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────────
const BASE_URL     = process.env.BASE_URL || 'http://localhost:5000';
const CONNECTIONS  = 100;     // 100 virtual users
const DURATION_SEC = 60;      // 1 minute
const PIPELINING   = 1;       // requests in-flight per connection

// SLA thresholds
const SLA_AVG_MS      = 1000;
const SLA_P99_MS      = 5000;
const SLA_TIMEOUT_PCT = 0.1;  // < 0.1% timeout rate (industry standard)

// Output directory
const REPORT_DIR = path.join(__dirname, '..', 'Test Results', 'Load');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ──────────────────────────────────────────────────────────────
// ENDPOINT SCENARIOS  (round-robin across all connections)
// ──────────────────────────────────────────────────────────────
const REQUESTS = [
    // GET endpoints
    { method: 'GET',  path: '/api/analytics',          headers: { 'content-type': 'application/json' } },
    { method: 'GET',  path: '/api/services',            headers: { 'content-type': 'application/json' } },
    { method: 'GET',  path: '/api/hazards',             headers: { 'content-type': 'application/json' } },
    { method: 'GET',  path: '/api/sos/history',         headers: { 'content-type': 'application/json' } },
    { method: 'GET',  path: '/api/assistance/history',  headers: { 'content-type': 'application/json' } },

    // POST endpoints
    {
        method: 'POST', path: '/api/diagnostics',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'OK', battery: 85, tyrePressure: 32, brakes: 'OK' })
    },
    {
        method: 'POST', path: '/api/hazards',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'pothole', description: 'Load test hazard', lat: 17.385, lng: 78.4867 })
    },
    {
        method: 'POST', path: '/api/assistance',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'tow', lat: 17.385, lng: 78.4867, provider: 'LoadTest Provider' })
    },
    {
        method: 'POST', path: '/api/login',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alex@rescue.com', password: 'password123' })
    }
];

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function fmt(n) { return n != null ? n.toFixed(2) : 'N/A'; }

function printProgress(elapsed, rps) {
    process.stdout.write(
        `\r  ⏱  ${String(elapsed).padStart(2, '0')}s / ${DURATION_SEC}s  |  ` +
        `RPS: ${String(Math.round(rps)).padStart(6)}  |  Running with ${CONNECTIONS} virtual users...`
    );
}

// ──────────────────────────────────────────────────────────────
// WAIT FOR SERVER
// ──────────────────────────────────────────────────────────────
async function waitForServer(url, maxWaitMs = 30000) {
    const start = Date.now();
    const healthUrl = new URL('/api/analytics', url);
    console.log(`\n⏳ Waiting for server at ${url}...`);
    while (Date.now() - start < maxWaitMs) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get({ hostname: healthUrl.hostname, port: healthUrl.port || 80, path: healthUrl.pathname }, resolve);
                req.on('error', reject);
                req.setTimeout(2000, () => req.destroy());
            });
            console.log(`✅ Server is ready!\n`);
            return true;
        } catch {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error(`Server not reachable at ${url} after ${maxWaitMs / 1000}s`);
}

// ──────────────────────────────────────────────────────────────
// RUN LOAD TEST
// ──────────────────────────────────────────────────────────────
async function runLoadTest() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         ROAD RESCUE SYSTEM — BASELINE LOAD TEST              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Target      : ${BASE_URL.padEnd(45)}║`);
    console.log(`║  Virtual Users (Connections) : ${String(CONNECTIONS).padEnd(30)}║`);
    console.log(`║  Duration    : ${String(DURATION_SEC + 's').padEnd(45)}║`);
    console.log(`║  Endpoints   : ${String(REQUESTS.length + ' endpoints (round-robin)').padEnd(45)}║`);
    console.log(`║  SLA Avg     : < ${SLA_AVG_MS}ms${' '.repeat(41)}║`);
    console.log(`║  SLA p99     : < ${SLA_P99_MS}ms${' '.repeat(41)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    let tickInterval;
    let elapsed = 0;
    let lastRPS  = 0;

    const instance = autocannon({
        url: BASE_URL,
        connections:  CONNECTIONS,
        duration:     DURATION_SEC,
        pipelining:   PIPELINING,
        requests:     REQUESTS,
        timeout:      10,  // 10s per-request timeout
    }, (err, result) => {
        if (tickInterval) clearInterval(tickInterval);
        process.stdout.write('\n');
        if (err) { console.error('❌ Load test error:', err); process.exit(1); }
        finalize(result);
    });

    // Live progress ticker
    tickInterval = setInterval(() => {
        elapsed++;
        printProgress(elapsed, lastRPS);
    }, 1000);

    instance.on('tick', ({ counter, bytes }) => {
        lastRPS = counter;
    });

    autocannon.track(instance, { renderProgressBar: false });
}

// ──────────────────────────────────────────────────────────────
// FINALIZE — PRINT + EXCEL
// ──────────────────────────────────────────────────────────────
async function finalize(r) {
    const lat    = r.latency;
    const req    = r.requests;
    const rps    = r.requests.mean / 1;   // autocannon gives total, compute ourselves
    const avgRPS = Math.round(r.requests.total / DURATION_SEC);

    const timeoutPct  = r.requests.total > 0 ? (r.timeouts / r.requests.total) * 100 : 0;
    const slaAvgPass  = lat.mean    <= SLA_AVG_MS;
    const slap99Pass  = lat.p99     <= SLA_P99_MS;
    const slaTimeout  = timeoutPct  <  SLA_TIMEOUT_PCT;
    const overallPass = slaAvgPass && slap99Pass && slaTimeout;

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    LOAD TEST RESULTS                         ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Duration Tested    : ${String(DURATION_SEC + 's').padEnd(39)}║`);
    console.log(`║  Virtual Users      : ${String(CONNECTIONS).padEnd(39)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Requests Sent: ${String(r.requests.total).padEnd(39)}║`);
    console.log(`║  Requests Per Sec   : ${String(avgRPS + ' req/sec').padEnd(39)}║`);
    console.log(`║  Throughput         : ${String(Math.round(r.throughput.total / 1024) + ' KB total').padEnd(39)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Latency — Average  : ${String(fmt(lat.mean) + 'ms').padEnd(39)}║`);
    console.log(`║  Latency — Min      : ${String(lat.min + 'ms').padEnd(39)}║`);
    console.log(`║  Latency — Max      : ${String(lat.max + 'ms').padEnd(39)}║`);
    console.log(`║  Latency — p50      : ${String(lat.p50 + 'ms').padEnd(39)}║`);
    console.log(`║  Latency — p75      : ${String(lat.p75 + 'ms').padEnd(39)}║`);
    console.log(`║  Latency — p97.5    : ${String((lat.p97_5 || lat.p975 || 'N/A') + 'ms').padEnd(39)}║`);
    console.log(`║  Latency — p99      : ${String(lat.p99 + 'ms').padEnd(39)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  HTTP Errors        : ${String(r.errors).padEnd(39)}║`);
    console.log(`║  Timeouts           : ${String(r.timeouts + ' (' + timeoutPct.toFixed(3) + '%)').padEnd(39)}║`);
    console.log(`║  Non-2xx Responses  : ${String(r.non2xx).padEnd(39)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  SLA Avg < ${SLA_AVG_MS}ms      : ${(slaAvgPass  ? '✅ PASS' : '❌ FAIL').padEnd(39)}║`);
    console.log(`║  SLA p99 < ${SLA_P99_MS}ms      : ${(slap99Pass  ? '✅ PASS' : '❌ FAIL').padEnd(39)}║`);
    console.log(`║  Timeout Rate < 0.1%: ${(slaTimeout   ? '✅ PASS' : '❌ FAIL').padEnd(39)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  OVERALL STATUS     : ${(overallPass  ? '✅ PASS' : '❌ FAIL').padEnd(39)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // ── Generate Excel Report ──
    await generateExcel(r, avgRPS, lat, overallPass);

    // Exit with appropriate code
    process.exit(overallPass ? 0 : 1);
}

async function generateExcel(r, avgRPS, lat, overallPass) {
    const timeoutPct = r.requests.total > 0 ? (r.timeouts / r.requests.total) * 100 : 0;
    const slaTimeout = timeoutPct < SLA_TIMEOUT_PCT;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Road Rescue Load Test';
    wb.created = new Date();

    // ── Sheet 1: Summary ──
    const summary = wb.addWorksheet('📊 Load Test Summary');
    summary.columns = [
        { header: 'Metric', key: 'metric', width: 32 },
        { header: 'Value',  key: 'value',  width: 28 },
        { header: 'SLA',    key: 'sla',    width: 22 },
        { header: 'Status', key: 'status', width: 14 },
    ];

    // Style header
    summary.getRow(1).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.font = { bold: true, color: { argb: 'FF38BDF8' }, size: 12 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    summary.getRow(1).height = 28;

    const NA = 'N/A';
    const PASS = '✅ PASS';
    const FAIL = '❌ FAIL';

    const rows = [
        // Config
        { metric: '── TEST CONFIGURATION ──', value: '', sla: '', status: '' },
        { metric: 'Target URL',          value: BASE_URL,                        sla: NA, status: NA },
        { metric: 'Virtual Users',        value: CONNECTIONS,                      sla: NA, status: NA },
        { metric: 'Duration',             value: DURATION_SEC + ' seconds',        sla: NA, status: NA },
        { metric: 'Pipelining',           value: PIPELINING,                       sla: NA, status: NA },
        { metric: 'Endpoints Tested',     value: REQUESTS.length + ' (round-robin)',sla: NA, status: NA },

        // Throughput
        { metric: '── THROUGHPUT ──',    value: '', sla: '', status: '' },
        { metric: 'Total Requests Sent',  value: r.requests.total,                 sla: NA, status: NA },
        { metric: 'Requests Per Second',  value: avgRPS + ' req/sec',              sla: NA, status: NA },
        { metric: 'Throughput',           value: Math.round(r.throughput.total / 1024) + ' KB', sla: NA, status: NA },

        // Latency
        { metric: '── RESPONSE TIME ──', value: '', sla: '', status: '' },
        { metric: 'Average Latency',      value: lat.mean.toFixed(2) + ' ms',      sla: '< ' + SLA_AVG_MS + 'ms', status: lat.mean <= SLA_AVG_MS ? PASS : FAIL },
        { metric: 'Min Latency',          value: lat.min  + ' ms',                 sla: NA, status: NA },
        { metric: 'Max Latency',          value: lat.max  + ' ms',                 sla: NA, status: NA },
        { metric: 'p50 Latency (Median)', value: lat.p50  + ' ms',                 sla: NA, status: NA },
        { metric: 'p75 Latency',          value: lat.p75  + ' ms',                 sla: NA, status: NA },
        { metric: 'p97.5 Latency',        value: (lat.p97_5 || lat.p975 || 'N/A') + ' ms', sla: NA, status: NA },
        { metric: 'p99 Latency',          value: lat.p99  + ' ms',                 sla: '< ' + SLA_P99_MS + 'ms', status: lat.p99 <= SLA_P99_MS ? PASS : FAIL },

        // Errors
        { metric: '── ERRORS ──',        value: '', sla: '', status: '' },
        { metric: 'HTTP Errors',          value: r.errors,                                          sla: '= 0',    status: r.errors === 0 ? PASS : FAIL },
        { metric: 'Timeouts',             value: r.timeouts + ' (' + timeoutPct.toFixed(3) + '%)', sla: '< 0.1%', status: slaTimeout ? PASS : FAIL },
        { metric: 'Non-2xx Responses',    value: r.non2xx,                           sla: NA,     status: NA },

        // Overall
        { metric: '── OVERALL ──',       value: '', sla: '', status: '' },
        { metric: 'OVERALL SLA STATUS',   value: overallPass ? 'ALL PASSED' : 'FAILED',
          sla: 'Avg<1000ms, p99<5000ms, timeouts<0.1%',
          status: overallPass ? PASS : FAIL
        },
    ];

    rows.forEach((rowData, i) => {
        const row = summary.addRow(rowData);
        const isSection = rowData.metric.startsWith('──');

        if (isSection) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
                cell.font = { bold: true, color: { argb: 'FF94A3B8' }, italic: true };
            });
        } else {
            row.eachCell((cell, col) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
                cell.alignment = { vertical: 'middle' };
            });

            // Color status cell
            const statusCell = row.getCell('status');
            if (rowData.status === PASS) {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } };
                statusCell.font = { bold: true, color: { argb: 'FF15803D' } };
                statusCell.alignment = { horizontal: 'center' };
            } else if (rowData.status === FAIL) {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
                statusCell.alignment = { horizontal: 'center' };
            }
        }
        row.height = 22;
    });

    // ── Sheet 2: Percentile Distribution ──
    const dist = wb.addWorksheet('📈 Percentile Distribution');
    dist.columns = [
        { header: 'Percentile', key: 'pct',  width: 18 },
        { header: 'Latency (ms)', key: 'ms', width: 18 },
        { header: 'Interpretation', key: 'desc', width: 42 },
    ];
    dist.getRow(1).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.font = { bold: true, color: { argb: 'FF38BDF8' }, size: 12 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    dist.getRow(1).height = 28;

    const percentiles = [
        { pct: 'Min',  ms: lat.min,  desc: 'Fastest response seen during the test' },
        { pct: 'p50',  ms: lat.p50,  desc: '50% of requests completed faster than this' },
        { pct: 'p75',  ms: lat.p75,  desc: '75% of requests completed faster than this' },
        { pct: 'Mean', ms: lat.mean.toFixed(2), desc: 'Average response time across all requests' },
        { pct: 'p97.5', ms: lat.p97_5 || lat.p975 || 'N/A', desc: '97.5% of requests completed faster than this' },
        { pct: 'p99',  ms: lat.p99,  desc: '99% of requests completed faster than this (SLA gate)' },
        { pct: 'Max',  ms: lat.max,  desc: 'Slowest response seen during the test (worst case)' },
    ];

    percentiles.forEach((p, i) => {
        const row = dist.addRow(p);
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF0F9FF' : 'FFFFFFFF' } };
            cell.alignment = { vertical: 'middle' };
        });
        // Color latency cell based on range
        const msCell = row.getCell('ms');
        const msVal  = parseFloat(p.ms);
        if (msVal < 200) {
            msCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } };
            msCell.font = { bold: true, color: { argb: 'FF15803D' } };
        } else if (msVal < 1000) {
            msCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
            msCell.font = { bold: true, color: { argb: 'FF92400E' } };
        } else {
            msCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            msCell.font = { bold: true, color: { argb: 'FFDC2626' } };
        }
        row.height = 24;
    });

    // ── Sheet 3: Endpoints Tested ──
    const endpointSheet = wb.addWorksheet('🌐 Endpoints Tested');
    endpointSheet.columns = [
        { header: '#',        key: 'num',    width: 6  },
        { header: 'Method',   key: 'method', width: 10 },
        { header: 'Endpoint', key: 'path',   width: 40 },
        { header: 'Body',     key: 'body',   width: 55 },
    ];
    endpointSheet.getRow(1).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.font = { bold: true, color: { argb: 'FF38BDF8' }, size: 12 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    endpointSheet.getRow(1).height = 28;

    REQUESTS.forEach((req, i) => {
        const row = endpointSheet.addRow({
            num:    i + 1,
            method: req.method,
            path:   req.path,
            body:   req.body || '—'
        });
        const methodColors = { GET: 'FF16A34A', POST: 'FF2563EB' };
        row.getCell('method').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: methodColors[req.method] || 'FFCCCCCC' } };
        row.getCell('method').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.getCell('method').alignment = { horizontal: 'center', vertical: 'middle' };
        row.eachCell(cell => { cell.alignment = { vertical: 'middle', wrapText: true }; });
        row.height = 28;
    });

    const outPath = path.join(REPORT_DIR, 'Load_Test_Report.xlsx');
    await wb.xlsx.writeFile(outPath);
    console.log(`\n📊 Excel report saved to: ${outPath}\n`);
}

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────
(async () => {
    try {
        await waitForServer(BASE_URL);
        await runLoadTest();
    } catch (err) {
        console.error('\n❌ Fatal error:', err.message);
        process.exit(1);
    }
})();
