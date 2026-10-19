/* ============================================================================
   src/engine/state.js — the system's one clock. Pure; no DOM, no GL.

   FOUR WEIGHTS, NEVER FOUR ANIMATIONS. Each control (INGEST, PROCESS,
   UNDERSTAND, ACT) owns a weight that eases to 1 while it is chosen (600 ms,
   ease-out) and back to 0 when it is released (800 ms, ease-out; 200 ms both
   ways under reduced motion). Moving INGEST → PROCESS lets one weight fall
   while the next rises; every visual is a function of the four weights, so
   the scene passes through the blend and never jumps.

   NOTHING IS TIMED FROM ZERO. Every moving thing (the flow, the ring spins,
   the braids, the swirl, the ground currents) integrates a RATE, and the
   states change rates — so a change of state changes speed, never position.

   THE FALL CARRIES ITS HISTORY. The weights are recorded at 30 Hz. A mark
   at depth d left the lip τ(d) seconds ago and is drawn with the state it
   left with, read from that record: a change of state pours over the lip and
   falls through the waterfall to the core, which receives it ~4.8 s later.
   Light, rings and the core's field answer at once; the data arrives.

   The rings are a Kuramoto system: UNDERSTAND couples their phases until
   their gaps line up — the machine comes into coherence rather than being
   set to it. PROCESS runs a STEP CLOCK: panels of energy light one after
   another down the fall, a steady repeating sequence (the readout's count
   ticks on the same steps). ACT is EUPHORIC and starts at the top: on entry
   the lip flares and a front of light pours down the whole fall; while it
   holds, bright pulses launch from the lip down its few bright streams —
   light, faster than the data — and each landing is a DECISION: the pond
   flashes and one ripple crosses the floor. At rest a quiet packet falls
   every 8.5–13.5 s and the core answers when it lands. The readout's numbers (signals in, transforms, seen → kept,
   decisions) are DEMO DATA, but they move with what the fall is doing.
   ========================================================================== */
import { P } from './params.js';
import { streamSpeeds, actStreams } from './geometry.js';

export const STATES = ['ingest', 'process', 'understand', 'act'];
export const DT = 1 / 120;
const F = P.fall;
export const FALL_D = F.lip.y - F.impact.y;
/* time to fall d metres from the lip (speed factor sp scales the velocity) */
export const tauOf = (d, sp = 1) => (Math.sqrt(F.v0 * F.v0 + 2 * F.g * d) - F.v0) / F.g / sp;
export const T_FALL = tauOf(FALL_D);

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
/* PROCESS's step (s) and ACT's pulse flight, lip to pond (s) — the shaders read the same numbers */
export const PROC_STEP = 0.3, PULSE_T = 1.2;
function spring(cur, vel, target, s, dt) {
  const w = 2 / s, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel + w * ch) * dt;
  return [target + (ch + tmp) * e, (vel - w * tmp) * e];
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export function createSystem({ reduced = false, seed = 7 } = {}) {
  const S = P.state, R = P.core.rings;
  const rng = mulberry(seed);
  const prim = streamSpeeds('primary');           // [{index, sp}] of the primary streams
  const acts = actStreams();                      // ACT's few bright streams
  const BLEND_IN = reduced ? 0.2 : 0.6, BLEND_OUT = reduced ? 0.2 : 0.8;
  const HN = S.histN, HZ = S.histHz;
  const st = {
    t: 0, target: -1, prevTarget: -1,
    w: [0, 0, 0, 0], bGoal: [0, 0, 0, 0], bFrom: [0, 0, 0, 0], bT0: [0, 0, 0, 0], bDur: [1, 1, 1, 1],
    flow: 0, flowU: 0,                     // the flow clock: wrapped (shader) and unwrapped (events)
    speed: 1,
    spin: R.map((r, k) => k * 1.9), prec: R.map((r, k) => k * 2.3), tilt: R.map((r) => r[3]), tiltV: R.map(() => 0),
    ringScale: 1, ringScaleV: 0,
    braid: 0, swirl: 0, inPh: 0, outPh: 0, res: 0,
    intro: 0,
    packets: [], pings: [], ripples: [], wave: null, nextDecision: 0,
    pulses: [], surge: null, ingT0: -99,       // INGEST: when it was chosen (its wave crosses the whole screen)
                  // ACT: light launched from the lip (instance, launch time, strength)
    procPh: 0, procStep: -1,               // PROCESS: the step clock (steps; one step = PROC_STEP s)
    /* the readout's demo counters */
    signals: 1_048_576, decisions: 0, transforms: 12_840, seen: 4294, kept: 48, lastWin: 0,
    nextIdle: 6.2,
    hist: new Float32Array(HN * 8 * 4),    // ring of samples at HZ: w0..w3, intro, 0, 0, 0
    histK: -1,
    demo: null,
    events: [],
  };

  function sampleNow() { return [st.w[0], st.w[1], st.w[2], st.w[3], st.intro, 0, 0, 0]; }
  /* the ring holds 4·HN samples (34 s); sample k sits at time k / HZ */
  const RING = HN * 4;
  function record() {
    const k = Math.floor(st.t * HZ);
    if (st.histK < 0) { const s = sampleNow(); for (let j = 0; j < RING; j++) st.hist.set(s, j * 8); st.histK = k; return; }
    while (st.histK < k) { st.histK++; st.hist.set(sampleNow(), (st.histK % RING) * 8); }
  }
  /* the state at real time t (linear between samples) */
  function at(t, ch) {
    const x = Math.max(0, t * HZ), k0 = Math.floor(x), u = x - k0;
    const lo = Math.max(0, st.histK - RING + 2);
    const a = Math.min(st.histK, Math.max(lo, k0)), b = Math.min(st.histK, Math.max(lo, k0 + 1));
    return st.hist[(a % RING) * 8 + ch] * (1 - u) + st.hist[(b % RING) * 8 + ch] * u;
  }

  function setTarget(i) { st.target = i; }

  function step() {
    const dt = DT;
    st.t += dt;
    /* the demonstration (WATCH THE EXPERIENCE) drives the target itself */
    if (st.demo) {
      const e = st.t - st.demo.t0;
      let acc = 0, tg = -1;
      for (const [k, d] of st.demo.seq) { if (e < acc + d) { tg = k; break; } acc += d; }
      if (e >= acc && tg === -1 && e > st.demo.seq.reduce((a, s) => a + s[1], 0)) { st.demo = null; st.events.push({ type: 'demo-end' }); }
      st.target = tg;
    }
    /* weights: each eases from where it is to its goal — in over 600 ms, out over 800 ms — on an ease-out */
    for (let k = 0; k < 4; k++) {
      const goal = st.target === k ? 1 : 0;
      if (goal !== st.bGoal[k]) { st.bGoal[k] = goal; st.bFrom[k] = st.w[k]; st.bT0[k] = st.t; st.bDur[k] = goal ? BLEND_IN : BLEND_OUT; }
      st.w[k] = st.bFrom[k] + (goal - st.bFrom[k]) * easeOut(Math.min(1, (st.t - st.bT0[k]) / st.bDur[k]));
    }
    const [wI, wP, wU, wA] = st.w;
    /* rates */
    st.speed = (1 + wI * (S.speed[0] - 1) + wP * (S.speed[1] - 1) + wU * (S.speed[2] - 1) + wA * (S.speed[3] - 1)) * (reduced ? 0.55 : 1);
    st.flowU += dt * st.speed;
    st.flow = st.flowU % F.period;
    st.braid = (st.braid + dt * (0.32 + 0.95 * wP)) % TAU;
    st.swirl = (st.swirl + dt * (0.14 + 1.7 * wP + 0.5 * wA - 0.08 * wU)) % TAU;
    st.inPh = (st.inPh + dt * (0.10 + 1.5 * wI)) % 1000;
    st.outPh = (st.outPh + dt * (0.04 + 2.0 * wA)) % 1000;
    st.res = (st.res + dt * 0.9) % TAU;
    /* rings: natural spins, sped up by PROCESS, slowed and COUPLED by UNDERSTAND */
    const K = 0.75 * wU;
    const dsp = R.map((r, k) => {
      let c = 0; for (let j = 0; j < R.length; j++) if (j !== k) c += Math.sin(st.spin[j] - st.spin[k]);
      return r[4] * (1 + 3.4 * wP + 0.6 * wA) * (1 - 0.75 * wU) + K * c / (R.length - 1);
    });
    for (let k = 0; k < R.length; k++) {
      st.spin[k] = (st.spin[k] + dt * dsp[k]) % TAU;
      st.prec[k] = (st.prec[k] + dt * R[k][5] * (1 + 2.6 * wP)) % TAU;
      /* PROCESS throws the stack into gyroscope tilts; UNDERSTAND levels it */
      const tilt = (R[k][3] * (1 + 0.4 * wI) + 0.16 * wP * (0.6 + 0.4 * Math.sin(k * 2.1))) * (1 - 0.96 * wU);
      [st.tilt[k], st.tiltV[k]] = spring(st.tilt[k], st.tiltV[k], tilt, 0.9, dt);
    }
    [st.ringScale, st.ringScaleV] = spring(st.ringScale, st.ringScaleV, 1 + 0.085 * wA, 0.5, dt);
    /* the entrance: data starts pouring over the lip */
    st.intro = smooth(0.25, 1.5, st.t);

    /* PROCESS: the step clock. It starts from the top panel when PROCESS is chosen from rest (not when it is
       re-chosen while still showing — the visible sequence never jumps) */
    if (st.target === 1 && st.prevTarget !== 1 && st.w[1] < 0.05) st.procPh = 0;
    if (st.target === 0 && st.prevTarget !== 0 && st.w[0] < 0.3) st.ingT0 = st.t;
    st.procPh = (st.procPh + dt / PROC_STEP) % 4096;
    /* ACT: on entry, the SURGE — the lip flares and one front of light pours down the whole fall. While ACT
       holds, PULSES launch from the lip down the few bright streams, two to three a second at first and then
       one every ~0.5–0.75 s; each one that reaches the pond is a DECISION: a ripple, the pond's flash, +1. */
    if (st.target === 3 && st.prevTarget !== 3) {
      st.surge = { t0: st.t, s: 1 };
      st.nextDecision = st.t + 0.12;
      st.events.push({ type: 'act' });
    }
    st.prevTarget = st.target;
    if (st.target === 3 && st.w[3] > 0.25 && st.t >= st.nextDecision) {
      const a = acts[Math.floor(rng() * acts.length)];
      st.pulses.push({ i: a.index, t0: st.t, s: 0.85 + 0.3 * rng() });
      const young = st.surge ? st.t - st.surge.t0 : 9;
      st.nextDecision = st.t + (young < 1.5 ? 0.2 + 0.1 * rng() : 0.35 + 0.2 * rng());
    }
    for (let i = st.pulses.length - 1; i >= 0; i--) {
      if (st.t - st.pulses[i].t0 >= PULSE_T) {
        st.ripples.push({ t0: st.t, s: st.pulses[i].s }); st.decisions++; st.events.push({ type: 'decision' });
        st.pulses.splice(i, 1);
      }
    }
    if (st.surge && !st.surge.landed && st.t - st.surge.t0 >= PULSE_T) { st.surge.landed = true; st.ripples.push({ t0: st.t, s: 1.6 * st.surge.s }); }
    /* while ACT holds, the top keeps giving: a smaller wave every 2.4 s */
    if (st.target === 3 && st.surge && st.t - st.surge.t0 >= 2.4) st.surge = { t0: st.t, s: 0.6 };
    if (st.surge && st.t - st.surge.t0 > 6) st.surge = null;

    /* a quiet thought: one packet on one primary stream */
    if (st.t >= st.nextIdle && !reduced) {
      const p = prim[Math.floor(rng() * prim.length)];
      st.packets.push({ i: p.index, sp: p.sp, tr: st.flowU, s: 1 });
      st.nextIdle = st.t + S.idle[0] + rng() * (S.idle[1] - S.idle[0]);
    }
    for (let i = st.packets.length - 1; i >= 0; i--) {
      const pk = st.packets[i];
      if (st.flowU - pk.tr >= T_FALL / pk.sp) {
        st.pings.push({ t0: st.t, ring: Math.floor(rng() * R.length), a: rng() * TAU, s: pk.s }); st.events.push({ type: 'ping' });
        st.packets.splice(i, 1);
      }
    }
    for (let i = st.pings.length - 1; i >= 0; i--) if (st.t - st.pings[i].t0 > 4) st.pings.splice(i, 1);
    for (let i = st.ripples.length - 1; i >= 0; i--) if (st.t - st.ripples[i].t0 > 3.6) st.ripples.splice(i, 1);
    /* the readout's demo counters move with the fall: signals pour in faster while INGESTING */
    const [cI, cP, cU] = st.w;
    st.signals += dt * 2400 * (1 + 7 * cI) * st.intro;
    /* the transforms count ticks on PROCESS's own steps */
    const step = Math.floor(st.procPh);
    if (step !== st.procStep) { st.procStep = step; st.transforms = Math.round((12_000 + 1_800 * cP + (rng() - 0.5) * 900) / 10) * 10; }
    if (st.t - st.lastWin >= 0.5) {
      st.lastWin = st.t;
      st.seen = Math.round(4294 * (1 + (rng() - 0.5) * 0.06));
      st.kept = Math.max(1, Math.round(48 * (1 + (rng() - 0.5) * 0.12)));
      void cU;
    }
    record();
  }

  /* everything the renderer needs, in one flat bag */
  function snapshot() {
    const [wI, wP, wU, wA] = st.w;
    const tA = st.t - T_FALL;
    /* what is ARRIVING at the core now (left the lip one fall ago) */
    const arrive = at(tA, 4) * (1 + 0.65 * at(tA, 0) + 0.35 * at(tA, 1) - 0.3 * at(tA, 2));
    let ping = 0, pingRing = -1, pingA = 0, pingAge = 9;
    /* a ping rises over 60 ms (no light arrives in one frame), then decays */
    for (const p of st.pings) { const a = st.t - p.t0, at = Math.min(1, a / 0.06); const v = Math.exp(-a / 0.9) * p.s * at * at * (3 - 2 * at); if (v > ping) { ping = v; pingRing = p.ring; pingA = p.a; pingAge = a; } }
    const wave = [0, 0, 60, 9];
    /* the ripples: radius from the platform's edge outward, strength, width, age — newest first */
    const ripples = st.ripples.slice(-4).reverse().map((rp) => { const a = st.t - rp.t0; return [27 + a * 44, 1.3 * (rp.s || 1) * Math.exp(-a / 1.6) * Math.min(1, a / 0.06), 1.2 + a * 1.4, a]; });
    /* ACT's light in flight: [instance, age, strength, 0] (newest first, eight at most), and the surge: [age, strength] */
    const pulses = st.pulses.slice(-8).reverse().map((p) => [p.i, st.t - p.t0, p.s, 0]);
    const surge = st.surge ? [st.t - st.surge.t0, st.surge.s] : [99, 0];
    return {
      t: st.t, w: st.w.slice(), speed: st.speed,
      flow: st.flow, flowU: st.flowU, braid: st.braid, swirl: st.swirl, inPh: st.inPh, outPh: st.outPh, res: st.res,
      spin: st.spin.slice(), prec: st.prec.slice(), tilt: st.tilt.slice(), ringScale: st.ringScale,
      intro: st.intro, arrive, ping, pingRing, pingA, pingAge, wave,
      /* a packet fades in over its first 0.3 s of flow (released at full strength, its head popped onto the stream) */
      packets: st.packets.map((p) => { const b = Math.min(1, (st.flowU - p.tr) / 0.3); return [p.i, p.tr % F.period, p.s * b * b * (3 - 2 * b), p.sp]; }),
      target: st.target, demo: !!st.demo, ripples, pulses, surge, procPh: st.procPh, ingAge: st.t - st.ingT0,
      counters: { signals: st.signals, transforms: st.transforms, seen: st.seen, kept: st.kept, decisions: st.decisions },
    };
  }

  /* the texture the falling data reads: texel i = the state i/HZ seconds ago */
  function historyTexels(out) {
    for (let i = 0; i < HN; i++) {
      const t = st.t - i / HZ;
      for (let c = 0; c < 4; c++) out[i * 4 + c] = at(t, c);
      out[(HN + i) * 4] = at(t, 4); out[(HN + i) * 4 + 1] = 0; out[(HN + i) * 4 + 2] = 0; out[(HN + i) * 4 + 3] = 0;
    }
    return out;
  }

  function hover(name) {
    const i = name == null ? -1 : STATES.indexOf(name);
    if (st.demo) { st.demo = null; st.events.push({ type: 'demo-end' }); }
    setTarget(i);
  }
  /* the idle cycle: the four states, 5 s each, then rest */
  function demo() {
    st.demo = { t0: st.t, seq: [[0, 5], [1, 5], [2, 5], [3, 5], [-1, 0.01]] };
    st.events.push({ type: 'demo-start' });
  }
  function drainEvents() { const e = st.events; st.events = []; return e; }

  return { st, DT, step, snapshot, historyTexels, hover, demo, drainEvents, at };
}

/* scripted visitors, for stills and the build's checks:
   [[t, 'process'], [t2, null], ...] — the target changes at those times */
export function runScript(sys, script, T) {
  const ev = (script || []).slice().sort((a, b) => a[0] - b[0]);
  let k = 0;
  while (sys.st.t < T - 1e-9) {
    while (k < ev.length && ev[k][0] <= sys.st.t + 1e-9) { const s = ev[k][1]; if (s === 'demo') sys.demo(); else sys.hover(s); k++; }
    sys.step();
  }
  return sys;
}
