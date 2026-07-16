// v143: 13 line-toolbar buttons (date+time merged into one chooser button)
// should mostly fit a single row at a normal phone width, and any leftover
// wrapped row should stay centered rather than stranded on the left.
const { assert, assertEqual, openBlankNote } = require('./helpers');

module.exports = async function lineToolbarFit(page) {
    await openBlankNote(page);
    // A focused block enables every button (undo/date-time/select all need
    // hasActiveLine/dateTimeAvailable true) so the toolbar renders at its
    // full, worst-case width.
    await page.click('.block-display, .block-editable');
    await page.waitForTimeout(150);

    const btnCount = await page.locator('.line-toolbar .line-toolbar-btn').count();
    assertEqual(btnCount, 13, 'toolbar has 13 buttons (date+time merged into one)');

    const toolbar = page.locator('.line-toolbar');
    const overflow = await toolbar.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    assert(overflow.scrollWidth <= overflow.clientWidth, 'toolbar does not horizontally overflow its own box: ' + JSON.stringify(overflow));

    const tops = await page.locator('.line-toolbar .line-toolbar-btn').evaluateAll(
        (els) => els.map((el) => Math.round(el.getBoundingClientRect().top))
    );
    const rows = [...new Set(tops)];
    assert(rows.length <= 2, 'toolbar wraps to at most 2 rows at 412px width, got ' + rows.length);

    if (rows.length === 2) {
        // Buttons on the second row should be horizontally centered within
        // the toolbar, not flush against the left edge.
        const toolbarBox = await toolbar.boundingBox();
        const secondRowBtns = await page.locator('.line-toolbar .line-toolbar-btn').evaluateAll(
            (els, secondRowTop) => els.filter((el) => Math.round(el.getBoundingClientRect().top) === secondRowTop)
                .map((el) => el.getBoundingClientRect()),
            rows[1]
        );
        const leftmost = Math.min(...secondRowBtns.map((b) => b.x));
        const rightmost = Math.max(...secondRowBtns.map((b) => b.x + b.width));
        const leftGap = leftmost - toolbarBox.x;
        const rightGap = (toolbarBox.x + toolbarBox.width) - rightmost;
        assert(Math.abs(leftGap - rightGap) < 4, 'wrapped second row is centered (left gap ' + leftGap.toFixed(1) + ' vs right gap ' + rightGap.toFixed(1) + ')');
    }

    const firstBtnBox = await page.locator('.line-toolbar .line-toolbar-btn').first().boundingBox();
    assert(firstBtnBox.width >= 24 && firstBtnBox.height >= 24, 'buttons stay comfortably tappable: ' + JSON.stringify(firstBtnBox));
};
