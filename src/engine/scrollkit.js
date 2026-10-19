/* ============================================================================
   src/engine/scrollkit.js — THE SCROLL ENGINE. Pure, and nothing in it
   allocates per frame.

   NATIVE SCROLLING STAYS NATIVE. The page is a tall pinned section; the browser
   owns the wheel, the trackpad, touch momentum, the keyboard, the scrollbar and
   accessibility — the wheel is never preventDefault-ed. The browser already
   normalises what it is given (a notched wheel's lines become pixels and a short
   smooth-scroll glide, a trackpad's precise deltas are applied as they come,
   touch keeps its own momentum), so the page reads one thing: the scroll
   position, once per animation frame, never inside a scroll event.

     input → TARGET → (rate limit) → two first-order stages → RENDERED PROGRESS
   Everything — camera, timeline, words, energy — is driven by the one rendered
   progress.

   THE FOLLOWER. Two cascaded exponential stages, frame-rate independent:
       x += (in − x) · (1 − exp(−dt / τ))     τ1 = 0.075 s, τ2 = 0.05 s
   The pair lags a steady scroll by τ1 + τ2 = 0.125 s, and its impulse response
   is never negative, so it cannot overshoot: when the hand stops, the motion
   eases to rest (95 % in 0.3 s) and stops, exactly, on the target. Unlike one
   stage, the pair's velocity is continuous — a notch starts soft instead of at
   full speed. Before the stages the target is rate limited (VMAX progress/s),
   so one hard fling, Page Down or End cannot skip a scene in a frame; it glides
   through it at the limit.
   ========================================================================== */

export function createFollower({ tau1 = 0.075, tau2 = 0.05, vmax = 1.2, p0 = 0 } = {}) {
  const F = {
    target: p0, lim: p0, mid: p0, p: p0, v: 0,
    /* jump without motion (a still, a resize that moves the track, a reduced-motion hold) */
    reset(p) { F.target = F.lim = F.mid = F.p = p; F.v = 0; },
    step(target, dt) {
      F.target = target;
      if (!(dt > 0)) return F.p;
      const m = vmax * dt, d = target - F.lim;
      F.lim += d > m ? m : d < -m ? -m : d;
      F.mid += (F.lim - F.mid) * (1 - Math.exp(-dt / tau1));
      const prev = F.p;
      F.p += (F.mid - F.p) * (1 - Math.exp(-dt / tau2));
      /* A STOP IS A STOP: inside a hundredth of a pixel of rest, land on the target exactly (no endless creep) */
      if (Math.abs(target - F.p) < 2e-7 && Math.abs(F.mid - F.p) < 2e-7) F.lim = F.mid = F.p = target;
      F.v = (F.p - prev) / dt;
      return F.p;
    },
  };
  return F;
}

/* THE FRAME LOG: a fixed ring of N frames × 8 numbers, filled without allocating. dump() is for tools. */
export function createFrameLog(n = 12000) {
  const W = 8, buf = new Float64Array(n * W);
  let i = 0, count = 0;
  return {
    push(a, b, c, d, e, f, g, h) {
      const o = i * W;
      buf[o] = a; buf[o + 1] = b; buf[o + 2] = c; buf[o + 3] = d; buf[o + 4] = e; buf[o + 5] = f; buf[o + 6] = g; buf[o + 7] = h;
      i = (i + 1) % n; if (count < n) count++;
    },
    clear() { i = 0; count = 0; },
    dump() {
      const out = new Array(count * W), s = count < n ? 0 : i;
      for (let k = 0; k < count; k++) { const o = ((s + k) % n) * W; for (let j = 0; j < W; j++) out[k * W + j] = buf[o + j]; }
      return out;
    },
  };
}

/* THE DEBUG OVERLAY (?debug=1): the last 240 frame times as bars against 16.7 / 33.3 ms, the dropped-frame count
   (frames longer than 1.5 × the display's interval, which it measures), the rendered progress and its velocity.
   One small 2D canvas over the page, drawn every frame from preallocated state. */
export function createDebugOverlay(host = document.body) {
  const c = document.createElement('canvas');
  const CW = 340, CH = 132, dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = CW * dpr; c.height = CH * dpr;
  c.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;width:' + CW + 'px;height:' + CH + 'px;pointer-events:none;border:1px solid rgba(95,233,222,.35);border-radius:6px;background:rgba(2,6,7,.82)';
  host.appendChild(c);
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const N = 240, ft = new Float32Array(N), sorted = new Float32Array(N);
  let k = 0, filled = 0, dropped = 0, frames = 0, interval = 16.67, lastText = 0;
  const lines = ['', '', ''];
  return {
    el: c,
    reset() { dropped = 0; frames = 0; },
    frame(dtMs, p, v, s, worldB, flash) {
      ft[k] = dtMs; k = (k + 1) % N; if (filled < N) filled++;
      frames++;
      /* the display's interval: the median of the window (a 120/144 Hz screen measures itself) */
      if ((frames & 31) === 0 && filled > 30) { for (let i = 0; i < filled; i++) sorted[i] = ft[i]; const s = sorted.subarray(0, filled).sort(); interval = s[filled >> 1]; }
      if (frames > 30 && dtMs > 1.5 * interval) dropped++;
      x.clearRect(0, 0, CW, CH);
      const gx = 8, gy = 48, gw = CW - 16, gh = CH - 56, msMax = 50;
      x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1;
      for (const ms of [16.67, 33.33]) { const yy = gy + gh - (ms / msMax) * gh; x.beginPath(); x.moveTo(gx, yy + 0.5); x.lineTo(gx + gw, yy + 0.5); x.stroke(); }
      const bw = gw / N;
      for (let i = 0; i < filled; i++) {
        const v2 = ft[(k - filled + i + N) % N], hh = Math.min(gh, (v2 / msMax) * gh);
        x.fillStyle = v2 > 25 ? '#ff6b5a' : v2 > 1.5 * interval ? '#ffd27a' : '#5fe9de';
        x.fillRect(gx + i * bw, gy + gh - hh, Math.max(1, bw - 0.2), hh);
      }
      /* the words: rebuilt ten times a second (strings are the only allocation, and only here) */
      const now = performance.now();
      if (now - lastText > 100) {
        lastText = now;
        lines[0] = (1000 / Math.max(1e-3, interval)).toFixed(0) + ' Hz · ' + dtMs.toFixed(1) + ' ms · dropped ' + dropped + ' / ' + frames;
        lines[1] = 'p ' + p.toFixed(4) + ' · v ' + v.toFixed(3) + ' /s';
        lines[2] = 's ' + s.toFixed(4) + ' · world ' + (worldB ? 'B' : 'A') + ' · flash ' + flash.toFixed(2);
      }
      x.font = '11px ui-monospace,Consolas,monospace'; x.fillStyle = '#e9f3f2';
      x.fillText(lines[0], 8, 15); x.fillText(lines[1], 8, 29); x.fillStyle = '#8fb'; x.fillText(lines[2], 8, 43);
    },
  };
}

/* THE SOFT SETTLE (optional): when the hand stops within `reach` of a hold, ease onto the hold's nearest edge over
   `dur` s, in the direction the hand was going (never a pull back) — never from further away, and any new input
   (wheel, touch, key, a press) cancels it at once. It moves
   the page's own scroll, so the follower carries it like any other scroll. */
/* eps: the page position's own granularity (a number, or a function of nothing, e.g. () => 2 / spanPx): a glide that lands
   within it is home (the browser rounds scroll to whole pixels; a short page would otherwise re-glide forever), and a
   move larger than it during a glide that the settle did not make (an anchor, a link, scrollTo) cancels the glide. */
export function createSettle({ holds, reach = 0.04, dur = 0.5, idle = 0.18, eps = 1e-4, getP, setP }) {
  let busy = false, from = 0, to = 0, t0 = 0, lastInput = -1e9, lastP = -1, still0 = 0, dir = 0, lastSet = null;
  const E = () => (typeof eps === 'function' ? eps() : eps);
  const cancel = () => { busy = false; lastInput = performance.now(); };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(ev, cancel, { passive: true, capture: true });
  const ease = (u) => u * u * (3 - 2 * u);
  return {
    cancel,
    tick(now) {
      const p = getP();
      if (busy) {
        /* something else moved the page (an anchor, a link, scrollTo): it wins at once */
        if (lastSet !== null && Math.abs(p - lastSet) > 3 * E()) { busy = false; lastSet = null; lastInput = now; still0 = now; dir = p > lastP ? 1 : -1; lastP = p; return; }
        const u = Math.min(1, (now - t0) / (dur * 1000));
        lastSet = from + (to - from) * ease(u);
        setP(lastSet);
        if (u >= 1) { busy = false; lastSet = null; }
        lastP = p; return;
      }
      if (Math.abs(p - lastP) > 1e-6) { if (lastP >= 0) dir = p > lastP ? 1 : -1; still0 = now; lastP = p; return; }
      /* settled by the hand: no movement for `idle` s, and no input for as long */
      if (now - still0 < idle * 1000 || now - lastInput < idle * 1000) return;
      for (let i = 0; i < holds.length; i++) {
        const a = Math.min(holds[i][0], holds[i][1]), b = Math.max(holds[i][0], holds[i][1]);   // a hold given backwards is still a hold
        const edge = p < a ? a : p > b ? b : -1;
        if (edge < 0 || Math.abs(p - edge) > reach || Math.abs(p - edge) <= 3 * E()) continue;
        /* only onward: a hold the hand was heading for, never a pull back against the way it was going */
        if ((edge - p) * dir <= 0) continue;
        busy = true; from = p; to = edge; t0 = now; still0 = now + dur * 1000; return;
      }
      still0 = now + 1e9;   // nothing near: wait for the hand
    },
    /* the hand moved the page (not the settle): look again once it stops */
    poke() { still0 = performance.now(); },
  };
}
