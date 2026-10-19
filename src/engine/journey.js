/* ============================================================================
   src/engine/journey.js — the scroll journey through the system. Pure.

   SCROLL POSITION IS NARRATIVE POSITION. Everything below is a function of
   the page's scroll through the hero's track, p ∈ [0, 1] (followed by the
   runtime's camera spring). Stop scrolling and the journey stops; scroll
   back and every frame of it plays backwards. Nothing is triggered once.

   RAW INFORMATION → CONVERGENCE → COMPUTATION → RESOLUTION → CLARITY
     the hero      the canyon, the falls, the copy and the rail
     the descent   into the fall, down its lines, onto the pond (unchanged)
     the portal    over the pond the camera begins to roll; the orb's surface
                   irises open and the machine under it shows: a well of
                   nested rings, lit from the bottom
     acceleration  the camera drops down the axis — the rings rush up and
                   spread apart, the lens widens, the lines stretch
     breakthrough  the light at the bottom fills everything (never black)
     the chamber   out of the light above a second core: the camera pulls
                   back and up with momentum, unrolling, into the wide view
     the outputs   three channels run from the core to three pedestals
     the room      the camera settles on the whole room — the column, the
                   pillars, the glyphs turning over their pedestals — and
                   the page scrolls on to the section after it
   One camera, one world-line: the switch from the canyon to the chamber
   happens inside the white of the breakthrough.

   p → s (the journey's clock) is a monotone cubic through keys: flat holds
   (equal s) settle in and out; spacing sets the pace — it accelerates into
   the portal and decelerates out of it. The camera is monotone cubic
   Hermite per component through its keys (no overshoot, no stop at a key);
   inside the well it follows the well's own depth function, so it falls
   through the rings wherever they have spread to.
   ========================================================================== */
import { P, wellD } from './params.js';
import { CH } from './chamber.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const DOWN = -Math.PI / 2 + 0.0015;

/* the journey's clock */
export const S_IN = 0.29, S_ORB = 0.64, SWITCH = 0.88, S_ROOM = 0.97, S_END = 1;
export const PH = { wf: [0, 0.22], enter: [0.22, 0.42], conv: [0.42, 0.6], orb: [0.6, 0.66], portal: [0.66, 0.8], plunge: [0.8, SWITCH], chamber: [SWITCH, 0.955], clarity: [0.955, 1] };

/* THE PAGE → THE JOURNEY: [p, s] keys, monotone between them.
   NO STUCK MOMENTS, SOFT CHECKPOINTS. Nothing holds the camera still but the last 1.5 % of the scroll, and the
   moments that matter are CHECKPOINTS — the camera slows to 35–60 % of its pace around them and carries on through
   (CHECKPOINTS below; the soft settle eases a hand that stops just short of one onto it). The pace comes from the
   picture's own rate (the sweep) and from comfort caps per wheel notch (100 px at 1456 × 819): the view turns at
   most 5°, rolls 22°, travels 60 m (90 in the chamber), the lens 5 %, the light 0.3 — motion inside the light is not
   capped. So the turn down into the waterfall is one even curve over ~25 notches. The end lands like a parabola (the
   velocity reaches 0 at p 0.985 — C¹), and the page then scrolls on. (Solved numerically from a sweep of the camera.) */
export const P2S = [
  [0, 0], [0.004, 0.004732], [0.008, 0.009519], [0.012, 0.014451], [0.016, 0.019647], [0.02, 0.025254], [0.024, 0.031485], [0.028, 0.038717], [0.032, 0.047611], [0.036, 0.058963], [0.04, 0.071955], [0.044, 0.084953], [0.048, 0.097882], [0.052, 0.110699], [0.056, 0.123469], [0.06, 0.136077], [0.064, 0.148512], [0.068, 0.160892], [0.072, 0.173102], [0.076, 0.185048], [0.08, 0.196716], [0.084, 0.207934], [0.088, 0.218534], [0.092, 0.228355], [0.096, 0.237171], [0.1, 0.244584], [0.104, 0.250282], [0.108, 0.254787], [0.112, 0.25859], [0.116, 0.261971], [0.12, 0.265089], [0.124, 0.26804], [0.128, 0.270884], [0.132, 0.273664], [0.136, 0.276411], [0.14, 0.279152], [0.144, 0.281904], [0.148, 0.284673], [0.152, 0.287444], [0.156, 0.290186], [0.16, 0.292867], [0.164, 0.29547], [0.168, 0.298009], [0.172, 0.300512], [0.176, 0.302999], [0.18, 0.305481], [0.184, 0.307961], [0.188, 0.310443], [0.192, 0.312927], [0.196, 0.315424], [0.2, 0.317949], [0.204, 0.32053], [0.208, 0.323203], [0.212, 0.326014], [0.216, 0.328986], [0.22, 0.332082], [0.224, 0.335224], [0.228, 0.338374], [0.232, 0.341525], [0.236, 0.344678], [0.24, 0.34784], [0.244, 0.351022], [0.248, 0.354242], [0.252, 0.357517], [0.256, 0.360872], [0.26, 0.364332], [0.264, 0.367934], [0.268, 0.371726], [0.272, 0.37574], [0.276, 0.37991], [0.28, 0.384122], [0.284, 0.388349], [0.288, 0.392612], [0.292, 0.396941], [0.296, 0.40137], [0.3, 0.405943], [0.304, 0.410716], [0.308, 0.415772], [0.312, 0.421237], [0.316, 0.427337], [0.32, 0.43452], [0.324, 0.443127], [0.328, 0.452224], [0.332, 0.460873], [0.336, 0.469136], [0.34, 0.476999], [0.344, 0.484456], [0.348, 0.491563], [0.352, 0.498466], [0.356, 0.505265], [0.36, 0.511905], [0.364, 0.518381], [0.368, 0.524791], [0.372, 0.531182], [0.376, 0.537529], [0.38, 0.543851], [0.384, 0.550175], [0.388, 0.556561], [0.392, 0.563267], [0.396, 0.570889], [0.4, 0.580066], [0.404, 0.590587], [0.408, 0.602356], [0.412, 0.615289], [0.416, 0.624011], [0.42, 0.629907], [0.424, 0.63472], [0.428, 0.639115], [0.432, 0.643442], [0.436, 0.647983], [0.44, 0.653132], [0.444, 0.659723], [0.448, 0.669687], [0.452, 0.681777], [0.456, 0.692886], [0.46, 0.702715], [0.464, 0.711168], [0.468, 0.718443], [0.472, 0.72468], [0.476, 0.730034], [0.48, 0.734651], [0.484, 0.738653], [0.488, 0.742178], [0.492, 0.745358], [0.496, 0.748293], [0.5, 0.751053], [0.504, 0.753683], [0.508, 0.756216], [0.512, 0.758677], [0.516, 0.761081], [0.52, 0.763442], [0.524, 0.76577], [0.528, 0.768072], [0.532, 0.770357], [0.536, 0.772629], [0.54, 0.774894], [0.544, 0.777156], [0.548, 0.779417], [0.552, 0.781679], [0.556, 0.783941], [0.56, 0.786206], [0.564, 0.788484], [0.568, 0.790787], [0.572, 0.79314], [0.576, 0.795568], [0.58, 0.798098], [0.584, 0.800755], [0.588, 0.803563], [0.592, 0.806562], [0.596, 0.809813], [0.6, 0.813315], [0.604, 0.816865], [0.608, 0.820203], [0.612, 0.82326], [0.616, 0.826089], [0.62, 0.828754], [0.624, 0.831299], [0.628, 0.83375], [0.632, 0.836122], [0.636, 0.83843], [0.64, 0.840694], [0.644, 0.842937], [0.648, 0.845172], [0.652, 0.847405], [0.656, 0.849638], [0.66, 0.851871], [0.664, 0.854103], [0.668, 0.856333], [0.672, 0.85855], [0.676, 0.86074], [0.68, 0.862868], [0.684, 0.86488], [0.688, 0.866727], [0.692, 0.868408], [0.696, 0.869962], [0.7, 0.871437], [0.704, 0.872867], [0.708, 0.874277], [0.712, 0.875679], [0.716, 0.877082], [0.72, 0.878496], [0.724, 0.879938], [0.728, 0.881435], [0.732, 0.883028], [0.736, 0.884765], [0.74, 0.886673], [0.744, 0.888719], [0.748, 0.890826], [0.752, 0.892923], [0.756, 0.894947], [0.76, 0.896848], [0.764, 0.89861], [0.768, 0.900247], [0.772, 0.901787], [0.776, 0.903257], [0.78, 0.904676], [0.784, 0.906062], [0.788, 0.907426], [0.792, 0.908777], [0.796, 0.910122], [0.8, 0.911463], [0.804, 0.912803], [0.808, 0.914142], [0.812, 0.915482], [0.816, 0.916823], [0.82, 0.918168], [0.824, 0.91952], [0.828, 0.920885], [0.832, 0.922276], [0.836, 0.923708], [0.84, 0.925205], [0.844, 0.926804], [0.848, 0.928562], [0.852, 0.930571], [0.856, 0.932968], [0.86, 0.935913], [0.864, 0.939485], [0.868, 0.943677], [0.872, 0.948662], [0.876, 0.955027], [0.88, 0.961044], [0.884, 0.965501], [0.888, 0.968518], [0.892, 0.970558], [0.896, 0.972131], [0.9, 0.973478], [0.904, 0.974717], [0.908, 0.975917], [0.912, 0.977135], [0.916, 0.978425], [0.92, 0.979866], [0.924, 0.981591], [0.928, 0.983849], [0.932, 0.986813], [0.936, 0.989727], [0.94, 0.992277], [0.944, 0.994463], [0.948, 0.996289], [0.952, 0.997753], [0.956, 0.998852], [0.96, 0.999586], [0.964, 0.999946], [0.9644, 0.999968], [0.965, 1], [1, 1],
];
export const CHECKPOINTS = [{ name: 'hero', s: 0, p: 0.0000 }, { name: 'streams', s: 0.265, p: 0.1199 }, { name: 'orb', s: 0.64, p: 0.4288 }, { name: 'room', s: 0.97, p: 0.8908 }, { name: 'brand', s: 1, p: 0.965 }];



/* monotone cubic Hermite through [x, y] pairs (Fritsch–Carlson): C¹, no overshoot. Prepared once (the tangents);
   evaluated by binary search without allocating — the frame loop calls it every frame. */
export function monoPrep(xs, ys) {
  const n = xs.length, X = Float64Array.from(xs), Y = Float64Array.from(ys), d = new Float64Array(n - 1), m = new Float64Array(n);
  for (let k = 0; k < n - 1; k++) d[k] = (Y[k + 1] - Y[k]) / (X[k + 1] - X[k]);
  m[0] = d[0];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  m[n - 1] = d[n - 2];
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) { m[k] = 0; m[k + 1] = 0; continue; }
    const a = m[k] / d[k], b = m[k + 1] / d[k], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[k] = t * a * d[k]; m[k + 1] = t * b * d[k]; }
  }
  return { X, Y, m, n };
}
export function monoAt(P, x) {
  const X = P.X, n = P.n;
  if (x <= X[0]) return P.Y[0];
  if (x >= X[n - 1]) return P.Y[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (X[mid] <= x) lo = mid; else hi = mid; }
  const i = lo, hx = X[i + 1] - X[i], t = (x - X[i]) / hx, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * P.Y[i] + (t3 - 2 * t2 + t) * hx * P.m[i] + (-2 * t3 + 3 * t2) * P.Y[i + 1] + (t3 - t2) * hx * P.m[i + 1];
}
const P2S_PREP = monoPrep(P2S.map((k) => k[0]), P2S.map((k) => k[1]));
export const sOf = (p) => monoAt(P2S_PREP, clamp01(p));
/* the first page position that reaches journey position s (bisection; never in the frame loop) */
export const pOfS = (s) => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (sOf(m) < s) a = m; else b = m; } return b; };

/* the canyon: [s, eye xyz, yaw, pitch, f, ppx, ppy] — key 0 is replaced by the responsive hero frame.
   Over the orb the camera looks straight down the core's axis, so its yaw IS its roll. */
export const KA = [
  [0.00, 0, 62, 60, 0, 0, 2.266, 0, -0.37],
  [0.10, 0, 92, -95, 0, 0.03, 2.2, 0, -0.26],
  [0.21, 0, 142, -258, 0, 0.11, 2.06, 0, -0.07],
  [0.30, 0, 206, -382, 0.05, -0.28, 1.9, 0, 0],
  [0.37, 0, 232, -437, 0.18, -0.98, 1.74, 0, 0],
  [0.44, 0, 227, -452, 0.34, -1.44, 1.6, 0, 0],
  [0.60, 0, 175, -423, 0.95, -1.566, 1.6, 0, 0],
  [S_ORB, 0, 158, -421, 1.10, DOWN, 1.6, 0, 0],
  [0.74, 0, 92, -420.4, 1.55, DOWN, 1.52, 0, 0],
  [0.80, 0, 24.0, -420, 2.45, DOWN, 1.3, 0, 0],
];
/* THE PLUNGE: from the aperture down the well, on an accelerating curve, in ring coordinates (q) */
const W = P.well, Q0 = -1.25, Q1 = W.rings - 0.35;
export const sepOf = (s) => sm(0.8, 0.875, s);
/* THE JOIN AT THE APERTURE IS C¹: the canyon's last keys arrive at the aperture moving —
   falling ~1,100 m and rolling ~15 rad per unit of s — and the plunge used to start from rest (u², 3.6u²), so the
   camera stopped dead at s 0.80 for a few pixels of scroll and set off again: a stall at the mouth of the well. Now
   the plunge starts at exactly the speed the canyon's track ends with (its end tangents, read off the keys): each
   curve gains a term k·u(1 − u)² — its whole slope at the aperture, gone by the bottom of the well — so the fall still
   reaches the last rings late, inside the light (an even fall passed them before the light had built, and the black
   under the last ring showed for two frames). */
const KA_END = (() => {
  const n = KA.length, d = (c) => (KA[n - 1][c] - KA[n - 2][c]) / (KA[n - 1][0] - KA[n - 2][0]);
  return { vy: d(2), vyaw: d(4), vf: d(6) };   // the monotone track's end tangent is its last secant
})();
const PL = (() => {
  const L = SWITCH - 0.8, dWdq = W.step * (1 + 2 * W.grow * Q0);          // d wellD / dq at the aperture (sep 0, sep' 0)
  const c = Math.max(0, (-KA_END.vy / dWdq) * L / (Q1 - Q0));                // e'(0): the aperture's own pace
  return { c, a: KA_END.vyaw * L, f: KA_END.vf * L + 0.5 };
})();
export function plungeAt(s, out = newCam()) {
  const u = clamp01((s - 0.8) / (SWITCH - 0.8)), v = u * (1 - u) * (1 - u);
  const e = u * u * (1.2 - 0.2 * u) + PL.c * v;              // leaves the aperture at the canyon's pace, accelerates
  const q = Q0 + (Q1 - Q0) * e;
  const sep = sepOf(s);
  out.eye[0] = 0; out.eye[1] = W.y0 - wellD(q, sep); out.eye[2] = -420;
  out.yaw = 2.45 + 3.6 * u * u + PL.a * v; out.pitch = DOWN; out.f = 1.3 - 0.5 * u + PL.f * v; out.pp[0] = 0; out.pp[1] = 0; out.q = q;
  return out;
}
export const newCam = () => ({ eye: [0, 0, 0], yaw: 0, pitch: 0, f: 1, pp: [0, 0], q: 0 });
/* THE CHAMBER: [s, eye xyz, yaw, pitch, f, ppx, ppy]. The first key comes straight out of the light above
   the chamber's pool with the roll still turning; the last is the room, whole. */
export const KB = [
  [SWITCH, 0, 66, 0.01, 6.05 - 2 * Math.PI, DOWN, 0.8, 0, 0],
  [0.9, 0, 110, 50, -0.06, -1.2, 0.98, 0, 0],
  [0.925, 0, 170, 470, -0.01, -0.48, 1.25, 0, 0],
  [0.95, 0, 160, 640, 0, -0.35, 1.4, 0, 0],
  /* THE ROOM: the chamber as it stands at its outputs — the column, the
     pillars, the three glyphs turning over their pedestals — whole; nothing is taken away; the points under the
     pedestals. Narrow screens widen the lens just enough to keep the outer pedestals in (roomFit). */
  [S_ROOM - 0.003, 0, 158, 650, 0, -0.348, 1.42, 0, 0],
  [S_ROOM + 0.003, 0, 158, 650, 0, -0.348, 1.42, 0, 0],   // the camera comes to rest on the room (the monotone curve stops at a pair of equal keys)
  /* THE LAST FRAME: the same eye, the lens a little wider and the picture lifted (roomFit; the feet as high as the cards
     under them need, hero.site) — one frame, front-facing, locked */
  [S_END, 0, 95, 720, 0, -0.13, 1.42 * 0.86, 0, 0],   // down near the floor and tilted up: the floor flattens and the column stands tall behind
];

/* the outer pedestal and its glyph, for the room's fit on narrow screens */
const GH = CH.glyphS * 1.35, GY = CH.glyphY + 4.9;
const FEET = CH.outs.map((o) => [o.x, 0, o.z + CH.pedestal.d / 2]);
const SIDE = [[CH.outs[2].x + CH.pedestal.w / 2, 0, CH.outs[2].z + CH.pedestal.d / 2], [CH.outs[2].x + 1.06 * GH, GY, CH.outs[2].z]];
/* the widest a key's view may be: the outer pedestal's edge at 90 % of the half-width (x / depth per unit of f). A tall
   screen can only show the room's width small, so there the camera rises and looks down on it (up to (0, 460, 500)
   at −1.0 rad on a phone): the floor, its three channels and the pedestals then fill the height instead of a strip */
function roomFit(e, W, H, feet) {
  const a = Math.min(1, Math.max(0, (0.85 - W / H) / 0.35)), end = e[0] >= S_ROOM - 0.005;
  /* THE PORTRAIT ENDING: lower and flatter than the old top-down view (41° down, not 57°), from further back with
     a narrower lens, so the three branches fan out across the screen: the outer feet at 16 % / 84 % of the width (each
     card then hangs right under its pedestal, clear of the edges) and the split about a third of the way down. The room
     keys take the same framing as the end (the camera lands on it and stays); the key before them leans toward it, so
     the descent settles in without turning back. */
  if (a > 0) { e[2] += a * ((end ? 220 : 200) - e[2]); e[3] += a * ((end ? 840 : 760) - e[3]); e[5] += a * ((end ? -0.716 : -0.62) - e[5]); }
  const eye = [e[1], e[2], e[3]], cp = Math.cos(e[5]), sp = Math.sin(e[5]);
  const kX = Math.max(...SIDE.map((p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]; return d[0] / (d[1] * sp - d[2] * cp); }));
  e[6] = Math.min(e[6], 0.9 * (W / H) / kX);
  if (end && a > 0) {
    const p = FEET[2], d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    e[6] += a * (Math.min(0.68 * (W / H) * (d[1] * sp - d[2] * cp) / d[0], 0.9 * (W / H) / kX) - e[6]);
  }
  /* THE POINTS LIVE UNDER THE PEDESTALS (ui .pts): the lens shifts the picture up (the verticals stay vertical) until the
     pedestals' feet sit at `feet` of the height (the room: 60 %, 57 % on a phone; the end: 42 %, with the mark under
     the points) — the floor under them is the points' ground, the lines hanging from the feet (ui) */
  const kB = Math.min(...FEET.map((p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], z = d[1] * sp - d[2] * cp; return (d[1] * cp + d[2] * sp) / z; }));
  e[8] = 1 - 2 * feet - e[6] * kB;
}
/* a key track prepared once: one monotone curve per component (eye xyz, yaw, pitch, f, ppx, ppy) */
function camPrep(keys) { const xs = keys.map((k) => k[0]); return [1, 2, 3, 4, 5, 6, 7, 8].map((c) => monoPrep(xs, keys.map((k) => k[c]))); }
function camAt(prep, s, out) {
  out.eye[0] = monoAt(prep[0], s); out.eye[1] = monoAt(prep[1], s); out.eye[2] = monoAt(prep[2], s);
  out.yaw = monoAt(prep[3], s); out.pitch = monoAt(prep[4], s); out.f = monoAt(prep[5], s);
  out.pp[0] = monoAt(prep[6], s); out.pp[1] = monoAt(prep[7], s); out.q = 0;
  return out;
}
/* the tracks for one responsive frame (the hero object — the runtime keeps one per screen size and hints), built once */
const TRACKS = new WeakMap();
function tracksFor(hero) {
  let t = TRACKS.get(hero);
  if (t) return t;
  const zoom = Math.max(0.55, Math.min(1, hero.f / 2.266));
  const ka = KA.map((k, i) => { const r = k.slice(); if (i > 0) r[6] *= zoom; return r; });
  ka[0][6] = hero.f; ka[0][7] = hero.pp[0]; ka[0][8] = hero.pp[1];
  const kb = KB.map((k) => { const r = k.slice(); r[6] *= zoom; return r; });
  const W = hero.w || 1456, H = hero.h || 819, tall = Math.min(1, Math.max(0, (0.85 - W / H) / 0.35));
  /* the last frame drops the room as low as the page lets it: the page measures what must fit under the pedestals' feet
     — a short line, the cards and air (ui: hero.setSiteHint({ under })) — and the feet sit just above it */
  const short = Math.min(1, Math.max(0, (1000 - H) / 200));
  const endFeet = hero.site && hero.site.under > 0 ? Math.min(0.62, Math.max(0.34, 1 - hero.site.under / H)) : 0.42 - 0.02 * tall - 0.045 * short;
  const roomFeet = 0.6 - 0.03 * tall;
  for (const k of kb) if (k[0] >= 0.95) roomFit(k, W, H, k[0] >= S_END ? endFeet : k[0] >= S_ROOM - 0.005 ? roomFeet + tall * (endFeet - roomFeet) : roomFeet);
  t = { zoom, A: camPrep(ka), B: camPrep(kb) };
  TRACKS.set(hero, t);
  return t;
}

/* WATCH THE EXPERIENCE: the whole camera journey on autopilot, hero to the room, at an even pace through the page */
export const AUTOPILOT = 26;

/* REDUCED MOTION: no flight. Four held views — the hero, inside the streams, the orb, the room — joined at three
   points of the scroll, each inside a short, partial dip of the light */
export const RVIEWS = [[0.2, 0], [0.34, S_IN], [0.6, S_ORB], [1.01, S_END]], DIPW = 0.012;

/* everything the renderer and the interface need at page scroll p.
   hero: { f, pp, mode } — the responsive hero frame (key 0 of the canyon path) */
/* the camera at journey position s (tools: the scroll-map solver reads the camera along s, independent of the map) */
export function camOfS(s, hero, out = newCam()) {
  const T = tracksFor(hero);
  if (s >= SWITCH) return camAt(T.B, s, out);
  if (s <= 0.8) return camAt(T.A, s, out);
  plungeAt(s, out); out.f *= T.zoom; return out;
}
/* the state a frame needs, allocated once and refilled (journeyAt's out) */
export function newJourney() {
  return { p: 0, s: 0, world: 'A', cam: newCam(), A: {}, B: {}, ui: {}, dip: 1, flash: 0, stretch: 0 };
}
export function journeyAt(p, hero, reduced = false, out = newJourney()) {
  p = clamp01(p);
  let s = sOf(p), dip = 1;
  if (reduced) {
    let k = 0; while (k < RVIEWS.length - 1 && p >= RVIEWS[k][0]) k++;
    s = RVIEWS[k][1];
    for (let i = 0; i < RVIEWS.length - 1; i++) dip = Math.min(dip, 1 - 0.7 * Math.max(0, 1 - Math.abs(p - RVIEWS[i][0]) / DIPW));
  }
  /* the responsive lens carries through the journey: a narrow screen keeps a wider view all the way */
  const T = tracksFor(hero);
  const world = s < SWITCH ? 'A' : 'B';
  const cam = out.cam;
  if (world === 'A') {
    if (s <= 0.8) camAt(T.A, s, cam);
    else { plungeAt(s, cam); cam.f *= T.zoom; }
  } else camAt(T.B, s, cam);
  const A = out.A;
  A.periph = sm(0.05, 0.24, s);                    // the rain, the side falls, the canyon air quiet down
  A.vol = sm(0.23, 0.42, s);                       // the fall opens into a volume around the camera
  A.lean = sm(0.02, 0.22, s) * 0.3 + sm(0.40, 0.62, s) * 0.7;   // the pull toward one point
  A.sel = sm(0.42, 0.62, s);                       // thousands → a few
  A.dark = sm(0.24, 0.52, s);                      // the canyon falls away into the night
  A.rings = 1 - sm(0.50, 0.62, s);
  A.open = sm(0.69, 0.79, s);                      // the orb's surface irises open: the portal
  A.fly = sm(0.26, 0.40, s) * (1 - sm(0.56, 0.62, s));   // fragments streaming past the camera
  A.sep = sepOf(s);                                // the well's rings spread apart under the camera
  A.white = 0;
  const B = out.B;
  B.reveal = sm(SWITCH, 0.93, s);                  // the room comes up out of the light
  B.outputs = sm(0.915, 0.952, s);                 // the three channels energise, the glyphs resolve
  B.simplify = 0;                                  // the room stays whole to the end (it used to be taken away for the website)
  /* the breakthrough: the lines stretch toward the centre, then the light takes the frame and lets go */
  const flash = s < SWITCH ? Math.pow(sm(0.868, SWITCH, s), 2.4) : 1 - sm(SWITCH, 0.891, s);   // the bright stretch
  const stretch = s < SWITCH ? sm(0.78, 0.872, s) : 1 - sm(SWITCH, 0.915, s);
  /* the interface: the hero's copy goes as the camera leaves; the rail and the instrument with it; the nav
     stays, quieter, and comes back as the room settles */
  const ui = out.ui;
  ui.copy = 1 - sm(0.006, 0.07, p);
  ui.rail = 1 - sm(0.016, 0.085, p);
  ui.nav = 1 - 0.6 * sm(0.09, 0.25, p) + 0.6 * sm(0.955, 0.99, s);
  ui.brand = sm(S_ROOM + 0.003, S_END, s);          // the room lifts, the points' lines shorten, the mark comes in under them
  out.p = p; out.s = s; out.world = world; out.dip = dip; out.flash = flash; out.stretch = stretch;
  return out;
}

/* the phase label (tools, the build's checks) */
export function phaseOf(s) {
  for (const [k, [a, b]] of Object.entries(PH)) if (s >= a && s < b) return k;
  return s >= S_END ? 'clarity' : 'wf';
}
