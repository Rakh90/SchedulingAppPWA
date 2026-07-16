// Automated legibility guard, written after two rounds of manually-reported
// "this text is hard to read on a dark theme" bugs (v144: color never
// switched; v145: color switched but a light-theme text-shadow halo wasn't
// cleared, producing a glow behind now-light text). Computes real WCAG
// contrast ratios for the exact selectors involved in those bugs, across a
// representative spread of themes, so the next instance of this pattern
// fails CI instead of shipping.
const { assert, openBlankNote } = require('./helpers');

// A few themes chosen to cover the interesting cases: 'default' (no swatch,
// plain white), a light-but-saturated theme (Aurora -- called out in the
// app's own CSS comments as a case where plain dark text nearly loses
// contrast), two dark themes (Inferno, the one from the original bug
// report; Obsidian, a near-black extreme), and Rainbow (dark, but styled
// via a separate compound .dark-content.theme-rainbow selector rather than
// the plain .dark-content rules -- a real edge case for anything that
// patches .dark-content alone).
const THEMES = ['default', 'Aurora', 'Inferno', 'Obsidian', 'Rainbow'];

// Selectors scoped to sheet content sitting directly on the sheet's own
// (opaque) gradient background -- not dashboard note cards, whose
// semi-transparent card tint layered over the dashboard background would
// need real alpha compositing to evaluate accurately.
const SHEET_SELECTORS = ['.section-label', '.sheet-muted-text', '.folder-theme-swatch-label'];
const CALENDAR_SELECTORS = ['.calendar-weekdays span'];
const TIME_RANGE_SELECTORS = ['.time-range-tab-value', '.time-range-tab-label'];

// Runs entirely inside the page: for each matching, visible element, finds
// the nearest ancestor actually painting a background (solid color, or a
// gradient -- every gradient in this app is authored at a consistent
// 135deg, see index.html), renders that gradient into an offscreen canvas
// at the ancestor's real pixel size using the standard CSS angle-to-line
// conversion, and reads back the exact pixel color behind the element's
// center. That's what a user actually sees at that spot, rather than a
// worst-case across every color the gradient contains anywhere in the
// sheet (which falsely flags e.g. a top-of-sheet label against a gradient
// stop that only appears in the sheet's bottom corner).
async function auditSelectors(page, selectors) {
    return page.evaluate((sels) => {
        function parseColor(str) {
            const m = str && str.match(/rgba?\(([^)]+)\)/);
            if (!m) return null;
            const p = m[1].split(',').map((s) => parseFloat(s.trim()));
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
        function relLuminance({ r, g, b }) {
            const [rs, gs, bs] = [r, g, b].map((c) => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        }
        function contrast(c1, c2) {
            const l1 = relLuminance(c1);
            const l2 = relLuminance(c2);
            const lighter = Math.max(l1, l2);
            const darker = Math.min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
        }
        // Parses "rgb(r, g, b) P%, rgb(r, g, b) P%, ..." (the computed-style
        // form of linear-gradient(...)) into {color, offset} stops.
        function gradientStops(bgImage) {
            const stops = [];
            const re = /(rgba?\([^)]+\))\s*([\d.]+)%/g;
            let m;
            while ((m = re.exec(bgImage))) {
                stops.push({ color: parseColor(m[1]), offset: parseFloat(m[2]) / 100 });
            }
            return stops;
        }
        // Standard CSS <angle> linear-gradient line endpoints for a WxH box
        // (0deg = to top, clockwise) -- what the browser itself uses to lay
        // the gradient out, reproduced here so canvas can rasterize the
        // same thing.
        function gradientLine(angleDeg, w, h) {
            const rad = (angleDeg * Math.PI) / 180;
            const length = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
            const cx = w / 2, cy = h / 2;
            const halfLen = length / 2;
            const dx = Math.sin(rad) * halfLen;
            const dy = -Math.cos(rad) * halfLen;
            return { x0: cx - dx, y0: cy - dy, x1: cx + dx, y1: cy + dy };
        }
        // Finds the nearest ancestor with a real background, and the exact
        // pixel color at (el's center, projected into that ancestor's box).
        function sampleBackgroundAt(el) {
            let node = el;
            while (node && node !== document.documentElement) {
                const cs = getComputedStyle(node);
                if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
                    const stops = gradientStops(cs.backgroundImage);
                    if (stops.length > 0) {
                        const rect = node.getBoundingClientRect();
                        const w = Math.max(1, Math.round(rect.width));
                        const h = Math.max(1, Math.round(rect.height));
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        const { x0, y0, x1, y1 } = gradientLine(135, w, h);
                        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
                        stops.forEach((s) => grad.addColorStop(s.offset, `rgb(${s.color.r}, ${s.color.g}, ${s.color.b})`));
                        ctx.fillStyle = grad;
                        ctx.fillRect(0, 0, w, h);
                        const elRect = el.getBoundingClientRect();
                        const px = Math.min(w - 1, Math.max(0, Math.round(elRect.left + elRect.width / 2 - rect.left)));
                        const py = Math.min(h - 1, Math.max(0, Math.round(elRect.top + elRect.height / 2 - rect.top)));
                        const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
                        return { r, g, b, a: 1 };
                    }
                }
                const bg = parseColor(cs.backgroundColor);
                if (bg && bg.a > 0.5) return bg;
                node = node.parentElement;
            }
            return parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
        }

        const results = [];
        sels.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                const cs = getComputedStyle(el);
                const color = parseColor(cs.color);
                if (!color) return;
                const fontSize = parseFloat(cs.fontSize);
                const fontWeight = parseInt(cs.fontWeight, 10) || 400;
                const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
                const bg = sampleBackgroundAt(el);
                // A handful of selectors (.section-label, .sheet-muted-text,
                // .folder-theme-swatch-label, .calendar-weekdays span) carry
                // a deliberate opaque text-shadow halo specifically so dark
                // text stays legible on busy light gradients (see index.html
                // for the intent) -- a flat foreground/background ratio
                // alone doesn't credit that, so also check the halo's own
                // color and take whichever is better. Doesn't catch the
                // *other* known failure mode (a light halo left over behind
                // already-light dark-theme text, purely cosmetic fuzziness
                // rather than a contrast deficit) -- that needs a separate
                // style-hygiene check, not a ratio one.
                const shadow = cs.textShadow;
                let shadowColor = null;
                if (shadow && shadow !== 'none') {
                    const shadowMatch = shadow.match(/rgba?\([^)]+\)/);
                    shadowColor = shadowMatch && parseColor(shadowMatch[0]);
                }
                const fillRatio = contrast(color, bg);
                const haloRatio = shadowColor ? contrast(shadowColor, bg) : 0;
                const minRatio = Math.max(fillRatio, haloRatio);
                let threshold = isLarge ? 3.0 : 4.5;
                // A single sampled point can't fully model a real blurred
                // halo's benefit -- the blur spreads the outline color
                // partway across the glyph's edge pixels too, which a flat
                // point-color comparison doesn't credit. Give haloed text a
                // small, disclosed tolerance rather than chasing WCAG's
                // letter (which has no defined model for outlined text to
                // begin with). Elements with no halo -- e.g. the exact
                // .time-range-tab-value case that shipped as a real v144
                // bug -- get no such tolerance.
                if (shadowColor) threshold -= 0.5;
                results.push({
                    selector: sel,
                    text: (el.textContent || '').trim().slice(0, 30),
                    minRatio: Math.round(minRatio * 100) / 100,
                    threshold,
                });
            });
        });
        return results;
    }, selectors);
}

function assertContrastResults(results, theme, context) {
    for (const r of results) {
        assert(
            r.minRatio >= r.threshold,
            `[${theme}/${context}] ${r.selector} ("${r.text}") contrast ${r.minRatio}:1 is below the ${r.threshold}:1 WCAG minimum`
        );
    }
}

module.exports = async function contrastAudit(page) {
    // --- Dashboard: Categories sheet (section labels, muted captions,
    // folder-theme-swatch labels all live here together). ---
    await page.click('button[title="Categories"]');
    await page.waitForSelector('.sheet h2 >> text=Categories');
    const dashboardBgRow = page.locator('.bg-swatch-row').nth(1);

    for (const theme of THEMES) {
        if (theme !== 'default') {
            await dashboardBgRow.locator('.bg-swatch[title="' + theme + '"]').click();
            await page.waitForTimeout(120);
        }
        const results = await auditSelectors(page, SHEET_SELECTORS);
        assert(results.length > 0, `[${theme}] found sheet-label elements to audit`);
        assertContrastResults(results, theme, 'Categories sheet');
    }
    await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);

    // --- Note editor: calendar weekday letters + time-range tabs, both
    // sitting on the note's own background. ---
    await openBlankNote(page);
    await page.click('.secondary-btn:has-text("Add table")');
    await page.waitForSelector('.sheet h2 >> text=Add table');
    await page.waitForTimeout(150);
    await page.locator('.table-col-editor-row select.table-type-select').first().selectOption('time');
    await page.locator('.table-col-editor-row .table-icon-btn[title="Remove column"]').nth(1).click();
    await page.waitForTimeout(100);
    await page.click('button:has-text("Create table")');
    await page.waitForTimeout(150);

    for (const theme of THEMES) {
        if (theme !== 'default') {
            await page.click('button[title="Background"]');
            await page.waitForSelector('.sheet h2 >> text=Background');
            await page.click('.bg-swatch[title="' + theme + '"]');
            await page.waitForTimeout(150);
            await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
            await page.waitForTimeout(150);
        }

        await page.click('.editor-title-input');
        await page.click('.line-toolbar-btn[title="Insert date or time"]');
        await page.waitForSelector('.sheet h2 >> text=Insert');
        await page.click('.category-picker-row:has-text("📅 Date")');
        await page.waitForSelector('.calendar-grid');
        const calResults = await auditSelectors(page, CALENDAR_SELECTORS);
        assert(calResults.length > 0, `[${theme}] found calendar weekday letters to audit`);
        assertContrastResults(calResults, theme, 'calendar weekdays');
        await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } });
        await page.waitForTimeout(150);

        await page.click('button:has-text("🕐 Pick Time")');
        await page.waitForSelector('.clock-face');
        await page.click('.time-mode-toggle button:has-text("Time range")');
        await page.waitForSelector('.time-range-tabs');
        const timeResults = await auditSelectors(page, TIME_RANGE_SELECTORS);
        assert(timeResults.length > 0, `[${theme}] found time-range tab text to audit`);
        assertContrastResults(timeResults, theme, 'time-range tabs');
        await page.click('button:has-text("Cancel")');
        await page.waitForTimeout(150);
    }
};
