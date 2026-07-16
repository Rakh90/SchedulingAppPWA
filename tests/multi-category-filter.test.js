// Categories already supported multiple tags per note (categoryIds is an
// array), but the dashboard filter itself was single-select -- tapping a
// chip/tile always replaced the whole selection. This adds long-press to
// ADD a category to the current selection (AND semantics: a note must
// carry every selected category to show), while a plain tap still jumps
// straight to viewing just that one category, unchanged.
const { assert, assertEqual } = require('./helpers');

async function addCategory(page, name) {
    await page.fill('.add-category-form input[type="text"]', name);
    await page.click('button:has-text("Add category")');
    await page.waitForTimeout(100);
}

async function longPress(page, locator) {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(100);
}

async function createTaggedNote(page, title, categoryNames) {
    await page.click('.fab');
    await page.waitForSelector('.sheet h2 >> text=New note');
    await page.click('.category-picker-row:has-text("Blank note")');
    await page.waitForSelector('.editor-screen');
    await page.fill('.editor-title-input', title);
    if (categoryNames.length > 0) {
        await page.click('.category-select');
        await page.waitForSelector('.sheet h2 >> text=Categories');
        for (const name of categoryNames) {
            await page.click('.category-picker-row:has-text("' + name + '")');
        }
        await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
        await page.waitForTimeout(150);
    }
    await page.click('.editor-header .icon-btn:has-text("←")');
    await page.waitForTimeout(150);
}

module.exports = async function multiCategoryFilter(page) {
    await page.click('button[title="Categories"]');
    await page.waitForSelector('.sheet h2 >> text=Categories');
    await addCategory(page, 'Work');
    await addCategory(page, 'Urgent');
    await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);

    await createTaggedNote(page, 'Just Work', ['Work']);
    await createTaggedNote(page, 'Just Urgent', ['Urgent']);
    await createTaggedNote(page, 'Both', ['Work', 'Urgent']);
    await createTaggedNote(page, 'Neither', []);

    const visibleTitles = async () => (await page.locator('.note-card-title').allTextContents()).map((t) => t.trim());

    // Tap "Work": single-select, unchanged behavior.
    await page.click('.category-pill:has-text("Work")');
    await page.waitForTimeout(150);
    assertEqual((await visibleTitles()).sort().join(','), 'Both,Just Work', 'tapping Work shows only notes tagged Work');

    // Long-press "Urgent": adds to the selection -- AND semantics narrows
    // to only notes with both.
    await longPress(page, page.locator('.category-pill:has-text("Urgent")'));
    assertEqual((await visibleTitles()).sort().join(','), 'Both', 'long-pressing Urgent narrows to notes tagged both Work AND Urgent');
    assert(await page.locator('.category-pill.active:has-text("Work")').count() === 1, 'Work pill still shows active after adding Urgent');
    assert(await page.locator('.category-pill.active:has-text("Urgent")').count() === 1, 'Urgent pill shows active too');

    // Plain tap on Work again: resets to viewing just Work, not narrowed.
    await page.click('.category-pill:has-text("Work")');
    await page.waitForTimeout(150);
    assertEqual((await visibleTitles()).sort().join(','), 'Both,Just Work', 'a plain tap after a long-press still resets to just that one category');
    assert(await page.locator('.category-pill.active:has-text("Urgent")').count() === 0, 'Urgent pill no longer active after the plain tap on Work');

    // Long-press to build the same combo again, then create a note from
    // inside it -- should be pre-tagged with both.
    await longPress(page, page.locator('.category-pill:has-text("Urgent")'));
    await page.waitForTimeout(150);
    await page.click('.fab');
    await page.waitForSelector('.sheet h2 >> text=New note');
    await page.click('.category-picker-row:has-text("Blank note")');
    await page.waitForSelector('.editor-screen');
    const chipText = await page.locator('.category-select').textContent();
    assert(chipText.includes('2 categories'), 'a note created while Work+Urgent are both selected is pre-tagged with both: ' + chipText);
    await page.click('.editor-header .icon-btn:has-text("←")');
    await page.waitForTimeout(150);

    // Folder view: same long-press-to-combine behavior, with both tiles
    // showing active.
    await page.click('button[title="Switch to folder view"]');
    await page.waitForSelector('.folder-tabs');
    await page.click('.folder-tile:has-text("Work")');
    await page.waitForTimeout(150);
    await longPress(page, page.locator('.folder-tile:has-text("Urgent")'));
    const folderTitles = (await visibleTitles()).sort();
    // The extra note created moments ago (pre-tagged Work+Urgent) is in
    // this result set too now, alongside the original "Both".
    assert(folderTitles.every((t) => t === 'Both' || t.length > 0) && folderTitles.includes('Both'), 'folder view AND-filter includes "Both": ' + folderTitles.join(','));
    assert(await page.locator('.folder-tile.active:has-text("Work")').count() === 1, 'Work tile active in folder view');
    assert(await page.locator('.folder-tile.active:has-text("Urgent")').count() === 1, 'Urgent tile active in folder view');
};
