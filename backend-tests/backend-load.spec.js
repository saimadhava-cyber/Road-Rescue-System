const request = require('supertest');
const { expect } = require('chai');
const app = require('../server');

describe('Load & Latency Testing Constraints', function () {
    this.timeout(180000); // Allow enough time for all 300 simulated tests

    // Utility: measure a CONCURRENT burst of N requests, return individual latencies
    async function measureBurst(payload, n = 5) {
        const promises = Array.from({ length: n }, () => {
            const t = Date.now();
            return request(app)
                .post('/api/diagnostics')
                .send(payload)
                .then(res => ({ status: res.status, latency: Date.now() - t }));
        });
        // Fire all N concurrently, but measure each one independently
        return Promise.all(promises);
    }

    // 300 Tests — each validates individual burst request SLA compliance
    // SLA Contract:
    //   - All requests must return HTTP 200
    //   - Max (worst-case) individual latency < 5000ms  [realistic for CI/local test runners]
    //   - Average latency < 3000ms
    // This is consistent with Google's Web Vitals "Good" threshold for TTI on local servers.
    describe('Simulated Concurrent SLA Latency Tests (300 Tests)', function () {

        for (let i = 1; i <= 300; i++) {
            const testId = `TC-L-SLA-${String(i).padStart(3, '0')}`;

            // Vary payload profile per iteration to simulate realistic diverse load
            const battery    = Math.max(10, 100 - (i % 30));
            const tyre       = 28 + (i % 10);
            const engine     = (i % 7 === 0) ? 'WARNING' : 'OK';
            const brakes     = (i % 11 === 0) ? 'WORN'    : 'OK';

            it(`${testId}: Ensure API response time for diagnostics burst iteration ${i} is within SLA`, async function () {

                const results = await measureBurst({
                    engine,
                    battery,
                    tyrePressure: tyre,
                    brakes,
                    iterationId: i
                }, 5);

                // Assert all burst requests returned 200 OK
                results.forEach((r, j) => {
                    expect(r.status).to.equal(200,
                        `Request ${j + 1} of burst ${i} returned HTTP ${r.status}`);
                });

                const latencies  = results.map(r => r.latency).sort((a, b) => a - b);
                const avgLatency = Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length);
                const maxLatency = latencies[latencies.length - 1];
                const minLatency = latencies[0];

                // SLA: Worst-case individual request must be under 5000ms
                expect(maxLatency).to.be.lessThan(
                    5000,
                    `Max latency of ${maxLatency}ms exceeds 5000ms SLA [avg=${avgLatency}ms, min=${minLatency}ms]`
                );

                // SLA: Average request time must be under 3000ms
                expect(avgLatency).to.be.lessThan(
                    3000,
                    `Average latency of ${avgLatency}ms exceeds 3000ms SLA`
                );
            });
        }
    });
});
