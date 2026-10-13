/**
 * DOM helpers. No framework.
 *
 * Security rule from the Cloudflare audit checklist: user-submitted content is
 * never written with innerHTML. Everything below builds nodes with textContent
 * or setAttribute, and dynamic styles go through the CSSOM (element.style), so
 * the site can ship a strict CSP without 'unsafe-inline'.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [props] - class, text, dataset, on*, or attributes
 * @param {Array|string} [children]
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') throw new Error('innerHTML is not allowed for user data');
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c == null) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Inline SVG icon from the sprite. */
export function icon(name, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const fmtNum = (n) => new Intl.NumberFormat().format(n);
export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

/** Status colour for a 0..100 "more is AI" score. */
export function scoreColor(score) {
  if (score < 20) return 'var(--success)';
  if (score < 40) return 'color-mix(in oklch, var(--success) 65%, var(--warning))';
  if (score < 60) return 'var(--warning)';
  if (score < 80) return 'color-mix(in oklch, var(--danger) 65%, var(--warning))';
  return 'var(--danger)';
}

/**
 * Circular score ring. The one authored moment on the page: the arc draws in
 * and the number counts up. Under reduced motion both settle instantly.
 */
export function renderRing(container, value, opts = {}) {
  const known = value != null && Number.isFinite(Number(value));
  const target = known ? clamp(Number(value)) : 0;
  const color = opts.color || (known ? scoreColor(target) : 'var(--text-4)');
  const size = 116;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  clear(container);
  container.style.setProperty('--ring-color', color);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');

  const bg = document.createElementNS(SVG_NS, 'circle');
  for (const [k, v] of Object.entries({ cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, stroke: 'var(--surface-3)' })) bg.setAttribute(k, String(v));

  const arc = document.createElementNS(SVG_NS, 'circle');
  for (const [k, v] of Object.entries({
    cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke,
    stroke: color, 'stroke-linecap': 'round',
    'stroke-dasharray': c.toFixed(2),
    'stroke-dashoffset': c.toFixed(2),
  })) arc.setAttribute(k, String(v));
  arc.setAttribute('class', 'ring__progress');

  svg.append(bg, arc);

  const label = h('div', { class: 'ring__value' });
  const num = h('span', { text: known ? '0' : '—' });
  label.append(num, known ? h('small', { text: '/100' }) : null);

  container.append(svg, label);

  if (!known) {
    arc.setAttribute('stroke-dashoffset', c.toFixed(2));
    return;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const offset = c * (1 - target / 100);
  requestAnimationFrame(() => {
    arc.setAttribute('stroke-dashoffset', offset.toFixed(2));
  });
  if (reduced) {
    num.textContent = String(Math.round(target));
  } else {
    const start = performance.now();
    const dur = 700;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      num.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/** Weighted bars. */
export function renderBars(container, items) {
  clear(container);
  for (const it of items) {
    const pct = Math.round((it.value ?? 0) * 100);
    const fill = h('div', { class: 'bar__fill' });
    requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
    container.append(
      h('div', { class: 'bar' }, [
        h('span', { class: 'bar__label', text: it.label || it.id }),
        h('div', { class: 'bar__track' }, [fill]),
        h('span', { class: 'bar__value', text: `${pct}%` }),
      ]),
    );
  }
}

/** Chips. `parts` are plain strings; a {code} object is rendered as <code>. */
export function renderChips(container, parts) {
  clear(container);
  if (!parts.length) {
    container.append(h('span', { class: 'chip', text: '—' }));
    return;
  }
  for (const p of parts) {
    const chip = h('span', { class: 'chip' });
    if (p && typeof p === 'object' && p.code != null) {
      chip.append(h('code', { text: String(p.code) }), p.suffix ? ` ${p.suffix}` : '');
    } else {
      chip.append(String(p));
    }
    container.append(chip);
  }
}

/** Table with a real thead/th[scope] and tabular numerals on the right. */
export function renderTable(table, rows, opts = {}) {
  clear(table);
  if (opts.caption) table.append(h('caption', { text: opts.caption }));
  if (opts.head) {
    const thead = h('thead');
    const tr = h('tr');
    opts.head.forEach((label, i) => tr.append(h('th', { scope: 'col', class: i > 0 ? 'num' : '', text: label })));
    thead.append(tr);
    table.append(thead);
  }
  const tbody = h('tbody');
  for (const row of rows) {
    const tr = h('tr');
    row.forEach((cell, i) => {
      const numeric = i > 0 && typeof cell === 'number';
      tr.append(h('td', { class: numeric ? 'num' : '', text: numeric ? fmtNum(cell) : String(cell) }));
    });
    tbody.append(tr);
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

let toastTimer;
/** Polite, dismissible status message. */
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function setHidden(el, hidden) {
  if (el) el.hidden = Boolean(hidden);
}
