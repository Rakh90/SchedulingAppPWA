// Shared harness for tests/*.test.js. Each test file exports an async
// function; run-all.js calls it once per file with a fresh browser/page and
// treats a thrown error (from assert()) as a failure.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');

// Playwright's own bundled Chromium download works fine in CI (after
// `npx playwright install`), but this sandboxed dev environment ships a
// prebuilt browser at a fixed path instead and has no outbound access to
// download another one. Point at that when the env var is set (see
// scratchpad/pw/*.js for the original pattern this generalizes), and fall
// back to Playwright's own resolution otherwise -- that's what CI uses.
function launchOptions() {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    return executablePath ? { executablePath } : {};
}

function assert(condition, message) {
    if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error('ASSERTION FAILED: ' + message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
    }
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

// Minimal static file server for the repo root -- no extra devDependency
// needed since this app has no build step to begin with.
function startServer(port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            let reqPath = decodeURIComponent(req.url.split('?')[0]);
            if (reqPath === '/') reqPath = '/index.html';
            const filePath = path.join(REPO_ROOT, reqPath);
            if (!filePath.startsWith(REPO_ROOT)) {
                res.writeHead(403);
                res.end();
                return;
            }
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                const ext = path.extname(filePath);
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                res.end(data);
            });
        });
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

// Every test gets its own isolated browser context (no shared storage), a
// fresh page navigated to the app, and a callback to open a fresh note --
// the flow every test starts from.
async function withPage(fn, options) {
    const browser = await chromium.launch(launchOptions());
    const contextOptions = { viewport: { width: 412, height: 915 }, serviceWorkers: 'block' };
    // Some UI (the Android-only native-timer shortcut) is gated behind a
    // navigator.userAgent sniff -- overriding it here is the only way to
    // reach that code path from this Linux-hosted test browser.
    if (options && options.userAgent) contextOptions.userAgent = options.userAgent;
    const context = await browser.newContext(contextOptions);
    // Needed for tests that exercise the app's clipboard-copy features
    // (whole-note copy, copy-selected-lines) via navigator.clipboard.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    try {
        await page.goto(`http://127.0.0.1:${process.env.TEST_SERVER_PORT}/index.html`);
        await page.waitForSelector('.app-header h1');
        await fn(page);
        assert(pageErrors.length === 0, 'no uncaught page errors, got: ' + pageErrors.join('; '));
    } finally {
        await browser.close();
    }
}

async function openBlankNote(page) {
    await page.click('.fab');
    await page.waitForSelector('.sheet h2 >> text=New note');
    await page.click('.category-picker-row:has-text("Blank note")');
    await page.waitForSelector('.editor-screen');
}

module.exports = { REPO_ROOT, assert, assertEqual, startServer, withPage, openBlankNote };
