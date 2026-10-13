/** Tiny DOM helpers. No framework. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [props] - attributes; `class`, `text`, `html`, `dataset`, event-like `on*`
 * @param {Array|string} [children]
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function fmtNum(n) {
  return new Intl.NumberFormat().format(n);
}

export function fmtPct(v) {
  return `${Math.round(v)}%`;
}

/** Colour for a 0..100 "more is AI" score. */
export function scoreColor(score) {
  if (score < 20) return 'var(--good)';
  if (score < 40) return 'color-mix(in srgb, var(--good) 65%, var(--warn))';
  if (score < 60) return 'var(--warn)';
  if (score < 80) return 'color-mix(in srgb, var(--bad) 70%, var(--warn))';
  return 'var(--bad)';
}

/**
 * Render a circular score gauge into a container.
 * @param {HTMLElement} container
 * @param {number} value - 0..100
 * @param {{suffix?:string, color?:string}} [opts]
 */
export function renderGauge(container, value, opts = {}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = opts.color || scoreColor(v);
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  container.innerHTML = `
    <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--card-2)" stroke-width="12"/>
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="${color}" stroke-width="12"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
    </svg>
    <div class="gauge-value" style="color:${color}">${Math.round(v)}<small>/100</small></div>`;
}

/** Render a list of weighted bars. */
export function renderBars(container, items, opts = {}) {
  clear(container);
  for (const it of items) {
    const pct = Math.round((it.value ?? 0) * 100);
    container.append(
      h('div', { class: 'bar' }, [
        h('span', { text: it.label || it.id }),
        h('div', { class: 'bar-track' }, [h('div', { class: 'bar-fill', style: { width: `${pct}%` } })]),
        h('small', { text: opts.raw ? String(it.raw ?? pct) : `${pct}%` }),
      ]),
    );
  }
}

export function renderChips(container, items) {
  clear(container);
  if (!items.length) {
    container.append(h('span', { class: 'chip', text: '—' }));
    return;
  }
  for (const it of items) container.append(h('span', { class: 'chip', html: it }));
}

export function renderTable(table, rows, opts = {}) {
  clear(table);
  if (opts.head) {
    const thead = h('thead');
    thead.append(h('tr', {}, opts.head.map((th) => h('th', { text: th }))));
    table.append(thead);
  }
  const tbody = h('tbody');
  for (const row of rows) {
    tbody.append(h('tr', {}, row.map((cell, i) => (i > 0 && typeof cell === 'number'
      ? h('td', { class: 'num', text: fmtNum(cell) })
      : h('td', { text: String(cell) })))));
  }
  table.append(tbody);
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
