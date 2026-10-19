/* ============================================================================
   src/engine/chamber.js — THE RESOLUTION CHAMBER: what is on the other side
   of the machine. Every number of it, and its geometry. Pure.

   The camera comes through the aperture at the bottom of the well and out
   above a second core: the same machine, seen from where its work ends. The
   data still falls into it from above (the column); out of its base run
   three output channels across the floor to three pedestals in front of it,
   each with its own glyph of light and its own colour — the three items of
   config.js's ending. Under each pedestal the page hangs its card.

   Units are metres, the floor is y = 0, the core's axis is x = z = 0, and
   the camera looks from +z toward −z (the outputs are in front of the core).
   ========================================================================== */

import config from '../../config.js';

/* a CSS hex colour as the light's rgb (0..1) */
const rgb = (hex) => { const h = String(hex).replace('#', ''); const x = h.length === 3 ? h.replace(/./g, 'export const CH = {export const CH = {') : h; return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255); };
const ITEMS = (config.ending && config.ending.items) || [];
const OUT_DEF = [['layers', '#9ef5ff'], ['prism', '#ffcc75'], ['network', '#6bd6ff']];
const outOf = (k, x, z) => { const it = ITEMS[k] || {}; return { x, z, col: rgb(it.colour || OUT_DEF[k][1]), glyph: it.glyph || OUT_DEF[k][0] }; };

export const CH = {
  /* the core: a lathe. Profile from the outside in, [r, y]; every segment is one ring of the shader's
     (treads are horizontal, walls vertical). The pool sits inside the last ring. */
  core: {
    profile: [[132, 0], [132, 3.5], [121, 3.5], [121, 9], [110, 9], [110, 15], [97, 15], [97, 21.5], [84, 21.5], [84, 25],
      [62, 25], [62, 28.5], [54, 28.5], [54, 24.5], [42, 24.5], [42, 22.5], [33, 22.5]],
    poolR: 33, poolY: 22,
    seg: 288,
  },
  /* the column of data falling into the pool from above */
  col: { r: 27, top: 430, bottom: 22.5 },
  /* the outputs: where each pedestal stands (front face toward the camera), its colour and its glyph (config.ending.items) */
  outs: [outOf(0, -170, 460), outOf(1, 0, 478), outOf(2, 170, 460)],
  pedestal: { w: 62, h: 9, d: 30, plinth: [44, 3.2, 20] },
  glyphY: 24, glyphS: 11,
  /* the room: pillars on an arc behind and beside the core */
  pillars: { n: 30, r0: 285, r1: 330, h0: 170, h1: 330, w: 18, d: 22, arc: [-2.25, 2.25] },
  floor: { half: 900, tile: 24 },
};

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* the core as a lathe: [x, y, z, ring] [nx, ny, nz, kind (0 tread, 1 wall)] [r at rest, ao] — 10 floats */
export function coreMesh() {
  const P = CH.core.profile, N = CH.core.seg;
  const v = [], idx = [];
  const vert = (r, y, th, nx, ny, nz, ring, kind, ao) => { v.push(Math.cos(th) * r, y, Math.sin(th) * r, ring, nx, ny, nz, kind, r, ao); return v.length / 10 - 1; };
  for (let k = 0; k < P.length - 1; k++) {
    const [r0, y0] = P[k], [r1, y1] = P[k + 1];
    const tread = Math.abs(y1 - y0) < 1e-6;
    /* a wall faces out when its tread above is further in (r1 == r0, the profile goes up), in when it goes down */
    const up = y1 > y0;
    /* corners where a wall meets the tread below it are darker (a cheap, fixed occlusion term) */
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      if (tread) {
        const a = vert(r0, y0, t0, 0, 1, 0, k, 0, 1), b = vert(r0, y0, t1, 0, 1, 0, k, 0, 1);
        const c = vert(r1, y1, t1, 0, 1, 0, k, 0, 1), d = vert(r1, y1, t0, 0, 1, 0, k, 0, 1);
        idx.push(a, d, c, a, c, b);
      } else {
        const s = up ? 1 : -1;
        const n0 = [Math.cos(t0) * s, Math.sin(t0) * s], n1 = [Math.cos(t1) * s, Math.sin(t1) * s];
        const a = vert(r0, y0, t0, n0[0], 0, n0[1], k, 1, up ? 0.45 : 1), b = vert(r0, y0, t1, n1[0], 0, n1[1], k, 1, up ? 0.45 : 1);
        const c = vert(r1, y1, t1, n1[0], 0, n1[1], k, 1, up ? 1 : 0.5), d = vert(r1, y1, t0, n0[0], 0, n0[1], k, 1, up ? 1 : 0.5);
        if (up) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      }
    }
  }
  return { verts: new Float32Array(v), idx: new Uint32Array(idx), rings: P.length - 1 };
}

/* a unit box (centred on x and z, base at y = 0): [x, y, z] [nx, ny, nz] — 36 vertices */
export function unitBox() {
  const F = [
    [[1, 0, 0], [[0.5, 0, -0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5]]],
    [[-1, 0, 0], [[-0.5, 0, 0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [-0.5, 1, 0.5]]],
    [[0, 1, 0], [[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]]],
    [[0, -1, 0], [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]]],
    [[0, 0, 1], [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]]],
    [[0, 0, -1], [[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]]],
  ];
  const out = [];
  for (const [n, q] of F) for (const i of [0, 1, 2, 0, 2, 3]) out.push(...q[i], ...n);
  return new Float32Array(out);
}

/* the solids: [x, z, yaw, kind] [w, h, d, y0] [r, g, b, seed] — kind 0 pillar, 1 pedestal, 2 plinth */
export function solidInstances() {
  const R = mulberry(20261007), out = [];
  const Pl = CH.pillars;
  for (let i = 0; i < Pl.n; i++) {
    const a = Pl.arc[0] + (Pl.arc[1] - Pl.arc[0]) * (i + 0.5) / Pl.n;   // 0 = straight behind the core (−z)
    const r = Pl.r0 + (Pl.r1 - Pl.r0) * R();
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    out.push(x, z, -a, 0, Pl.w * (0.8 + 0.5 * R()), Pl.h0 + (Pl.h1 - Pl.h0) * R(), Pl.d, 0, 0.3, 0.85, 0.95, R());
  }
  const Pd = CH.pedestal;
  for (const o of CH.outs) {
    out.push(o.x, o.z, 0, 1, Pd.w, Pd.h, Pd.d, 0, ...o.col, R());
    out.push(o.x, o.z, 0, 2, Pd.plinth[0], Pd.plinth[1], Pd.plinth[2], Pd.h, ...o.col, R());
  }
  return new Float32Array(out);
}

/* the output channels: segments along the floor from the core's skirt to each pedestal's back —
   [x0, z0, x1, z1] [r, g, b, lane] [channel, len, 0, 0]; three lanes per channel */
export function pathSegments() {
  const out = [];
  const rStart = CH.core.profile[0][0] + 2;
  CH.outs.forEach((o, k) => {
    const back = o.z - CH.pedestal.d / 2 - 1;
    const dir = Math.atan2(o.x, back);
    const sx = Math.sin(dir) * rStart, sz = Math.cos(dir) * rStart;
    const len = Math.hypot(o.x - sx, back - sz);
    const nx = Math.cos(dir), nz = -Math.sin(dir);
    for (const lane of [-1, 0, 1]) {
      const off = lane * 3.2;
      out.push(sx + nx * off, sz + nz * off, o.x + nx * off, back + nz * off, ...o.col, lane, k, len, 0, 0);
    }
  });
  return new Float32Array(out);
}

/* THE GLYPHS, by name (config.ending.items[k].glyph): line segments in their own frame — y up from the glyph's foot,
   about −1..1 across, the unit ≈ CH.glyphS metres; each turns about its vertical axis over its pedestal */
const ring = (c, r, n = 14) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]; });
export const GLYPHS = {
  /* three stacked diamonds: many signals collapsing into one pattern */
  layers(add, poly) { for (const [h, s] of [[0, 1.0], [0.45, 0.86], [0.9, 0.72]]) poly([[0, h, -s], [s, h, 0], [0, h, s], [-s, h, 0]]); },
  /* a hexagonal prism's outline with a bolt through it: an action triggered */
  prism(add, poly) {
    const hx = (y) => Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 + Math.PI / 6; return [Math.cos(a) * 0.95, y, Math.sin(a) * 0.95]; });
    poly(hx(0)); poly(hx(1.25));
    for (let i = 0; i < 6; i += 2) add(hx(0)[i], hx(1.25)[i]);
    poly([[0.18, 1.55, 0], [-0.32, 0.62, 0], [0.12, 0.62, 0], [-0.2, -0.3, 0]], false);
  },
  /* three nodes and the paths between them */
  network(add, poly) {
    const nodes = [[0, 1.45, 0], [-0.82, 0.25, 0], [0.82, 0.25, 0]];
    add(nodes[0], nodes[1]); add(nodes[0], nodes[2]); add(nodes[1], nodes[2]);
    for (const c of nodes) poly(ring(c, 0.24));
  },
  /* a bolt with depth: the outline twice, its corners joined */
  bolt(add, poly) {
    const B = [[0.32, 1.6], [-0.5, 0.58], [0.02, 0.58], [-0.3, -0.3], [0.56, 0.8], [0.06, 0.8]];
    const f = B.map(([x, y]) => [x, y, 0.16]), k = B.map(([x, y]) => [x, y, -0.16]);
    poly(f); poly(k);
    for (let i = 0; i < B.length; i++) add(f[i], k[i]);
  },
  /* three waves in step, one behind the other: an even rhythm */
  wave(add, poly) {
    for (const [z, y] of [[-0.42, 0.3], [0, 0.72], [0.42, 1.14]]) {
      poly(Array.from({ length: 25 }, (_, i) => { const x = -1 + i / 12; return [x, y + 0.22 * Math.sin(x * Math.PI * 1.5), z]; }), false);
    }
  },
  /* a feather: the shaft, the vane's two edges and a few barbs */
  feather(add, poly) {
    const at = (t) => [-0.52 + 1.04 * t, -0.3 + 1.9 * t - 0.25 * t * t, 0];
    const shaft = Array.from({ length: 13 }, (_, i) => at(i / 12));
    poly(shaft, false);
    const vane = (side) => Array.from({ length: 11 }, (_, i) => { const t = 0.18 + 0.82 * i / 10, p = at(t), w = 0.46 * Math.sin(Math.PI * Math.min(1, (t - 0.18) / 0.82)) * (1 - 0.25 * t); return [p[0] - side * w * 0.86, p[1] + side * w * 0.5, side * 0.08]; });
    const L = vane(1), R = vane(-1);
    poly(L, false); poly(R, false);
    for (const i of [2, 4, 6, 8]) { add(at(0.18 + 0.82 * i / 10), L[i]); add(at(0.18 + 0.82 * i / 10), R[i]); }
  },
};
/* [ax, ay, az, bx] [by, bz, pedestal, 0] */
export function glyphSegments() {
  const segs = [];
  CH.outs.forEach((o, g) => {
    const add = (a, b) => segs.push(a[0], a[1], a[2], b[0], b[1], b[2], g, 0);
    const poly = (pts, closed = true) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) add(pts[i], pts[(i + 1) % pts.length]); };
    (GLYPHS[o.glyph] || GLYPHS.layers)(add, poly);
  });
  return new Float32Array(segs);
}

/* where a pedestal's front face is in the world: its four corners (for the interface: the face becomes the card) */
export function pedestalFace(k) {
  const o = CH.outs[k], P = CH.pedestal, z = o.z + P.d / 2;
  return [[o.x - P.w / 2, 0, z], [o.x + P.w / 2, 0, z], [o.x + P.w / 2, P.h, z], [o.x - P.w / 2, P.h, z]];
}
