/* ============================================================================
   src/page.js — the page's markup, written from config.js before the first
   paint (main.js): the navigation, the hero track with its stage (the canvas,
   the copy, the four controls, the credit, the three cards, the readout) and
   the section after it. The words are text; only the icons are markup.
   ========================================================================== */
import { gradeCss } from './engine/colour.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/* a headline line: *stars* mark the accented words */
const line = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
const ARROW = '<svg class="ar" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10.6M9.2 4.1 13.1 8 9.2 11.9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/* a placeholder mark: put your own SVG here */
const MARK = '<svg class="mark" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="7.6"/><circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none"/></svg>';

/* the four controls drive the scene's four behaviours, in this order */
const STATES = ['ingest', 'process', 'understand', 'act'];
const ICONS = [
  '<path d="M5.5 2.5v7M10 1.5v9.5M14.5 3.5v6"/><path d="M3 12.5v3.6h14v-3.6"/><path d="M10 13.4v.01" stroke-width="2.2" stroke-linecap="round"/>',
  '<g transform="rotate(45 10 10)">' + [6, 10, 14].map((y) => [6, 10, 14].map((x) => `<circle cx="${x}" cy="${y}" r="1.05" fill="currentColor" stroke="none"/>`).join('')).join('') + '</g><path d="M10 2.2v1.6M10 16.2v1.6" />',
  '<circle cx="10" cy="10" r="7.4"/><circle cx="10" cy="10" r="3.6"/><path d="M4.8 4.8l10.4 10.4M15.2 4.8 4.8 15.2" stroke-dasharray="2.2 1.6"/>',
  '<rect x="6.6" y="6.6" width="6.8" height="6.8"/><path d="M10 1.6v2.6M10 15.8v2.6M1.6 10h2.6M15.8 10h2.6"/>',
];

export function pageHtml(C) {
  const H = C.hero || {}, N = C.nav || {}, B = C.brand || {}, K = C.controls || {}, R = C.readout || {}, E = C.ending || {}, F = C.footer || {};
  const light = C.colours && C.colours.light;
  const ctl = (it, k) => `<li><button class="ctl" type="button" data-state="${STATES[k]}" aria-pressed="false" aria-describedby="d-${k}">
<span class="num">0${k + 1}</span><svg class="ico" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="square">${ICONS[k]}</svg>
<span class="tx"><span class="t">${esc(it.label)}</span><span class="d" id="d-${k}">${esc(it.note)}</span></span><i class="ln" aria-hidden="true"></i></button></li>`;
  const point = (it, k) => {
    const cc = it.colour ? gradeCss(it.colour, light) : 'var(--acc)';
    const ico = String(it.icon || '').replace(/<(path|circle|rect|line|polyline|polygon|ellipse)\b/g, '<$1 pathLength="1"');
    const value = it.measure ? '' : `${esc(it.value)}<small>${esc(it.unit)}</small>`;
    return `<li class="pt" style="--k:${k};--cc:${cc}"><b class="pt-dot" aria-hidden="true"></b><i class="pt-ln" aria-hidden="true"></i><div class="pt-in">
<p class="pt-h"><span class="pt-n">0${k + 1}</span><svg class="pt-ico" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round">${ico}</svg><span class="pt-t">${esc(it.title)}</span></p>
<p class="pt-v" aria-live="off">${value}</p><p class="pt-s">${esc(it.sub)}</p>
<p class="pt-d">${esc(it.note)}</p></div></li>`;
  };
  const credit = C.credit && C.credit.show !== false && C.credit.text
    ? `<p class="foot">${C.credit.href ? `<a href="${esc(C.credit.href)}">${esc(C.credit.text)}</a>` : esc(C.credit.text)}</p>` : '';
  return `<header class="nav" id="nav">
  <a class="brand" href="${esc(B.href || '#')}" aria-label="${esc(B.name)} — home">${MARK}<span class="wm">${esc(B.name)}</span></a>
  <nav class="links" aria-label="Primary">${(N.links || []).map(([t, h]) => `<a href="${esc(h)}">${esc(t)}</a>`).join('')}</nav>
  ${N.action ? `<a class="start" href="${esc(N.action[1])}">${esc(N.action[0])} ${ARROW}</a>` : '<span></span>'}
</header>
<main>
<section class="hero" id="hero" aria-labelledby="h1">
  <div class="stage" id="stage">
    <canvas id="gl" aria-hidden="true"></canvas>
    <p class="sr">${esc(H.scene)}</p>
    <div class="shade" aria-hidden="true"></div>
    <div class="edge" id="edge" aria-hidden="true"></div>
    <div class="copy">
      <p class="eyebrow">${esc(H.eyebrow)}</p>
      <h1 id="h1">${(H.headline || []).map((s, i) => `<span class="l${i + 1}">${line(s)}</span>`).join('')}</h1>
      <p class="lede">${esc(H.lede)}</p>
      <div class="ctas">
        <a class="cta primary explore" href="#next">${esc(H.explore)} ${ARROW}</a>
        <button class="cta ghost" id="watch" type="button"><span class="pl" aria-hidden="true"></span><span class="lb">${esc(H.watch)}</span> ${ARROW}</button>
      </div>
    </div>
    <nav class="rail" id="rail" aria-label="Controls — hover or focus one to change what the system is doing">
      <p class="rh" aria-hidden="true"><span>${esc(K.title)}</span><i></i><span class="rs" id="rstate">${esc(K.idle || 'IDLE')}</span></p>
      <ul>${(K.items || []).slice(0, 4).map(ctl).join('')}</ul>
    </nav>
    ${credit}
    <ol class="pts" id="pts" aria-label="${esc(E.label)}" aria-hidden="true">${(E.items || []).slice(0, 3).map(point).join('')}</ol>
    <aside class="readout" aria-label="This page, measured live">
      <p class="rt"><span>${esc(R.title)}</span><i class="lv" aria-hidden="true"></i><span>${esc(R.live)}</span></p>
      <dl>
        <div><dt>FPS</dt><dd id="r-fps">—</dd></div>
        <div><dt>FRAME</dt><dd><span id="r-frame">—</span><small>ms</small></dd></div>
        <div><dt>WIRE</dt><dd><span id="r-wire">—</span><small>KB</small></dd></div>
        <div class="st" aria-live="off"><dt><span class="sl on" id="r-sl0">SIGNALS IN</span><span class="sl" id="r-sl1"></span></dt><dd><span class="sv on" id="r-sv0">—</span><span class="sv" id="r-sv1"></span></dd></div>
      </dl>
      <canvas class="graph" aria-hidden="true"></canvas>
      <p class="demo">${esc(R.note)}</p>
    </aside>
  </div>
</section>
<footer class="close" id="next">
  <p>${esc(F.text)}</p>
  <nav aria-label="Footer">${(F.links || []).map(([t, h]) => `<a href="${esc(h)}">${esc(t)}</a>`).join('')}</nav>
</footer>
</main>`;
}

/* the page's tokens and head, from the config: colours, type, the track's length, the title and the link preview */
export function applyConfig(C, doc = document) {
  const r = doc.documentElement.style, c = C.colours || {}, f = C.fonts || {};
  const set = (k, v) => { if (v) r.setProperty(k, v); };
  set('--bg', c.background); set('--ink', c.ink); set('--acc', c.accent); set('--on-acc', c.onAccent);
  set('--sans', f.sans); set('--mono', f.mono);
  const M = C.meta || {};
  if (M.title) doc.title = M.title;
  const meta = (attr, key, val) => {
    if (!val) return;
    let m = doc.head.querySelector(`meta[${attr}="${key}"]`);
    if (!m) { m = doc.createElement('meta'); m.setAttribute(attr, key); doc.head.append(m); }
    m.setAttribute('content', val);
  };
  meta('name', 'description', M.description);
  meta('property', 'og:title', M.title); meta('property', 'og:description', M.description);
  meta('property', 'og:url', M.url); meta('property', 'og:image', M.image && M.url ? new URL(M.image, M.url).href : M.image);
  meta('name', 'theme-color', c.background);
}
