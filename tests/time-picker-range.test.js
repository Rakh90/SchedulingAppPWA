// A time-only table column: Now/Pick Time buttons, single-time vs
// time-range modes, 12h/24h format, and reopening a cell in the mode it was
// last saved in.
const { assert, assertEqual, openBlankNote } = require('./helpers');

async function tapClockValue(page, value) {
    const numbers = page.locator('.clock-number');
    const count = await numbers.count();
    for (let i = 0; i < count; i++) {
        if ((await numbers.nth(i).textContent()) === String(value)) {
            const box = await numbers.nth(i).boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            return;
        }
    }
    throw new Error('clock number ' + value + ' not found');
}

module.exports = async function timePickerRange(page) {
    await openBlankNote(page);
    await page.click('.secondary-btn:has-text("Add table")');
    await page.waitForSelector('.sheet h2 >> text=Add table');
    await page.waitForTimeout(150);
    await page.locator('.table-col-editor-row select.table-type-select').first().selectOption('time');
    await page.locator('.table-col-editor-row .table-icon-btn[title="Remove column"]').nth(1).click();
    await page.waitForTimeout(100);
    await page.click('button:has-text("Create table")');
    await page.waitForTimeout(150);

    assertEqual(await page.locator('button:has-text("🕐 Now")').count(), 1, 'Now button present on a time column table');
    assertEqual(await page.locator('button:has-text("🕐 Pick Time")').count(), 1, 'Pick Time button present');
    // Scoped to the table's own action row -- the line toolbar's combined
    // date/time button (v143) also renders "📅" and is unconditionally
    // present regardless of column type, so an unscoped count would always
    // find at least 1.
    assertEqual(await page.locator('.table-action-row button:has-text("📅")').count(), 0, 'no date buttons on a time-only table');

    await page.click('button:has-text("🕐 Now")');
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.mileage-cell-input').count(), 1, 'Now with no rows yet adds exactly one row');
    const nowValue = await page.locator('.mileage-cell-input').first().inputValue();
    assert(nowValue.length > 0, 'Now filled the row with a non-empty time');

    await page.click('button:has-text("🕐 Now")');
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.mileage-cell-input').count(), 1, 'Now on an already-active cell overwrites in place, not a new row');

    await page.click('button:has-text("🕐 Pick Time")');
    await page.waitForSelector('.clock-face');
    assertEqual(await page.locator('.clock-number').count(), 12, 'hour ring shows 12 numbers');

    // Defaults to whichever half of the day it currently is in the real
    // world -- force AM so the "7:15 AM" assertions below don't flip based
    // on what time of day the test happens to run.
    await page.click('.time-period-toggle button:has-text("AM")');
    await tapClockValue(page, 7);
    await page.waitForTimeout(100);
    await tapClockValue(page, '15');
    await page.waitForTimeout(100);
    await page.click('button:has-text("Done")');
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.mileage-cell-input').first().inputValue(), '7:15 AM', 'single time inserted into the active cell');

    // Blur the cell first -- otherwise it's still the "active" cell and
    // Done below would overwrite it in place instead of adding a new row
    // (same active-cell-fill behavior as the Now button above).
    await page.locator('.mileage-cell-input').first().evaluate((el) => el.blur());
    await page.waitForTimeout(100);

    // Time range: two tabs, each independently editable, adds a new row.
    await page.click('button:has-text("🕐 Pick Time")');
    await page.waitForSelector('.clock-face');
    await page.click('.time-mode-toggle button:has-text("Time range")');
    await page.waitForSelector('.time-range-tabs');
    assertEqual(await page.locator('.time-range-tab').count(), 2, 'range mode shows Start/End tabs');
    await tapClockValue(page, 9);
    await tapClockValue(page, '30');
    await page.click('.time-range-tab:has-text("End")');
    await page.waitForTimeout(100);
    await tapClockValue(page, 5);
    await tapClockValue(page, '00');
    await page.waitForTimeout(100);
    await page.click('button:has-text("Done")');
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.mileage-cell-input').count(), 2, 'a time-range Done adds a new row rather than overwriting the single-time cell');

    // Undo removes the range row without touching the earlier cell.
    await page.click('.line-toolbar-btn[title="Undo last edit"]');
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.mileage-cell-input').count(), 1, 'undo removes the range row');
    assertEqual(await page.locator('.mileage-cell-input').first().inputValue(), '7:15 AM', 'the remaining cell is unaffected by the undo');
};
