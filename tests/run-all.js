// Test runner: starts a static server for the repo, then runs every
// tests/*.test.js file against it in turn, reporting a pass/fail summary
// and exiting non-zero if anything failed (what CI checks).
const path = require('path');
const fs = require('fs');
const { startServer, withPage } = require('./helpers');

const PORT = 8831;

async function main() {
    const server = await startServer(PORT);
    process.env.TEST_SERVER_PORT = String(PORT);

    const testsDir = __dirname;
    const files = fs.readdirSync(testsDir)
        .filter((f) => f.endsWith('.test.js'))
        .sort();

    const results = [];
    for (const file of files) {
        const testFn = require(path.join(testsDir, file));
        process.stdout.write(`RUN  ${file} ... `);
        const start = Date.now();
        try {
            await withPage((page) => testFn(page));
            const ms = Date.now() - start;
            console.log(`PASS (${ms}ms)`);
            results.push({ file, ok: true });
        } catch (err) {
            const ms = Date.now() - start;
            console.log(`FAIL (${ms}ms)`);
            console.log('     ' + err.message);
            results.push({ file, ok: false, error: err.message });
        }
    }

    server.close();

    const failed = results.filter((r) => !r.ok);
    console.log('');
    console.log(`${results.length - failed.length}/${results.length} tests passed`);
    if (failed.length > 0) {
        console.log('Failed: ' + failed.map((f) => f.file).join(', '));
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error('Test runner crashed:', err);
    process.exitCode = 1;
});
