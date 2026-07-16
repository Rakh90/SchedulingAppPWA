// v146: the Export data button used to always download straight to the
// device. Browsers that support the Web Share API's file-sharing (Level 2)
// now see a small chooser first, letting the backup go straight to
// Drive/email/another app instead of needing a second manual move off the
// device later. Browsers without that support (stubbed as absent in the
// first case below) keep the old direct-download behavior unchanged.
const { assert, assertEqual, openBlankNote } = require('./helpers');

async function openExportFlow(page) {
    await page.click('button[title="Categories"]');
    await page.waitForSelector('.sheet h2 >> text=Categories');
    await page.click('button:has-text("⬇ Export data")');
}

module.exports = async function exportShare(page) {
    // A note to back up, so the export payload isn't trivially empty.
    await openBlankNote(page);
    await page.fill('.editor-title-input', 'Export test note');
    await page.click('.editor-header .icon-btn:has-text("←")');
    await page.waitForTimeout(150);

    // --- No file-sharing support: unchanged direct-download behavior. ---
    await page.addInitScript(() => {
        delete window.navigator.share;
        delete window.navigator.canShare;
    });
    await page.reload();
    await page.waitForSelector('.app-header h1');
    const [download1] = await Promise.all([
        page.waitForEvent('download'),
        openExportFlow(page),
    ]);
    assert(/den-notes-backup-.*\.json/.test(download1.suggestedFilename()), 'download filename looks like a backup file: ' + download1.suggestedFilename());
    assertEqual(await page.locator('.sheet h2 >> text=Export data').count(), 0, 'no chooser shown when the browser cannot share files');

    // --- File-sharing supported: chooser appears; each option does the
    // right thing. ---
    await page.evaluate(() => {
        window.__shareCalls = [];
        window.navigator.canShare = () => true;
        window.navigator.share = (data) => { window.__shareCalls.push({ fileCount: data.files ? data.files.length : 0, title: data.title }); return Promise.resolve(); };
    });

    // The Categories sheet from the block above is still open (exporting
    // never closes it) -- just click "Export data" again, not "Categories",
    // which is now covered by that still-open sheet's own backdrop.
    await page.click('button:has-text("⬇ Export data")');
    await page.waitForSelector('.sheet h2 >> text=Export data');
    assertEqual(await page.locator('.category-picker-row:has-text("💾 Save to device")').count(), 1, 'Save to device option shown');
    assertEqual(await page.locator('.category-picker-row:has-text("📤 Share...")').count(), 1, 'Share option shown');

    const [download2] = await Promise.all([
        page.waitForEvent('download'),
        page.click('.category-picker-row:has-text("💾 Save to device")'),
    ]);
    assert(/den-notes-backup-.*\.json/.test(download2.suggestedFilename()), 'Save to device still downloads the backup file');
    assertEqual(await page.locator('.sheet h2 >> text=Export data').count(), 0, 'chooser closes after picking Save to device');

    // The Categories sheet itself is still open underneath (only the
    // chooser closed) -- re-click just "Export data", not "Categories"
    // again, which would now be covered by that still-open sheet.
    await page.click('button:has-text("⬇ Export data")');
    await page.waitForSelector('.sheet h2 >> text=Export data');
    await page.click('.category-picker-row:has-text("📤 Share...")');
    await page.waitForTimeout(150);
    const shareCalls = await page.evaluate(() => window.__shareCalls);
    assertEqual(shareCalls.length, 1, 'Share... calls navigator.share exactly once');
    assertEqual(shareCalls[0].fileCount, 1, 'navigator.share is called with the backup file attached');
    assertEqual(await page.locator('.sheet h2 >> text=Export data').count(), 0, 'chooser closes after picking Share');
};
