/* ============================================================================
   src/engine/params.js — every number in the scene.

   WORLD UNITS ARE METRES. y up, the camera looks down −z into a canyon.
   The core platform sits on the canyon floor at the foot of a 310 m fall of
   information; the eye hovers 62 m over the floor, ~480 m out. A lens shift
   (off-axis frustum), never a pitch, frames the fall: every stream and every
   cliff column stays vertical on screen, as in architectural photography.

   Composition from the reference (1456 x 819): the lip at 13 % from the top,
   the core's top at 79 %, the fall 13.7 % of the width at the lip, the
   platform 27 % of the width at its front edge, the floor's horizon ~68 %.
   ========================================================================== */

export const P = {
  /* ---- camera ---- */
  cam: {
    eye: [0, 62, 60],
    near: 1.0,
    far: 9000,
    f: 2.266,                // vertical focal length (1 / tan(vfov/2)) — 47.6°
    pp: [0, -0.37],          // principal point (NDC): the horizon at ~68 %
    /* the scroll push: where the camera ends, entering the system */
    end: { eye: [0, 66, -236], f: 2.05, pp: [0, -0.02], pitch: -0.205 },
    /* cursor parallax: the eye translates, the frame re-aims at a pivot far
       behind the fall — near cliffs move ~1.5 %, the core ~0.5 %, the fall
       ~0.25 %; a heavy spring, the place never follows the hand */
    move: [5.0, 3.0],
    pivotZ: -900,
    smooth: 1.35,
    breathe: 0.6,            // idle drift (m) — almost still
  },

  /* ---- the canyon ---- */
  canyon: {
    zBack: -560, zFront: 160,
    /* floor half-width at the back and the front; the walls lean out with height */
    halfBack: 158, halfFront: 300, lean: 0.11,
    top: 560, topVar: 190,   // wall crest height and its variation along z
    grid: [210, 128],        // side-wall grid (along z, up)
    cliff: [190, 120],       // back-cliff grid (across x, up)
  },

  /* ---- the fall ---- */
  fall: {
    lip: { y: 325, z: -478, half: 56 },
    impact: { y: 11.6, z: -420, half: 26 },   // the pool surface inside the aperture
    v0: 18, g: 20,                              // m/s, m/s² — 4.7 s from lip to pool
    sway: 0.9,                                  // lateral sway (m)
    bow: 0.025,                                 // mid-fall spread
    period: 600,                                // the flow wraps every 600 s, seamlessly
  },

  /* ---- the core ---- */
  core: {
    c: [0, 0, -420],
    /* tiers: [y0, y1, half] */
    tiers: [[0, 7, 84], [7, 11, 74], [11, 14.5, 65]],
    chamfer: 0.18,
    aperture: 34,
    /* the well: steps down into the pool [r_outer, y] */
    well: [[34, 13.4], [30.5, 12.5]],
    pool: 27.5,
    poolY: 11.6,
    fins: { spacing: 4.6, depth: 5.2, thick: 1.3, height: 6.2 },
    /* rings: y, radius, tube (m), tilt (rad), spin (rad/s), precession (rad/s), ticks, gap (rad) */
    rings: [
      [24, 60, 0.42, 0.045, 0.050, 0.030, 240, 0.55],
      [40, 52, 0.38, 0.06, -0.036, -0.022, 180, 0.40],
      [58, 45, 0.34, 0.04, 0.068, 0.026, 144, 0.70],
      [80, 39, 0.30, 0.055, -0.052, -0.031, 120, 0.50],
    ],
    radial: 96,              // fine radial lines on the platform top
    rim: 72,                 // vertical threads around the aperture
  },

  /* ---- the portal: under the pool, a well of nested stepped rings down to the light ----
     ring k: radius r0·shrink^k; its depth below y0 is wellD(q, sep) at q = k (its wall's top) and
     q = k + riser (its tread). sep spreads the rings apart as the camera falls through them. */
  well: { y0: 11.1, rings: 12, r0: 27.0, shrink: 0.866, step: 11, grow: 0.05, riser: 0.62, sepK: 1.25 },

  /* ---- the observer ---- */
  figure: { p: [14, 0, -240], h: 1.8 },

  /* ---- streams (instances) ---- */
  streams: {
    mid: 150, primary: 44, filament: 14, peripheral: 28, rain: 230, rim: 72,
    seg: 112,                // segments along a stream
    groups: 11,              // braids under PROCESS
  },

  /* ---- particles (instances; the live count is what the readout shows) ---- */
  particles: {
    fall: 5200, spray: 2600, ambient: 1800, orbit: 1400, launch: 700, nodes: 72, fly: 2600,
  },

  /* ---- the four states ---- */
  state: {
    inT: 0.55, outT: 0.95,   // spring smooth times (s), entering / leaving
    speed: [1.14, 1.08, 0.84, 1.0],      // flow speed under each state
    actCooldown: 1.6,
    waveSpeed: 230,          // m/s, the ACT wave
    idle: [8.5, 13.5],       // a quiet thought every 8.5–13.5 s
    /* resonance (UNDERSTAND): the field's angular order and circle spacing (m) */
    mode: { n: 8, spacing: 37, first: 22 },
    histHz: 30, histN: 256,  // the state history the falling data carries
  },

  /* ---- light & atmosphere ---- */
  light: {
    exposure: 1.0,
    fall: 2.6,               // the line light of the fall
    lipGlow: 7.0,
    core: 5.5,
    source: 3.2,             // the upstream glow behind the lip
    sourceP: [0, 400, -760],
  },
  fog: {
    sig0: 0.0026, H: 62,     // ground mist: density at the floor, scale height
    haze: 0.00026,           // uniform haze
    scatter: 0.0078,         // in-scatter strength
    col: [0.0014, 0.0050, 0.0062],
  },
  color: {
    accent: [0.20, 0.93, 0.86],     // turquoise
    deep: [0.03, 0.26, 0.28],
    hot: [0.80, 1.0, 0.97],
  },
  render: {
    dprCap: 1.5,
    maxPixels: 2560 * 1440,
    msaaPixels: 2560 * 1440,
    bloom: 0.42,
    bloomThreshold: 0.55,
    grain: 0.028,
    vignette: 0.32,
  },
};

/* the responsive frame — ONE rule shared with the CSS (page.js):
     phone   width ≤ 700 or aspect < 1.05   copy on top, the fall below it
     tablet  width ≤ 1100 and aspect < 1.5  copy upper left, the fall moved right, controls in a row
     desk    otherwise                      below 16:9 the lens widens to keep the canyon's width */
export const layoutFor = (w, h) => (w <= 700 || w / h < 1.05 ? 'portrait' : w <= 1100 && w / h < 1.5 ? 'tablet' : 'desk');
/* the frame carries the screen's size: the journey's last view is solved per screen on narrow ones */
export function frameFor(w, h, hint = null) { return Object.assign(frameOf(w, h, hint), { w, h }); }
function frameOf(w, h, hint) {
  const aspect = w / h, design = 16 / 9, mode = layoutFor(w, h);
  if (mode === 'desk') return { f: P.cam.f * Math.min(1, Math.max(0.8, aspect / design)), pp: P.cam.pp.slice(), mode };
  if (mode === 'tablet') {
    const k = Math.min(1, Math.max(0, (aspect - 1.05) / 0.45));
    /* solved from the lens: the core's top at ~70 % (above the control row), the lip at ~12 %, the fall right of the copy */
    return { f: P.cam.f * (0.86 + 0.06 * k), pp: [0.36 - 0.06 * k, -0.21 - 0.04 * k], mode };
  }
  /* portrait: the fall stands between the copy and the controls — the lip just under the copy, the core's
     top just over the controls. The page measures both (hint, CSS px: { top, bottom }) and the lens is
     solved for this phone's height; without a hint, lip ~45 %, core's top ~75 % */
  if (hint && hint.top > 0 && hint.bottom > hint.top + 80) {
    const e = P.cam.eye, L = P.fall.lip, C = P.core;
    const kL = (L.y - e[1]) / (e[2] - L.z), kC = (C.tiers[2][1] - e[1]) / (e[2] - C.c[2]);
    const nL = 1 - 2 * hint.top / h, nC = 1 - 2 * hint.bottom / h;
    const f = Math.min(1.3, Math.max(0.7, (nL - nC) / (kL - kC)));
    return { f, pp: [0, nL - f * kL], mode };
  }
  return { f: 1.02, pp: [0, -0.4], mode };
}

/* the portal's depth below its top at ring coordinate q, with the rings spread by sep (0..1) — the
   well's vertex shader and the camera's path through it both read this one function */
export const wellD = (q, sep) => P.well.step * q * (1 + P.well.grow * q) * (1 + P.well.sepK * sep);
export const wellR = (k) => P.well.r0 * Math.pow(P.well.shrink, k);
