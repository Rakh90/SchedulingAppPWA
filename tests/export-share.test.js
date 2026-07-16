// v146-v152 tried offering a Save/Share chooser on Export data so a backup
// could go straight to Drive/email/another app instead of needing a manual
// move off the device afterward. Real-device testing across several
// attempts (loosening the feature-detection, broadening the shared file's
// MIME type) never got the OS share sheet to actually appear -- navigator.
// share() kept resolving successfully with no visible UI and no error to
// react to, most likely because the device had no app registered to
// receive a shared file at all. Reverted back to a single button that
// always downloads directly, the one thing that reliably worked.
const { assert, openBlankNote } = require('./helpers');

module.exports = async function exportShare(page) {
    // A note to back up, so the export payload isn't trivially empty.
    await openBlankNote(page);
    await page.fill('.editor-title-input', 'Export test note');
    await page.click('.editor-header .icon-btn:has-text("←")');
    await page.waitForTimeout(150);

    await page.click('button[title="Categories"]');
    await page.waitForSelector('.sheet h2 >> text=Categories');
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("⬇ Export data")'),
    ]);
    assert(/den-notes-backup-.*\.json/.test(download.suggestedFilename()), 'Export data downloads a backup file directly: ' + download.suggestedFilename());
    assert((await page.locator('.sheet h2 >> text=Export data').count()) === 0, 'no intermediate chooser appears -- Export data is a single, direct action');
};
