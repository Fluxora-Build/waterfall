/* ============================================================================
   src/engine/shaders/post.js — the noise the world is made of, the bloom,
   and the final image.

   The bloom keeps its downsampled levels intact (the up chain writes to its
   own targets) — the floor reflects last frame's ½ and ⅛ levels. The tone
   curve works on the brightest channel and keeps hue, with a white shoulder:
   turquoise stays turquoise until it is hot enough to turn white.
   ========================================================================== */

export const NOISEGEN_FS = /* glsl */`
in vec2 vUv;
out vec4 o;
uint hp(ivec2 p, int per, uint seed){ p = ((p % per) + per) % per; return hashU(p + ivec2(int(seed)*131, int(seed)*71)); }
float pn(vec2 x, int per, uint seed){
  vec2 i = floor(x), f = x - i; ivec2 q = ivec2(i);
  vec2 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);
  float a0 = float(hp(q, per, seed) & 0xffffu)*(6.2831853/65536.0);
  float a1 = float(hp(q + ivec2(1,0), per, seed) & 0xffffu)*(6.2831853/65536.0);
  float a2 = float(hp(q + ivec2(0,1), per, seed) & 0xffffu)*(6.2831853/65536.0);
  float a3 = float(hp(q + ivec2(1,1), per, seed) & 0xffffu)*(6.2831853/65536.0);
  float va = dot(vec2(cos(a0), sin(a0)), f), vb = dot(vec2(cos(a1), sin(a1)), f - vec2(1,0));
  float vc = dot(vec2(cos(a2), sin(a2)), f - vec2(0,1)), vd = dot(vec2(cos(a3), sin(a3)), f - vec2(1,1));
  return va + u.x*(vb - va) + u.y*(vc - va) + u.x*u.y*(va - vb - vc + vd);
}
float fbmP(vec2 uv, int base, uint seed, int oct){
  float a = 0.0, w = 0.5; int per = base;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; a += w*pn(uv*float(per), per, seed + uint(i)); w *= 0.5; per *= 2; }
  return a;
}
void main(){
  vec2 uv = gl_FragCoord.xy/256.0;
  float r = fbmP(uv, 4, 1u, 6)*0.9 + 0.5;
  float g = fbmP(uv, 8, 9u, 5)*0.9 + 0.5;
  float b = 0.0, w = 0.5; int per = 4;
  for (int i = 0; i < 5; i++){ b += w*abs(pn(uv*float(per), per, 20u + uint(i))); w *= 0.5; per *= 2; }
  float a = fbmP(uv, 32, 40u, 3)*0.9 + 0.5;
  o = vec4(r, g, b*1.4, a);
}`;

export const DOWN_FS = /* glsl */`
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uFirst;
uniform float uThresh;
in vec2 vUv;
out vec4 o;
vec3 tap(vec2 off){ return min(finite3(texture(uSrc, vUv + off*uTexel).rgb), vec3(3.0e4)); }
float kw(vec3 c){ return 1.0/(1.0 + luma(c)); }
void main(){
  vec3 a = tap(vec2(-2,2)), b = tap(vec2(0,2)), c = tap(vec2(2,2));
  vec3 d = tap(vec2(-2,0)), e = tap(vec2(0,0)), f = tap(vec2(2,0));
  vec3 g = tap(vec2(-2,-2)), h = tap(vec2(0,-2)), i = tap(vec2(2,-2));
  vec3 j = tap(vec2(-1,1)), k = tap(vec2(1,1)), l = tap(vec2(-1,-1)), m = tap(vec2(1,-1));
  vec3 r;
  if (uFirst > 0.5){
    vec3 g0 = (a+b+d+e)*0.25, g1 = (b+c+e+f)*0.25, g2 = (d+e+g+h)*0.25, g3 = (e+f+h+i)*0.25, g4 = (j+k+l+m)*0.25;
    float w0 = kw(g0), w1 = kw(g1), w2 = kw(g2), w3 = kw(g3), w4 = kw(g4);
    r = (g0*w0*0.125 + g1*w1*0.125 + g2*w2*0.125 + g3*w3*0.125 + g4*w4*0.5)/(w0*0.125 + w1*0.125 + w2*0.125 + w3*0.125 + w4*0.5);
    float br = max(r.r, max(r.g, r.b));
    float knee = uThresh*0.5;
    float soft = clamp(br - uThresh + knee, 0.0, 2.0*knee);
    soft = soft*soft/(4.0*knee + 1e-4);
    r *= max(soft, br - uThresh)/max(br, 1e-4);
    /* a NaN or an infinity anywhere would be smeared into a black block by every level below */
    if (!(r.r + r.g + r.b < 1e6)) r = vec3(0.0);
  } else {
    r = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  }
  o = vec4(r, 1.0);
}`;

/* U[i] = D[i] + upsampled U[i+1] — the down levels stay untouched */
export const UP_FS = /* glsl */`
uniform sampler2D uSrc;     // U[i+1]
uniform sampler2D uCur;     // D[i]
uniform vec2 uTexel;
in vec2 vUv;
out vec4 o;
void main(){
  vec3 s = vec3(0.0);
  s += texture(uSrc, vUv + vec2(-1,-1)*uTexel).rgb;
  s += texture(uSrc, vUv + vec2( 0,-1)*uTexel).rgb*2.0;
  s += texture(uSrc, vUv + vec2( 1,-1)*uTexel).rgb;
  s += texture(uSrc, vUv + vec2(-1, 0)*uTexel).rgb*2.0;
  s += texture(uSrc, vUv).rgb*4.0;
  s += texture(uSrc, vUv + vec2( 1, 0)*uTexel).rgb*2.0;
  s += texture(uSrc, vUv + vec2(-1, 1)*uTexel).rgb;
  s += texture(uSrc, vUv + vec2( 0, 1)*uTexel).rgb*2.0;
  s += texture(uSrc, vUv + vec2( 1, 1)*uTexel).rgb;
  o = vec4(s/16.0 + texture(uCur, vUv).rgb, 1.0);
}`;

export const FINAL_FS = /* glsl */`
uniform sampler2D uLit;
uniform sampler2D uBloom;
uniform vec4 uPost;    // exposure, bloom, grain, vignette
uniform vec4 uPost2;   // flash, frame, scroll, 0
uniform mat3 uGrade;   // config.colours.light: a hue rotation × a saturation scale (colour.js; identity as made)
uniform vec2 uView;    // dev only (default 0,0): x = 1 the grade is off entirely; y = 1 scene buffer without bloom, 2 bloom only
uniform vec4 uBreak;   // the breakthrough: radial stretch, the light, 0, 0
uniform sampler2D uLast;  // the frame before the switch between the worlds (sRGB, as shown)
uniform float uXfade;     // how much of it is kept: the cut is crossfaded over ~8 frames; at speed in the plunge, motion persistence
in vec2 vUv;
out vec4 o;
vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 tone(vec3 c){
  float m = max(c.r, max(c.g, c.b));
  if (m <= 1e-6) return vec3(0.0);
  float tm = m*(1.0 + m/9.0)/(1.0 + m);
  vec3 o = c/m*tm;
  float w = smoothstep(0.55, 2.4, m);
  return mix(o, vec3(max(o.r, max(o.g, o.b))), w*0.62);
}
void main(){
  vec3 c, bl;
  vec2 dc = vUv - 0.5;
  if (uBreak.x > 0.002){
    /* the lines stretch: the frame smeared toward its centre, the far end of each streak fainter */
    vec3 a = vec3(0.0), ab = vec3(0.0); float ws = 0.0;
    float kz = uBreak.x*0.34;
    for (int i = 0; i < 14; i++){
      float t = float(i)/13.0, w = 1.0 - 0.6*t;
      vec2 uv = 0.5 + dc*(1.0 - kz*t);
      a += finite3(texture(uLit, uv).rgb)*w; ab += finite3(texture(uBloom, uv).rgb)*w; ws += w;
    }
    c = a/ws; bl = ab/ws;
  } else {
    c = finite3(texture(uLit, vUv).rgb);
    bl = finite3(texture(uBloom, vUv).rgb);
  }
  if (uView.y > 1.5) c = vec3(0.0);
  if (uView.y < 0.5 || uView.y > 1.5) c += bl*uPost.y;
  c *= uPost.x*(1.0 + uPost2.x);
  c = max(uGrade*c, 0.0);
  bool grade = uView.x < 0.5;
  /* a black point: the canyon’s shadows go to black, not to a veil */
  if (grade) c = max(c - vec3(0.0018, 0.0022, 0.0024), 0.0)*1.04;
  c = tone(c);
  float lm = luma(c);
  if (grade){
    /* grade: shadows lean deep teal, the lights stay clean */
    vec3 tint = uGrade*vec3(0.90, 1.0, 1.06); tint *= 0.983/max(luma(tint), 1e-3);   // the shadows' lean follows the light's colour
    c *= mix(tint, vec3(1.0, 1.0, 0.98), smoothstep(0.02, 0.3, lm));
    vec2 v = vUv - 0.5; v.x *= uRes.x/uRes.y;
    c *= 1.0 - uPost.w*smoothstep(0.4, 1.3, length(v));
    float g = ign(gl_FragCoord.xy + uPost2.y*vec2(13.0, 7.0)) - 0.5;
    c += g*uPost.z*(0.25 + 0.75*sqrt(max(lm, 0.0)))*(1.0 - lm);
  }
  /* THE LIGHT OF THE BREAKTHROUGH opens from the centre and never takes the whole frame: at full it is 62 % white at
     the centre and gone before the corners, so the dark edges stay (no near-white frame); never black */
  if (uBreak.y > 0.0){ vec2 v2 = dc; v2.x *= uRes.x/uRes.y; float R = mix(0.08, 0.85, uBreak.y); float fl = 0.62*uBreak.y*smoothstep(R, R*0.15, length(v2)); c = 1.0 - (1.0 - c)*(1.0 - fl*vec3(0.93, 1.0, 0.985)); }
  c = srgb(clamp(c, 0.0, 1.0));
  if (uXfade > 0.0) c = mix(c, texture(uLast, vUv).rgb, uXfade);
  c += (ign(gl_FragCoord.xy + 0.5 + uPost2.y) - 0.5)/255.0;
  o = vec4(c, 1.0);
}`;
