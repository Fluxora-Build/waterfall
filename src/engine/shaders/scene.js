/* ============================================================================
   src/engine/shaders/scene.js — the place: sky, canyon, floor, platform,
   fins, pool, the observer. Opaque; every one ends in atmos().

   The canyon is made on the GPU from the grid index alone: the side walls
   are x = ±(half-width(z) + lean·y − bulge(z, y)), the bulge built from the
   noise texture with vertical anisotropy (columns three times taller than
   wide), strata shelves every ~74 m and a scree toe. The back cliff carries
   the lip: a straight engineered edge over an overhang, the alcove beneath
   it where the core sits. Wet streaks run down both: lower roughness,
   darker albedo, the fall's highlight sliding along them.

   The floor reflects the previous frame's bright layers (the bloom chain's
   unblurred ½ and ⅛ levels) through a proxy plane at the core: the reflected
   ray meets the plane, the plane point is projected with last frame's camera,
   the puddles take the sharp level and the rock the soft one.
   ========================================================================== */
import { P } from '../params.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const C = P.canyon, Co = P.core;
const T = Co.tiers;

/* ---------------- sky ---------------- */
export const SKY_VS = /* glsl */`
out vec2 vNdc;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2))*2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 1.0, 1.0);
}`;
export const SKY_FS = /* glsl */`
uniform mat4 uIVP;
in vec2 vNdc;
out vec4 o;
void main(){
  vec4 w = uIVP*vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(w.xyz/w.w - uEye);
  vec3 c = vec3(0.0016, 0.0045, 0.006)*(0.6 + 0.4*smoothstep(-0.1, 0.6, rd.y));
  /* a faint upper haze, lit from the gorge head */
  c += vec3(0.004, 0.012, 0.014)*exp(-abs(rd.x)*4.0)*smoothstep(0.1, 0.5, rd.y);
  o = vec4(atmos(c, uEye, rd, 2600.0)*(1.0 - 0.99*uJ.w), 1.0);
}`;

/* ---------------- the canyon walls ---------------- */
export const WALL_VS = /* glsl */`
uniform ivec2 uGrid;
uniform int uKind;          // 0: the side walls (instance 0 left, 1 right); 1: the back cliff
centroid out vec3 vP;
centroid out vec3 vN;
flat out float vK;
vec4 N(vec2 uv){ return textureLod(uNoise, uv, 0.0); }
const float ZB = ${f(C.zBack)}, ZF = ${f(C.zFront)}, HB = ${f(C.halfBack)}, HF = ${f(C.halfFront)}, LEAN = ${f(C.lean)};
const float TOPW = ${f(C.top)}, TOPV = ${f(C.topVar)};
float sideBulge(float z, float y){
  float b = 52.0*(N(vec2(z/1500.0, y/1900.0 + 0.31)).r - 0.5)*2.0;
  b += 40.0*(0.5 - N(vec2(z/300.0, y/1800.0 + 0.6)).b);
  b += 10.0*(0.5 - N(vec2(z/95.0, y/900.0 + 0.2)).b);
  float st = fract(y/74.0 + 0.35*N(vec2(z/800.0, 0.2)).g);
  b += 9.0*smoothstep(0.5, 0.8, st);
  b += 5.0*(N(vec2(z/110.0, y/280.0)).a - 0.5)*2.0;
  b += 34.0*exp(-y/24.0);
  return b;
}
vec3 sidePos(float s, float i, float j){
  float z = mix(ZB, ZF, i);
  float top = TOPW + TOPV*(N(vec2(z/1700.0, 0.71)).r - 0.5)*2.0 + 52.0*(N(vec2(z/240.0, 0.13)).a - 0.5)*2.0;
  float y = top*pow(j, 1.1);
  float hw = HB + (HF - HB)*clamp((z - ZB)/(ZF - ZB), 0.0, 1.0);
  return vec3(s*(hw + LEAN*y - sideBulge(z, y)), y, z);
}
vec3 cliffPos(float i, float j){
  float x = mix(-340.0, 340.0, i);
  float ax = abs(x);
  float lipM = 1.0 - smoothstep(LIP_H - 3.0, LIP_H + 26.0, ax);
  float topR = 336.0 + max(ax - 40.0, 0.0)*1.55 + 70.0*(N(vec2(x/700.0, 0.5)).r - 0.5)*2.0 + 34.0*(N(vec2(x/150.0, 0.9)).a - 0.5)*2.0;
  float top = mix(max(topR, LIP_Y + 8.0), LIP_Y, lipM);
  float y = top*pow(j, 1.04);
  float b = 16.0*(N(vec2(x/600.0, y/1500.0)).r - 0.5)*2.0 + 13.0*(0.62 - N(vec2(x/280.0, y/1100.0)).b*1.25)
          + 7.0*smoothstep(0.6, 0.7, fract(y/74.0 + 0.2*N(vec2(x/700.0, 0.4)).g));
  float zRock = -528.0 + b + 24.0*exp(-y/22.0);
  float ledge = smoothstep(LIP_Y - 52.0, LIP_Y - 1.0, y);
  float zLip = mix(-552.0 + b*0.25, LIP_Z, ledge*ledge*(3.0 - 2.0*ledge));
  return vec3(x, y, mix(zRock, zLip, lipM));
}
vec3 posAt(float s, float i, float j){ return uKind == 0 ? sidePos(s, i, j) : cliffPos(i, j); }
void main(){
  int id = gl_VertexID;
  float i = float(id % uGrid.x)/float(uGrid.x - 1), j = float(id/uGrid.x)/float(uGrid.y - 1);
  float s = gl_InstanceID == 0 ? -1.0 : 1.0;
  vec3 p = posAt(s, i, j);
  float di = 0.5/float(uGrid.x - 1), dj = 0.5/float(uGrid.y - 1);
  vec3 pi = posAt(s, i + di, j) - posAt(s, i - di, j);
  vec3 pj = posAt(s, i, min(j + dj, 1.0)) - posAt(s, i, max(j - dj, 0.0));
  vec3 n = normalize(cross(pj, pi));
  /* face the canyon's interior */
  vec3 inward = uKind == 0 ? vec3(-s, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  if (dot(n, inward) < 0.0) n = -n;
  vP = p; vN = n; vK = float(uKind);
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const WALL_FS = /* glsl */`
centroid in vec3 vP;
centroid in vec3 vN;
flat in float vK;
out vec4 o;
void main(){
  vec3 p = vP;
  vec3 n = normalize(vN);
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  vec2 q = vK < 0.5 ? vec2(p.z, p.y) : vec2(p.x, p.y);
  /* COLUMNAR JOINTING. The rock is cut into vertical columns (~9–20 m),
     broken by horizontal fractures; every block is a flat facet turned a
     little about the vertical and tipped a little out of it, so each one
     takes the fall's light differently — a cliff of monoliths, not a noise.
     Facet edges are blended over a pixel (fwidth), so they never shimmer. */
  float cxr = q.x/13.5 + 0.55*texture(uNoise, vec2(q.y/1100.0, q.x/1500.0 + 0.4)).r;
  float ci = floor(cxr), fx = cxr - ci;
  float wx = clamp(fwidth(cxr)*1.2, 0.02, 0.5);
  float hy0 = h1(uint(int(ci) + 40960)), hy1 = h1(uint(int(ci) + 40961));
  float cy0 = q.y/(24.0 + 58.0*hy0) + hy0*7.0, cy1 = q.y/(24.0 + 58.0*hy1) + hy1*7.0;
  vec4 f0 = h4(hashU(ivec2(int(ci), int(floor(cy0)))));
  vec4 f1 = h4(hashU(ivec2(int(ci) + 1, int(floor(cy1)))));
  float wy = clamp(fwidth(cy0)*1.2, 0.02, 0.5);
  vec4 f0b = h4(hashU(ivec2(int(ci), int(floor(cy0)) + 1)));
  f0 = mix(f0, f0b, smoothstep(1.0 - wy, 1.0, fract(cy0)));
  vec4 fc = mix(f0, f1, smoothstep(1.0 - wx, 1.0, fx));
  float ang = (fc.x - 0.5)*0.9, tip = (fc.y - 0.5)*0.32;
  float ca = cos(ang), sa = sin(ang);
  if (uDbg != 9.0) n = normalize(vec3(n.x*ca - n.z*sa, n.y + tip, n.x*sa + n.z*ca));
  /* the joints themselves: thin dark seams */
  float seam = min(min(fx, 1.0 - fx)/max(fwidth(cxr), 1e-4), min(fract(cy0), 1.0 - fract(cy0))/max(fwidth(cy0), 1e-4));
  float joint = 1.0 - 0.75*(1.0 - smoothstep(0.0, 1.6, seam));
  float h = texture(uNoise, vec2(q.x/11.0, q.y/48.0)).a*0.5 + fc.z*0.5;
  if (uDbg != 8.0) n = bumpN(p, n, texture(uNoise, vec2(q.x/7.0, q.y/40.0)).b*1.2, 1.0);
  float wet = smoothstep(0.55, 0.8, texture(uNoise, vec2(q.x/40.0, q.y/560.0 + 0.3)).g)*(0.4 + 0.6*fc.w);
  float shin = mix(10.0, 46.0, wet);
  vec3 alb = vec3(0.019, 0.024, 0.027)*(0.4 + 1.15*h)*mix(1.0, 0.55, wet)*joint;
  /* the gorge head: a cool top light that finds the ledges */
  vec3 Ls = normalize(vec3(0.0, 1.0, -0.55));
  vec3 sky = LC_SRC*0.11*sq(max(dot(n, Ls), 0.0))*smoothstep(-40.0, 380.0, p.y);
  vec3 sp = vec3(0.0);
  vec3 L = sceneLight(p, n, v, shin, sp);
  if (uDbg == 2.0){ L = vec3(0.0); sp = vec3(0.0); }
  if (uDbg == 3.0) sky = vec3(0.0);
  vec3 c = alb*(L + sky + vec3(0.002, 0.006, 0.008)*(0.5 + 0.5*n.y)) + sp*mix(0.01, 0.2, wet)*joint;
  /* the lip: the edge the data pours over glows */
  if (vK > 0.5){
    float lipE = (1.0 - smoothstep(LIP_H*(1.0 + 0.15*uW.x) - 4.0, LIP_H*(1.0 + 0.15*uW.x) + 14.0, abs(p.x)))*exp(-abs(p.y - LIP_Y)/1.4)*exp(-max(LIP_Z - p.z, 0.0)/2.5);
    c += HOT*lipE*2.2*uPh2.z*(1.0 - 0.6*uJ3.x)*(1.0 + 0.6*uW.w + 1.8*uProc.z*exp(-uProc.y/0.45));
  }
  /* ACT: the canyon answers the wave */
  c += ACC*waveAt(p)*0.55*(1.0 - smoothstep(60.0, 420.0, p.y));
  /* INGEST: the wave of incoming data sweeps down the rock with the rain in front of it */
  c += mix(DEEP, ACC, 0.65)*0.05*exp(-sq((p.y - (780.0 - uProc.w*430.0))/30.0))*smoothstep(0.0, 0.12, uProc.w)*(1.0 - smoothstep(1.6, 2.2, uProc.w))*smoothstep(0.0, 0.25, uW.x);
  c *= 1.0 - uJ.w;
  o = vec4(atmos(c, uEye, -v, Td), 1.0);
}`;

/* ---------------- the floor ---------------- */
export const GROUND_VS = /* glsl */`
centroid out vec3 vP;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vP = vec3(mix(-430.0, 430.0, c.x), 0.0, mix(${f(C.zBack)}, 220.0, c.y));
  gl_Position = uVP*vec4(vP, 1.0);
}`;
export const GROUND_FS = /* glsl */`
uniform sampler2D uRefl0;
uniform sampler2D uRefl1;
uniform mat4 uPrevVP;
uniform float uReflK;
centroid in vec3 vP;
out vec4 o;
void main(){
  vec3 p = vP;
  /* under the platform the floor is cut away once the portal opens: the well goes down through it */
  if (uJ2.x > 0.0 && length(p.xz - CORE.xz) < 40.0) discard;
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  vec4 nA = texture(uNoise, p.xz/150.0);
  vec4 nB = texture(uNoise, p.xz/33.0 + 0.37);
  float puddle = smoothstep(0.46, 0.6, nA.r*0.7 + nB.g*0.3);
  float h = nB.a*0.6 + nA.b*0.4;
  /* normals by finite differences in texture space: the mip chain band-limits
     them, so a floor seen at a grazing angle never breaks into blocks */
  vec2 e = vec2(0.9, 0.0);
  float hx = texture(uNoise, (p.xz + e.xy)/33.0 + 0.37).a - nB.a;
  float hz = texture(uNoise, (p.xz + e.yx)/33.0 + 0.37).a - nB.a;
  float far = 1.0/(1.0 + Td/260.0);
  vec3 n = normalize(vec3(-hx*2.2, 1.0, -hz*2.2)*vec3(1.0 - 0.85*puddle, 1.0, 1.0 - 0.85*puddle)*vec3(far, 1.0, far));
  /* the spray keeps the floor near the core restless */
  float near = exp(-length(p.xz - CORE.xz)/170.0);
  vec2 rq = p.xz/7.0;
  vec2 o1 = uTime*vec2(112.0, 68.0)/3600.0, o2 = -uTime*vec2(79.0, -101.0)/3600.0;
  float r0 = texture(uNoise, rq + o1).a + texture(uNoise, rq*1.7 + o2).a;
  float rx = texture(uNoise, rq + vec2(0.06, 0.0) + o1).a + texture(uNoise, (rq + vec2(0.06, 0.0))*1.7 + o2).a - r0;
  float rz = texture(uNoise, rq + vec2(0.0, 0.06) + o1).a + texture(uNoise, (rq + vec2(0.0, 0.06))*1.7 + o2).a - r0;
  n = normalize(n + vec3(-rx, 0.0, -rz)*1.4*(0.2 + near)*far);
  float rough = mix(0.55, 0.05, puddle);
  /* reflection: last frame's bright layers through a proxy plane at the core */
  vec3 r = reflect(-v, n);
  float zp = p.z > CORE.z + 6.0 ? CORE.z : -548.0;
  float tt = (zp - p.z)/min(r.z, -1e-3);
  vec3 hp = p + r*max(tt, 0.0);
  vec4 cp = uPrevVP*vec4(hp, 1.0);
  vec2 ruv = cp.xy/cp.w*0.5 + 0.5;
  vec3 refl = finite3(mix(finite3(texture(uRefl0, ruv).rgb), finite3(texture(uRefl1, ruv).rgb), saturate(rough*1.8)));
  float edge = smoothstep(0.0, 0.05, ruv.x)*smoothstep(1.0, 0.95, ruv.x)*smoothstep(1.0, 0.9, ruv.y)*step(0.0, cp.w);
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 sp = vec3(0.0);
  vec3 L = sceneLight(p, n, v, mix(10.0, 180.0, puddle), sp);
  vec3 alb = vec3(0.020, 0.025, 0.027)*(0.55 + 0.9*h)*mix(1.0, 0.45, puddle);
  vec3 c = alb*(L + vec3(0.002, 0.006, 0.007)) + sp*mix(0.02, 0.22, puddle) + refl*edge*fres*mix(0.3, 1.0, puddle)*uReflK;
  /* UNDERSTAND: the floor is a plate too — its nodal web lights around the core */
  if (uW.z > 0.01){
    vec2 dq = p.xz - CORE.xz; float rr = length(dq); float th = atan(dq.x, dq.y);
    float dA = abs(cos(MODE_N*th))*rr/MODE_N;
    float g = (rr - MODE_R0)/MODE_SP; float dR = abs(fract(g + 0.5) - 0.5)*MODE_SP;
    float lw = max(0.45, length(fwidth(p.xz))*0.9);
    float web = max(exp(-sq(dA/lw)), exp(-sq(dR/lw)))*smoothstep(96.0, 118.0, rr)*exp(-rr/380.0);
    c += ACC*web*uW.z*0.45*(0.45/lw);
  }
  /* ACT: the wave runs out over the wet floor */
  c += mix(ACC, HOT, 0.3)*(waveAt(p)*1.4 + ripples(p)*2.4);
  c *= 1.0 - uJ.w;
  o = vec4(atmos(c, uEye, -v, Td), 1.0);
}`;

/* ---------------- the platform ---------------- */
export const PLAT_VS = /* glsl */`
layout(location=0) in vec4 aP;   // xyz, part
layout(location=1) in vec4 aN;   // normal, tier
layout(location=2) in float aAng; // the angle of this quad's centre about the core
centroid out vec3 vP;
centroid out vec3 vN;
centroid out vec3 vR0;   // the rest position: the lines of light are drawn where they were made
flat out vec2 vPT;
void main(){
  vec3 p = aP.xyz;
  float part = aP.w, tier = aN.w, op = 0.0;
  if (op > 0.0){
    const float PET = 6.2831853/8.0;
    if (part > 1.5 || tier > 1.5){
      float ac = (floor(aAng/PET) + 0.5)*PET;
      p.xz += vec2(cos(ac), sin(ac))*op*32.0;
      p.y += part > 1.5 ? -op*55.0 : op*1.5;
    } else if (tier > 0.5){
      float ac = floor(aAng/PET + 0.5)*PET;
      p.xz += vec2(cos(ac), sin(ac))*op*14.0;
    }
  }
  vP = p; vR0 = aP.xyz; vN = aN.xyz; vPT = vec2(part, tier);
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const PLAT_FS = /* glsl */`
uniform mat4 uPrevVP;
centroid in vec3 vP;
centroid in vec3 vN;
centroid in vec3 vR0;
flat in vec2 vPT;
out vec4 o;
const vec3 TY = vec3(${T.map((t) => f(t[1])).join(', ')});
const vec3 TH = vec3(${T.map((t) => f(t[2])).join(', ')});
const float CH = ${f(Co.chamfer)};
float outlineD(vec2 q, float hs){ q = abs(q); return max(max(q.x, q.y) - hs, (q.x + q.y - hs*(2.0 - CH))*0.7071); }
/* how far this point moved on screen since the last frame (px): thin lines widen by it (a short streak, the same light) */
float motPx(vec3 p){ vec4 a = uVP*vec4(p, 1.0), b = uPrevVP*vec4(p, 1.0); return b.w > 0.01 ? min(40.0, length((a.xy/a.w - b.xy/b.w)*0.5*uRes)) : 0.0; }
void main(){
  vec3 p = vP; vec3 n = normalize(vN);
  float part = vPT.x, tier = vPT.y; int ti = int(tier + 0.5);
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  /* the petal's own pattern travels with it: grooves, edges, lines are taken at the rest position */
  vec2 q = vR0.xz - CORE.xz; float r = length(q); float th = atan(q.y, q.x);
  /* panel grooves */
  float groove = 0.0;
  if (part < 0.5){ float g = vR0.y/1.15; groove = band(fract(g), 0.0, 0.08, fwidth(g)); }
  else if (part < 1.5){ vec2 g = q/6.0; vec2 fw = fwidth(g); groove = max(band(fract(g.x), 0.0, 0.05, fw.x), band(fract(g.y), 0.0, 0.05, fw.y)); }
  vec3 alb = vec3(0.016, 0.020, 0.022)*(1.0 - 0.6*groove);
  vec3 sp = vec3(0.0);
  vec3 L = sceneLight(p, n, v, 60.0, sp);
  vec3 c = alb*(L + vec3(0.002, 0.005, 0.006)) + sp*0.09*(1.0 - groove);
  /* the journey: the metal goes dark, its lines of light stay — only the core remains */
  c *= 1.0 - 0.92*uJ.w;
  float act = uCore.x;
  float poolI = (0.9 + 0.8*uW.x + 0.5*uW.y + 1.4*uW.w + 2.0*uWave.y + 1.4*uCore.y)*act;
  /* the tier edges: a thin line of light along each top outline */
  float y1 = ti == 0 ? TY.x : (ti == 1 ? TY.y : TY.z);
  float hf = ti == 0 ? TH.x : (ti == 1 ? TH.y : TH.z);
  if (part < 1.5){
    float dE = part < 0.5 ? (y1 - vR0.y) : -outlineD(q, hf);
    float pw = 2.0*Td/(uF*uRes.y)*(1.0 + motPx(vP));
    float lw = max(0.16, pw*1.5);
    c += ACC*exp(-max(dE, 0.0)/lw)*(0.16/lw)*(0.55 + 0.45*act)*(ti == 2 ? 1.3 : 0.7);
  }
  /* the top tier: fine radial lines, and the aperture's rim */
  if (part > 0.5 && part < 1.5 && ti == 2){
    float a = th/TAU*${f(Co.radial)};
    float ka = floor(a + 0.5);
    float dl = abs(a - ka)*TAU*r/${f(Co.radial)};
    float mot = motPx(vP);
    float pw = 2.0*Td/(uF*uRes.y)*(1.0 + mot);
    float lw = max(0.12, pw*1.5);
    float line = exp(-sq(dl/lw))*(0.12/lw)*smoothstep(2.5, 4.5, TAU*r/${f(Co.radial)}/pw);
    float hk = h1(uint(ka + 200.0));
    /* sparks run outward along the lines (the swirl clock) */
    float sx = fract(uPh.z*0.22 + hk);
    float spark = exp(-sq((r - mix(APER, 66.0, sx))/2.2))*step(0.72, hk);
    float thL = ka/${f(Co.radial)}*TAU;
    float nod = exp(-sq(cos(MODE_N*thL)/0.12));
    float I = 0.05 + 0.9*uW.y + 1.6*uW.z*nod + spark*(0.6 + 2.0*uW.y) + 2.5*uCore.y*exp(-sq((r - APER - uCore.w*30.0)/3.0));
    c += ACC*line*I*act*smoothstep(APER, APER + 3.0, r);
    c += mix(ACC, HOT, 0.4)*exp(-max(r - APER, 0.0)/0.6)*(0.7 + poolI*0.5);
    /* THE DECK'S RINGS: four etched circles around the aperture, each carrying a band of micro-segments that
       turns (alternate rings in opposite directions) and a few pulses running round it; they wake as the
       portal opens and the camera comes down to them */
    float wake = 0.18 + 0.82*smoothstep(0.0, 0.6, uJ2.x);
    for (int i = 0; i < 4*uLoop; i++){
      float fi = float(i);
      float Ri = 38.5 + fi*6.4;
      float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
      float ring = exp(-sq((r - Ri)/lw))*(0.1/lw);
      float ma = th/TAU*(72.0 + 24.0*fi) + dir*uTime*(0.03 + 0.012*fi)*(1.0 + 3.0*uJ3.w);
      float dash = mix(0.38, band(fract(ma), 0.0, 0.38, fwidth(ma)*(1.0 + mot)), smoothstep(2.5, 4.5, TAU*r/(72.0 + 24.0*fi)/pw));
      float segB = band(r, Ri + 1.0, Ri + 2.6, max(fwidth(r)*(1.0 + mot), 1e-4))*dash;
      float ph = fract(dir*uTime*0.04*(1.0 + 0.3*fi) + fi*0.27);
      float dth = abs(fract(th/TAU - ph + 0.5) - 0.5)*TAU*r;
      float pulse = exp(-sq(dth/2.2))*exp(-sq((r - Ri)/(lw*2.0)));
      c += ACC*(ring*(0.3 + 0.7*dash) + segB*0.05)*wake*act + mix(ACC, HOT, 0.7)*pulse*1.4*wake*act;
    }
  }
  /* the well: lit from the pool beneath */
  if (part > 1.5){
    float lp = exp(-max(vR0.y - POOL_Y, 0.0)/2.2);
    c += ACC*poolI*lp*(part > 2.5 ? 0.35 : 0.22);
    /* engineered ticks along each tread's lip */
    float tk = fract(th/TAU*180.0);
    c += ACC*band(tk, 0.0, 0.18, fwidth(th/TAU*180.0))*exp(-abs(vR0.y - (POOL_Y + 1.0))/0.6)*0.4*act;
  }
  c += ACC*(waveAt(p) + ripples(p)*0.8)*0.6;
  o = vec4(atmos(c, uEye, -v, Td), 1.0);
}`;

/* ---------------- fins ---------------- */
export const FIN_VS = /* glsl */`
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in vec4 aI;   // x, z, orientation, height
centroid out vec3 vP;
centroid out vec3 vN;
void main(){
  vec3 s = aI.z < 0.5 ? vec3(${f(Co.fins.depth)}, aI.w, ${f(Co.fins.thick)}) : vec3(${f(Co.fins.thick)}, aI.w, ${f(Co.fins.depth)});
  vP = vec3(aI.x, 0.0, aI.y) + aP*s;
  vN = aN;
  gl_Position = uVP*vec4(vP, 1.0);
}`;
export const FIN_FS = /* glsl */`
centroid in vec3 vP;
centroid in vec3 vN;
out vec4 o;
void main(){
  vec3 p = vP; vec3 n = normalize(vN);
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  vec3 sp = vec3(0.0);
  vec3 L = sceneLight(p, n, v, 50.0, sp);
  vec3 c = vec3(0.014, 0.017, 0.019)*(L + 0.004) + sp*0.08;
  c += ACC*waveAt(p)*0.5;
  c *= 1.0 - 0.92*uJ.w;
  o = vec4(atmos(c, uEye, -v, Td), 1.0);
}`;

/* ---------------- the pool: where information becomes energy ----------------
   A shaded height field of light — never drawn contours. Emission from below
   is focused by the surface's curvature (caustics: brighter where it bulges),
   the fall's light glances off it. The field per mechanism:
     1 COLLIMATE  a calm, steady bullseye under the sorted channels
     2 ACCRETE    log-spiral arms wound by the orbiting inflow
     3 INTERFERE  every stream that lands rings the pool; the rings interfere
   and on top of any of them: PROCESS turns arms, UNDERSTAND settles into the
   standing mode, ACT sends one ring out, a packet's landing pings it. */
export const POOL_VS = /* glsl */`
centroid out vec3 vP;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1))*2.0 - 1.0;
  vP = vec3(CORE.x + c.x*POOL_R, POOL_Y - uJ2.x*55.0, CORE.z + c.y*POOL_R);
  gl_Position = uVP*vec4(vP, 1.0);
}`;
export const POOL_FS = /* glsl */`
uniform vec4 uSrc[12];   // ripple sources: x, z (relative), amplitude, phase
centroid in vec3 vP;
out vec4 o;
float field(vec2 q){
  float r = length(q), th = atan(q.y, q.x);
  float t = uTime;
  float h = 0.0;
  float busy = (0.55 + 0.75*uW.x)*(1.0 - 0.88*uW.z);
  if (uMech < 1.5 || uMech > 2.5){
    for (int i = 0; i < 12*uLoop; i++){
      float rr = length(q - uSrc[i].xy);
      h += uSrc[i].z*sin(rr*0.95 - t*(TAU*1948.0/3600.0) + uSrc[i].w)/(1.0 + rr*0.11);
    }
    h *= busy*0.45;
  } else {
    h = sin(log(r + 1.5)*7.5 - th*3.0 - uPh.z*2.4)*1.1/(1.0 + r*0.04)*busy;
  }
  h += uW.y*0.95*cos(r*0.5 - 3.0*th - uPh.z*2.6)/(1.0 + r*0.04);
  h += uW.z*1.3*cos(MODE_N*th)*cos(r*PI/9.0)*(0.75 + 0.25*cos(uPh.w));
  float ar = uWave.w*36.0; h += uWave.y*2.4*exp(-sq((r - ar)/2.4));
  h += uCore.y*1.6*exp(-sq((r - uCore.w*22.0)/2.0));
  return h;
}
void main(){
  vec2 q = vP.xz - CORE.xz;
  float r = length(q);
  if (r > POOL_R) discard;
  vec3 dv = uEye - vP; float Td = length(dv); vec3 v = dv/Td;
  float e = 0.35;
  float h0 = field(q), hx = field(q + vec2(e, 0.0)), hz = field(q + vec2(0.0, e));
  float hx2 = field(q - vec2(e, 0.0)), hz2 = field(q - vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - hx2)/(2.0*e)*0.35, 1.0, -(hz - hz2)/(2.0*e)*0.35));
  float lap = (hx + hx2 + hz + hz2 - 4.0*h0)/(e*e);
  float focus = clamp(-lap*0.55, -0.6, 2.8);
  float act = uCore.x;
  float E = (0.55 + focus*0.6)*(0.7 + 0.6*exp(-r*r/160.0));
  float land = 0.0;
  for (int i = 0; i < 4*uLoop; i++) land += uRip[i].y*exp(-uRip[i].w/0.35);
  E *= (1.1 + 0.6*uW.x + 0.5*uW.y + 0.3*uW.z + 2.6*uW.w + 2.5*uWave.y + 1.6*uCore.y + 2.2*land)*act;
  vec3 sp = vec3(0.0);
  fallLight(vP, n, v, 240.0, sp);
  float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 c = mix(ACC, HOT, saturate(focus*0.35 + 0.15))*E*1.6 + sp*fres*3.0;
  c *= (1.0 - 0.55*uJ.y);
  /* THE IRIS: the orb's surface opens from its centre out onto the portal beneath; its edge burns */
  float ro = POOL_R*uJ2.x*1.04;
  if (uJ2.x > 0.0 && r < ro) discard;
  c += mix(ACC, HOT, 0.7)*exp(-max(r - ro, 0.0)/0.7)*3.0*smoothstep(0.0, 0.08, uJ2.x);
  c *= smoothstep(POOL_R, POOL_R - 1.5, r);
  o = vec4(atmos(c, uEye, -v, Td), 1.0);
}`;

/* ---------------- the observer ---------------- */
export const FIG_VS = /* glsl */`
uniform vec3 uFig;
centroid out vec2 vQ;
centroid out vec3 vP;
flat out float vRefl;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec3 toE = uEye - uFig; toE.y = 0.0; toE = normalize(toE);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toE));
  float refl = float(gl_InstanceID);
  vQ = vec2((c.x*2.0 - 1.0)*0.55, c.y*1.92);
  vec3 p = uFig + right*vQ.x + vec3(0.0, vQ.y*(1.0 - 2.0*refl), 0.0);
  vP = p; vRefl = refl;
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const FIG_FS = /* glsl */`
centroid in vec2 vQ;
centroid in vec3 vP;
flat in float vRefl;
out vec4 o;
float cap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*t) - r; }
void main(){
  vec2 p = vQ;
  float d = length(p - vec2(0.0, 1.70)) - 0.11;
  d = min(d, cap(p, vec2(0.0, 1.50), vec2(0.0, 1.0), 0.19));
  d = min(d, cap(p, vec2(-0.08, 0.98), vec2(-0.09, 0.03), 0.075));
  d = min(d, cap(p, vec2(0.08, 0.98), vec2(0.09, 0.03), 0.075));
  d = min(d, cap(p, vec2(-0.21, 1.46), vec2(-0.25, 0.92), 0.06));
  d = min(d, cap(p, vec2(0.21, 1.46), vec2(0.25, 0.92), 0.06));
  float aa = max(fwidth(d), 1e-3);
  float a = 1.0 - smoothstep(-aa, aa, d);
  if (a < 0.01) discard;
  vec3 dv = uEye - vP; float Td = length(dv);
  /* rim light from the core behind them */
  float rim = smoothstep(-aa*2.5, 0.0, d)*(0.6 + 0.4*uCore.x);
  vec3 c = (vec3(0.004, 0.006, 0.007) + ACC*rim*0.35)*(1.0 - uJ.w);
  if (vRefl > 0.5){ o = vec4(0.0, 0.0, 0.0, a*0.7); return; }
  o = vec4(atmos(c, uEye, -dv/Td, Td), a);
}`;
