const KEY = 'counter';
const countEl = document.getElementById('count');
let count = parseInt(localStorage.getItem(KEY), 10) || 0;
countEl.textContent = count;

document.getElementById('increment').addEventListener('click', () => {
  count += 1;
  localStorage.setItem(KEY, count);
  countEl.textContent = count;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
