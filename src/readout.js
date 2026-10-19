/* ============================================================================
   src/readout.js — the panel in the corner reads the page itself.

   Nothing in it is invented. Every number is this page, now:
     FPS        frames presented in the last second (rAF timestamps)
     FRAME      time between frames, median of the last 8 (ms)
     WIRE       compressed bytes of every file the page is made of — the
                document and its fonts — as delivered (Resource Timing
                encodedBodySize: the brotli body when the server sends br;
                headers are not counted). "—" where the browser cannot say
                (a file:// page has no transfer).
   The fourth cell speaks for the system's state (ui.js), and says so: its
   numbers are DEMO DATA. Its label and value swap with a 200 ms cross-fade
   between two layers in one fixed box, so nothing re-lays out.
   The sparkline is the last 120 frame times, one sample per frame, on a
   fixed 0–33.3 ms scale with a hairline at the 16.7 ms budget.
   ========================================================================== */
/* the page's own files as this visit received them (the document and everything it fetched): { bytes, compressed }, where
   compressed says the server sent the document compressed; null where the browser cannot say (a page opened from disk) */
export function wireMeasure() {
  try {
    if (!/^https?:$/.test(location.protocol)) return null;
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav || !nav.encodedBodySize) return null;
    let bytes = nav.encodedBodySize;
    for (const e of performance.getEntriesByType('resource')) bytes += e.encodedBodySize || 0;
    return { bytes, compressed: nav.decodedBodySize > 0 && nav.encodedBodySize < 0.8 * nav.decodedBodySize };
  } catch { return null; }
}
const N = 120;
const SCALE = 1000 / 30;
const BUDGET = 1000 / 60;

export function createReadout(root = document) {
  const $ = (id) => document.getElementById(id);
  const out = { fps: $('r-fps'), frame: $('r-frame'), wire: $('r-wire') };
  const SL = [$('r-sl0'), $('r-sl1')], SV = [$('r-sv0'), $('r-sv1')];
  let cur = 0, curLabel = '', curValue = '';
  const graph = root.querySelector('.readout .graph');
  if (!graph || !out.fps) return { frame() {}, wire() {}, state() {}, value() {} };
  const g = graph.getContext('2d');
  const dts = new Float32Array(N);
  const stamps = new Float64Array(256);
  let head = 0, count = 0, sHead = 0, sCount = 0;
  const shown = {};
  const set = (k, v) => { if (shown[k] !== v) { shown[k] = v; out[k].textContent = v; } };

  function wire() {
    /* a page opened from disk crossed no wire */
    const w = wireMeasure();
    set('wire', w ? (w.bytes / 1024).toFixed(1) : '—');
  }
  wire();
  try { new PerformanceObserver(wire).observe({ type: 'resource', buffered: true }); } catch {}
  addEventListener('load', wire);

  let gw = 1, gh = 1, gdpr = 1, visible = true;
  /* the graph in the page's own colours (config.js: ink and accent) */
  const cs = getComputedStyle(document.documentElement), rgbOf = (v, d) => { const m = (cs.getPropertyValue(v) || '').trim().match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(',') : d; };
  const INK = rgbOf('--ink', '236,239,239'), ACC = rgbOf('--acc', '232,238,240');
  function size() {
    const r = graph.getBoundingClientRect();
    visible = r.width > 0;
    gdpr = Math.min(2, window.devicePixelRatio || 1);
    gw = Math.max(1, Math.round(r.width * gdpr)); gh = Math.max(1, Math.round(r.height * gdpr));
    graph.width = gw; graph.height = gh;
    draw();
  }
  function draw() {
    if (!visible) return;
    g.clearRect(0, 0, gw, gh);
    const Y = (ms) => gh - 1 - Math.min(1, ms / SCALE) * (gh - 3);
    const X = (i) => (i / (N - 1)) * (gw - 3) + 0.5;
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(' + INK + ',.12)';
    g.beginPath(); g.moveTo(0, gh - 0.5); g.lineTo(gw, gh - 0.5); g.stroke();
    g.setLineDash([2 * gdpr, 3 * gdpr]);
    g.strokeStyle = 'rgba(' + INK + ',.22)';
    const yb = Math.round(Y(BUDGET)) + 0.5;
    g.beginPath(); g.moveTo(0, yb); g.lineTo(gw, yb); g.stroke();
    g.setLineDash([]);
    if (!count) return;
    const pts = [];
    for (let k = 0; k < count; k++) { const i = (head - count + k + N) % N; pts.push([X(N - count + k), Y(dts[i])]); }
    const step = Math.max(2, Math.round(2 * gdpr));
    const grad = g.createLinearGradient(0, 0, gw, 0);
    grad.addColorStop(0, 'rgba(' + ACC + ',.03)'); grad.addColorStop(1, 'rgba(' + ACC + ',.2)');
    g.strokeStyle = grad;
    g.beginPath();
    for (let x = pts[0][0]; x <= gw; x += step) {
      const f = (x - pts[0][0]) / Math.max(1, pts[pts.length - 1][0] - pts[0][0]) * (pts.length - 1);
      const i0 = Math.min(pts.length - 1, Math.floor(f)), i1 = Math.min(pts.length - 1, i0 + 1), u = f - i0;
      g.moveTo(Math.round(x) + 0.5, gh); g.lineTo(Math.round(x) + 0.5, pts[i0][1] * (1 - u) + pts[i1][1] * u);
    }
    g.stroke();
    g.strokeStyle = 'rgba(' + ACC + ',.9)';
    g.lineWidth = Math.max(1, gdpr);
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    const [lx, ly] = pts[pts.length - 1];
    g.fillStyle = 'rgba(' + ACC + ',.95)';
    g.beginPath(); g.arc(lx, ly, 1.6 * gdpr, 0, Math.PI * 2); g.fill();
  }
  size();
  new ResizeObserver(size).observe(graph);

  let lastText = 0, lastGraph = 0;
  /* the state cell: a new label cross-fades in on the hidden layer; the same label only updates its value */
  function state(label, v) {
    if (!SL[0]) return;
    if (label === curLabel) { value(v); return; }
    const nx = 1 - cur;
    SL[nx].textContent = label; SV[nx].textContent = v;
    SL[nx].classList.add('on'); SV[nx].classList.add('on');
    SL[cur].classList.remove('on'); SV[cur].classList.remove('on');
    cur = nx; curLabel = label; curValue = v;
  }
  function value(v) { if (SV[cur] && v !== curValue) { curValue = v; SV[cur].textContent = v; } }
  function frame(dtMs, now) {
    if (dtMs > 0) { dts[head] = dtMs; head = (head + 1) % N; count = Math.min(N, count + 1); }
    stamps[sHead] = now; sHead = (sHead + 1) % stamps.length; sCount = Math.min(stamps.length, sCount + 1);
    if (now - lastText > 250) {
      lastText = now;
      let n = 0, oldest = now;
      for (let k = 1; k <= sCount; k++) { const t = stamps[(sHead - k + stamps.length) % stamps.length]; if (now - t <= 1000) { n++; oldest = t; } else break; }
      if (n >= 2 && now > oldest) set('fps', String(Math.round((n - 1) * 1000 / (now - oldest))));
      if (count) {
        const last = [];
        for (let k = 1; k <= Math.min(8, count); k++) last.push(dts[(head - k + N) % N]);
        last.sort((a, b) => a - b);
        set('frame', last[last.length >> 1].toFixed(1));
      }
    }
    if (now - lastGraph > 66) { lastGraph = now; draw(); }
  }
  return { frame, wire, state, value };
}
