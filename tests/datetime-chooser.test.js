// v143/v140-class regression guard: the combined date/time toolbar button
// opens a chooser that must preserve whichever field (title / table name /
// body line) was focused before it opened, so openDateSheetSmart /
// openTimeSheetSmart target the right one. This is exactly the class of
// bug fixed in v140 for TimePickerSheet -- verified here for the new
// DateTimeChooserSheet.
const { assert, openBlankNote } = require('./helpers');

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

async function pickTime(page, hour, minute) {
    await page.waitForSelector('.clock-face');
    await tapClockValue(page, hour);
    await page.waitForTimeout(100);
    await tapClockValue(page, minute.toString().padStart(2, '0'));
    await page.waitForTimeout(100);
    await page.click('button:has-text("Done")');
    await page.waitForTimeout(150);
}

module.exports = async function datetimeChooser(page) {
    await openBlankNote(page);

    // Title: chooser -> Date, then chooser -> Time, both landing in the title.
    await page.click('.editor-title-input');
    await page.type('.editor-title-input', 'Due ');
    assert(await page.locator('.line-toolbar-btn[title="Insert date or time"]').isDisabled() === false, 'combined button enabled with title focused');
    await page.click('.line-toolbar-btn[title="Insert date or time"]');
    await page.waitForSelector('.sheet h2 >> text=Insert');
    await page.click('.category-picker-row:has-text("📅 Date")');
    await page.waitForSelector('.calendar-grid');
    await page.locator('.calendar-day:not(.calendar-day-empty)').first().click();
    await page.waitForTimeout(150);
    let titleValue = await page.inputValue('.editor-title-input');
    assert(titleValue.startsWith('Due ') && titleValue.length > 'Due '.length, 'title got a date inserted via the chooser: ' + titleValue);

    await page.click('.editor-title-input');
    await page.waitForTimeout(100);
    await page.click('.line-toolbar-btn[title="Insert date or time"]');
    await page.waitForSelector('.sheet h2 >> text=Insert');
    await page.click('.category-picker-row:has-text("🕐 Time")');
    await pickTime(page, 3, 30);
    titleValue = await page.inputValue('.editor-title-input');
    assert(titleValue.includes('3:30 AM'), 'title got a time inserted via the chooser (focus preserved across two chooser round-trips): ' + titleValue);

    // Body line: chooser -> Time.
    await page.click('.block-display, .block-editable');
    await page.waitForTimeout(150);
    if (await page.locator('.block-editable').count() === 0) {
        await page.locator('.block-display').first().click();
        await page.waitForTimeout(150);
    }
    const block = page.locator('.block-editable').first();
    await block.click();
    await page.keyboard.type('Meet at ');
    await page.click('.line-toolbar-btn[title="Insert date or time"]');
    await page.waitForSelector('.sheet h2 >> text=Insert');
    await page.click('.category-picker-row:has-text("🕐 Time")');
    await pickTime(page, 9, 15);
    // The inserted time is prefixed with a non-breaking space (so it never
    // wraps mid-phrase), not a plain one -- normalize before comparing.
    const bodyText = (await block.textContent()).replace(/\u00A0/g, " ");
    assert(bodyText === 'Meet at 9:15 AM', 'body line got a time inserted via the chooser: ' + JSON.stringify(bodyText));

    // Table name: chooser -> Time, then undo must fully restore it -- the
    // exact failure mode v140 fixed (a sheet control stealing focus mid-
    // gesture corrupts the focus/blur undo snapshot).
    await page.click('.secondary-btn:has-text("Add table")');
    await page.waitForSelector('.sheet h2 >> text=Add table');
    await page.click('button:has-text("Create table")');
    await page.waitForTimeout(150);
    const nameInput = page.locator('.table-name-input');
    await nameInput.click();
    await page.waitForTimeout(100);
    const nameBefore = await nameInput.inputValue();
    await page.click('.line-toolbar-btn[title="Insert date or time"]');
    await page.waitForSelector('.sheet h2 >> text=Insert');
    await page.click('.category-picker-row:has-text("🕐 Time")');
    await pickTime(page, 7, 0);
    const nameAfter = await nameInput.inputValue();
    assert(nameAfter === nameBefore + '7:00 AM', 'table name got a time inserted via the chooser: ' + nameAfter);

    await page.click('.editor-title-input');
    await page.waitForTimeout(150);
    await page.click('.line-toolbar-btn[title="Undo last edit"]');
    await page.waitForTimeout(150);
    assert((await nameInput.inputValue()) === nameBefore, 'undo fully restores the table name -- focus was never stolen mid-gesture');

    // Dismissing via backdrop tap closes the chooser cleanly.
    await page.click('.block-display, .block-editable');
    await page.waitForTimeout(100);
    await page.click('.line-toolbar-btn[title="Insert date or time"]');
    await page.waitForSelector('.sheet h2 >> text=Insert');
    await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    assert(await page.locator('.sheet h2 >> text=Insert').count() === 0, 'chooser dismissed via backdrop tap');
};
