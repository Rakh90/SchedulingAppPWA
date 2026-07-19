// Two related fixes/features from the same round of feedback:
// 1. Line-select mode ("Select lines" in the LineToolbar) can now copy the
//    selected lines to the clipboard as plain text, same formatting as the
//    existing whole-note copy button, so they can be pasted elsewhere.
// 2. Dismissing the keyboard used to only blur() the focused field without
//    clearing the app's own "this line is being edited" state -- if the
//    native blur didn't actually land, the line stayed internally active,
//    and tapping its checkbox afterward could bring the keyboard right back.
//    onDismissKeyboard now flushes + clears editingBlockId directly instead
//    of relying on blur alone, so a checkbox tap post-dismiss can never
//    re-enter edit mode.
const { assert, assertEqual, openBlankNote } = require('./helpers');

async function longPressRow(page, rowLocator) {
    const box = await rowLocator.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.up();
}

module.exports = async function lineSelectCopy(page) {
    await openBlankNote(page);

    const block = page.locator('.block-editable, .block-display').first();
    await block.click();
    await page.keyboard.type('Buy milk');
    await page.click('.line-toolbar-btn[title="checklist"]');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Buy eggs');
    await page.click('.line-toolbar-btn[title="Hide keyboard"]');
    await page.waitForTimeout(150);

    assertEqual(await page.locator('.checkbox-marker').count(), 2, 'two checklist lines created');

    // Enter line-select mode and long-press both rows to select them.
    await page.click('.line-toolbar-btn[title="Select lines"]');
    await page.waitForSelector('.selection-count-label');
    const rows = page.locator('.block-row');
    await longPressRow(page, rows.nth(0));
    await page.waitForTimeout(100);
    await longPressRow(page, rows.nth(1));
    await page.waitForTimeout(100);
    assert((await page.locator('.selection-count-label').textContent()).includes('2 selected'), 'both lines selected');

    await page.click('.line-toolbar-btn[title="Copy selected lines"]');
    await page.waitForTimeout(150);
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    assertEqual(clipboardText, '[ ] Buy milk\n[ ] Buy eggs', 'copy-selected-lines puts the formatted checklist text on the clipboard');

    // Exit select mode, then verify the keyboard-dismiss fix: hiding the
    // keyboard fully exits edit mode, and ticking the checkbox afterward
    // does not re-enter it.
    await page.click('.line-toolbar-btn[title="Done"]');
    await page.waitForTimeout(150);

    await page.locator('.block-display').first().click();
    await page.waitForSelector('.block-editable');
    await page.click('.line-toolbar-btn[title="Hide keyboard"]');
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.block-editable').count(), 0, 'hiding the keyboard fully exits edit mode');

    await page.locator('.checkbox-marker').first().click();
    await page.waitForTimeout(150);
    assertEqual(await page.locator('.block-editable').count(), 0, 'ticking the checkbox after dismissing the keyboard does not reopen edit mode');
    assert(await page.locator('.block-display.checked').count() === 1, 'the checkbox tap still actually toggled the checked state');
};
