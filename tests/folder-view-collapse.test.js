// v149: three bugs found right after multi-category filtering shipped:
// 1. noteMatchesCategoryFilter treated null (folder view's "nothing
//    selected" state) the same as [] ("All") -- both matched every note,
//    so tapping the active folder to collapse it never actually hid
//    anything.
// 2. Long-pressing a folder tile (to add it to the filter) also triggered
//    the browser's own long-press handling -- text selection, and on
//    Android Chrome specifically, the native image context menu on the
//    folder icon.
// 3. Settings load from IndexedDB asynchronously and can resolve before
//    React's first paint, so the mount-time transition-detection ref
//    sometimes captured the already-loaded 'folders' value directly
//    rather than seeing a transition -- folder view silently opened to
//    "all notes shown" on a cold load instead of collapsed, whenever
//    folders was the persisted mode.
const { assert, assertEqual, openBlankNote } = require('./helpers');

module.exports = async function folderViewCollapse(page) {
    await openBlankNote(page);
    await page.fill('.editor-title-input', 'Collapse test note');
    await page.click('.editor-header .icon-btn:has-text("←")');
    await page.waitForTimeout(150);

    // Switching view modes commits in two steps: .folder-tabs appears as
    // soon as dashboardViewMode flips, but the useEffect that resets
    // filterCategoryIds to null lands in a slightly later render --
    // waitForSelector actively retries until that second commit lands,
    // rather than checking .count() once immediately.
    await page.click('button[title="Switch to folder view"]');
    await page.waitForSelector('.folder-tabs');
    await page.waitForSelector('.empty-state p:has-text("Select a folder")');
    assertEqual(await page.locator('.empty-state p:has-text("Select a folder")').count(), 1, 'folder view opens with nothing selected');

    await page.click('.folder-tile:has-text("All")');
    await page.waitForSelector('.note-card-title:has-text("Collapse test note")');
    assertEqual(await page.locator('.note-card-title:has-text("Collapse test note")').count(), 1, 'tapping All shows notes');

    await page.click('.folder-tile:has-text("All")');
    await page.waitForSelector('.empty-state p:has-text("Select a folder")');
    assertEqual(await page.locator('.note-card-title:has-text("Collapse test note")').count(), 0, 'tapping the already-active All tile again collapses the list');
    assertEqual(await page.locator('.empty-state p:has-text("Select a folder")').count(), 1, 'collapsing shows the "select a folder" prompt again');

    // Context menu / text selection prevention on a long-press-bound tile.
    await page.click('button[title="Categories"]');
    await page.waitForSelector('.sheet h2 >> text=Categories');
    await page.fill('.add-category-form input[type="text"]', 'Work');
    await page.click('button:has-text("Add category")');
    await page.waitForTimeout(100);
    await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);

    const defaultPrevented = await page.locator('.folder-tile:has-text("Work")').evaluate((el) => {
        const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        el.dispatchEvent(evt);
        return evt.defaultPrevented;
    });
    assert(defaultPrevented, 'long-press-bound folder tiles suppress the native context menu');
    const userSelect = await page.locator('.folder-tile:has-text("Work")').evaluate((el) => getComputedStyle(el).userSelect);
    assertEqual(userSelect, 'none', 'folder tiles are not text-selectable (long-press would otherwise highlight them)');

    // Cold load: with folders as the persisted view mode, it should start
    // collapsed, not showing every note.
    await page.reload();
    await page.waitForSelector('.app-header h1');
    await page.waitForSelector('.folder-tabs');
    await page.waitForSelector('.empty-state p:has-text("Select a folder")');
    assertEqual(await page.locator('.folder-tabs').count(), 1, 'folder view mode persisted across reload');
    assertEqual(await page.locator('.note-card-title:has-text("Collapse test note")').count(), 0, 'folder view starts collapsed on a cold load, not showing all notes');
    assertEqual(await page.locator('.empty-state p:has-text("Select a folder")').count(), 1, 'the "select a folder" prompt shows immediately on cold load');
};
