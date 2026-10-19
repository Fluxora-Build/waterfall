/* ============================================================================
   src/engine/shaders/portal.js — THE PORTAL: the machine under the pool.

   When the orb's surface irises open it shows what was under it all along:
   a well of nested, stepped rings going down to a white-hot light. Each ring
   is a wall facing the axis and a tread facing up; the light from the bottom
   catches the walls and the treads' inner rims, so the depth reads as a
   gradient of light, ring inside ring. Every tread is machined: fine radial
   seams (more with depth), one thin illuminated channel, a band of micro-
   segments that turns — alternate rings in opposite directions, faster with
   depth — and a few pulses running round the circumference, white-hot at
   their heads. The rings spread apart (sep) as the camera falls through.

   The vertex shader reads the ring coordinate q from the mesh and turns it
   into depth with the same wellD the camera's plunge uses (params.js).
   ========================================================================== */
import { P } from '../params.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const W = P.well;

export const WELL_COMMON = /* glsl */`
const float W_Y0 = ${f(W.y0)}, W_STEP = ${f(W.step)}, W_GROW = ${f(W.grow)}, W_SEPK = ${f(W.sepK)}, W_R0 = ${f(W.r0)}, W_SHRINK = ${f(W.shrink)}, W_RISER = ${f(W.riser)};
const float W_RINGS = ${f(W.rings)};
float wellD(float q, float sep){ return W_STEP*q*(1.0 + W_GROW*q)*(1.0 + W_SEPK*sep); }
float wellR(float k){ return W_R0*pow(W_SHRINK, k); }
`;

export const WELL_VS = /* glsl */`${WELL_COMMON}
layout(location=0) in vec4 aP;   // x, q, z, kind (0 tread, 1 wall, 2 the light)
layout(location=1) in vec4 aN;   // normal, ring
centroid out vec3 vP;
centroid out vec3 vN;
centroid out float vQ;
flat out vec2 vK;
void main(){
  vec3 p = vec3(aP.x, W_Y0 - wellD(aP.y, uJ3.w), aP.z);
  vP = p; vN = aN.xyz; vQ = aP.y; vK = vec2(aP.w, aN.w);
  gl_Position = uVP*vec4(p, 1.0);
}`;

export const WELL_FS = /* glsl */`${WELL_COMMON}
uniform mat4 uPrevVP;
uniform float uNearK;   // the near fade's reach: 6 m at rest (only what is passing the lens), 18 m when the camera falls fast
centroid in vec3 vP;
centroid in vec3 vN;
centroid in float vQ;
flat in vec2 vK;
out vec4 o;
void main(){
  vec3 p = vP; vec3 n = normalize(vN);
  float kind = vK.x, k = vK.y;
  vec2 q2 = p.xz - CORE.xz; float r = length(q2); float th = atan(q2.y, q2.x);
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  float pw = 2.0*Td/(uF*uRes.y);               // metres per pixel here
  /* MOTION-AWARE: how far this point moved on screen since the last frame (px). Every thin line widens by it — the same
     light spread over the distance it travelled, a short streak — so a fast fall never strobes; at rest it is razor
     sharp. Lines are never thinner than 1.5 px, and a pattern whose repeat falls under ~4 px fades to its average. */
  vec4 ca = uVP*vec4(p, 1.0), cb = uPrevVP*vec4(p, 1.0);
  float mot = cb.w > 0.01 ? min(40.0, length((ca.xy/ca.w - cb.xy/cb.w)*0.5*uRes)) : 0.0;
  float pwm = pw*(1.0 + mot);                    // metres per (pixel + its motion)
  float open = uJ2.x;
  /* the light at the bottom */
  float yb = W_Y0 - wellD(W_RINGS + 0.25, uJ3.w);
  vec3 lp = vec3(CORE.x, yb + 2.0, CORE.z);
  vec3 l = lp - p; float d2 = dot(l, l); l *= inversesqrt(d2);
  float I = (5.0 + 5.0*uJ3.w)*open/(1.0 + d2/(95.0*95.0));
  if (kind > 1.5){
    /* the light itself: white-hot, with a fine radial structure turning in it */
    float a = th/TAU*64.0 + uTime*0.35;
    float lines = 0.85 + 0.15*band(fract(a), 0.0, 0.5, fwidth(a));
    vec3 c = mix(ACC, HOT, 0.85)*(6.0 + 6.0*uJ3.w)*lines*open*(0.6 + 0.4*smoothstep(wellR(W_RINGS)*1.02, 0.0, r));
    o = vec4(c, 1.0);
    return;
  }
  float r0 = wellR(k), r1 = wellR(k + 1.0);
  vec3 alb = vec3(0.020, 0.025, 0.028);
  float nl = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  vec3 c = alb*LC_CORE*I*(0.15 + 0.85*nl) + LC_CORE*I*pow(max(dot(n, h), 0.0), 40.0)*0.05;
  float depthK = k/W_RINGS;
  if (kind < 0.5){
    /* a tread: radial seams, one illuminated channel, the turning micro-segments, the pulses */
    float nseg = 48.0 + 16.0*k;
    float a = th/TAU*nseg;
    float da = abs(fract(a + 0.5) - 0.5)*TAU*r/nseg;
    float sw0 = max(0.06, pw*1.5), sw = max(0.06, pwm*1.5);
    float seam = exp(-sq(da/sw))*(sw0/sw)*smoothstep(2.5, 4.5, TAU*r/nseg/pwm);
    c *= 1.0 - 0.5*seam;
    float rm = mix(r0, r1, 0.42);
    float lw = max(0.07, pwm*1.5);
    float chan = exp(-sq((r - rm)/lw))*(0.09/lw)*smoothstep(2.0, 4.5, (r0 - r1)/pwm);
    float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float segs = 36.0 + 12.0*k;
    float sp = (0.05 + 0.03*k)*(1.0 + 4.0*uJ3.w);
    float ma = th/TAU*segs + dir*uTime*sp;
    float dash = mix(0.42, band(fract(ma), 0.0, 0.42, fwidth(ma)*(1.0 + mot)), smoothstep(2.5, 4.5, TAU*r/segs/pwm));
    float bandM = band(r, mix(r0, r1, 0.6), mix(r0, r1, 0.78), max(fwidth(r)*(1.0 + mot), 1e-4));
    float pulse = 0.0;
    for (int j = 0; j < 3*uLoop; j++){
      float ph = fract(dir*uTime*(0.035 + 0.01*k)*(1.0 + float(j)*0.37) + float(j)*0.333 + k*0.17);
      float dth = abs(fract(th/TAU - ph + 0.5) - 0.5)*TAU*r;
      pulse += exp(-sq(dth/(1.2 + 0.4*r/10.0)));
    }
    /* the tread's inner rim catches the light from below: nested apertures, one inside the next */
    float rim = exp(-max(r - r1, 0.0)/max(0.25, pwm))*(max(0.25, pw)/max(0.25, pwm))*(0.6 + 0.4*depthK);
    float glow = open*(0.55 + 0.9*depthK);
    c += ACC*(chan*(0.35 + 0.65*dash)*1.6 + bandM*dash*0.12 + rim*1.4)*glow;
    c += mix(ACC, HOT, 0.8)*pulse*exp(-sq((r - rm)/(lw*1.6)))*1.6*glow;
  } else {
    /* a wall: fine vertical grooves; a thin lit line along its top edge */
    float a = th/TAU*(96.0 + 24.0*k);
    float groove = mix(0.1, band(fract(a), 0.0, 0.1, fwidth(a)*(1.0 + mot)), smoothstep(2.5, 4.5, TAU*r/(96.0 + 24.0*k)/pwm));
    c *= 1.0 - 0.45*groove;
    float yt = W_Y0 - wellD(k, uJ3.w);
    float edge = exp(-max(yt - p.y, 0.0)/max(0.12, pwm*1.5))*(0.08/max(0.12, pwm*1.5));
    c += ACC*edge*open*(0.6 + 0.8*depthK);
  }
  /* THE NEAR FADE (its reach follows the camera's speed — at rest only what is passing the lens): inside the well, a ring level with the camera is
     passing through the lens — its lit rim would fill
     the frame for a frame and be gone the next (a strobe). So what is within a few metres of the camera's own height
     dissolves into the dark: the rings fade as they arrive and the camera passes through them, not past them */
  float lvl = abs(p.y - uEye.y);
  c *= mix(1.0, smoothstep(1.0, mix(6.0, 18.0, uNearK), lvl), smoothstep(W_Y0 + 2.0, W_Y0 - 6.0, uEye.y));
  /* toward the top the well stays in the canyon's air; down it, only its own light */
  o = vec4(c, 1.0);
}`;
