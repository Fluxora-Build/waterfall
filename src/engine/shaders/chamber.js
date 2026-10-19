/* ============================================================================
   src/engine/shaders/chamber.js — THE RESOLUTION CHAMBER (journey.js: the
   world after the breakthrough; chamber.js: its geometry).

   One light model for the room: six point lights (the pool, the column, the
   three outputs, a cold light high behind) and one air — a thin uniform haze
   that the pool and the column glow in. Everything ends in chAtmos().

   uChB  = reveal, outputs, simplify, column
   uChB2 = haze, glow, motes, 0
   SIMPLIFY takes the room away: the pillars sink into the dark, the haze
   thins, every glow drops to a hairline, the motes go — until what remains
   is a dark surface, a quiet core, and three faces that become the cards.
   ========================================================================== */
import { CH } from '../chamber.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
const PR = CH.core.profile;

export const CH_COMMON = /* glsl */`
uniform vec4 uCL[6];      // the room's lights: xyz, intensity — pool, column, insights, automations, decisions, back
uniform vec4 uChB;        // reveal, outputs, simplify, column
uniform vec4 uChB2;       // haze, glow, motes, 0
uniform vec3 uOutH;       // per output: its card is hovered (eased 0..1) — its glyph and its channel answer
uniform vec3 uGlyphA;     // per glyph: its turn (radians, integrated on the CPU so a faster turn never jumps)
const vec3 CH_BG = vec3(0.0016, 0.0030, 0.0034);
const float CH_POOLR = ${f(CH.core.poolR)}, CH_POOLY = ${f(CH.core.poolY)};
const float CH_PR[${PR.length}] = float[](${PR.map((p) => f(p[0])).join(', ')});
const float CH_PY[${PR.length}] = float[](${PR.map((p) => f(p[1])).join(', ')});
const vec3 CH_OUT0 = ${v3(CH.outs[0].col)}, CH_OUT1 = ${v3(CH.outs[1].col)}, CH_OUT2 = ${v3(CH.outs[2].col)};
vec3 chLCol(int i){ return i == 0 ? vec3(0.55, 1.0, 0.94) : i == 1 ? vec3(0.35, 0.9, 0.95) : i == 2 ? CH_OUT0 : i == 3 ? CH_OUT1 : i == 4 ? CH_OUT2 : vec3(0.25, 0.55, 0.62); }
float chLRange(int i){ return i == 0 ? 75.0 : i == 1 ? 170.0 : i == 5 ? 520.0 : 42.0; }
vec3 chLight(vec3 p, vec3 n, vec3 v, float shin, inout vec3 sp){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6*uLoop; i++){
    float I = uCL[i].w; if (I <= 0.0) continue;
    vec3 l = uCL[i].xyz - p; float d2 = dot(l, l); l *= inversesqrt(d2);
    float R = chLRange(i), att = I/(1.0 + d2/(R*R));
    vec3 h = normalize(l + v);
    vec3 col = chLCol(i);
    c += col*att*max(dot(n, l), 0.0);
    sp += col*att*pow(max(dot(n, h), 0.0), shin)*(shin + 2.0)*0.04;
  }
  return c;
}
/* the air: a thin haze the pool and the column glow in (closed-form in-scatter from a point light) */
vec3 chIns(vec3 ro, vec3 rd, float T, int i){
  float I = uCL[i].w; if (I <= 0.0) return vec3(0.0);
  vec3 oc = uCL[i].xyz - ro; float b = dot(oc, rd);
  float h = sqrt(max(dot(oc, oc) - b*b, 16.0));
  return chLCol(i)*I*(atan((T - b)/h) + atan(b/h))/h;
}
vec3 chAtmos(vec3 c, vec3 ro, vec3 rd, float T){
  T = min(T, 4000.0);
  float tr = exp(-T*0.0011*uChB2.x);
  vec3 ins = (chIns(ro, rd, T, 0)*1.0 + chIns(ro, rd, T, 1)*0.8)*0.010*uChB2.x;
  return c*tr + CH_BG*(1.0 - tr) + ins;
}
`;

/* ---------------- the void around the room ---------------- */
export const CH_SKY_FS = /* glsl */`${CH_COMMON}
uniform mat4 uIVP;
in vec2 vNdc;
out vec4 o;
void main(){
  vec4 w = uIVP*vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(w.xyz/w.w - uEye);
  vec3 c = CH_BG*(0.75 + 0.25*smoothstep(-0.2, 0.4, rd.y));
  /* the column's halo in the air: the ray's closest approach to the axis, and the height there */
  vec2 d2 = rd.xz; float dd = max(dot(d2, d2), 1e-5);
  float t = max(-dot(uEye.xz, d2)/dd, 0.0);
  float dist = length(uEye.xz + d2*t), y = uEye.y + rd.y*t;
  float halo = exp(-dist/30.0)*smoothstep(10.0, 90.0, y)*(1.0 - smoothstep(260.0, 700.0, y));
  c += vec3(0.010, 0.040, 0.044)*halo*uChB.w*(1.0 - 0.7*uChB.z);
  /* far behind the core, the faintest lit air */
  c += vec3(0.002, 0.007, 0.008)*exp(-abs(rd.y - 0.05)*7.0)*smoothstep(0.0, 1.0, -rd.z)*uChB.x*(1.0 - 0.8*uChB.z);
  o = vec4(c, 1.0);
}`;

/* ---------------- the core ---------------- */
export const CH_CORE_VS = /* glsl */`
layout(location=0) in vec4 aP;   // xyz, ring
layout(location=1) in vec4 aN;   // normal, kind (0 tread, 1 wall)
layout(location=2) in vec2 aR;   // radius, occlusion
centroid out vec3 vP;
centroid out vec3 vN;
centroid out float vAo;
flat out vec2 vK;
void main(){
  vP = aP.xyz; vN = aN.xyz; vAo = aR.y; vK = vec2(aP.w, aN.w);
  gl_Position = uVP*vec4(aP.xyz, 1.0);
}`;
export const CH_CORE_FS = /* glsl */`${CH_COMMON}
centroid in vec3 vP;
centroid in vec3 vN;
centroid in float vAo;
flat in vec2 vK;
out vec4 o;
void main(){
  vec3 p = vP; vec3 n = normalize(vN);
  int k = int(vK.x + 0.5); float kind = vK.y;
  float r = length(p.xz), th = atan(p.z, p.x);
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  float pw = 2.0*Td/(uF*uRes.y);
  float nse = texture(uNoise, p.xz/70.0 + 0.2).r;
  vec3 alb = vec3(0.019, 0.023, 0.026)*(0.8 + 0.4*nse);
  vec3 sp = vec3(0.0);
  vec3 L = chLight(p, n, v, kind < 0.5 ? 70.0 : 36.0, sp);
  vec3 c = alb*(L*vAo + vec3(0.003, 0.005, 0.006)) + sp*0.3*vAo;
  float glow = uChB2.y*(1.0 - 0.75*uChB.z);
  float fk = float(k), dir = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
  float r0 = CH_PR[k], r1 = CH_PR[k + 1];
  float lw = max(0.09, pw*0.8);
  if (kind < 0.5){
    /* a tread: radial seams (finer toward the centre), a lit channel, the turning micro-segments, pulses */
    float nseg = floor(40.0 + 8.0*fk);
    float a = th/TAU*nseg;
    float da = abs(fract(a + 0.5) - 0.5)*TAU*r/nseg;
    float seam = exp(-sq(da/max(0.08, pw*0.7)));
    c *= 1.0 - 0.55*seam;
    float rm = mix(r0, r1, 0.5);
    float chan = exp(-sq((r - rm)/lw))*(0.1/lw);
    float ma = th/TAU*(64.0 + 10.0*fk) + dir*uTime*(0.02 + 0.006*fk);
    float dash = band(fract(ma), 0.0, 0.4, fwidth(ma));
    float pulse = 0.0;
    for (int j = 0; j < 2*uLoop; j++){
      float ph = fract(dir*uTime*(0.028 + 0.004*fk)*(1.0 + 0.5*float(j)) + float(j)*0.5 + fk*0.21);
      float dth = abs(fract(th/TAU - ph + 0.5) - 0.5)*TAU*r;
      pulse += exp(-sq(dth/2.4));
    }
    float inner = smoothstep(90.0, 30.0, r);
    c += ACC*chan*(0.25 + 0.75*dash)*(0.35 + 0.9*inner)*glow;
    c += mix(ACC, HOT, 0.75)*pulse*exp(-sq((r - rm)/(lw*1.8)))*1.3*glow;
    /* the etched rings: the finest geometry, seen only near */
    float e = r/1.6; float etch = band(fract(e), 0.0, 0.06, fwidth(e));
    c += ACC*etch*0.006*smoothstep(3.0*pw, 0.6*pw, 0.08)*glow;
  } else {
    /* a wall: vertical ribs; a lit line along its top edge */
    float a = th/TAU*(180.0 + 12.0*fk);
    float rib = band(fract(a), 0.0, 0.12, fwidth(a));
    c *= 1.0 - 0.4*rib;
    float yt = max(CH_PY[k], CH_PY[k + 1]);
    float edge = exp(-max(yt - p.y, 0.0)/max(0.1, pw))*(0.09/max(0.1, pw));
    c += ACC*edge*(0.5 + 0.6*smoothstep(100.0, 40.0, r))*glow;
  }
  o = vec4(chAtmos(c*uChB.x, uEye, -v, Td), 1.0);
}`;

/* ---------------- the pool: where the column lands ---------------- */
export const CH_POOL_VS = /* glsl */`
centroid out vec3 vP;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1))*2.0 - 1.0;
  vP = vec3(c.x*${f(CH.core.poolR + 0.5)}, ${f(CH.core.poolY)}, c.y*${f(CH.core.poolR + 0.5)});
  gl_Position = uVP*vec4(vP, 1.0);
}`;
export const CH_POOL_FS = /* glsl */`${CH_COMMON}
centroid in vec3 vP;
out vec4 o;
void main(){
  float r = length(vP.xz); if (r > CH_POOLR) discard;
  float th = atan(vP.z, vP.x);
  vec3 dv = uEye - vP; float Td = length(dv);
  /* the landing: a hot centre; rings of light drawn inward to it; fine radial structure */
  float g = r/4.2 + uTime*0.42;
  float ringsI = band(fract(g), 0.0, 0.22, fwidth(g))*smoothstep(CH_POOLR, CH_POOLR*0.4, r);
  float a = th/TAU*96.0; float rad = band(fract(a), 0.0, 0.2, fwidth(a))*smoothstep(4.0, 14.0, r);
  float I = 0.5 + 3.4*exp(-r*r/70.0) + 0.6*ringsI + 0.12*rad + 2.0*exp(-max(CH_POOLR - r, 0.0)/0.6);
  vec3 c = mix(ACC, HOT, clamp(0.3 + 0.5*exp(-r*r/120.0), 0.0, 1.0))*I*uChB2.y*(1.0 - 0.7*uChB.z)*1.4;
  o = vec4(chAtmos(c, uEye, -dv/Td, Td), 1.0);
}`;

/* ---------------- the floor ---------------- */
export const CH_FLOOR_VS = /* glsl */`
centroid out vec3 vP;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1))*2.0 - 1.0;
  vP = vec3(c.x*${f(CH.floor.half)}, 0.0, c.y*${f(CH.floor.half)});
  gl_Position = uVP*vec4(vP, 1.0);
}`;
export const CH_FLOOR_FS = /* glsl */`${CH_COMMON}
uniform sampler2D uRefl0;
uniform sampler2D uRefl1;
uniform mat4 uPrevVP;
/* a block under the cards in the last frame (none by default): x how much (the end fade), y the top of its zone in
   buffer pixels from the bottom, z the fade's half-width. The etched rings fade out below it. */
uniform vec4 uChLogo;
centroid in vec3 vP;
out vec4 o;
void main(){
  vec3 p = vP;
  float r = length(p.xz);
  if (r < ${f(CH.core.profile[0][0] - 1)}) discard;
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  float pw = 2.0*Td/(uF*uRes.y);
  vec3 n = vec3(0.0, 1.0, 0.0);
  /* tiles: seams every ${CH.floor.tile} m, a faint finer grid, concentric etched rings around the core */
  vec2 tq = p.xz/${f(CH.floor.tile)}; vec2 fw = fwidth(tq);
  vec2 tf = abs(fract(tq + 0.5) - 0.5);
  float seam = max(1.0 - smoothstep(0.0, max(fw.x*1.2, 0.006), tf.x), 1.0 - smoothstep(0.0, max(fw.y*1.2, 0.006), tf.y));
  vec2 gq = p.xz/6.0; vec2 gw = fwidth(gq); vec2 gf = abs(fract(gq + 0.5) - 0.5);
  float grid = max(1.0 - smoothstep(0.0, gw.x, gf.x), 1.0 - smoothstep(0.0, gw.y, gf.y))*smoothstep(0.5, 0.15, max(gw.x, gw.y));
  float rr = r/26.0; float ringE = band(fract(rr), 0.0, 0.03, fwidth(rr))*smoothstep(132.0, 150.0, r)*exp(-r/420.0);
  ringE *= 1.0 - uChLogo.x*(1.0 - smoothstep(uChLogo.y - uChLogo.z, uChLogo.y + uChLogo.z, gl_FragCoord.y));
  float nse = texture(uNoise, p.xz/90.0).g;
  vec3 alb = vec3(0.017, 0.021, 0.024)*(0.8 + 0.4*nse)*(1.0 - 0.35*seam);
  vec3 sp = vec3(0.0);
  vec3 L = chLight(p, n, v, 90.0, sp);
  /* reflection: last frame's bright layers through a proxy wall at the core */
  vec3 rd = reflect(-v, n);
  float zp = p.z > 0.0 ? 0.0 : -320.0;
  float tt = (zp - p.z)/min(rd.z, -1e-3);
  vec3 hp = p + rd*max(tt, 0.0);
  vec4 cp = uPrevVP*vec4(hp, 1.0);
  vec2 ruv = cp.xy/cp.w*0.5 + 0.5;
  vec3 refl = finite3(mix(finite3(texture(uRefl0, ruv).rgb), finite3(texture(uRefl1, ruv).rgb), 0.5));
  float edge = smoothstep(0.0, 0.05, ruv.x)*smoothstep(1.0, 0.95, ruv.x)*smoothstep(1.0, 0.9, ruv.y)*step(0.0, cp.w);
  float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float glow = uChB2.y*(1.0 - 0.8*uChB.z);
  vec3 c = alb*(L + vec3(0.002, 0.004, 0.005)) + sp*0.12 + refl*edge*fres*1.6*(1.0 - 0.85*uChB.z);
  c += ACC*(grid*0.0016 + ringE*0.03 + seam*0.0012)*glow*uChB.x;
  o = vec4(chAtmos(c*uChB.x, uEye, -v, Td), 1.0);
}`;

/* ---------------- the solids: pillars, pedestals, plinths ---------------- */
export const CH_SOLID_VS = /* glsl */`
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in vec4 aI;   // x, z, yaw, kind (0 pillar, 1 pedestal, 2 plinth)
layout(location=3) in vec4 aS;   // w, h, d, y0
layout(location=4) in vec4 aC;   // colour, seed
centroid out vec3 vP;
centroid out vec3 vN;
centroid out vec3 vL;            // local position, in metres
flat out vec4 vC;
flat out vec4 vS;
flat out float vKind;
void main(){
  vec3 lp = aP*aS.xyz;
  float c = cos(aI.z), s = sin(aI.z);
  vec3 wp = vec3(lp.x*c + lp.z*s, lp.y + aS.w, -lp.x*s + lp.z*c) + vec3(aI.x, 0.0, aI.y);
  vN = vec3(aN.x*c + aN.z*s, aN.y, -aN.x*s + aN.z*c);
  vP = wp; vL = lp; vC = aC; vS = aS; vKind = aI.w;
  gl_Position = uVP*vec4(wp, 1.0);
}`;
export const CH_SOLID_FS = /* glsl */`${CH_COMMON}
centroid in vec3 vP;
centroid in vec3 vN;
centroid in vec3 vL;
flat in vec4 vC;
flat in vec4 vS;
flat in float vKind;
out vec4 o;
void main(){
  vec3 p = vP; vec3 n = normalize(vN);
  vec3 dv = uEye - p; float Td = length(dv); vec3 v = dv/Td;
  float pw = 2.0*Td/(uF*uRes.y);
  vec3 sp = vec3(0.0);
  vec3 L = chLight(p, n, v, 40.0, sp);
  vec3 lp = vL; vec3 col = vC.rgb;
  float glow = uChB2.y*(1.0 - 0.75*uChB.z);
  vec3 c;
  if (vKind < 0.5){
    /* a pillar: panel seams, its face toward the core carries a hairline of light and a few status points;
       its top is lost in the dark */
    vec3 alb = vec3(0.012, 0.015, 0.017);
    float py = lp.y/14.0; float pseam = band(fract(py), 0.0, 0.05, fwidth(py));
    c = alb*(L + vec3(0.002, 0.004, 0.005))*(1.0 - 0.5*pseam) + sp*0.1;
    float face = smoothstep(0.6, 0.9, dot(n, normalize(vec3(-p.x, 0.0, -p.z))));
    float lw = max(0.12, pw*0.7);
    float line = exp(-sq(lp.x/lw))*(0.08/lw)*face;
    float flick = 0.55 + 0.45*sin(uTime*0.6 + vC.a*40.0 + lp.y*0.05);
    float dots = step(0.985, fract(sin(floor(lp.y/9.0)*91.7 + vC.a*311.0)*4371.2))*exp(-sq(lp.x/max(0.5, pw*1.2)))*face;
    c += ACC*(line*0.35*flick + dots*0.6)*glow;
    c *= exp(-max(lp.y - 70.0, 0.0)/110.0);
    /* SIMPLIFY: the pillars go back into the dark first */
    c *= 1.0 - smoothstep(0.0, 0.55, uChB.z);
  } else {
    /* a pedestal / its plinth: machined metal; an inset slot of the channel's light on top; a hairline along
       the front face's top edge — the line the card's border will be */
    vec3 alb = vec3(0.022, 0.026, 0.029);
    c = alb*(L + vec3(0.004, 0.006, 0.007)) + sp*0.25;
    float top = step(0.9, n.y), front = step(0.9, n.z);
    vec2 hx = vec2(vS.x, vS.z)*0.5;
    vec2 e = hx - abs(lp.xz);
    float insetD = min(e.x, e.y);
    float lw = max(0.08, pw*0.8);
    float slot = exp(-sq((insetD - 2.4)/lw))*(0.08/lw)*top;
    float topEdge = exp(-max(vS.y - lp.y, 0.0)/lw)*(0.06/lw)*front;
    float plinth = vKind > 1.5 ? 1.0 : 0.0;
    c += col*(slot*(0.7 - 0.4*plinth) + topEdge*0.9 + plinth*top*0.12)*glow*uChB.y;
    /* the pedestals hand over to the cards */
    c *= 1.0 - 0.9*smoothstep(0.3, 0.85, uChB.z);
  }
  o = vec4(chAtmos(c*uChB.x, uEye, -v, Td), 1.0);
}`;

/* ---------------- the output channels: lines of light along the floor ---------------- */
export const CH_PATH_VS = /* glsl */`
layout(location=0) in vec2 aT;   // along 0..1, side ±1
layout(location=1) in vec4 aA;   // x0, z0, x1, z1
layout(location=2) in vec4 aB;   // colour, lane
layout(location=3) in vec4 aE;   // channel, length, 0, 0
out vec3 vF;                     // along (m), across (m), u
flat out vec4 vB;
flat out vec2 vE;
void main(){
  vec2 a = aA.xy, b = aA.zw;
  vec2 d = normalize(b - a), nrm = vec2(-d.y, d.x);
  vec3 p = vec3(mix(a, b, aT.x), 0.0).xzy; p.y = 0.12;
  float Td = length(uEye - p);
  float pw = 2.0*Td/(uF*uRes.y);
  float hw = max(2.6, pw*6.0);
  p.xz += nrm*aT.y*hw;
  vF = vec3(aT.x*aE.y, aT.y*hw, aT.x);
  vB = aB; vE = aE.xy;
  gl_Position = uVP*vec4(p, 1.0);
}`;
export const CH_PATH_FS = /* glsl */`${CH_COMMON}
in vec3 vF;
flat in vec4 vB;
flat in vec2 vE;
out vec4 o;
void main(){
  float along = vF.x, dx = abs(vF.y), u = vF.z;
  float pw = max(fwidth(vF.y), 1e-3);
  float lane = vB.a, ch = vE.x;
  float w = lane == 0.0 ? 0.55 : 0.34;
  float core = exp(-sq(dx/max(w, pw*0.9)))*(w/max(w, pw*0.9));
  float halo = exp(-dx/2.6)*0.32;
  /* the flow toward the pedestal: dashes running out, and a signal head now and then */
  float fl = along/7.0 - uTime*(0.9 + 0.12*ch);
  float dash = band(fract(fl), 0.0, 0.34, fwidth(fl));
  float hp = fract(uTime*0.16 + ch*0.31 + lane*0.11);
  float head = exp(-sq((u - hp)/0.025));
  float ends = smoothstep(0.0, 0.02, u)*smoothstep(1.0, 0.97, u);
  float I = (core*(0.6 + 0.9*dash) + halo*(0.8 + 0.4*dash) + head*core*3.5)*ends*(lane == 0.0 ? 1.25 : 0.7);
  /* its card hovered: the channel carries its light again (the room around it stays down) */
  I *= uChB.y*uChB2.y*(1.0 - 0.8*uChB.z)*(1.0 + 5.0*uOutH[int(ch + 0.5)]);
  o = vec4(vB.rgb*I*1.3, 0.0);
}`;

/* ---------------- the glyphs: what each output is, drawn in light over its pedestal ---------------- */
export const CH_GLYPH_VS = /* glsl */`${CH_COMMON}
layout(location=0) in vec2 aT;   // end 0..1, side ±1
layout(location=1) in vec4 aA;   // a.xyz, b.x
layout(location=2) in vec4 aB;   // b.yz, glyph, 0
out float vS;
flat out vec3 vC;
flat out float vH;
const vec3 GX = vec3(${f(CH.outs[0].x)}, ${f(CH.outs[1].x)}, ${f(CH.outs[2].x)});
const vec3 GZ = vec3(${f(CH.outs[0].z)}, ${f(CH.outs[1].z)}, ${f(CH.outs[2].z)});
vec3 place(vec3 q, float g){
  int gi = int(g + 0.5);
  float a = uGlyphA[gi], h = uOutH[gi];
  float c = cos(a), s = sin(a);
  /* at the end the glyphs stay — a little larger, lifted, still turning: the space between the words and the cards */
  q = vec3(q.x*c + q.z*s, q.y, -q.x*s + q.z*c)*${f(CH.glyphS)}*(1.0 + 0.35*uChB.z)*(1.0 + 0.1*h);
  float x = gi == 0 ? GX.x : gi == 1 ? GX.y : GX.z, z = gi == 0 ? GZ.x : gi == 1 ? GZ.y : GZ.z;
  return q + vec3(x, ${f(CH.glyphY)} + 4.0*uChB.z + 0.9*sin(uTime*0.55 + g*2.0), z);
}
void main(){
  float g = aB.z;
  vec3 A = place(aA.xyz, g), B = place(vec3(aA.w, aB.xy), g);
  vec4 ca = uVP*vec4(A, 1.0), cb = uVP*vec4(B, 1.0);
  vec4 cp = aT.x < 0.5 ? ca : cb;
  vec2 sa = ca.xy/ca.w*uRes, sb = cb.xy/cb.w*uRes;
  vec2 dd = sb - sa; float L = length(dd);
  vec2 nrm = L > 1e-3 ? vec2(-dd.y, dd.x)/L : vec2(0.0, 1.0);
  float wpx = 5.0*uRes.y/1080.0;
  cp.xy += nrm*aT.y*wpx/uRes*cp.w;
  vS = aT.y;
  int gi = int(g + 0.5);
  vC = gi == 0 ? CH_OUT0 : gi == 1 ? CH_OUT1 : CH_OUT2;
  vH = uOutH[gi];
  gl_Position = cp;
}`;
export const CH_GLYPH_FS = /* glsl */`${CH_COMMON}
in float vS;
flat in vec3 vC;
flat in float vH;
out vec4 o;
void main(){
  float s = abs(vS);
  float I = exp(-s*s*18.0)*1.6 + exp(-s*3.5)*0.22;
  I *= uChB.y*uChB2.y*(1.0 - 0.3*smoothstep(0.25, 0.8, uChB.z))*(1.0 + 1.6*vH);
  o = vec4(mix(vC, vec3(1.0), 0.35 + 0.25*vH)*I, 0.0);
}`;

/* ---------------- the motes: the column's dust; signals running the channels ---------------- */
export const CH_MOTE_VS = /* glsl */`${CH_COMMON}
layout(location=0) in vec2 aC;
out vec2 vQ;
out vec3 vC;
const vec3 GX = vec3(${f(CH.outs[0].x)}, ${f(CH.outs[1].x)}, ${f(CH.outs[2].x)});
const vec3 GZ = vec3(${f(CH.outs[0].z)}, ${f(CH.outs[1].z)}, ${f(CH.outs[2].z)});
void main(){
  int id = gl_InstanceID;
  vec4 h = h4(uint(id)*2654435761u + 17u);
  vec3 p; vec3 col; float I, sz;
  if (id < 900){
    /* around the column: slow, drifting down toward the pool */
    float a = h.x*TAU + uTime*0.03*(h.y - 0.5);
    float rr = 30.0 + 70.0*h.y*h.y;
    float y = ${f(CH.core.poolY + 4)} + fract(h.z - uTime*0.012*(0.4 + h.w))*360.0;
    p = vec3(cos(a)*rr, y, sin(a)*rr);
    col = mix(ACC, HOT, 0.3); I = 0.22*(0.4 + 0.6*h.w)*uChB.w; sz = 1.1 + 1.2*h.w;
  } else {
    /* signals on the channels: out from the core to the pedestals */
    int k = id % 3;
    float x1 = k == 0 ? GX.x : k == 1 ? GX.y : GX.z, z1 = (k == 0 ? GZ.x : k == 1 ? GZ.y : GZ.z) - 16.0;
    float dir = atan(x1, z1);
    vec2 a = vec2(sin(dir), cos(dir))*134.0, b = vec2(x1, z1);
    float u = fract(h.x + uTime*(0.05 + 0.04*h.y));
    vec2 q = mix(a, b, u) + vec2(cos(dir), -sin(dir))*(h.z - 0.5)*7.0;
    p = vec3(q.x, 0.5 + 1.5*h.w, q.y);
    col = k == 0 ? CH_OUT0 : k == 1 ? CH_OUT1 : CH_OUT2;
    I = 0.5*smoothstep(0.0, 0.08, u)*smoothstep(1.0, 0.9, u)*uChB.y; sz = 1.2 + 1.0*h.w;
  }
  I *= uChB2.z;
  vec4 c = uVP*vec4(p, 1.0);
  if (I < 0.003 || c.w < 1.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = uRes.y/1080.0;
  vQ = aC; vC = col*I;
  gl_Position = vec4(c.xy + aC*sz*k*2.0/uRes*c.w, c.z, c.w);
}`;
export const CH_MOTE_FS = /* glsl */`
in vec2 vQ;
in vec3 vC;
out vec4 o;
void main(){ float d = dot(vQ, vQ); o = vec4(vC*exp(-d*3.5), 0.0); }`;
