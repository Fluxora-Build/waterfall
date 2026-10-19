/* ============================================================================
   src/engine/colour.js — config.colours.light as one 3 × 3 grade of the whole
   frame: a hue rotation and a saturation scale, relative to the colour the
   scene was made in (#5fe9de, which gives the identity, exactly). The final
   pass applies it before the tone curve, so the highlights still burn to white.
   ========================================================================== */
export const MADE_IN = '#5fe9de';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/* any CSS colour as [r, g, b] in 0..1 (the browser parses it) */
export function cssRGB(colour) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000'; c.fillStyle = String(colour);
  const s = c.fillStyle;
  if (s[0] === '#') return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  return s.replace(/[^\d.,]/g, '').split(',').slice(0, 3).map((v) => +v / 255);
}
function hueSat([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  /* saturation as HSV has it (chroma over the brightest channel): a pale colour is a pale light. (HSL calls a near-white
     such as #e8f1ff fully saturated, and the grade would turn it a vivid blue.) */
  const s = mx === 0 ? 0 : d / mx;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * Math.PI / 3, s];
}
/* row-major 3 × 3 */
function gradeRows(colour) {
  const [h0, s0] = hueSat(cssRGB(MADE_IN)), [h, s] = hueSat(cssRGB(colour || MADE_IN));
  const a = h - h0, k = clamp(s / s0, 0, 1.5);
  if (Math.abs(a) < 1e-6 && Math.abs(k - 1) < 1e-6) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const c = Math.cos(a), n = Math.sin(a);
  /* the luminance-keeping hue rotation of CSS's hue-rotate() */
  const H = [
    [0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928],
    [0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.140, 0.072 - c * 0.072 - n * 0.283],
    [0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072],
  ];
  /* and saturate(): towards the luminance by 1 − k */
  const Lw = [0.2126, 0.7152, 0.0722];
  const S = [0, 1, 2].map((i) => [0, 1, 2].map((j) => Lw[j] * (1 - k) + (i === j ? k : 0)));
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => S[i][0] * H[0][j] + S[i][1] * H[1][j] + S[i][2] * H[2][j]));
}
/* for the shader: column-major */
export function gradeFor(colour) {
  const R = gradeRows(colour), out = new Float32Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[j * 3 + i] = R[i][j];
  return out;
}
/* the same grade on one CSS colour, so the page's cards wear the colour their channel shows in the scene */
export function gradeCss(colour, light) {
  const R = gradeRows(light), v = cssRGB(colour);
  const o = R.map((row) => clamp(row[0] * v[0] + row[1] * v[1] + row[2] * v[2], 0, 1));
  return '#' + o.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
