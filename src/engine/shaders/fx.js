/* ============================================================================
   src/engine/shaders/fx.js — the light: streams, the sheet, the rings, the
   energy column, the floor's traces, the particles. All additive.

   THE NOTATION. Not digits. Each stream is a tape of marks read in RELEASE
   TIME: a mark at depth d left the lip τ(d) seconds ago, so marks are dense
   at the lip, stretch and space out as they accelerate, and every property
   carried by the data (density, braid, lattice) falls with it. A mark is
   one of eight constructed shapes on a 2 x 1 cell — full bar, half bars,
   a split bar, a stem dash, a dot pair, a hairline, a bracket — whose length
   is a fixed physical size plus motion blur. When marks shrink below two
   pixels they resolve to their mean (no shimmer at the lip).

   THE LAST METRES. data → compression (the pull narrows the fall) →
   acceleration (marks stretch to streaks) → transformation (marks dissolve
   into a continuous filament, turquoise to white) → energy (the pool).
   ========================================================================== */
import { P } from '../params.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const LAT = 3;  // lattice rows per flow-second (× the 600 s period = whole cells)

/* ---------------- streams ---------------- */
export const STREAM_VS = /* glsl */`
layout(location=0) in vec2 aT;   // u along, side ±1
layout(location=1) in vec4 aA;   // lane|x|angle, depth|z|radius, layer, seed
layout(location=2) in vec4 aB;   // width, brightness, speed, threshold
layout(location=3) in vec4 aC;   // rate, density, importance|top|height, group|length
uniform float uSpeed;
uniform float uActIdx[6];   // ACT's few bright streams (instance indices)
centroid out vec4 vS;    // across, d (m along the flow), u, layer
centroid out vec4 vA;    // seed, rate, density, importance
centroid out vec4 vB;    // intensity, speed, lattice (process at release), 0
centroid out vec3 vP;
flat out int vInst;
void main(){
  float u = aT.x, side = aT.y;
  float layer = aA.z, seed = aA.w;
  float width = aB.x, I = aB.y, sp = aB.z, thr = aB.w;
  vec3 p, tng = vec3(0.0, -1.0, 0.0);
  float d, vis = 1.0, latt = 0.0, imp = 0.0;
  if (layer < 0.5){
    /* rain: a column hanging in the canyon air, falling at a constant slow speed */
    d = u*aC.w;
    p = vec3(aA.x, aC.z - d, aA.y);
    vis = smoothstep(0.0, 0.3, u)*smoothstep(1.0, 0.65, u)*uPh2.z*(1.0 + 0.9*uW.x)*(1.0 - 0.65*uW.z)*(1.0 - uJ2.y);
    /* INGEST: more columns pour (the near ones only now), and one wave of light comes down the whole screen */
    if (aB.w > 1.5) vis *= uW.x;
    float yf = 780.0 - uProc.w*430.0;
    I *= 1.0 + 3.2*exp(-sq((p.y - yf)/42.0))*smoothstep(0.0, 0.12, uProc.w)*(1.0 - smoothstep(1.6, 2.2, uProc.w))*smoothstep(0.0, 0.25, uW.x);
  } else if (layer > 4.5){
    /* rim threads: processed data rising off the aperture's rim */
    float hgt = aC.z*(1.0 + 1.4*uW.w + 0.45*uW.y);
    d = u*hgt;
    float a = aA.x + uPh.z*0.12;
    p = vec3(CORE.x + cos(a)*aA.y, TOP_Y + d, CORE.z + sin(a)*aA.y);
    tng = vec3(0.0, 1.0, 0.0);
    vis = smoothstep(0.0, 0.12, u)*smoothstep(1.0, 0.45, u)*uCore.x*(0.45 + 0.6*uW.y + 0.9*uW.w)*(1.0 - 0.6*uW.z)*step(thr, 0.35 + 0.65*(uW.y + uW.w))*(1.0 - uJ2.y);
  } else if (layer > 3.5){
    /* peripheral falls: straight down the back cliff — they pour only while INGESTING */
    d = u*aC.z;
    float lag = tauOf(d)/(sp*max(uSpeed, 0.3));
    vis = smoothstep(thr - 0.03, thr + 0.03, 0.62 + 0.38*uW.x)*histIntro(lag)*smoothstep(1.0, 0.94, u)*(1.0 - uJ2.y);
    p = vec3(aA.x + 2.5*sin(u*5.0 + seed), aC.z - d, aA.y + 9.0*(1.0 - pow(1.0 - u, 1.6)));
    tng = normalize(vec3(0.0, -1.0, -0.03));
  } else {
    /* the fall */
    d = u*FALL_D;
    float lag = tauOf(d)/(sp*max(uSpeed, 0.3));
    imp = aC.z;
    float wI = uW.x, wU = uW.z, wA = uW.w;
    /* INGEST: 40 % more streams pour */
    vis = smoothstep(thr - 0.04, thr + 0.04, 0.62*(1.0 + 0.4*wI))*histIntro(lag);
    p = fallPath(u, aA.x, aA.y, seed, aC.w);
    vec3 p2 = fallPath(min(u + 0.005, 1.0), aA.x, aA.y, seed, aC.w);
    vec3 p1 = fallPath(max(u - 0.005, 0.0), aA.x, aA.y, seed, aC.w);
    tng = normalize(p2 - p1);
    /* UNDERSTAND: past the waist only 1 in 8 goes on (brighter); the rest end at the waist, and the knot
       where they all meet is held down so it does not burn */
    float keep8 = step(0.875, fract(seed*5.31 + 0.17));
    vis *= mix(1.0, mix(1.0 - smoothstep(0.40, 0.50, u), 1.0, keep8), wU);
    I *= (1.0 + 0.9*wU*keep8*smoothstep(0.46, 0.6, u))*(1.0 - 0.45*wU*exp(-sq((u - 0.46)/0.07)));
    /* ACT: only its few bright streams reach the pond; the rest give out on the way down */
    float act = 0.0;
    for (int i = 0; i < 6*uLoop; i++) act = max(act, 1.0 - step(0.5, abs(float(gl_InstanceID) - uActIdx[i])));
    act *= layer > 1.5 && layer < 2.5 ? 1.0 : 0.0;
    vis *= mix(1.0, mix(1.0 - 0.94*smoothstep(0.2, 0.55, u), 1.0, act), wA);
    I *= 1.0 + 3.2*wA*act;
    I *= 1.0 + 0.35*smoothstep(0.86, 1.0, u);
    I *= smoothstep(0.0, 0.008, u);
    /* the journey selects: streams rank by importance, the filaments last; the few that remain brighten */
    float rank = layer > 2.5 ? 0.95 + 0.05*fract(seed*7.31) : imp;
    float thrS = uJ.y*0.91;   // ~9 % of the streams and every filament stay to the core
    float keep = smoothstep(thrS - 0.035, thrS + 0.005, rank);
    vis *= mix(1.0, keep, smoothstep(0.0, 0.05, uJ.y));
    /* ...except after the dark, when the fall is the place again, quieter than what came out of it */
    I *= (1.0 + 1.5*uJ.y*keep*(1.0 - uJ3.x))*(1.0 - 0.7*uJ3.x);
  }
  /* the chamber: only the fall's own streams, as the column; at the end it thins from the top down */
  if (uWB.x > 0.5){ vis *= (layer > 0.5 && layer < 3.5) ? uWB.y*mix(1.0, smoothstep(0.87, 0.985, u), smoothstep(0.3, 0.9, uChB_s())) : 0.0; }
  vec3 V = uEye - p; float dist = length(V); V /= dist;
  vec3 sd = cross(tng, V); float sl = length(sd); sd = sl > 1e-4 ? sd/sl : vec3(1.0, 0.0, 0.0);
  float mpp = 2.0*dist/(uF*uRes.y);
  float wTrue = max(width, 1.35*mpp);
  I *= width/wTrue*vis*transmit(p);
  /* inside the fall the streams are threads: a ribbon is never wider than a few pixels, and the many dim down */
  float wEff = min(wTrue, mix(24.0, 4.0, smoothstep(0.0, 0.5, uJ.x))*mpp);
  I *= mix(1.0, 0.6, uJ.x);
  /* nothing fills the lens */
  I *= smoothstep(3.0, 16.0, dist);
  p += sd*side*wEff*0.5;
  vS = vec4(side, d, u, layer);
  vA = vec4(seed, aC.x, aC.y*(1.0 + 0.4*uW.x), imp);
  vB = vec4(I, sp, latt, aA.x);
  vP = p;
  vInst = gl_InstanceID;
  gl_Position = uVP*vec4(p, 1.0);
}`;

export const STREAM_FS = /* glsl */`
uniform vec4 uPkt[4];   // packet: instance, release (flow), strength, speed
uniform float uSpeed;
uniform float uFlowStep; // how far the flow clock moved since the last frame (0 in a still)
centroid in vec4 vS;
centroid in vec4 vA;
centroid in vec4 vB;
centroid in vec3 vP;
flat in int vInst;
out vec4 o;
const float LAT = ${f(LAT)};
void main(){
  float I = vB.x;
  if (I < 0.002) discard;
  /* whatever the rasteriser hands us, the stream's own coordinates stay in range */
  float s = clamp(vS.x, -1.0, 1.0), d = max(vS.y, 0.0), u = clamp(vS.z, 0.0, 1.0), layer = vS.w;
  float seed = vA.x, rate = vA.y, dens = vA.z, imp = vA.w, sp = vB.y, latt = vB.z;
  bool fall = layer > 0.5 && layer < 4.5;
  float vel, tr, spacing;
  if (fall){ vel = velOf(d)*sp*uSpeed; tr = uPh.x - tauOf(d)/sp; spacing = velOf(d)*sp/rate; }
  else { vel = sp; tr = layer > 4.5 ? uPh.x - d/sp : uPh.x - d/sp; spacing = sp/rate; }
  /* ---- the notation ---- */
  float c = tr*rate;
  float Ncell = floor(rate*PERIOD + 0.5);
  float kc = floor(c);
  float k = mod(kc, Ncell);
  float fc = c - kc;
  float fw = max(fwidth(c), 1e-4);
  /* MOTION BLUR ALONG THE FALL: a mark moves rate × (the flow's step) cells a frame. Near the lens that is tens of
     pixels — a mark that jumps that far each frame strobes. So its edges widen by the distance it travels (the same
     light spread over its own path, a short streak), and a mark moving more than a third of its spacing a frame
     settles to the stream's average. Far away the step is a fraction of a pixel and nothing changes; in a still, 0. */
  float fwM = fw + rate*uFlowStep;
  float markL = 1.5 + vel*0.022;
  float fr = clamp(markL/spacing, 0.03, 0.82);
  vec4 h = h4(uint(k) + uint(seed*977.0)*7919u);
  float on = step(h.x, dens);
  float ty = floor(h.y*8.0);
  float aa = max(fwidth(s), 0.04);
  float ax = abs(s);
  float acr, lenM = 1.0;
  if (ty < 1.0) acr = band(ax, -1.0, 0.82, aa);
  else if (ty < 2.0) acr = band(s, -0.82, 0.05, aa);
  else if (ty < 3.0) acr = band(s, -0.05, 0.82, aa);
  else if (ty < 4.0){ acr = band(ax, -1.0, 0.24, aa); lenM = 2.6; }
  else if (ty < 5.0) acr = band(ax, 0.32, 0.86, aa);
  else if (ty < 6.0){ acr = band(abs(ax - 0.52), -1.0, 0.26, aa); lenM = 0.45; }
  else if (ty < 7.0){ acr = band(ax, -1.0, 0.82, aa); lenM = 0.32; }
  else { acr = max(band(ax, -1.0, 0.82, aa)*step(fc, fr*0.3), band(s, 0.48, 0.86, aa)); }
  float Lm = min(fr*lenM, 0.92);
  float mark = on*acr*band(fc, 0.0, Lm, fwM)*(0.42 + 0.58*h.z)*(h.w > 0.965 ? 2.4 : 1.0);
  float lod = smoothstep(0.28, 0.7, fwM);
  mark = mix(mark, dens*min(fr, 0.9)*0.42, lod);
  /* IN THE WELL the streams' last stretch (u > 0.82) is drawn out hundreds of metres down the axis: whatever travels
     along it there — the marks, the flow's texture, the filaments' heads — would race a long way each frame and strobe.
     So there it settles to its own average: a steady ray of light that still answers the state */
  float stK = uJ2.x*smoothstep(0.80, 0.86, u);
  mark = mix(mark, dens*min(fr, 0.9)*0.42, stK);
  /* a hairline spine ties a stream's marks together */
  if (layer > 0.5 && layer < 1.5) mark += 0.05*band(ax, -1.0, 0.12, aa);

  vec2 nq = vec2(fract(seed*0.37) + s*0.02, tr*0.4);
  float flowN = mix(texture(uNoise, nq).r, 0.55, stK);
  /* primary streams: a fluid body under the marks */
  if (layer > 1.5 && layer < 2.5){
    float body = exp(-s*s*2.0)*(0.15 + 0.85*smoothstep(0.38, 0.72, flowN));
    mark = mark*1.1 + body*0.5;
  }
  /* filaments: a thread of light with travelling heads */
  if (layer > 2.5 && layer < 3.5){
    float head = mix(on*pow(1.0 - fc, 7.0), 0.3*dens, stK);
    mark = exp(-s*s*5.0)*(0.1 + 2.6*head);
  }
  if (fall){
    /* PROCESS: the marks fall into rows — a lattice, every fifth row a pulse into the core */
    if (latt > 0.01){
      float cL = tr*LAT;
      float fwL = max(fwidth(cL), 1e-4);
      float frL = clamp((0.6 + vel*0.012)/(velOf(d)*sp/LAT), 0.025, 0.5);
      float row = band(ax, -1.0, 1.0, aa)*band(fract(cL), 0.0, frL, fwL);
      float pulse = mod(floor(cL), 5.0) < 0.5 ? 2.8 : 0.75;
      float lat = mix(row*pulse, 0.3, smoothstep(0.28, 0.7, fwL));
      mark = mix(mark, lat, latt*0.88);
    }
    /* PROCESS: the code marks quiet down and the panels' energy runs through the streams */
    if (uW.y > 0.01){
      float rimP, pf = procPanel(u, clamp(vB.w, -1.0, 1.0), max(fwidth(u), 1e-4), 0.03, rimP);
      float core = exp(-s*s*2.0);
      mark = mark*(1.0 - 0.6*uW.y) + uW.y*(pf*(0.2 + 0.85*core) + rimP*0.5*core);
    }
    /* the last metres: marks dissolve into a continuous filament */
    float e = smoothstep(0.86, 0.985, u)*(layer < 3.5 ? 1.0 : 0.0);
    float cont = exp(-s*s*2.5)*(0.45 + 0.85*smoothstep(0.3, 0.7, flowN));
    /* the fall is compressed here — many streams overlap — so each gives less */
    mark = mix(mark, cont*0.5, e*0.8);
    /* ACT: the surge pours down every stream; the pulses run down the few bright ones */
    if (uProc.z > 0.0 && uProc.y < PULSE_T*1.2 && layer < 3.5){
      float uf = actFront(uProc.y, PULSE_T*0.9);
      mark += uProc.z*(1.0 - smoothstep(1.0, 1.2, uProc.y/PULSE_T))*actLight(u, uf, 0.022, 0.2)*2.4*exp(-s*s*1.2);
    }
    for (int i = 0; i < 8*uLoop; i++){
      if (uActP[i].z <= 0.0 || int(uActP[i].x + 0.5) != vInst) continue;
      float a = uActP[i].y;
      float birth = 1.0 + 2.0*exp(-a/0.12);
      mark += uActP[i].z*actLight(u, actFront(a, PULSE_T), 0.02, 0.2)*4.2*birth*exp(-s*s*1.4);
    }
    /* a packet: one quiet thought falling into the core */
    for (int i = 0; i < 4*uLoop; i++){
      if (uPkt[i].z <= 0.0 || int(uPkt[i].x + 0.5) != vInst) continue;
      float df = mod(tr - uPkt[i].y + PERIOD*0.5, PERIOD) - PERIOD*0.5;
      float pk = exp(-sq(df/0.045))*3.5 + exp(-max(df, 0.0)/0.45)*step(0.0, df)*1.1;
      /* in the well the streams' last stretch is drawn out hundreds of metres: a packet there would race a long way in
         one frame (a strobe), so it fades before it gets there */
      mark += pk*uPkt[i].z*exp(-s*s*1.4)*(1.0 - stK);
    }
    vec3 col = mix(ACC, HOT, clamp(0.1 + 0.6*e + 0.3*step(0.965, h.w)*on + 0.55*exp(-d/7.0), 0.0, 1.0));
    o = vec4(col*mark*I*1.3, 0.0);
    return;
  }
  vec3 col = layer < 0.5 ? mix(DEEP, ACC, 0.6) : mix(ACC, HOT, 0.25);
  o = vec4(col*mark*I, 0.0);
}`;

/* ---------------- the sheet: the fall's body, the lip, the lattice net, the nodal lines ---------------- */
export const SHEET_VS = /* glsl */`
layout(location=0) in vec2 aT;
uniform float uSpeed;
centroid out vec3 vS;   // across, d, u
centroid out vec3 vP;
void main(){
  float u = aT.x, side = aT.y;
  vec3 p = fallPath(u, side*1.07, 0.0, 0.0, 0.0);
  vS = vec3(side, u*FALL_D, u);
  vP = p;
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const SHEET_FS = /* glsl */`
uniform float uSpeed;
centroid in vec3 vS;
centroid in vec3 vP;
out vec4 o;
void main(){
  float s = clamp(vS.x, -1.0, 1.0), d = max(vS.y, 0.0), u = clamp(vS.z, 0.0, 1.0);
  if (uDbg == 16.0){ o = vec4(d, s, u, 0.0); return; }
  float tr = uPh.x - tauOf(d);
  float lag = tauOf(d)/max(uSpeed, 0.3);
  float intro = histIntro(lag);
  float edge = pow(max(1.0 - s*s, 0.0), 0.7);
  float streak = texture(uNoise, vec2(s*0.55 + 0.13, tr*0.15)).g;
  float sheet = edge*(0.2 + 0.8*smoothstep(0.35, 0.75, streak))*0.05*intro*(1.0 + 0.6*uW.x - 0.5*uW.z)*(1.0 - 0.7*uW.w);
  /* the lip: the data pours over a line of light */
  float lipN = texture(uNoise, vec2(s*0.9 + 0.21, 0.37)).r;
  float lip = exp(-d/1.3)*(1.0 - smoothstep(0.84, 1.0, abs(s)))*(1.2 + 3.4*smoothstep(0.35, 0.7, lipN))*uPh2.z;
  lip += exp(-d/9.0)*edge*0.5*uPh2.z;
  /* the foot gathers energy */
  float foot = smoothstep(0.8, 1.0, u)*edge*0.08*uCore.x;
  float pw = 2.0*length(uEye - vP)/(uF*uRes.y);
  /* PROCESS: the panels of energy, across the sheet */
  float net = 0.0;
  if (uW.y > 0.01){
    float rimP, pf = procPanel(u, s/1.07, max(fwidth(u), 1e-4), max(fwidth(s), 1e-3), rimP);
    net = (pf*0.28 + rimP*0.75)*uW.y*(1.0 - smoothstep(0.93, 1.0, abs(s)));
  }
  /* ACT: the surge's front crosses the whole sheet; the lip flares as it leaves */
  float flare = uProc.z*exp(-uProc.y/0.45)*smoothstep(0.0, 0.05, uProc.y);
  if (uProc.z > 0.0 && uProc.y < PULSE_T*1.2){
    float uf = actFront(uProc.y, PULSE_T*0.9);
    net += uProc.z*(1.0 - smoothstep(1.0, 1.2, uProc.y/PULSE_T))*actLight(u, uf, 0.02, 0.14)*edge*0.42;
  }
  lip *= 1.0 + 0.9*uW.w + 2.6*flare;
  float nodal = 0.0;
  if (uDbg == 5.0) nodal = 0.0;
  if (uDbg == 6.0) net = 0.0;
  if (uDbg == 7.0) lip = 0.0;
  if (uDbg == 10.0) sheet = 0.0;
  if (uDbg == 11.0) foot = 0.0;
  vec3 col = ACC*(sheet + net + foot) + HOT*lip + mix(ACC, HOT, 0.45)*nodal;
  o = vec4(col*transmit(vP)*(1.0 - uJ.x)*(1.0 - 0.7*uJ3.x), 0.0);
}`;

/* ---------------- the rings ---------------- */
export const RING_VS = /* glsl */`
layout(location=0) in vec2 aT;
uniform vec4 uRA[4];   // y, radius, tube, tilt
uniform vec4 uRB[4];   // spin, precession, ticks, gap
centroid out vec4 vR;           // across, spun angle, ring, 0
centroid out vec3 vP;
vec3 ringPt(int k, float th){
  vec4 A = uRA[k], B = uRB[k];
  vec3 pt = vec3(cos(th)*A.y, 0.0, sin(th)*A.y);
  vec3 ax = vec3(cos(B.y), 0.0, sin(B.y));
  float ct = cos(A.w), st = sin(A.w);
  pt = pt*ct + cross(ax, pt)*st + ax*dot(ax, pt)*(1.0 - ct);
  return vec3(CORE.x, A.x, CORE.z) + pt;
}
void main(){
  int k = gl_InstanceID;
  float th = aT.x*TAU;
  vec3 p = ringPt(k, th);
  vec3 tng = normalize(ringPt(k, th + 0.004) - ringPt(k, th - 0.004));
  vec3 V = uEye - p; float dist = length(V); V /= dist;
  vec3 sd = cross(tng, V); float sl = length(sd); sd = sl > 1e-4 ? sd/sl : vec3(0.0, 1.0, 0.0);
  float mpp = 2.0*dist/(uF*uRes.y);
  float w = max(uRA[k].z*3.2, 3.6*mpp);
  p += sd*aT.y*w*0.5;
  vR = vec4(aT.y, th - uRB[k].x, float(k), w/mpp);
  vP = p;
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const RING_FS = /* glsl */`
uniform vec4 uRA[4];
uniform vec4 uRB[4];
centroid in vec4 vR;
centroid in vec3 vP;
out vec4 o;
void main(){
  float s = vR.x; int k = int(vR.z + 0.5);
  float a = mod(vR.y, TAU);
  float px = vR.w;                                  // ribbon width in pixels
  float coreW = max(0.18, 1.1/px);                   // the line: ≥ ~1 px
  float line = exp(-sq(s/coreW))*min(1.0, px*coreW*0.9);
  float ticks = uRB[k].z;
  float ta = a/TAU*ticks;
  float tick = band(fract(ta), 0.0, 0.14, max(fwidth(ta), 1e-3))*band(s, -1.0, -0.15, 0.08)*0.55;
  float major = band(fract(a/TAU*12.0), 0.0, 0.015, fwidth(a/TAU*12.0))*band(s, -1.0, 0.95, 0.08);
  float gapH = uRB[k].w*0.5;
  float ga = min(a, TAU - a);
  float gap = smoothstep(gapH - 0.02, gapH + 0.02, ga);
  float blk = h1(uint(floor(a/TAU*24.0)) + uint(k)*97u);
  float block = step(0.8, blk)*band(s, -0.5, 0.5, 0.1)*0.5;
  float I = (line*0.9 + tick + major*0.8 + block)*gap;
  float ping = float(int(uCore.z + 0.5) == k)*uCore.y;
  I *= (0.32 + 0.4*uCore.x)*(1.0 + 1.3*uW.y + 0.5*uW.z + 0.7*uW.w + 3.0*ping + 1.6*uWave.y*exp(-uWave.w*1.2));
  o = vec4(mix(ACC, HOT, 0.2 + 0.4*ping)*I*transmit(vP)*uJ2.z, 0.0);
}`;

/* ---------------- the energy column over the aperture ---------------- */
export const COLUMN_VS = /* glsl */`
centroid out vec2 vQ;
centroid out vec3 vP;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec3 toE = uEye - CORE; toE.y = 0.0; toE = normalize(toE);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toE));
  float hw = 34.0*(1.0 + 0.35*uW.w);
  vQ = vec2(c.x*2.0 - 1.0, c.y);
  vec3 p = vec3(CORE.x, POOL_Y, CORE.z) + right*vQ.x*hw + vec3(0.0, c.y*150.0, 0.0);
  vP = p;
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const COLUMN_FS = /* glsl */`
centroid in vec2 vQ;
centroid in vec3 vP;
out vec4 o;
void main(){
  /* MSAA may shade a pixel centre just outside the quad: clamp what is interpolated */
  float x = clamp(vQ.x, -1.0, 1.0), y = clamp(vQ.y, 0.0, 1.0);
  float w = mix(0.42, 0.1, sqrt(y));
  float prof = exp(-x*x/(w*w));
  float up = exp(-y*3.4);
  float sh = texture(uNoise, vec2(x*0.35 + 0.3, y*0.7 - uTime*0.05)).r;
  float I = prof*up*(0.45 + 0.8*smoothstep(0.3, 0.75, sh));
  I += uW.y*prof*up*0.9*pow(max(0.5 + 0.5*sin(x*9.0 + y*28.0 - uPh.z*4.0), 0.0), 6.0);
  I *= uCore.x*(1.0 + 0.4*uW.x + 1.5*uW.w + 3.0*uWave.y*exp(-uWave.w*1.4) + 1.2*uCore.y)*(1.0 - 0.45*uW.z);
  o = vec4(mix(ACC, HOT, prof*0.5)*I*0.075*smoothstep(0.0, 0.08, y)*transmit(vP)*(1.0 - 0.75*uJ.w)*(1.0 - uJ.y), 0.0);
}`;

/* ---------------- the floor's traces ---------------- */
export const TRACE_VS = /* glsl */`
layout(location=0) in vec4 aV;   // centre x, z, s, side
layout(location=1) in vec4 aL;   // miter normal x, z, seed, length
layout(location=2) in float aWd; // width (m)
centroid out vec4 vT;                      // s, side, seed, length
centroid out vec3 vP;
centroid out float vK;                     // energy scale (the width clamp)
void main(){
  vec3 c = vec3(aV.x, 0.06, aV.y);
  vec3 V = uEye - c; float dist = length(V);
  float mpp = 2.0*dist/(uF*uRes.y);
  float sinE = max(abs(V.y)/dist, 0.04);
  /* a line on the floor seen at a grazing angle: keep it ≥ ~1.2 px tall on screen */
  float w = max(aWd, 1.2*mpp/sinE);
  vec3 p = c + vec3(aL.x, 0.0, aL.y)*aV.w*w*0.5;
  vP = p; vK = aWd/w;
  vT = vec4(aV.z, aV.w, aL.z, aL.w);
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const TRACE_FS = /* glsl */`
centroid in vec4 vT;
centroid in vec3 vP;
centroid in float vK;
out vec4 o;
void main(){
  float s = max(vT.x, 0.0), seed = vT.z, total = vT.w;
  float r0 = 92.0;
  float pin = fract(s/26.0 + uPh2.x*0.9 + seed*7.0);
  float dashIn = smoothstep(0.0, 0.04, pin)*smoothstep(0.16, 0.05, pin);
  float pout = fract(s/34.0 - uPh2.y*1.3 + seed*5.0);
  float dashOut = smoothstep(0.0, 0.03, pout)*smoothstep(0.22, 0.04, pout);
  float x = (r0 + s - uWave.x)/16.0;
  float front = uWave.y*(exp(-x*x)*3.0 + 0.35*exp(min(x, 0.0)*0.3)*step(x, 0.0));
  float vary = 0.35 + 0.65*fract(seed*13.7);
  float I = 0.03*vary + dashIn*(0.16 + 0.8*uW.x)*vary + dashOut*uW.w*2.6 + front + ripples(vP)*1.8;
  I *= (1.0 - 0.6*uW.z)*uPh2.z;
  I *= smoothstep(total, total - 6.0, s)*exp(-s/460.0);
  o = vec4(ACC*I*vK*transmit(vP)*(1.0 - uJ.w), 0.0);
}`;

/* ---------------- particles ----------------
   Stateless: every particle is a function of its index and the clocks, so
   the count can rise and fall without a single one jumping — the readout's
   PARTICLES is the number drawn this frame. Each is a streak between where
   it is and where it was 35 ms ago (motion blur on screen). */
export const PART_VS = /* glsl */`
layout(location=0) in vec2 aC;   // corner ±1
uniform vec4 uKS;     // kind starts: fall, spray, ambient, orbit
uniform vec4 uKS2;    // starts: launch, nodes, fragments, end
uniform vec4 uN0;     // active: fall, spray, ambient, orbit
uniform vec4 uN1;     // active: launch, nodes, fragments
uniform vec4 uNodes[${P.particles.nodes}];
uniform vec4 uCurO;   // the cursor's ray: origin, strength
uniform vec4 uCurD;   // direction
uniform float uSpeed;
uniform float uPxK;   // CSS px → drawing-buffer px
uniform float uBase;  // this draw's first particle (one draw per kind)
centroid out vec2 vQ;
centroid out vec3 vC;
centroid out vec2 vLR;         // half length, radius (px)
vec2 toScreen(vec4 c){ return (c.xy/c.w*0.5 + 0.5)*uRes; }
void main(){
  int id = int(uBase + 0.5) + gl_InstanceID;
  vec4 h = h4(uint(id)*2654435761u + 911u);
  vec4 g = h4(uint(id)*1597334677u + 37u);
  vec3 p, p0; float I = 0.0, rad = 0.8, fade = 1.0;
  float fid = float(id);
  if (fid < uKS.y){
    /* falling motes inside the sheet */
    float li = fid - uKS.x; fade = saturate(uN0.x - li);
    float lane = h.x*2.0 - 1.0, depth = h.y*2.0 - 1.0, sp = 0.9 + h.z*0.25;
    float life = T_FALL/sp; life = PERIOD/floor(PERIOD/life + 0.5);
    float age = mod(uPh.x + h.w*life, life);
    float tau = age*sp, tau0 = max(tau - 0.035*sp*uSpeed, 0.0);
    float d = V0*tau + 0.5*GRAV*tau*tau, d0 = V0*tau0 + 0.5*GRAV*tau0*tau0;
    float u = d/FALL_D, u0 = d0/FALL_D;

    float grp = floor((lane + 1.0)*0.5*GROUPS);
    vec3 j = (g.xyz - 0.5)*vec3(2.5, 1.0, 3.0);
    p = fallPath(min(u, 1.0), lane, depth, h.x*7.0, grp) + j;
    p0 = fallPath(min(u0, 1.0), lane, depth, h.x*7.0, grp) + j;
    float dens = (0.62 + 0.38*uW.x - 0.5*uW.z)*(1.0 - 0.6*uW.w);
    I = 0.5*smoothstep(g.w - 0.05, g.w + 0.05, dens)*histIntro(tau)*(1.0 + 2.0*smoothstep(0.85, 1.0, u))*step(u, 1.0)*(1.0 - 0.85*uJ.y);
    rad = 0.75;
  } else if (fid < uKS.z){
    /* the impact: every landing throws a crown of sparks that cool as they fall back */
    float li = fid - uKS.y; fade = saturate(uN0.y - li);
    float life = 0.9 + h.z*1.3; life = 3600.0/floor(3600.0/life + 0.5);
    float age = mod(uTime + h.w*life, life);
    vec3 o0;
    if (uMech < 1.5){
      float ch = (floor(h.x*7.0) + 0.5)/7.0*2.0 - 1.0;
      o0 = vec3(CORE.x + ch*IMP_H*0.95*(1.0 - 0.32*uW.y) + (g.z - 0.5)*1.2, IMP_Y + 0.8, CORE.z + (g.w - 0.5)*1.2);
    } else {
      float a0 = h.x*TAU, r0 = sqrt(h.y)*IMP_H*1.1;
      o0 = vec3(CORE.x + cos(a0)*r0, IMP_Y + 1.0, CORE.z + sin(a0)*r0*0.7);
    }
    float az = g.x*TAU;
    vec3 dir = vec3(cos(az), 0.0, sin(az));
    if (uMech > 1.5 && uMech < 2.5) dir = normalize(dir + vec3(-sin(az), 0.0, cos(az))*1.3);
    float up = 7.0 + 30.0*g.y*g.y;
    vec3 vel = dir*(3.0 + 24.0*h.y*h.y) + vec3(0.0, up, 0.0);
    vel *= 1.0 + 0.7*uW.w + 0.3*uW.x - 0.35*uW.z;
    p = o0 + vel*age - vec3(0.0, 0.5*GRAV*age*age, 0.0);
    float a1 = max(age - 0.035, 0.0);
    p0 = o0 + vel*a1 - vec3(0.0, 0.5*GRAV*a1*a1, 0.0);
    float rr = length(p.xz - CORE.xz);
    float cool = age/life;
    I = (1.25 - cool)*(rr < APER ? 1.0 : smoothstep(TOP_Y - 0.5, TOP_Y + 2.0, p.y))*uCore.x*2.2*(1.0 - uJ.z);
    rad = 0.9 + 0.8*(1.0 - cool);
  } else if (fid < uKS.w){
    /* motes in the canyon air — INGEST draws them into the fall */
    float li = fid - uKS.z; fade = saturate(uN0.z - li);
    float z = -540.0 + h.z*640.0;
    float hwz = mix(${f(P.canyon.halfBack)}, ${f(P.canyon.halfFront)}, saturate((z - ${f(P.canyon.zBack)})/${f(P.canyon.zFront - P.canyon.zBack)}));
    vec3 home = vec3((h.x*2.0 - 1.0)*(hwz - 20.0), 6.0 + pow(h.y, 1.5)*400.0, z);
    const float W1 = TAU*29.0/3600.0, W2 = TAU*18.0/3600.0, W3 = TAU*25.0/3600.0;
    vec3 drift = vec3(sin(uTime*W1 + g.x*TAU)*7.0, sin(uTime*W2 + g.y*TAU)*3.0, cos(uTime*W3 + g.z*TAU)*7.0);
    vec3 dv = vec3(cos(uTime*W1 + g.x*TAU)*7.0*W1, cos(uTime*W2 + g.y*TAU)*3.0*W2, -sin(uTime*W3 + g.z*TAU)*7.0*W3);
    float ph = fract(g.w + uPh2.x*(0.05 + 0.05*h.w));
    vec3 entry = vec3(clamp(home.x*0.25, -LIP_H*0.6, LIP_H*0.6), max(home.y, 30.0)*0.9, LIP_Z + 40.0);
    float pull = uW.x*step(h.w, 0.75);
    vec3 pulled = mix(home, entry, ph*ph);
    p = mix(home + drift, pulled, pull);
    p0 = p - dv*0.035 - (entry - home)*2.0*ph*0.004*pull;
    /* the hand: a gentle wake around the cursor's ray, never a follow */
    vec3 rel = p - uCurO.xyz; float along = dot(rel, uCurD.xyz);
    vec3 perp = rel - uCurD.xyz*along; float dperp = length(perp);
    float wake = uCurO.w*exp(-sq(dperp/(16.0 + along*0.04)))*step(0.0, along);
    p += perp/max(dperp, 1e-3)*wake*9.0;
    I = 0.16*(1.0 + 1.2*pull*smoothstep(0.0, 0.2, ph)*smoothstep(1.0, 0.8, ph))*(1.0 - 0.5*uW.z)*uPh2.z*(1.0 - uJ2.y);
    rad = 0.85;
  } else if (fid < uKS2.x){
    /* PROCESS: energy turning about the core on two spiral arms */
    float li = fid - uKS.w; fade = saturate(uN0.w - li);
    float rr = 9.0 + pow(h.x, 0.8)*52.0;
    float yy = TOP_Y + 3.0 + h.y*h.y*80.0*(1.0 - h.x*0.4);
    float arm = h.w > 0.5 ? PI : 0.0;
    float w = 2.2/(0.6 + rr/14.0);
    float a = arm + 2.3*log(rr/9.0) + (g.x - 0.5)*0.5 + uPh.z*w*1.4;
    p = vec3(CORE.x + cos(a)*rr, yy, CORE.z + sin(a)*rr);
    float a0 = a - w*1.4*0.05;
    p0 = vec3(CORE.x + cos(a0)*rr, yy, CORE.z + sin(a0)*rr);
    I = 0.55*uW.y*(0.5 + 0.5*g.y);
    rad = 0.8;
  } else if (fid < uKS2.y){
    /* ACT: a few launch outward from the system */
    float li = fid - uKS2.x; fade = saturate(uN1.x - li);
    float age = uWave.w;
    float a0 = h.x*TAU, el = 0.2 + 0.6*h.y, spd = 45.0 + 95.0*h.z;
    vec3 vel = vec3(cos(a0)*cos(el), sin(el), sin(a0)*cos(el))*spd;
    vec3 o0 = vec3(CORE.x, TOP_Y + 6.0, CORE.z);
    p = o0 + vel*age - vec3(0.0, 0.5*GRAV*age*age, 0.0);
    float a1 = max(age - 0.035, 0.0);
    p0 = o0 + vel*a1 - vec3(0.0, 0.5*GRAV*a1*a1, 0.0);
    I = 1.3*exp(-age*0.8)*step(0.0, p.y)*step(age, 5.0);
    rad = 0.9;
  } else if (fid < uKS2.z){
    /* UNDERSTAND: the field's nodes, glinting */
    float li = fid - uKS2.y; fade = saturate(uN1.y - li);
    vec4 nd = uNodes[int(li)];
    p = nd.xyz; p0 = p;
    I = uW.z*(0.75 + 0.5*sin(uTime*(TAU*745.0/3600.0) + nd.w*TAU))*1.6;
    rad = 1.5;
  } else {
    /* the journey: fragments of the data streaming past the camera inside the fall */
    float li = fid - uKS2.z; fade = saturate(uN1.z - li);
    float r = 3.0 + pow(h.x, 0.7)*72.0, a = h.y*TAU;
    float spd = 40.0 + 55.0*h.z, span = 150.0;
    float ph = fract(h.w + uPh.x*spd/span);
    p = uEye + vec3(cos(a)*r, (0.5 - ph)*span, sin(a)*r);
    p0 = p + vec3(0.0, spd*0.035, 0.0);
    I = 0.6*uJ2.w*smoothstep(0.0, 0.15, ph)*smoothstep(1.0, 0.8, ph);
    rad = 0.65 + 0.5*h.z;
  }
  I *= fade*transmit(p);
  vec4 c1 = uVP*vec4(p, 1.0), c0 = uVP*vec4(p0, 1.0);
  if (I < 0.003 || c1.w < 1.0 || c0.w < 1.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s1 = toScreen(c1), s0 = toScreen(c0);
  vec2 dv = s1 - s0; float L = length(dv);
  vec2 ax = L > 1e-3 ? dv/L : vec2(1.0, 0.0);
  vec2 ay = vec2(-ax.y, ax.x);
  float R = rad*uPxK;
  float hl = L*0.5;
  vec2 mid = (s1 + s0)*0.5;
  vec2 sp2 = mid + ax*aC.x*(hl + R) + ay*aC.y*R;
  vQ = aC; vLR = vec2(hl, R);
  vC = mix(ACC, HOT, 0.45)*I/(1.0 + hl/max(R, 0.5)*0.35);
  gl_Position = vec4(sp2/uRes*2.0 - 1.0, c1.z/c1.w, 1.0);
}`;
export const PART_FS = /* glsl */`
centroid in vec2 vQ;
centroid in vec3 vC;
centroid in vec2 vLR;
out vec4 o;
void main(){
  float hl = vLR.x, R = vLR.y;
  vec2 q = vec2(vQ.x*(hl + R), vQ.y*R);
  float dd = length(vec2(max(abs(q.x) - hl, 0.0), q.y))/R;
  float a = exp(-dd*dd*2.6);
  o = vec4(vC*a, 0.0);
}`;
