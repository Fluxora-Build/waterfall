/* ============================================================================
   src/perf.js — the three cards at the end read this page, measured in the
   visitor's browser on this visit. Nothing is written in by hand: each card
   says "measuring…" until its number has settled.

     paint   FAST: the largest paint (LCP), and under it the first paint (FCP),
             in seconds from the start of the navigation. LCP settles at the
             visitor's first input or scroll (the browser stops looking then),
             or 5 s after load. A browser that does not report LCP shows the
             first paint, and says so.
     frames  SMOOTH: frames presented in the last second, and the 95th
             percentile of the last 240 frame times (the slowest 5 %). Live:
             it settles after 90 frames and keeps updating, 4 times a second.
     bytes   LIGHT: every file this page fetched — the document, its scripts,
             everything — as it crossed the wire (Resource Timing's
             encodedBodySize: the compressed body when the server compressed
             it; headers are not counted). It settles once the scene has
             loaded and nothing new has arrived for 1.5 s.
   ========================================================================== */
const SETTLE_FRAMES = 90, WINDOW = 240;

export function createMeasures(cards) {
  /* cards: [{ measure, value: element, sub: element }] */
  const by = {};
  for (const c of cards) if (c.measure) (by[c.measure] = by[c.measure] || []).push(c);
  const show = (kind, value, unit, sub) => {
    for (const c of by[kind] || []) {
      if (c.shown === value + unit + sub) continue;
      c.shown = value + unit + sub;
      c.value.textContent = '';
      if (value === null) { const w = document.createElement('span'); w.className = 'pt-wait'; w.textContent = 'measuring…'; c.value.append(w); }
      else { c.value.append(value); if (unit) { const s = document.createElement('small'); s.textContent = unit; c.value.append(s); } }
      if (c.sub) c.sub.textContent = sub || '';
      c.value.closest('.pt')?.toggleAttribute('data-settled', value !== null);
    }
  };
  for (const k of Object.keys(by)) show(k, null, '', '');
  const secs = (ms) => (ms / 1000).toFixed(2);

  let sceneLoaded = false, lastEntry = performance.now(), bytesDone = false, bytesTimer = 0;

  /* ---- paint ---- */
  let fcp = 0, lcp = 0, lcpOK = false, paintDone = false, loaded = document.readyState === 'complete';
  const paint = () => {
    if (!paintDone) return show('paint', null, '', fcp ? 'FCP ' + secs(fcp) + ' s' : '');
    if (lcp) show('paint', secs(lcp), 's', fcp ? 'LCP · FCP ' + secs(fcp) + ' s' : 'LCP');
    else if (fcp) show('paint', secs(fcp), 's', lcpOK ? 'FCP' : 'FCP (no LCP here)');
    else show('paint', '—', '', 'not reported by this browser');
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') fcp = e.startTime; paint(); }).observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { const es = l.getEntries(); if (es.length) lcp = es[es.length - 1].startTime; paint(); }).observe({ type: 'largest-contentful-paint', buffered: true });
    lcpOK = true;
  } catch {}
  const settlePaint = () => { if (!paintDone) { paintDone = true; paint(); } };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) addEventListener(ev, () => setTimeout(settlePaint, 50), { once: true, passive: true });
  const afterLoad = () => { loaded = true; setTimeout(settlePaint, 5000); checkBytes(); };
  if (loaded) afterLoad(); else addEventListener('load', afterLoad, { once: true });

  /* ---- bytes ---- */
  const weigh = () => {
    try {
      if (!/^https?:$/.test(location.protocol)) return null;   // a page opened from disk crossed no wire
      const nav = performance.getEntriesByType('navigation')[0];
      if (!nav || !nav.encodedBodySize) return null;
      let bytes = nav.encodedBodySize, files = 1;
      for (const e of performance.getEntriesByType('resource')) { bytes += e.encodedBodySize || 0; files++; }
      return { bytes, files, compressed: nav.decodedBodySize > 0 && nav.encodedBodySize < 0.8 * nav.decodedBodySize };
    } catch { return null; }
  };
  const kb = (b) => { const k = b / 1024; return k < 100 ? k.toFixed(1) : String(Math.round(k)); };
  function checkBytes() {
    if (bytesDone) return;
    clearTimeout(bytesTimer);
    if (!sceneLoaded || !loaded) return;
    const wait = 1500 - (performance.now() - lastEntry);
    if (wait > 0) { bytesTimer = setTimeout(checkBytes, wait + 20); return; }
    bytesDone = true;
    const w = weigh();
    if (!w) show('bytes', '—', '', 'opened from disk: nothing crossed a wire');
    else show('bytes', kb(w.bytes), 'KB', w.files + ' files · ' + (w.compressed ? 'compressed' : 'raw'));
  }
  try { new PerformanceObserver(() => { lastEntry = performance.now(); checkBytes(); }).observe({ type: 'resource', buffered: true }); } catch {}

  /* ---- frames ---- */
  const dts = new Float32Array(WINDOW), stamps = [];
  let n = 0, head = 0, lastNow = 0, lastShow = 0;
  function frame(now) {
    if (!by.frames) return;
    if (lastNow && now - lastNow < 250) { dts[head] = now - lastNow; head = (head + 1) % WINDOW; n++; }   // a gap (a hidden tab) is not a frame
    lastNow = now;
    stamps.push(now); while (stamps.length && stamps[0] < now - 1000) stamps.shift();
    if (n < SETTLE_FRAMES) { if (now - lastShow > 250) { lastShow = now; show('frames', null, '', ''); } return; }
    if (now - lastShow < 250) return;
    lastShow = now;
    const m = Math.min(n, WINDOW), a = Array.from(dts.subarray(0, m)).sort((x, y) => x - y);
    const p95 = a[Math.min(m - 1, Math.floor(0.95 * m))];
    show('frames', String(stamps.length), 'fps', 'p95 ' + p95.toFixed(1) + ' ms');
  }

  return {
    frame,
    /* the scene's scripts have arrived (main.js): the weight can settle */
    sceneLoaded() { sceneLoaded = true; lastEntry = performance.now(); checkBytes(); },
    /* no scene (no WebGL2 here): nothing draws frames */
    noScene() { show('frames', '—', '', 'no WebGL2 in this browser'); by.frames = null; },
  };
}
