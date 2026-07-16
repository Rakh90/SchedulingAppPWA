// Baseline: the app loads, a blank note can be created, edited, and its
// content persists after navigating back to the dashboard.
const { assert, openBlankNote } = require('./helpers');

module.exports = async function smoke(page) {
    assert(await page.locator('.app-header h1').textContent() === 'Den Notes', 'dashboard header renders');

    await openBlankNote(page);
    await page.fill('.editor-title-input', 'Smoke test note');
    const block = page.locator('.block-display, .block-editable').first();
    await block.click();
    await page.keyboard.type('Hello world');
    await page.click('.editor-header .icon-btn:has-text("←")');
    await page.waitForTimeout(150);

    assert(await page.locator('.note-card-title:has-text("Smoke test note")').count() === 1, 'note appears on dashboard with its title');
    assert(await page.locator('.note-card-body:has-text("Hello world")').count() === 1, 'note body text persisted');
};
