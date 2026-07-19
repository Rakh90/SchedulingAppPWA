// v154 shipped the dashboard's "Set a timer" shortcut as a JS-triggered
// window.location.href navigation to an intent: URL. On a real Android
// device it silently did nothing -- no error, no Clock app. v155 switched it
// to a real <a href> anchor (the standard, documented way browsers resolve
// intent: URLs) and fixed a malformed empty authority ("intent://#Intent"
// -> "intent:#Intent") that may have kept Android from resolving it at all.
// This can only verify the render/href side from here -- there's no Android
// OS in this Linux test environment to actually confirm the Clock app opens.
const { assert, assertEqual } = require('./helpers');

module.exports = async function nativeTimerShortcut(page) {
    const timerLink = page.locator('a.icon-btn[title="Set a timer"]');
    assertEqual(await timerLink.count(), 1, 'timer shortcut renders as a real anchor, not a button, when the UA looks like Android');
    const href = await timerLink.getAttribute('href');
    assertEqual(href, 'intent:#Intent;action=android.intent.action.SET_TIMER;end', 'href has no stray "//" before "#Intent" and targets the SET_TIMER action');
};
module.exports.userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
