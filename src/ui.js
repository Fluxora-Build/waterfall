/* ============================================================================
   src/ui.js — the interface to the intelligence.

   THE RAIL. The four controls are not cards: hovering (or focusing) one sets
   the system's target, and the fall blends into that verb over 600 ms;
   leaving the rail releases it over 800 ms. Moving from one control straight
   to the next never passes through rest — the items touch. On touch a tap
   selects (a second tap, or a tap elsewhere, releases). The active item shows
   its number and draws a thin progress line; the others dim to 40 %.

   THE IDLE CYCLE. Nothing hovered for 8 s: the system walks through the four
   states, 5 s each, and rests; the rail follows. The first input of any kind
   stops it. Not under reduced motion.

   THE READOUT. FPS, FRAME and WIRE are this page, measured now. The fourth
   cell speaks for the state (DEMO DATA, said beside it): SIGNALS IN at rest
   and while INGESTING (counting fast), TRANSFORMS / S, SEEN → KEPT, and
   DECISIONS, one per landing in the pond. Label and value swap with a 200 ms
   cross-fade inside a fixed box — nothing re-lays out.

   THE JOURNEY: the hero is a 1250vh track; scroll position is narrative
   position (journey.js). The interface takes its fades from the same
   followed position the scene uses, so the words and the world move
   together. WATCH THE EXPERIENCE plays the whole camera journey on autopilot
   (hero to the room, through the same checkpoints); EXPLORE THE SYSTEM plays
   the whole journey, tap to the readouts, in about 12 s. Any wheel, touch, key or click hands control back.

   THE END IS THE ROOM, and under each pedestal, on the floor, one card —
   config.ending.items — held to its pedestal's foot wherever the camera puts
   it (read from the scene every frame it moves, written only when it moved).
   Pointing at one lights its pedestal. Then the page scrolls on to the
   section after it.
   ========================================================================== */
import config from '../config.js';
import { createReadout } from './readout.js';
import { AUTOPILOT, CHECKPOINTS, S_ORB, S_END, sOf, pOfS, monoPrep, monoAt } from './engine/journey.js';
import { createSettle } from './engine/scrollkit.js';
import { createMeasures } from './perf.js';

const CTL = (config.controls && config.controls.items) || [];
const LABEL = [0, 1, 2, 3].map((k) => (CTL[k] && CTL[k].status) || '');
const IDLE_LABEL = (config.controls && config.controls.idle) || 'IDLE';
const MOTION = config.motion || {};
const AUTO_S = MOTION.autopilot ?? AUTOPILOT;
/* THE DIVE'S TIMELINE (EXPLORE THE SYSTEM): the six acts at their own pace — the push to the waterfall, the turn down and
   the descent through the streams, the core, the ring tunnel, the light, the beam's split to the room — as one
   continuous curve in the journey's own position s: a monotone cubic through the acts' ends, at rest at both ends (no
   plateau between acts), on the clock (a phone and a desktop see the same timing). The last act's motion ends while
   the readouts are still coming in (their entrance is CSS, 1.6 s from the room's landing); then the page eases on to
   the end of the track (the camera is at rest there: only the canvas's bottom edge finishes its fade). */
const DIVE_ACTS = (MOTION.acts && MOTION.acts.length === 6 ? MOTION.acts : [1.2, 2.0, 1.5, 2.5, 1.0, 3.5]);
const DIVE_S = [0, 0.265, S_ORB, 0.80, 0.868, 0.90, S_END];
const DIVE_T = DIVE_S.map((_, i) => DIVE_ACTS.slice(0, i).reduce((a, b) => a + b, 0));
const DIVE = monoPrep(DIVE_T, DIVE_S);
DIVE.m[0] = 0; DIVE.m[DIVE.n - 1] = 0;
const DIVE_END = DIVE_T[DIVE_T.length - 1], DIVE_TAIL = 0.4, P_FULL = pOfS(S_END);
/* the time on the timeline at which the journey reaches s (a page already part-way in starts there) */
const diveTimeOf = (s) => { if (s <= 0) return 0; let a = 0, b = DIVE_END; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (monoAt(DIVE, m) < s) a = m; else b = m; } return b; };

const STATES = ['ingest', 'process', 'understand', 'act'];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
/* the state cell: [label, value from the system's counters] — rest reads like INGEST, slower */
const METRIC = [
  ['SIGNALS IN', (c) => fmt(c.signals)],
  ['TRANSFORMS / S', (c) => fmt(c.transforms)],
  ['SEEN → KEPT', (c) => fmt(c.seen) + ' → ' + fmt(c.kept)],
  ['DECISIONS', (c) => fmt(c.decisions)],
];
const IDLE_AFTER = 1000 * (MOTION.idleAfter ?? 8), IDLE_CYCLE = MOTION.idleCycle !== false;

export function bindUI(hero, opts = {}) {
  const root = document.documentElement;
  const rail = document.getElementById('rail');
  const ctls = [...rail.querySelectorAll('.ctl')];
  const rstate = document.getElementById('rstate');
  const watch = document.getElementById('watch');
  const heroEl = document.getElementById('hero');
  const readout = createReadout(document);
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = -1, pinned = -1, uiOff = false, cycling = false;

  function show(k, cycle = false) {
    rail.style.setProperty('--pd', cycle ? '5s' : '.6s');
    rail.style.setProperty('--pe', cycle ? 'linear' : 'cubic-bezier(.2,.7,.2,1)');
    ctls.forEach((c, i) => { const on = i === k; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    rail.classList.toggle('lit', k >= 0);
    rstate.textContent = k >= 0 ? LABEL[k] : IDLE_LABEL;
  }
  function setActive(k) {
    if (uiOff) k = -1;
    if (k === active && !cycling) return;
    active = k;
    cycling = false;
    hero.hover(k >= 0 ? STATES[k] : null);
    show(k);
  }
  ctls.forEach((c, i) => {
    c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setActive(i); });
    c.addEventListener('focus', () => setActive(i));
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pinned = pinned === i ? -1 : i;
      setActive(pinned);
    });
    c.addEventListener('click', (e) => { if (e.detail === 0) { pinned = pinned === i ? -1 : i; setActive(pinned === -1 ? -1 : i); } });
  });
  rail.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && pinned < 0) setActive(-1); });
  rail.addEventListener('focusout', (e) => { if (!rail.contains(e.relatedTarget) && pinned < 0) setActive(-1); });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !rail.contains(e.target) && pinned >= 0) { pinned = -1; setActive(-1); } }, { passive: true });

  /* THE IDLE CYCLE: any input resets the clock and stops a cycle in progress */
  let lastInput = performance.now();
  function input() {
    lastInput = performance.now();
    if (cycling) { cycling = false; if (active < 0) { hero.hover(null); show(-1); } }
  }
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, input, { passive: true });

  /* THE AUTOPILOT: glide the page to p over ms (a 0.4 s ramp at each end, an even pace between); the
     camera's own spring and the journey's holds do the rest. A wheel, touch, key or click hands it back. */
  /* the track's geometry is measured when the layout changes, never per frame: progress() reads scrollY alone */
  let heroTop = 0, spanPx = 1;
  const measureTrack = () => { heroTop = heroEl.offsetTop; spanPx = Math.max(1, heroEl.offsetHeight - innerHeight); };
  measureTrack();
  addEventListener('resize', measureTrack);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureTrack);
  if (typeof ResizeObserver === 'function') new ResizeObserver(measureTrack).observe(heroEl);
  const span = () => spanPx;
  const progress = () => clamp01((scrollY - heroTop) / spanPx);
  let tween = null, piloting = false;
  const cancelTween = () => { if (tween) { cancelAnimationFrame(tween); tween = null; } };
  function stopPilot() {
    cancelTween();
    if (piloting) { piloting = false; watch.setAttribute('aria-pressed', 'false'); }
    if (cta === 'diving') ctaSet('idle');
  }
  function glide(pTo, ms, done) {
    cancelTween();
    const p0 = progress(), t0 = performance.now(), D = Math.max(1, ms), R = Math.min(400, D / 4);
    /* distance covered by time t on a trapezoid velocity profile, normalised to 1 at t = D */
    const area = D - R;
    const at = (t) => (t < R ? (t * t) / (2 * R) : t < D - R ? t - R / 2 : area - ((D - t) * (D - t)) / (2 * R)) / area;
    const step = (now) => {
      const t = Math.min(D, now - t0);
      scrollTo(0, heroTop + (p0 + (pTo - p0) * at(t)) * spanPx);
      if (t < D) tween = requestAnimationFrame(step); else { tween = null; if (done) done(); }
    };
    tween = requestAnimationFrame(step);
  }
  /* WATCH THE EXPERIENCE: hero to the room at the autopilot's pace */
  watch.addEventListener('click', () => {
    if (piloting) { stopPilot(); return; }
    stopPilot();
    piloting = true; watch.setAttribute('aria-pressed', 'true');
    const go = () => {
      if (!piloting) return;
      if (progress() > 0.98) scrollTo(0, heroTop);
      if (hero.govern) hero.govern();
      const p0 = progress();
      glide(1, AUTO_S * 1000 * (1 - p0), () => { piloting = false; watch.setAttribute('aria-pressed', 'false'); });
    };
    if (hero.prewarmNow) hero.prewarmNow().then(go); else go();
  });

  /* EXPLORE THE SYSTEM — one state machine, idle → diving → arrived, the same on every screen: the whole journey to the
     readouts on the dive's timeline (DIVE, above), so a phone never stops part-way with nothing to read and no way on.
     Reduced motion: no flight, straight to the end.
     Each state has a hard deadline: the pre-warm 4 s; a dive not landed by its planned end + 1.2 s (rAF stalled, the app
     in the background, a scroll the browser ignored) jumps there; a landing is checked 0.5 s later and jumped again if
     the page is not there. Nothing locks the page: no overflow, no touch-action, no history entry (Back leaves as
     before). Any wheel, touch, key or click hands control back (idle). The state is on the button (data-state). */
  const explore = document.querySelector('.cta.explore');
  let cta = 'idle', ctaTimer = 0;
  const ctaGoal = 1;
  function ctaSet(s) { cta = s; explore.dataset.state = s; clearTimeout(ctaTimer); ctaTimer = 0; }
  ctaSet('idle');
  function jumpTo(p) {
    const y = Math.round(heroTop + p * spanPx);
    scrollTo(0, y);
    if (Math.abs(scrollY - y) > 2) document.scrollingElement.scrollTop = y;
  }
  function arrive() {
    cancelTween();
    measureTrack();
    if (Math.abs(progress() - ctaGoal) > 0.002) jumpTo(ctaGoal);
    if (settle) settle.cancel();
    ctaSet('arrived');
    /* a keyboard visit leaves the faded button: the next key scrolls the page */
    if (document.activeElement === explore) explore.blur();
    ctaTimer = setTimeout(() => { if (cta === 'arrived' && Math.abs(progress() - ctaGoal) > 0.004) jumpTo(ctaGoal); }, 500);
  }
  explore.addEventListener('click', (e) => {
    e.preventDefault();
    stopPilot();
    measureTrack();
    ctaSet('diving');
    /* the pre-warm first (a cold cost before the camera moves; its own deadline: 4 s, then the dive lands at once) */
    if (!reducedMotion && hero.prewarmNow) {
      ctaTimer = setTimeout(() => { if (cta === 'diving') arrive(); }, 4000);
      hero.prewarmNow().then(() => { if (cta === 'diving') dive(); });
    } else dive();
  });
  function dive() {
    clearTimeout(ctaTimer);
    measureTrack();
    if (reducedMotion) { glide(ctaGoal, 1, arrive); ctaTimer = setTimeout(() => { if (cta === 'diving') arrive(); }, 1200); return; }
    if (hero.govern) hero.govern();
    const from = diveTimeOf(sOf(progress()));
    glideDive(from, arrive);
    ctaTimer = setTimeout(() => { if (cta === 'diving') arrive(); }, (DIVE_END + DIVE_TAIL - from) * 1000 + 1200);
  }
  /* the page on the dive's timeline: p = pOfS(s(t)), then the short ease to the end of the track */
  function glideDive(from, done) {
    cancelTween();
    const t0 = performance.now() - from * 1000, T = DIVE_END + DIVE_TAIL;
    const step = (now) => {
      const t = Math.min(T, (now - t0) / 1000);
      let p;
      if (t <= DIVE_END) p = pOfS(monoAt(DIVE, t));
      else { const u = (t - DIVE_END) / DIVE_TAIL; p = P_FULL + (1 - P_FULL) * u * u * (3 - 2 * u); }
      scrollTo(0, heroTop + p * spanPx);
      if (t < T) tween = requestAnimationFrame(step); else { tween = null; if (done) done(); }
    };
    tween = requestAnimationFrame(step);
  }
  /* back from another page mid-dive (the page cache): land at once */
  addEventListener('pageshow', (e) => { if (e.persisted && cta === 'diving') arrive(); });
  /* any input hands control back. The tap or click that starts a glide arrives before it starts, and Enter or Space on a
     button is its activation; anything else — a wheel anywhere, another key — is the hand. */
  const handBack = (e) => {
    const on = e.target && e.target.closest && e.target.closest('#watch, .cta.explore');
    if (on && (e.type === 'touchstart' || e.type === 'pointerdown' || (e.type === 'keydown' && (e.key === 'Enter' || e.key === ' ')))) return;
    stopPilot();
    if (cta === 'arrived') ctaSet('idle');
  };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(ev, handBack, { passive: true });
  /* the tools drive the same autopilot */
  if (opts.dev) window.__autopilot = { glide: (pTo, ms) => new Promise((r) => glide(pTo, ms, r)), progress, span };

  /* portrait: tell the camera where the copy ends and the controls begin (layout offsets, unaffected by the fades) */
  const copyEl = document.querySelector('.copy');
  function frameHint() {
    if (!hero.setFrameHint || !copyEl) return;
    hero.setFrameHint({ top: copyEl.offsetTop + copyEl.offsetHeight + 46, bottom: rail.offsetTop - 66 });   // air under the button; the core's base clear of the controls
  }
  frameHint();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(frameHint);
  addEventListener('resize', frameHint);

  /* SCROLL (scrollkit.js): the page hands the runtime a reader of its progress; the runtime reads it once a frame —
     never in a scroll event — and follows it. The bottom edge's fade is set each frame from the raw progress (a fling
     cannot outrun it). Without a runtime (no WebGL) the old event path keeps the interface honest. */
  const edgeEl = document.getElementById('edge');
  let lastEdge = -1;
  if (hero.setScrollSource) hero.setScrollSource(progress, () => scrollY > heroTop + spanPx + 2);
  else { const onScroll = () => hero.setScroll(progress()); addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  function edgeFrame() {
    const e = Math.round(clamp01((progress() - 0.885) / 0.1) * 50) / 50;
    if (edgeEl && e !== lastEdge) { lastEdge = e; edgeEl.style.opacity = String(e); }
  }
  edgeFrame();
  /* THE SOFT SETTLE: a hand that stops just short of a checkpoint, heading for it, is eased onto it over 0.6 s (the
     checkpoints are points now — the camera slows through them, nothing holds — and the room's landing); any input
     cancels it; never from further than 2.5 % of the track. Not under reduced motion, not while the autopilot flies. */
  const HOLDS = CHECKPOINTS.filter((c) => c.p > 0).map((c) => (c.name === 'brand' ? [c.p, 1] : [c.p, c.p]));
  const settle = reducedMotion || (opts.dev && /[?&]film/.test(location.search)) ? null : createSettle({ holds: HOLDS, reach: 0.025, dur: 0.6, getP: progress, setP: (p) => scrollTo(0, heroTop + p * spanPx) });

  /* the interface follows the journey — written only when a value moves */
  const last = {}, VV = { copy: 1, rail: 1, nav: 1, brand: 0 };
  let copyOff = false;
  const q$ = (s) => document.querySelector(s);
  const EL = { shade: q$('.shade'), copy: q$('.copy'), rail: q$('.rail'), readout: q$('.readout'), foot: q$('.foot'), nav: q$('#nav') };
  const copyLinks = EL.copy ? [...EL.copy.querySelectorAll('a, button')] : [];
  const setO = (el, x) => { if (el) el.style.opacity = String(Math.round(x * 1000) / 1000); };
  const setT = (el, px) => { if (el) el.style.translate = Math.abs(px) < 0.01 ? '' : '0 ' + px.toFixed(2) + 'px'; };
  /* THE POINTS (page.js .pts): each stands at its pedestal's foot (hero.pedestalAnchors, CSS px, no allocation) and
     shows once the room has landed (.on, s ≥ 0.952; the entrance is CSS, in time). Pointing at one lights its pedestal
     (hero.outHover); a tap does the same on touch. The cards that measure this page (config.ending.items[k].measure)
     read it live (perf.js). */
  const ptsEl = document.getElementById('pts'), pts = ptsEl ? [...ptsEl.children] : [];
  const ptAt = new Float32Array(6), ptLast = new Float32Array(6).fill(-1e9), ptIn = pts.map((c) => c.querySelector('.pt-in'));
  const items = (config.ending && config.ending.items) || [];
  const measures = createMeasures(pts.map((c, k) => ({ measure: items[k] && items[k].measure, value: c.querySelector('.pt-v'), sub: c.querySelector('.pt-s') })));
  let ptsOn = false, ptHalf = 0, ptW = 0, ptH = 0, ptBlock = 0, ptTop = 0, ptPw0 = 0, ptPw = -1;
  const ptGap = new Float32Array(3).fill(-1);
  /* the line from a pedestal's foot down to its card, in the last frame */
  const lineG = (h) => Math.max(26, Math.min(80, (h < 900 ? 0.04 : 0.05) * h));
  /* THE THREE CARDS SIT ON ONE ROW: each line is as long as its pedestal needs to reach the row — the nearer centre
     pedestal's line is the shorter. In the room the row hangs low (the cards end at 91 % of the stage); in the last frame
     it rises to just under the feet. The cards keep 14 px from the screen's edges (the dot and the line stay on the
     pedestal). Measured on resize only: the cards' height and the line's top under the foot. */
  const ptMeasure = () => {
    if (ptsEl) ptsEl.style.removeProperty('--pw');
    ptPw0 = pts.length ? pts[0].getBoundingClientRect().width : 0; ptPw = -1; ptHalf = ptPw0 / 2; ptW = innerWidth; ptH = innerHeight; ptLast.fill(-1e9); ptGap.fill(-1);   // unrounded: the width the CSS gives (a rounded one can re-wrap a card)
    ptBlock = Math.max(0, ...ptIn.map((e) => (e ? e.offsetHeight : 0)));
    const ln = pts.length && pts[0].querySelector('.pt-ln'); ptTop = ln ? ln.offsetTop : 20;
    sendHint();
  };
  /* the last frame's budget under the pedestals' feet — the line, the cards, and air under them — for the camera, which
     drops the room into what is left (journey: hero.site.under) */
  let hintSent = -1;
  function sendHint() {
    if (!hero.setSiteHint) return;
    /* a phone held upright (the portrait ending, journey.roomFit): the feet at ~44 % of the height, the split about a third
       down, the cards in the lower middle */
    const portrait = ptW <= 700 && ptH > ptW;
    const under = Math.round(Math.max(ptTop + lineG(ptH) + ptBlock + Math.max(64, 0.1 * ptH), portrait ? 0.56 * ptH : 0));
    if (under !== hintSent) { hintSent = under; hero.setSiteHint({ under }); }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ptMeasure);
  ptMeasure(); addEventListener('resize', ptMeasure);
  function placePoints(JY) {
    if (!ptsEl) return;
    const on = JY.world === 'B' && JY.s >= 0.952;
    if (on !== ptsOn) { ptsOn = on; ptsEl.classList.toggle('on', on); ptsEl.setAttribute('aria-hidden', on ? 'false' : 'true'); if (!on) pts.forEach((c) => c.classList.remove('hv')); }
    if (JY.world !== 'B' || JY.s < 0.94 || !hero.pedestalAnchors || !hero.pedestalAnchors(ptAt)) return;
    /* the cards' real height, read before this frame writes anything (the last frame's layout is clean, so it costs nothing):
       their width settles here and their words may wrap anew — the camera's budget follows */
    { const blk = Math.max(0, ...ptIn.map((e) => (e ? e.offsetHeight : 0))); if (Math.abs(blk - ptBlock) > 1) { ptBlock = blk; ptGap.fill(-1); sendHint(); } }
    /* the cards never touch: no wider than the pedestals' spacing less 18 px */
    const pw = Math.min(ptPw0, Math.round(Math.min(ptAt[2] - ptAt[0], ptAt[4] - ptAt[2]) - 18));
    if (pw > 40 && Math.abs(pw - ptPw) >= 1) {
      ptPw = pw; ptHalf = pw / 2; ptsEl.style.setProperty('--pw', pw + 'px'); ptLast.fill(-1e9); ptGap.fill(-1);
      ptBlock = Math.max(0, ...ptIn.map((e) => (e ? e.offsetHeight : 0)));   // narrower cards wrap taller (read once, on a width change)
    }
    const b = JY.ui.brand || 0, low = Math.max(ptAt[1], ptAt[3], ptAt[5]);
    const rowRoom = Math.max(0.91 * ptH - ptBlock, low + ptTop + 40), rowEnd = low + ptTop + lineG(ptH);
    const row = rowRoom + (rowEnd - rowRoom) * b;
    for (let k = 0; k < 3; k++) {
      const g = Math.round(Math.max(20, row - ptAt[2 * k + 1] - ptTop));
      if (g !== ptGap[k]) { ptGap[k] = g; pts[k].style.setProperty('--gap', g + 'px'); }
    }
    for (let k = 0; k < 3; k++) {
      const x = ptAt[2 * k], y = ptAt[2 * k + 1];
      if (Math.abs(x - ptLast[2 * k]) < 0.1 && Math.abs(y - ptLast[2 * k + 1]) < 0.1) continue;
      ptLast[2 * k] = x; ptLast[2 * k + 1] = y;
      pts[k].style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      const dx = Math.min(ptW - 14 - ptHalf, Math.max(14 + ptHalf, x)) - x;
      ptIn[k].style.translate = Math.abs(dx) < 0.5 ? '' : dx.toFixed(1) + 'px 0';
    }
  }
  pts.forEach((c, k) => {
    const on = () => { pts.forEach((o) => o.classList.toggle('hv', o === c)); if (hero.outHover) hero.outHover(k); };
    const off = () => { c.classList.remove('hv'); if (hero.outHover) hero.outHover(-1); };
    c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') on(); });
    c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') off(); });
    c.addEventListener('click', () => (c.classList.contains('hv') ? off() : on()));
  });

  function applyJourney(JY) {
    if (!JY) return;
    const v = VV; v.copy = JY.ui.copy; v.rail = JY.ui.rail; v.nav = JY.ui.nav; v.brand = JY.ui.brand || 0;
    /* THE SCROLL WRITES ONLY OPACITY AND THE INDIVIDUAL TRANSLATE / SCALE, INLINE, ON THE ELEMENTS IT MOVES. (A custom
       property on the root restyled all 500 elements of the document every frame.) Values move in 1/400 steps and
       an element is written only when its value moved. */
    for (const k in v) {
      const x = Math.round(v[k] * 400) / 400;
      if (last[k] === x) continue;
      last[k] = x;
      if (k === 'copy') { setO(EL.shade, x); setO(EL.copy, x); setT(EL.copy, (1 - x) * -36); }
      else if (k === 'rail') { setO(EL.rail, x); setT(EL.rail, (1 - x) * -24); setO(EL.readout, x); }
      else if (k === 'nav') setO(EL.nav, x);
      /* the credit at the foot dims with the controls and stays */
      if (k === 'rail') setO(EL.foot, 0.35 + 0.65 * x);
    }
    placePoints(JY);
    /* the faded copy is not there to be touched: a tap that lands where the button was must not start a dive */
    const cOff = v.copy < 0.25;
    if (cOff !== copyOff) { copyOff = cOff; EL.copy.toggleAttribute('data-off', cOff); copyLinks.forEach((a) => (a.tabIndex = cOff ? -1 : 0)); }
    const off = v.rail < 0.25;
    if (off !== uiOff) {
      uiOff = off;
      rail.toggleAttribute('data-off', off);
      ctls.forEach((c) => (c.tabIndex = off ? -1 : 0));
      if (off) { pinned = -1; setActive(-1); }
    }
  }

  /* the state cell: the dominant state's metric, or the resting one */
  let shownK = -9, lastVal = 0;
  function stateCell(S, now) {
    let k = -1, m = 0.5;
    S.w.forEach((w, i) => { if (w > m) { m = w; k = i; } });
    const mk = k < 0 ? 0 : k;
    if (k !== shownK) { shownK = k; readout.state(METRIC[mk][0], METRIC[mk][1](S.counters)); lastVal = now; return; }
    if (now - lastVal > 100) { lastVal = now; readout.value(METRIC[mk][1](S.counters)); }
  }

  /* per frame: the readout, the journey's interface, the idle cycle and the rail following it */
  let shownT = -2;
  hero.hooks.onFrame = (S, sys, JY) => {
    const now = performance.now();
    /* the readout lives with the rail: once the rail has gone it stops writing (an invisible element still repaints) */
    if (!uiOff) { readout.frame(hero.stats.dt, now); if (S.counters) stateCell(S, now); }
    measures.frame(now);
    edgeFrame();
    if (settle && !piloting && cta !== 'diving') settle.tick(now);
    applyJourney(JY);
    if (IDLE_CYCLE && !reducedMotion && !cycling && active < 0 && !uiOff && !piloting && now - lastInput > IDLE_AFTER) {
      cycling = true; shownT = -2; hero.demo();
    }
    if (cycling) {
      if (!S.demo) { cycling = false; lastInput = now; show(-1); shownT = -2; return; }
      if (S.target !== shownT) { shownT = S.target; show(S.target, true); }
    }
  };
  /* stills (tools): the interface shows the scripted moment — the lit control, the journey's fades */
  hero.hooks.onStill = (S, scroll, JY) => { show(S.target); applyJourney(JY || (hero.journey && hero.journey())); if (S.counters) { shownK = -9; stateCell(S, performance.now()); } };
  return { setActive, measures };
}
