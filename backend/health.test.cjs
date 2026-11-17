const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('./app');

test('GET /api/health responde HTTP 200 con JSON de salud', async t => {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => {
        server.close(error => {
            if (error) reject(error);
            else resolve();
        });
    }));
    await once(server, 'listening');

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, {
        signal: AbortSignal.timeout(5000)
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.deepEqual(await response.json(), { status: 'ok' });
});
