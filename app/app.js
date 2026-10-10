/*
 * app.js - the behavior of the app.
 * Consumer: the browser, via the <script> tag in index.html.
 * It does two jobs:
 *   1. Runs the counter, saving the value in localStorage (a small
 *      key/value store built into the browser) so it survives page reloads.
 *   2. Registers the service worker (sw.js) that enables install and offline use.
 */
// localStorage name under which the number is saved
const KEY = 'counter';
const countEl = document.getElementById('count');
// Read the saved value (stored as text); fall back to 0 if nothing saved yet
let count = parseInt(localStorage.getItem(KEY), 10) || 0;
countEl.textContent = count;

document.getElementById('increment').addEventListener('click', () => {
  count += 1;
  localStorage.setItem(KEY, count);
  countEl.textContent = count;
});

// The path is relative ('sw.js', not '/sw.js') so the worker's scope is the
// folder this page lives in. That keeps production and each PR preview isolated.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
