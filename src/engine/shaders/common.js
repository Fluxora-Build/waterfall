/* ============================================================================
   src/engine/shaders/common.js — GLSL ES 3.00 shared by every program.

   ONE ATMOSPHERE. Every opaque surface and the sky end in atmos(): height
   fog (dense in the floor's mist, thin haze above) plus the light the fog
   scatters toward the eye from the fall, the core, the lip and the upstream
   source — integrated in closed form along the view ray up to the surface,
   so the light hangs in the air around what makes it and the cliffs cut it.

   ONE FALL. fallPath() is the trajectory every stream, the sheet behind them
   and the falling motes share: over the lip with a forward throw, a slight
   spread mid-fall, then the core's pull — the last 58 % of the drop bends
   every stream into the pool. PROCESS braids the streams in groups,
   ACT flares the foot outward; the mechanism (uMech) shapes the last metres.
   ========================================================================== */
import { P } from '../params.js';
import { FALL_D, T_FALL, PROC_STEP, PULSE_T } from '../state.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = (a) => `vec3(${a.map(f).join(',')})`;
const F = P.fall, Co = P.core, Fo = P.fog, L = P.light, Cc = P.color, M = P.state.mode;

export const HEAD = /* glsl */`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const COMMON = /* glsl */`
uniform mat4 uVP;
uniform vec3 uEye;
uniform float uTime;      // seconds, wrapped every 3600 (every periodic use closes on it)
uniform vec2 uRes;
uniform float uF;         // vertical focal length
uniform vec4 uW;          // the four weights now: ingest, process, understand, act
uniform vec4 uPh;         // flow (wrapped), braid, swirl, resonance
uniform vec4 uPh2;        // inflow, outflow, intro, sway
uniform vec4 uWave;       // (the old ACT wave: kept at zero — ACT no longer floods the scene)
uniform vec4 uRip[4];     // ACT's ripples, one per decision landed: radius, strength, width, age
uniform vec4 uProc;       // PROCESS's step clock (steps), ACT's surge: age (s), strength; INGEST's wave: age (s)
uniform vec4 uActP[8];    // ACT's pulses in flight: stream instance, age (s), strength, 0
uniform vec4 uCore;       // arriving, ping, ping ring, ping age
uniform vec4 uL[8];       // lights: xyz, intensity — lip, fall ¼ ½ ¾, core, source, flash, the resolved form
uniform float uFall;      // the fall's line light
uniform float uMech;      // transformation mechanism 1 collimate, 2 accrete, 3 interfere
uniform vec4 uJ;          // the journey: volume, selection, lean (to one point), dark
uniform vec4 uJ2;         // the journey: core open, periphery quiet, rings, fragments
uniform vec4 uJ3;         // the journey: 0, the orb's white, the portal's depth below the pool (m), the well's ring spread
uniform vec3 uWB;         // the chamber: 1 when the fall is the chamber's column; the column's brightness; the room's simplify
float uChB_s(){ return uWB.z; }
uniform sampler2D uHist;  // the state the falling data carries: row 0 weights, row 1 intro
uniform sampler2D uNoise;
uniform int uLoop;        // always 1 (keeps loops as loops on ANGLE)
uniform float uDbg;       // dev: ?dbg=1 no in-scatter, 2 no direct light on rock, 3 no top light, 4 no fog colour

const float PI = 3.14159265;
const float TAU = 6.2831853;
const vec3 CORE = ${v3(Co.c)};
const float LIP_Y = ${f(F.lip.y)}, LIP_Z = ${f(F.lip.z)}, LIP_H = ${f(F.lip.half)};
const float IMP_Y = ${f(F.impact.y)}, IMP_Z = ${f(F.impact.z)}, IMP_H = ${f(F.impact.half)};
const float V0 = ${f(F.v0)}, GRAV = ${f(F.g)}, FALL_D = ${f(+FALL_D.toFixed(3))}, T_FALL = ${f(+T_FALL.toFixed(4))};
const float PERIOD = ${f(F.period)};
const float PROC_STEP = ${f(PROC_STEP)}, PULSE_T = ${f(PULSE_T)};
const float BOW = ${f(F.bow)}, SWAY = ${f(F.sway)};
const float GROUPS = ${f(P.streams.groups)};
const float TOP_Y = ${f(Co.tiers[Co.tiers.length - 1][1])};
const float APER = ${f(Co.aperture)}, POOL_R = ${f(Co.pool)}, POOL_Y = ${f(Co.poolY)};
const float HZ = ${f(P.state.histHz)}, HN = ${f(P.state.histN)};
const float SIG0 = ${f(Fo.sig0)}, FOG_H = ${f(Fo.H)}, HAZE = ${f(Fo.haze)}, SCAT = ${f(Fo.scatter)};
const vec3 FOGC = ${v3(Fo.col)};
const vec3 ACC = ${v3(Cc.accent)};
const vec3 DEEP = ${v3(Cc.deep)};
const vec3 HOT = ${v3(Cc.hot)};
const float MODE_N = ${f(M.n)}, MODE_SP = ${f(M.spacing)}, MODE_R0 = ${f(M.first)};
const vec3 LC_FALL = vec3(0.30, 0.94, 0.90);
const vec3 LC_CORE = vec3(0.24, 0.93, 0.86);
const vec3 LC_SRC = vec3(0.40, 0.80, 0.90);

float saturate(float x){ return clamp(x, 0.0, 1.0); }
float sq(float x){ return x*x; }   /* never pow(x, 2.0): undefined for x < 0 */
/* NaN and Inf by their bits — D3D's compiler removes isnan() and x != x, it cannot remove integer tests */
vec3 finite3(vec3 c){ bvec3 bad = equal(floatBitsToUint(c) & uvec3(0x7F800000u), uvec3(0x7F800000u)); return vec3(bad.x ? 0.0 : c.x, bad.y ? 0.0 : c.y, bad.z ? 0.0 : c.z); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
uint hashU(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
uint hashU(ivec2 p){ return hashU(uint(p.x)*0x8da6b343u ^ hashU(uint(p.y) + 0x9e3779b9u)); }
float h1(uint x){ return float(hashU(x))*(1.0/4294967296.0); }
vec4 h4(uint x){ uint a = hashU(x), b = hashU(a ^ 0x68e31da4u), c = hashU(b ^ 0xb5297a4du), d = hashU(c ^ 0x1b56c4e9u); return vec4(a, b, c, d)*(1.0/4294967296.0); }
float band(float x, float a, float b, float aa){ return smoothstep(a - aa, a + aa, x) - smoothstep(b - aa, b + aa, x); }

/* ---- the fall ---- */
float tauOf(float d){ return (sqrt(V0*V0 + 2.0*GRAV*max(d, 0.0)) - V0)/GRAV; }
float velOf(float d){ return sqrt(V0*V0 + 2.0*GRAV*max(d, 0.0)); }
/* the state the data at fall-depth d left the lip with (lag in seconds) */
vec4 histW(float lag){ return texture(uHist, vec2((lag*HZ + 0.5)/HN, 0.25)); }
float histIntro(float lag){ return texture(uHist, vec2((lag*HZ + 0.5)/HN, 0.75)).r; }

/* the fall's half-width at u (the sheet, before the pull meets the pool) */
float attractOf(float u){ return pow(smoothstep(0.58, 1.0, u), 1.7); }

/* THE FALL SPEAKS THE VERB. One stream's centre line at u (0 the lip, 1 the pool); lane −1..1 across
   the lip, depth −1..1 through the sheet. The four weights (uW, eased by state.js) shape it directly —
   the whole fall answers within the blend, top to bottom:
     INGEST      more of everything: the emitter widens 15 %, the streams wander as they fall
     PROCESS     the fall as it is; panels of energy run down it in a steady sequence (procPanel)
     UNDERSTAND  the hourglass: the fall converges to a waist mid-height; below it only 1 in 8
                 continues (stream VS) and the lower bulb opens again
     ACT         euphoric, from the top: the lip flares, a front pours down the fall, pulses of light run
                 the few bright streams to the pond (stream VS/FS); the shape rests */
float hourglass(float u){ return 1.0 - 0.92*exp(-sq((u - 0.46)/0.15)); }
vec3 fallPath(float u, float lane, float depth, float seed, float grp){
  if (uWB.x > 0.5){
    /* THE CHAMBER'S COLUMN: the same streams, falling in a ring around the axis into the pool below */
    float a = lane*PI + seed*0.37;
    float rr = 27.0*(0.3 + 0.7*sqrt(abs(depth)))*mix(1.0, 0.6, smoothstep(0.7, 1.0, u));
    return vec3(cos(a)*rr, mix(430.0, 22.5, u), sin(a)*rr);
  }
  float wI = uW.x, wP = uW.y, wU = uW.z;
  /* the journey's lean: at full lean the pull spans the whole fall — straight lines to one point */
  float A = mix(attractOf(u), pow(u, 1.15), uJ.z);
  float y = mix(LIP_Y, IMP_Y, u) - uJ2.x*uJ3.z*smoothstep(0.82, 1.0, u);
  float bow = 1.0 + BOW*sin(PI*u);
  /* INGEST: a wider emitter; the streams wander as they fall */
  float wide = 1.0 + 0.15*wI;
  float sw = SWAY*(1.0 + 1.6*wI);
  float wander = sw*(sin(u*9.0 + seed*6.2831 + uPh2.w) + 0.6*wI*sin(u*2.7 + seed*3.9 + uPh2.w*0.41));
  /* UNDERSTAND: the hourglass */
  float hg = mix(1.0, hourglass(u), wU);
  float x = lane*LIP_H*bow*wide*hg*(1.0 + 0.3*uJ.x) + wander*(1.0 - A);
  float zArc = mix(LIP_Z, IMP_Z, 1.0 - pow(1.0 - u, 1.6));
  /* the journey opens the sheet into a volume (biased toward the camera, clear of the cliff) */
  float dz = mix(depth*mix(3.5, 2.2, u)*hg, depth*62.0 + 28.0, uJ.x);
  float conv = 1.0 - 0.97*uJ.z;
  float cmp = 1.0 - 0.15*wP;
  float ix = lane*IMP_H*cmp*conv;
  float iz = IMP_Z + depth*5.0*cmp*conv;
  if (uMech < 1.5){
    /* COLLIMATE: the streams are sorted into channels as they pass the rings */
    float ch = (floor(lane*3.5 + 3.5) + 0.5)/7.0*2.0 - 1.0;
    ix = mix(ix, ch*IMP_H*0.95*cmp*conv, smoothstep(0.55, 0.8, u));
    iz = mix(iz, IMP_Z, smoothstep(0.55, 0.8, u));
  }
  x = mix(x, ix, A);
  float z = zArc + dz*(1.0 - A) + (iz - IMP_Z)*A;
  if (uMech > 1.5 && uMech < 2.5){
    /* ACCRETE: the pull becomes an orbit — the streams wind into the pool */
    float w = sq(smoothstep(0.55, 1.0, u));
    vec2 q = vec2(x, z - IMP_Z);
    float a = w*(2.2 + 1.2*abs(lane))*(lane >= 0.0 ? 1.0 : -1.0);
    q = mat2(cos(a), sin(a), -sin(a), cos(a))*q*(1.0 - 0.25*w);
    x = q.x; z = q.y + IMP_Z;
  }
  return vec3(x, y, z);
}

/* ---- atmosphere ---- */
float fogOD(vec3 ro, vec3 rd, float T){
  T = min(T, 6000.0);
  float k = rd.y/FOG_H;
  float base = SIG0*exp(-clamp(ro.y, -40.0, 2000.0)/FOG_H);
  float od = abs(k*T) < 1e-3 ? base*T : base*(1.0 - exp(-k*T))/k;
  return od + HAZE*T;
}
vec3 lcol(int i){ return i == 5 ? LC_SRC : ((i == 4 || i >= 6) ? LC_CORE : LC_FALL); }
float mistAt(vec3 p){
  vec2 q = p.xz/360.0 + vec2(p.y/1100.0, 0.0) + uTime*vec2(8.0, -5.0)/3600.0;
  return 0.35 + 1.25*smoothstep(0.32, 0.72, texture(uNoise, q).r);
}
vec3 inscatter(vec3 ro, vec3 rd, float T){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8*uLoop; i++){
    float I = uL[i].w;
    if (I <= 0.0) continue;
    vec3 oc = uL[i].xyz - ro;
    float b = dot(oc, rd);
    float h = sqrt(max(dot(oc, oc) - b*b, 9.0));
    float s = (atan((T - b)/h) + atan(b/h))/h;
    vec3 pc = ro + rd*clamp(b, 0.0, T);
    float dens = 0.22 + 0.78*exp(-max(pc.y, 0.0)/(FOG_H*1.6));
    acc += lcol(i)*I*s*dens*mistAt(pc);
  }
  return acc*SCAT;
}
vec3 atmos(vec3 c, vec3 ro, vec3 rd, float T){
  float tr = exp(-fogOD(ro, rd, T));
  vec3 ins = uDbg == 1.0 ? vec3(0.0) : inscatter(ro, rd, T);
  /* the journey takes the air away: only what emits light remains */
  return c*tr + ((uDbg == 4.0 ? vec3(0.0) : FOGC*(1.0 - tr)) + ins*(0.35 + 0.65*sqrt(tr)))*(1.0 - 0.985*uJ.w);
}
float transmit(vec3 p){ vec3 d = p - uEye; float T = length(d); return exp(-fogOD(uEye, d/T, T)); }

/* ---- surface light ---- */
const vec3 FALL_A = vec3(0.0, LIP_Y - 4.0, LIP_Z + 6.0);
const vec3 FALL_B = vec3(0.0, IMP_Y + 26.0, IMP_Z);
/* the fall as a line light: diffuse from the nearest point, the highlight from the representative point */
vec3 fallLight(vec3 p, vec3 n, vec3 v, float shin, inout vec3 sp){
  vec3 ab = FALL_B - FALL_A;
  float t = clamp(dot(p - FALL_A, ab)/dot(ab, ab), 0.0, 1.0);
  vec3 l = FALL_A + ab*t - p; float d = length(l); l /= d;
  float prof = 0.5 + 1.1*exp(-t*7.0) + 0.9*smoothstep(0.65, 1.0, t);
  float E = uFall*prof*1.6/((1.0 + d/36.0)*(1.0 + d/210.0));
  float nl = max(dot(n, l), 0.0); float diff = nl*nl*0.9 + nl*0.1;
  vec3 r = reflect(-v, n);
  vec3 L0 = FALL_A - p;
  float rd = dot(r, ab);
  float tt = clamp((dot(r, L0)*rd - dot(L0, ab))/max(dot(ab, ab) - rd*rd, 1e-3), 0.0, 1.0);
  vec3 ls = normalize(L0 + ab*tt);
  sp += LC_FALL*E*pow(max(dot(r, ls), 0.0), shin)*(shin + 2.0)*0.06;
  return LC_FALL*E*diff;
}
vec3 pointLight(vec3 p, vec3 n, vec3 v, float shin, int i, float range, inout vec3 sp){
  vec3 l = uL[i].xyz - p; float d2 = dot(l, l); l *= inversesqrt(d2);
  float att = uL[i].w/(1.0 + d2/(range*range));
  vec3 h = normalize(l + v);
  sp += lcol(i)*att*pow(max(dot(n, h), 0.0), shin)*(shin + 2.0)*0.06;
  return lcol(i)*att*max(dot(n, l), 0.0);
}
/* all the scene's light on a surface (diffuse into the return, highlights into sp) */
vec3 sceneLight(vec3 p, vec3 n, vec3 v, float shin, inout vec3 sp){
  vec3 c = uDbg == 12.0 ? vec3(0.0) : fallLight(p, n, v, shin, sp);
  if (uDbg == 12.0) sp = vec3(0.0);
  if (uDbg == 13.0) return c;
  c += pointLight(p, n, v, shin, 4, 46.0, sp);
  c += pointLight(p, n, v, shin, 0, 52.0, sp)*0.5;
  /* the upstream source glows in the air (in-scatter); on rock it is only a faint rim from above */
  vec3 sp5 = vec3(0.0);
  c += pointLight(p, n, v, shin, 5, 260.0, sp5)*0.16;
  sp += sp5*0.3;
  c += pointLight(p, n, v, shin, 6, 120.0, sp);
  /* the resolved form, hanging in the canyon, lights the rock and the floor around it */
  c += pointLight(p, n, v, shin, 7, 90.0, sp);
  return c;
}
/* ACT's ripples: one thin ring of light per decision, crossing the floor outward from the pond */
float ripples(vec3 p){
  float r = length(p.xz - CORE.xz), a = 0.0;
  for (int i = 0; i < 4*uLoop; i++){
    if (uRip[i].y < 0.003) continue;
    float x = (r - uRip[i].x)/uRip[i].z;
    a += uRip[i].y*(exp(-x*x) + 0.12*exp(min(x, 0.0)*0.6)*step(x, 0.0));
  }
  return a;
}
/* the ACT wave on a surface: a front of light and a thin afterglow */
float waveAt(vec3 p){
  if (uWave.y < 0.002) return 0.0;
  float r = length(p - CORE);
  float x = (r - uWave.x)/uWave.z;
  /* the afterglow only trails the front (x < 0): exp of min(x, 0) can never overflow */
  return uWave.y*(exp(-x*x) + 0.18*exp(min(x, 0.0)*0.35)*step(x, 0.0));
}
#ifdef FRAG
/* PROCESS — PANELS OF ENERGY. The fall between the lip and the pull is cut into seven panels; on the step
   clock one panel after another lights, top to bottom: it opens out from the centre to the fall's edges in
   half a step, glows, and fades over the next two while the panels below it take over; two empty steps,
   and the sequence repeats. Returns the panel's fill at fall position u (0 lip → 1 pool) and across
   position x (−1..1); rim = its top and bottom edges and the opening edge. fu, fx: their pixel widths. */
const float NPAN = 7.0, PU0 = 0.06, PU1 = 0.8;
float procPanel(float u, float x, float fu, float fx, out float rim){
  rim = 0.0;
  float fp = (u - PU0)/(PU1 - PU0)*NPAN;
  if (fp < 0.0 || fp >= NPAN) return 0.0;
  float i = floor(fp), f = fract(fp);
  float cyc = NPAN + 2.0;
  float age = mod(mod(floor(uProc.x), cyc) - i + cyc, cyc) + fract(uProc.x);
  float life = 1.0 - smoothstep(0.7, 2.9, age);
  if (life <= 0.0) return 0.0;
  float open = smoothstep(0.0, 0.55, age);
  float fwf = max(fu*NPAN/(PU1 - PU0), 1e-4), gap = 0.07;
  float inV = smoothstep(gap - fwf, gap + fwf, f)*(1.0 - smoothstep(1.0 - gap - fwf, 1.0 - gap + fwf, f));
  float ax = abs(x);
  float inH = 1.0 - smoothstep(open - fx, open + fx, ax);
  float lw = max(fwf*1.3, 0.012);
  float border = (exp(-sq((f - gap)/lw)) + exp(-sq((f - 1.0 + gap)/lw)))*inH;
  float lead = exp(-sq((ax - open)/max(fx*1.5, 0.025)))*inV*(1.0 - smoothstep(0.35, 0.75, age));
  rim = (0.8*border + 1.6*lead)*life;
  return inV*inH*life*(0.35 + 0.65*exp(-age*1.1));
}
/* ACT — light from the top. A pulse launched at the lip at age 0 reaches the pond at PULSE_T, accelerating
   as the fall does; the surge is one front across the whole fall, a little ahead of the pulses */
float actFront(float age, float T){ return pow(clamp(age/T, 0.0, 1.0), 1.6); }
float actLight(float u, float up, float w, float tail){
  /* a sharp leading edge, a long glowing wake back up toward the lip */
  float x = (u - up)/w;
  return exp(-x*x*(x > 0.0 ? 4.0 : 1.0)) + 0.38*exp(-max(up - u, 0.0)/tail)*step(u, up);
}
/* bump from a height, without tangents (surface-gradient form) */
vec3 bumpN(vec3 p, vec3 n, float h, float k){
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det)*(dhx*r1 + dhy*r2);
  return normalize(abs(det)*n - g*k);
}
#endif
`;

export const FS_QUAD_VS = /* glsl */`
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p*2.0 - 1.0, 0.0, 1.0);
}`;
