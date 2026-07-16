// v146: the Export data button used to always download straight to the
// device. Browsers that support the Web Share API's file-sharing (Level 2)
// now see a small chooser first, letting the backup go straight to
// Drive/email/another app instead of needing a second manual move off the
// device later. Browsers without that support (stubbed as absent in the
// first case below) keep the old direct-download behavior unchanged.
//
// v150: the chooser's own appearance only checks that navigator.share/
// canShare exist, NOT navigator.canShare({files:[...]}) with a real file --
// that per-file check turned out to be an unreliable predictor in practice
// (some browsers reject a JSON file up front even though their real share
// sheet handles it fine), which meant the chooser silently never appeared
// on some devices and Export data always fell straight through to a
// download with no indication why. The real navigator.share() call is now
// the source of truth, with a visible toast if it genuinely fails.
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

    // --- navigator.share exists and canShare() would say yes, but the
    // real share call itself rejects (e.g. this particular file type isn't
    // actually shareable on this device) -- falls back to a download and
    // tells the user why, instead of silently doing nothing. ---
    await page.evaluate(() => {
        window.navigator.share = () => Promise.reject(new TypeError('Permission denied'));
    });
    await page.click('button:has-text("⬇ Export data")');
    await page.waitForSelector('.sheet h2 >> text=Export data');
    const [download3] = await Promise.all([
        page.waitForEvent('download'),
        page.click('.category-picker-row:has-text("📤 Share...")'),
    ]);
    assert(/den-notes-backup-.*\.json/.test(download3.suggestedFilename()), 'a real share() failure still falls back to downloading the backup file');
    await page.waitForSelector('.undo-toast:has-text("Sharing isn\'t supported here")');
    assertEqual(await page.locator('.undo-toast:has-text("Sharing isn\'t supported here")').count(), 1, 'a toast explains why it fell back to downloading instead of failing silently');
    // The toast auto-dismisses after 5s -- wait it out so the next check
    // (no toast at all) isn't just seeing this one still lingering.
    await page.waitForSelector('.undo-toast', { state: 'detached', timeout: 6000 });

    // Cancelling the OS share sheet (AbortError) is a normal dismissal, not
    // a failure -- no download, no toast.
    await page.evaluate(() => {
        window.navigator.share = () => Promise.reject(new DOMException('cancelled', 'AbortError'));
    });
    await page.click('button:has-text("⬇ Export data")');
    await page.waitForSelector('.sheet h2 >> text=Export data');
    await page.click('.category-picker-row:has-text("📤 Share...")');
    await page.waitForTimeout(200);
    assertEqual(await page.locator('.undo-toast').count(), 0, 'cancelling the share sheet does not trigger the fallback download or toast');
};
