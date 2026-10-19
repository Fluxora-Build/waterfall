/* ============================================================================
   src/engine/geometry.js — every mesh and instance table. Pure; seeded.

   Streams are instanced ribbons: one template strip (u along the fall, ±1
   across) and three vec4 per instance. Layers:
     0 rain        faint columns hanging in the canyon air, slow, constant speed
     1 mid         the dense body of the fall
     2 primary     the bright, fluid streams
     3 filament    thin energy threads with travelling heads
     4 peripheral  side falls off the back cliff — they pour only while INGESTING
     5 rim         short threads rising from the aperture's rim (processed data leaving)
   Rates are quantised so rate × the flow period is a whole number of cells:
   the flow clock wraps every 600 s without a seam.
   ========================================================================== */
import { P } from './params.js';

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const qRate = (r) => Math.max(1, Math.round(r * P.fall.period)) / P.fall.period;
const C = P.canyon;
export const halfW = (z) => C.halfBack + (C.halfFront - C.halfBack) * Math.min(1, Math.max(0, (z - C.zBack) / (C.zFront - C.zBack)));

/* ---------------- streams ---------------- */
let STREAMS = null;
export function buildStreams() {
  if (STREAMS) return STREAMS;
  const S = P.streams, R = mulberry(20261004);
  const rows = [];   // [layer, A(4), B(4), C(4)]
  const push = (A, B, Cc) => rows.push([A, B, Cc]);
  const G = S.groups;
  /* mid: the body — denser toward the centre */
  for (let i = 0; i < S.mid; i++) {
    const u = (i + R() * 0.9) / S.mid * 2 - 1;
    const lane = Math.sign(u) * Math.pow(Math.abs(u), 0.92);
    const imp = R() < 0.14 ? 0.7 + R() * 0.3 : R() * 0.45;
    const edge = Math.max(0, Math.abs(lane) - 0.7) / 0.3, clus = 0.6 + 0.4 * Math.sin(lane * 11.3 + 1.7) * Math.sin(lane * 4.1);
    push([lane, R() * 2 - 1, 1, R() * 1000], [0.95 + R() * 0.5, (0.4 + R() * 0.55) * clus, 0.9 + R() * 0.22, Math.min(0.98, R() * (1 - 0.5 * edge) + 0.5 * edge)],
      [qRate(3.2 + R() * 3.6), 0.38 + R() * 0.42, imp, Math.min(G - 1, Math.floor((lane + 1) / 2 * G))]);
  }
  /* primary: bright, fluid — evenly spread, mostly present at rest */
  for (let i = 0; i < S.primary; i++) {
    const lane = ((i + 0.2 + R() * 0.6) / S.primary) * 2 - 1;
    push([lane * 0.8, (R() * 2 - 1) * 0.6, 2, R() * 1000], [2.1 + R() * 1.1, 1.0 + R() * 0.7, 0.95 + R() * 0.12, R() * 0.48],
      [qRate(2.6 + R() * 2.2), 0.5 + R() * 0.35, 0.55 + R() * 0.45, Math.min(G - 1, Math.floor((lane + 1) / 2 * G))]);
  }
  /* filaments: thin energy threads */
  for (let i = 0; i < S.filament; i++) {
    const lane = (R() * 2 - 1) * 0.8;
    push([lane, (R() * 2 - 1) * 0.4, 3, R() * 1000], [0.55, 1.6 + R() * 0.8, 1.0 + R() * 0.1, R() * 0.6],
      [qRate(0.35 + R() * 0.25), 1, 0.9, Math.min(G - 1, Math.floor((lane + 1) / 2 * G))]);
  }
  /* peripheral: side falls off the back cliff, INGEST only (thresholds above the rest density) */
  for (let i = 0; i < S.peripheral; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) / (S.peripheral / 2);
    const x = side * (84 + k * 70 + R() * 6);
    push([x, -497 + R() * 6, 4, R() * 1000], [1.5 + R() * 0.8, 0.55 + R() * 0.35, 0.9 + R() * 0.2, 0.64 + k * 0.33 + R() * 0.02],
      [qRate(2.4 + R() * 2), 0.45 + R() * 0.3, 345 + k * 120 + R() * 20, 0]);
  }
  /* rain: faint columns hanging in the canyon air */
  let n = 0, guard = 0;
  while (n < S.rain && guard++ < 20000) {
    const z = -545 + R() * 400, x = (R() * 2 - 1) * 280;
    if (Math.abs(x) > halfW(z) - 18) continue;
    if (Math.abs(x) < 70 && z < -380) continue;          // keep the fall's own column clear
    const top = 120 + R() * 520, len = 70 + R() * 220;
    push([x, z, 0, R() * 1000], [1.0 + R() * 0.7, 0.05 + R() * 0.1, 9 + R() * 9, R() * 0.9],
      [qRate(2.4 + R() * 2.6), 0.35 + R() * 0.4, top, len]);
    n++;
  }
  /* INGEST only: columns in the near air, in front of the walls, so the ingest wave reaches the screen edges (aB.w = 2 marks them) */
  for (let i = 0, g = 0; i < 120 && g < 20000; g++) {
    const z = -150 + R() * 160, x = (R() * 2 - 1) * 300;
    if (Math.abs(x) > halfW(z) - 10 || Math.abs(x) < 26) continue;
    const top = 60 + R() * 380, len = 60 + R() * 170;
    push([x, z, 0, R() * 1000], [0.8 + R() * 0.5, 0.05 + R() * 0.08, 11 + R() * 9, 2.0],
      [qRate(2.4 + R() * 2.6), 0.35 + R() * 0.4, top, len]);
    i++;
  }
  /* rim threads: processed data rising off the aperture's rim */
  for (let i = 0; i < S.rim; i++) {
    const a = (i + R() * 0.6) / S.rim * Math.PI * 2;
    push([a, P.core.aperture - 1.2, 5, R() * 1000], [0.42, 0.55 + R() * 0.5, 7 + R() * 5, R() * 0.7],
      [qRate(1.6 + R() * 1.6), 0.4 + R() * 0.4, 5 + R() * 15, 0]);
  }
  const data = new Float32Array(rows.length * 12);
  rows.forEach((r, i) => data.set([...r[0], ...r[1], ...r[2]], i * 12));
  const layerOf = rows.map((r) => r[0][2]);
  STREAMS = { data, count: rows.length, rows, layerOf };
  return STREAMS;
}
/* the speed factors of one layer's streams (state.js schedules packets on them) */
export function streamSpeeds(layer) {
  const L = { mid: 1, primary: 2, filament: 3 }[layer];
  const s = buildStreams();
  const out = [];
  s.rows.forEach((r, i) => { if (r[0][2] === L) out.push({ index: i, sp: r[1][2], lane: r[0][0], depth: r[0][1] }); });
  return out;
}
/* ACT's few: six primary streams spread evenly across the fall — the only ones that still reach the pond,
   and the ones the decisions travel down (the shader is told their instance indices) */
export function actStreams(n = 6) {
  const prim = streamSpeeds('primary').slice().sort((a, b) => a.lane - b.lane);
  return Array.from({ length: n }, (_, k) => prim[Math.min(prim.length - 1, Math.floor((k + 0.5) / n * prim.length))]);
}
/* where the primary streams land in the pool (xz) — the ripple sources */
export function impactPoints(max = 12) {
  const F = P.fall;
  const prim = streamSpeeds('primary');
  const step = Math.max(1, Math.floor(prim.length / max));
  const out = [];
  for (let i = 0; i < prim.length && out.length < max; i += step) {
    const p = prim[i];
    out.push([p.lane * F.impact.half, F.impact.z + p.depth * 6]);
  }
  return out;
}

/* the ribbon template: (u, side) pairs as a triangle strip */
export function stripTemplate(seg) {
  const a = new Float32Array((seg + 1) * 4);
  for (let i = 0; i <= seg; i++) a.set([i / seg, -1, i / seg, 1], i * 4);
  return a;
}

/* ---------------- grids (positions are made on the GPU from gl_VertexID) ---------------- */
export function gridIndex(nx, ny) {
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let k = 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  return idx;
}

/* ---------------- the platform ---------------- */
/* a chamfered square, as a function of angle: the distance to its outline */
function outlineR(th, half, ch) {
  /* the outline is the intersection of a square |x|,|z| ≤ half and a diamond |x|+|z| ≤ half(2 − ch) */
  const c = Math.cos(th), s = Math.sin(th);
  const rSq = half / Math.max(Math.abs(c), Math.abs(s));
  const rDi = half * (2 - ch) / (Math.abs(c) + Math.abs(s));
  return Math.min(rSq, rDi);
}
export function platformMesh() {
  const Pc = P.core, [cx, , cz] = Pc.c, ch = Pc.chamfer;
  const v = [], idx = [];
  /* nine floats: position, part, normal, tier, and the angle of the quad's centre (the iris opens by petal) */
  let ang = 0;
  const vert = (x, y, z, nx, ny, nz, part, tier) => { v.push(x + cx, y, z + cz, part, nx, ny, nz, tier, ang); return v.length / 9 - 1; };
  const N = 320;
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  /* tier sides: walk the outline; flat normals per straight run, so split at every angle step */
  Pc.tiers.forEach(([y0, y1, half], ti) => {
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      ang = (t0 + t1) / 2;
      const r0 = outlineR(t0, half, ch), r1 = outlineR(t1, half, ch);
      const x0 = Math.cos(t0) * r0, z0 = Math.sin(t0) * r0, x1 = Math.cos(t1) * r1, z1 = Math.sin(t1) * r1;
      let nx = z1 - z0, nz = -(x1 - x0); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (nx * (x0 + x1) + nz * (z0 + z1) < 0) { nx = -nx; nz = -nz; }
      const a = vert(x0, y0, z0, nx, 0, nz, 0, ti), b = vert(x1, y0, z1, nx, 0, nz, 0, ti);
      const c = vert(x1, y1, z1, nx, 0, nz, 0, ti), d = vert(x0, y1, z0, nx, 0, nz, 0, ti);
      quad(a, b, c, d);
    }
    /* the tier's top: from its outline in to the next tier's outline (or the aperture) */
    const inner = ti + 1 < Pc.tiers.length ? (th) => outlineR(th, Pc.tiers[ti + 1][2], ch) : () => Pc.aperture;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      ang = (t0 + t1) / 2;
      const o0 = outlineR(t0, half, ch), o1 = outlineR(t1, half, ch), i0 = inner(t0), i1 = inner(t1);
      const a = vert(Math.cos(t0) * o0, y1, Math.sin(t0) * o0, 0, 1, 0, 1, ti), b = vert(Math.cos(t1) * o1, y1, Math.sin(t1) * o1, 0, 1, 0, 1, ti);
      const c = vert(Math.cos(t1) * i1, y1, Math.sin(t1) * i1, 0, 1, 0, 1, ti), d = vert(Math.cos(t0) * i0, y1, Math.sin(t0) * i0, 0, 1, 0, 1, ti);
      quad(a, d, c, b);
    }
  });
  /* the well: walls and steps down to the pool */
  const top = Pc.tiers[Pc.tiers.length - 1][1];
  const rings = [[Pc.aperture, top], ...Pc.well, [Pc.pool, Pc.poolY]];
  for (let k = 0; k < rings.length - 1; k++) {
    const [r0, y0] = rings[k], [r1, y1] = rings[k + 1];
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      ang = (t0 + t1) / 2;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      /* inner wall: facing the axis */
      let a = vert(c0 * r0, y0, s0 * r0, -c0, 0, -s0, 2, k), b = vert(c1 * r0, y0, s1 * r0, -c1, 0, -s1, 2, k);
      let c = vert(c1 * r0, y1, s1 * r0, -c1, 0, -s1, 2, k), d = vert(c0 * r0, y1, s0 * r0, -c0, 0, -s0, 2, k);
      quad(a, b, c, d);
      /* step tread (not under the last ring — that is the pool) */
      if (k < rings.length - 2) {
        a = vert(c0 * r0, y1, s0 * r0, 0, 1, 0, 3, k); b = vert(c1 * r0, y1, s1 * r0, 0, 1, 0, 3, k);
        c = vert(c1 * r1, y1, s1 * r1, 0, 1, 0, 3, k); d = vert(c0 * r1, y1, s0 * r1, 0, 1, 0, 3, k);
        quad(a, d, c, b);
      }
    }
  }
  return { verts: new Float32Array(v), idx: new Uint32Array(idx) };
}

/* fins: on the base tier's four straight sides, clear of the chamfers */
export function finInstances() {
  const Pc = P.core, [cx, , cz] = Pc.c, F = Pc.fins;
  const [, , half] = Pc.tiers[0];
  const reach = half * (1 - Pc.chamfer) - 2.5;
  const out = [];
  for (let s = 0; s < 4; s++) {
    for (let o = -reach; o <= reach + 1e-6; o += F.spacing) {
      /* x, z (centre of the fin's base), orientation (0: fin plane ⟂ x, 1: ⟂ z), height */
      const h = F.height * (0.92 + 0.08 * Math.cos(o * 0.7));
      if (s === 0) out.push(cx + o, cz + half + F.depth / 2, 1, h);
      if (s === 1) out.push(cx + o, cz - half - F.depth / 2, 1, h);
      if (s === 2) out.push(cx + half + F.depth / 2, cz + o, 0, h);
      if (s === 3) out.push(cx - half - F.depth / 2, cz + o, 0, h);
    }
  }
  return new Float32Array(out);
}
/* a unit box (−0.5..0.5 in x and z, 0..1 in y) with flat normals */
export function boxTemplate() {
  const f = [
    [[1, 0, 0], [[.5, 0, -.5], [.5, 1, -.5], [.5, 1, .5], [.5, 0, .5]]],
    [[-1, 0, 0], [[-.5, 0, .5], [-.5, 1, .5], [-.5, 1, -.5], [-.5, 0, -.5]]],
    [[0, 0, 1], [[.5, 0, .5], [.5, 1, .5], [-.5, 1, .5], [-.5, 0, .5]]],
    [[0, 0, -1], [[-.5, 0, -.5], [-.5, 1, -.5], [.5, 1, -.5], [.5, 0, -.5]]],
    [[0, 1, 0], [[-.5, 1, -.5], [-.5, 1, .5], [.5, 1, .5], [.5, 1, -.5]]],
  ];
  const v = [];
  for (const [n, q] of f) for (const k of [0, 1, 2, 0, 2, 3]) v.push(...q[k], ...n);
  return new Float32Array(v);
}

/* ---------------- ground traces: a fan-out from each side of the platform ----------------
   Each trace leaves its side perpendicular, runs out a common distance, turns
   45° away from the side's centre until its offset has grown by a fixed
   factor, then runs straight out. Offsets grow monotonically, so no two
   traces ever cross (checked at build). */
export function traces() {
  const Pc = P.core, [cx, , cz] = Pc.c;
  const half = Pc.tiers[0][2] + Pc.fins.depth + 1.5;
  const R = mulberry(77);
  const lines = [];
  const sides = [
    { n: [0, 1], t: [1, 0], count: 34, run: 9, k: 2.3, maxLen: 520 },     // front, toward the camera
    { n: [1, 0], t: [0, 1], count: 30, run: 7, k: 1.7, maxLen: 260 },     // right
    { n: [-1, 0], t: [0, 1], count: 30, run: 7, k: 1.7, maxLen: 260 },    // left
    { n: [0, -1], t: [1, 0], count: 22, run: 4, k: 1.15, maxLen: 34 },    // back, toward the cliff
  ];
  for (const sd of sides) {
    const span = half * (1 - Pc.chamfer) - 4;
    for (let j = 0; j < sd.count; j++) {
      const o = -span + (2 * span) * (j + 0.5) / sd.count;
      if (R() < 0.12) continue;                         // a few gaps, like a real fan-out
      const p0 = [cx + sd.n[0] * half + sd.t[0] * o, cz + sd.n[1] * half + sd.t[1] * o];
      const run = sd.run + R() * 2;
      const p1 = [p0[0] + sd.n[0] * run, p0[1] + sd.n[1] * run];
      const shift = Math.abs(o) * (sd.k - 1), sg = Math.sign(o) || 1;
      const p2 = [p1[0] + sd.n[0] * shift + sd.t[0] * shift * sg, p1[1] + sd.n[1] * shift + sd.t[1] * shift * sg];
      const len = sd.maxLen * (0.35 + 0.65 * R());
      const p3 = [p2[0] + sd.n[0] * len, p2[1] + sd.n[1] * len];
      /* clip to the floor between the walls */
      const pts = [p0, p1, p2, p3];
      const clipped = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = clipped[clipped.length - 1], b = pts[i];
        const inside = (p) => Math.abs(p[0]) < halfW(p[1]) - 12 && p[1] < 130 && p[1] > C.zBack + 18;
        if (inside(b)) { clipped.push(b); continue; }
        let lo = 0, hi = 1;
        for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; inside([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]) ? (lo = m) : (hi = m); }
        clipped.push([a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo]);
        break;
      }
      lines.push({ pts: clipped, w: 0.42 + R() * 0.38, seed: R() });
    }
  }
  /* ribbon vertices: centre x, z, s (arc length from the platform), side | miter normal x, z, seed, length | width */
  const v = [], idx = [];
  for (const ln of lines) {
    let s = 0;
    const base = v.length / 9;
    const pts = ln.pts;
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      /* miter: average of the adjacent segment normals */
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      let nx = -tz, nz = tx;
      let mit = 1;
      if (i > 0 && i < pts.length - 1) {
        const d0 = [pts[i][0] - a[0], pts[i][1] - a[1]], l0 = Math.hypot(...d0) || 1;
        const n0 = [-d0[1] / l0, d0[0] / l0];
        mit = 1 / Math.max(0.5, n0[0] * nx + n0[1] * nz);
      }
      for (const sd of [-1, 1]) v.push(pts[i][0], pts[i][1], s, sd, nx * mit, nz * mit, ln.seed, total, ln.w);
    }
    for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  return { verts: new Float32Array(v), idx: new Uint32Array(idx), lines };
}

/* ---------------- the resonance (UNDERSTAND): nodes of the field ----------------
   Φ(r, θ) = cos(nθ)·cos(k r) about the impact, in the fall's plane: nodal
   rays at θ = ±(2j+1)π/2n from the vertical and nodal circles every
   `spacing` metres. The nodes are where the two meet inside the fall. */
export function resonanceNodes() {
  const F = P.fall, M = P.state.mode;
  const out = [];
  const halfAt = (y) => {
    const u = (F.lip.y - y) / (F.lip.y - F.impact.y);
    const s = Math.min(1, Math.max(0, (u - 0.58) / 0.42)); const A = Math.pow(s * s * (3 - 2 * s), 1.7);
    return F.lip.half * (1 + P.fall.bow * Math.sin(Math.PI * u)) * (1 - A) + F.impact.half * A;
  };
  for (let j = 0; j < M.n / 2; j++) {
    const th = (2 * j + 1) * Math.PI / (2 * M.n);
    for (let i = 0; i < 12; i++) {
      const r = M.first + i * M.spacing;
      for (const sg of [-1, 1]) {
        const x = sg * r * Math.sin(th), y = F.impact.y + r * Math.cos(th);
        if (y > F.lip.y - 8 || y < F.impact.y + 8) continue;
        if (Math.abs(x) > halfAt(y) * 0.97) continue;
        const u = (F.lip.y - y) / (F.lip.y - F.impact.y);
        const z = F.lip.z + (F.impact.z - F.lip.z) * (1 - Math.pow(1 - u, 1.6));
        out.push([x, y, z, (i * 7 + j * 3) % 11 / 11]);
      }
    }
  }
  return out.slice(0, P.particles.nodes);
}

/* THE PORTAL'S WELL: nested stepped rings under the pool — for each ring a wall facing the axis and a
   tread (an annulus facing up) into the next, then the light at the bottom. Positions carry the ring
   coordinate q in y (the vertex shader turns it into depth with wellD, so the rings can spread apart):
   [x, q, z, kind (0 tread, 1 wall, 2 the light)] [nx, ny, nz, ring] */
export function wellMesh() {
  const W = P.well, [cx, , cz] = P.core.c, N = 192;
  const v = [], idx = [];
  const vert = (r, q, th, nx, ny, nz, kind, k) => { v.push(cx + Math.cos(th) * r, q, cz + Math.sin(th) * r, kind, nx, ny, nz, k); return v.length / 8 - 1; };
  const rk = (k) => W.r0 * Math.pow(W.shrink, k);
  for (let k = 0; k < W.rings; k++) {
    const r0 = rk(k), r1 = rk(k + 1), qa = k, qb = k + W.riser;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      /* the wall, facing the axis */
      let a = vert(r0, qa, t0, -c0, 0, -s0, 1, k), b = vert(r0, qa, t1, -c1, 0, -s1, 1, k);
      let c = vert(r0, qb, t1, -c1, 0, -s1, 1, k), d = vert(r0, qb, t0, -c0, 0, -s0, 1, k);
      idx.push(a, c, b, a, d, c);
      /* the tread, facing up, from this wall in to the next */
      a = vert(r0, qb, t0, 0, 1, 0, 0, k); b = vert(r0, qb, t1, 0, 1, 0, 0, k);
      c = vert(r1, qb, t1, 0, 1, 0, 0, k); d = vert(r1, qb, t0, 0, 1, 0, 0, k);
      idx.push(a, d, c, a, c, b);
    }
  }
  /* the light: a disc closing the bottom */
  const q = W.rings + 0.25, rL = rk(W.rings);
  const ctr = v.length / 8; v.push(cx, q, cz, 2, 0, 1, 0, W.rings);
  for (let i = 0; i <= N; i++) { const t = (i / N) * Math.PI * 2; vert(rL * 1.02, q, t, 0, 1, 0, 2, W.rings); }
  for (let i = 0; i < N; i++) idx.push(ctr, ctr + 2 + i, ctr + 1 + i);
  return { verts: new Float32Array(v), idx: new Uint32Array(idx) };
}
