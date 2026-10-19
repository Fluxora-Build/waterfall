/* ============================================================================
   src/engine/runtime.js — the renderer. Raw WebGL2, no dependencies.

   FRAME
     scene (HDR, 4x MSAA)        sky → walls ×2 → cliff → floor → platform →
                                 fins → pool → observer (+ its reflection)
                                 traces → sheet → streams → rings → column →
                                 particles (one draw per kind: the readout's
                                 PARTICLES is the instance count submitted)
     resolve → bloom (6 down, kept for next frame's floor reflection; 5 up)
     final (tone, grade, vignette, grain)
   ~30 draw calls, 19 programs.

   THE JOURNEY (journey.js): the scroll drives everything below as pure
   functions of one number — the camera's path, the fall opening into a
   volume, the thinning, the lean to one point, the dark, the core's iris —
   and the orb, held from above, brightening to a soft white. One place, one
   ordered timeline: nothing is cut, nothing goes dark.

   ONE CLOCK: state.js at 1/120 s. ?still&t=&hover=&at= replays a scripted
   visitor to any moment and draws it synchronously; the tools see exactly
   what a visitor would.

   GRACEFUL: a governor watches the frame time. Over budget it first thins
   the particles (to 55 %), and only then lowers the resolution — the scene
   keeps every layer and loses density, never structure.
   ========================================================================== */
import { P, frameFor, wellD } from './params.js';
import { HEAD, COMMON, FS_QUAD_VS } from './shaders/common.js';
import * as SC from './shaders/scene.js';
import * as FX from './shaders/fx.js';
import * as PO from './shaders/post.js';
import { buildStreams, stripTemplate, gridIndex, platformMesh, finInstances, boxTemplate, traces, resonanceNodes, impactPoints, actStreams, wellMesh } from './geometry.js';
import { createSystem, runScript, STATES, DT, T_FALL, PULSE_T } from './state.js';
import { journeyAt, newJourney, SWITCH, sOf } from './journey.js';
import { createFollower, createFrameLog, createDebugOverlay } from './scrollkit.js';
import * as CHS from './shaders/chamber.js';
import * as PT from './shaders/portal.js';
import { gradeFor } from './colour.js';
import config from '../../config.js';
import { CH, coreMesh, unitBox, solidInstances, pathSegments, glyphSegments, pedestalFace } from './chamber.js';
const sm01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/* ---------- mat4 (column-major) ---------- */
function mul(a, b, o = new Float32Array(16)) { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function inv(m, o = new Float32Array(16)) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
function xf(m, p) { const [x, y, z] = p; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]; }
let SPV = 0;
function springX(cur, vel, target, s, dt) {
  const w = 2 / s, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel + w * ch) * dt;
  SPV = (vel - w * tmp) * e;
  return target + (ch + tmp) * e;
}
function spring(cur, vel, target, s, dt) {
  const w = 2 / s, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (vel + w * ch) * dt;
  return [target + (ch + tmp) * e, (vel - w * tmp) * e];
}

export function startWaterfall(opts) {
  const { canvas, host, still = false } = opts;
  /* the tools' switches (?dev&still&t=…, ?dev&gputime, …) are read only when the page is opened with ?dev */
  const dev = !!opts.dev;
  const q = opts.query || { has: () => false, get: () => null };
  const grade = gradeFor(config.colours && config.colours.light);
  const reduced = opts.reduced ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: !!still, powerPreference: 'high-performance' });
  const fail = (why) => { host.classList.add('no-gl'); return { ok: false, why }; };
  if (!gl) return fail('webgl2');
  if (!gl.getExtension('EXT_color_buffer_float')) return fail('EXT_color_buffer_float');
  const par = gl.getExtension('KHR_parallel_shader_compile');
  /* the transformation mechanism: 1 COLLIMATE (chosen), 2 accrete, 3 interfere — the other two stay reachable for comparison */
  const mech = Number(q.get('mech')) || 1;
  /* dev: ?skip=wall,ground,... leaves passes out (debugging only) */
  const skip = new Set((q.get('skip') || '').split(',').filter(Boolean));
  let dbg = Number(q.get('dbg')) || 0;
  /* dev only: ?nograde (the whole grade off), ?view=scene|bloom, ?noreflect (the floor reads no reflection) */
  const viewDev = [q.has('nograde') ? 1 : 0, ({ scene: 1, bloom: 2 })[q.get('view')] || 0];

  /* THE READOUT IS REAL: draw calls and particle instances are counted where they are issued */
  const stats = { dt: 0, draws: 0, particles: 0, frames: 0 };
  let curProg = null;
  let drawCount = 0;
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const fn = gl[name].bind(gl);
    gl[name] = (...a) => { if (curProg && skip.has(curProg)) return; drawCount++; return fn(...a); };
  }
  const tq = dev && q.has('gputime') ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const tqPending = [], tqMs = [];
  function tqPoll() {
    while (tqPending.length && gl.getQueryParameter(tqPending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const qq = tqPending.shift();
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) tqMs.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(qq);
    }
  }

  /* ---------- programs ---------- */
  const defs = {
    noisegen: [FS_QUAD_VS, PO.NOISEGEN_FS], sky: [SC.SKY_VS, SC.SKY_FS], wall: [SC.WALL_VS, SC.WALL_FS], ground: [SC.GROUND_VS, SC.GROUND_FS],
    plat: [SC.PLAT_VS, SC.PLAT_FS], fin: [SC.FIN_VS, SC.FIN_FS], pool: [SC.POOL_VS, SC.POOL_FS], fig: [SC.FIG_VS, SC.FIG_FS],
    trace: [FX.TRACE_VS, FX.TRACE_FS], sheet: [FX.SHEET_VS, FX.SHEET_FS], stream: [FX.STREAM_VS, FX.STREAM_FS], ring: [FX.RING_VS, FX.RING_FS],
    column: [FX.COLUMN_VS, FX.COLUMN_FS], part: [FX.PART_VS, FX.PART_FS],
    down: [FS_QUAD_VS, PO.DOWN_FS], up: [FS_QUAD_VS, PO.UP_FS], final: [FS_QUAD_VS, PO.FINAL_FS],
    well: [PT.WELL_VS, PT.WELL_FS],
    /* the chamber, past the breakthrough: compiled in the background, checked when it is first needed */
    chsky: [SC.SKY_VS, CHS.CH_SKY_FS], chcore: [CHS.CH_CORE_VS, CHS.CH_CORE_FS], chpool: [CHS.CH_POOL_VS, CHS.CH_POOL_FS],
    chfloor: [CHS.CH_FLOOR_VS, CHS.CH_FLOOR_FS], chsolid: [CHS.CH_SOLID_VS, CHS.CH_SOLID_FS], chpath: [CHS.CH_PATH_VS, CHS.CH_PATH_FS],
    chglyph: [CHS.CH_GLYPH_VS, CHS.CH_GLYPH_FS], chmote: [CHS.CH_MOTE_VS, CHS.CH_MOTE_FS],
  };
  const isB = (name) => name.startsWith('ch');
  const progs = {};
  /* COMMON is shared by both stages; derivative helpers compile in fragment shaders only */
  const preVS = HEAD + COMMON, preFS = HEAD + '#define FRAG 1\n' + COMMON;
  /* dev: ?compilecost compiles and links one program at a time and waits for each, so each one's cost can be read */
  const compileCost = dev && q.has('compilecost') ? {} : null;
  for (const [name, [vs, fs]] of Object.entries(defs)) {
    const tc = performance.now();
    const p = gl.createProgram();
    const mk = (type, s) => { const sh = gl.createShader(type); gl.shaderSource(sh, (type === gl.FRAGMENT_SHADER ? preFS : preVS) + s); gl.compileShader(sh); gl.attachShader(p, sh); return sh; };
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    gl.linkProgram(p);
    if (compileCost) { gl.getProgramParameter(p, gl.LINK_STATUS); compileCost[name] = +(performance.now() - tc).toFixed(2); }
    progs[name] = { p, v, f, u: null, name };
  }
  const compileT = {}, compile0 = performance.now();
  const programsReady = () => {
    if (!par) return true;
    let all = true;
    for (const [name, x] of Object.entries(progs)) {
      if (compileT[name] || isB(name)) continue;
      if (gl.getProgramParameter(x.p, par.COMPLETION_STATUS_KHR)) compileT[name] = +(performance.now() - compile0).toFixed(1); else all = false;
    }
    return all;
  };
  let bChecked = false;
  function checkPrograms(which = (n) => !isB(n)) {
    for (const [name, x] of Object.entries(progs)) {
      if (!which(name) || x.u) continue;
      if (!gl.getProgramParameter(x.p, gl.LINK_STATUS)) {
        const log = (gl.getShaderInfoLog(x.v) || '') + '\n' + (gl.getShaderInfoLog(x.f) || '') + '\n' + (gl.getProgramInfoLog(x.p) || '');
        throw new Error('program ' + name + ' failed:\n' + log.slice(0, 3000));
      }
      const u = {}; const n = gl.getProgramParameter(x.p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(x.p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(x.p, info.name); }
      x.u = u;
    }
  }

  /* ---------- geometry ---------- */
  const vao = (fn) => { const a = gl.createVertexArray(); gl.bindVertexArray(a); fn(); gl.bindVertexArray(null); return a; };
  const buf = (target, data, usage = gl.STATIC_DRAW) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; };
  const empty = gl.createVertexArray();
  const attr = (loc, size, stride, off, div = 0) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); if (div) gl.vertexAttribDivisor(loc, div); };

  const SG = P.canyon.grid, CG = P.canyon.cliff;
  const sideIdx = gridIndex(SG[0], SG[1]), cliffIdx = gridIndex(CG[0], CG[1]);
  const sideVao = vao(() => buf(gl.ELEMENT_ARRAY_BUFFER, sideIdx));
  const cliffVao = vao(() => buf(gl.ELEMENT_ARRAY_BUFFER, cliffIdx));

  const STR = buildStreams();
  const SEG = P.streams.seg;
  const strip = stripTemplate(SEG);
  const streamVao = vao(() => {
    buf(gl.ARRAY_BUFFER, strip); attr(0, 2, 8, 0);
    buf(gl.ARRAY_BUFFER, STR.data); attr(1, 4, 48, 0, 1); attr(2, 4, 48, 16, 1); attr(3, 4, 48, 32, 1);
  });
  const sheetVao = vao(() => { buf(gl.ARRAY_BUFFER, stripTemplate(160)); attr(0, 2, 8, 0); });
  const ringVao = vao(() => { buf(gl.ARRAY_BUFFER, stripTemplate(720)); attr(0, 2, 8, 0); });

  const PM = platformMesh();
  const platVao = vao(() => { buf(gl.ARRAY_BUFFER, PM.verts); attr(0, 4, 36, 0); attr(1, 4, 36, 16); attr(2, 1, 36, 32); buf(gl.ELEMENT_ARRAY_BUFFER, PM.idx); });
  const FI = finInstances(), BOX = boxTemplate();
  const finVao = vao(() => { buf(gl.ARRAY_BUFFER, BOX); attr(0, 3, 24, 0); attr(1, 3, 24, 12); buf(gl.ARRAY_BUFFER, FI); attr(2, 4, 16, 0, 1); });
  const TR = traces();
  const traceVao = vao(() => { buf(gl.ARRAY_BUFFER, TR.verts); attr(0, 4, 36, 0); attr(1, 4, 36, 16); attr(2, 1, 36, 32); buf(gl.ELEMENT_ARRAY_BUFFER, TR.idx); });
  const partVao = vao(() => { buf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])); attr(0, 2, 8, 0); });
  /* the portal's well */
  const WM = wellMesh();
  const wellVao = vao(() => { buf(gl.ARRAY_BUFFER, WM.verts); attr(0, 4, 32, 0); attr(1, 4, 32, 16); buf(gl.ELEMENT_ARRAY_BUFFER, WM.idx); });
  /* the chamber */
  const CM = coreMesh();
  const coreVao = vao(() => { buf(gl.ARRAY_BUFFER, CM.verts); attr(0, 4, 40, 0); attr(1, 4, 40, 16); attr(2, 2, 40, 32); buf(gl.ELEMENT_ARRAY_BUFFER, CM.idx); });
  const SOL = solidInstances(), NSOL = SOL.length / 12;
  const solidVao = vao(() => { buf(gl.ARRAY_BUFFER, unitBox()); attr(0, 3, 24, 0); attr(1, 3, 24, 12); buf(gl.ARRAY_BUFFER, SOL); attr(2, 4, 48, 0, 1); attr(3, 4, 48, 16, 1); attr(4, 4, 48, 32, 1); });
  const PS = pathSegments(), NPATH = PS.length / 12;
  const pathVao = vao(() => { buf(gl.ARRAY_BUFFER, stripTemplate(64)); attr(0, 2, 8, 0); buf(gl.ARRAY_BUFFER, PS); attr(1, 4, 48, 0, 1); attr(2, 4, 48, 16, 1); attr(3, 4, 48, 32, 1); });
  const GS = glyphSegments(), NGLY = GS.length / 8;
  const glyphVao = vao(() => { buf(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1])); attr(0, 2, 8, 0); buf(gl.ARRAY_BUFFER, GS); attr(1, 4, 32, 0, 1); attr(2, 4, 32, 16, 1); });
  const NMOTE = 1500;

  const PA = P.particles;
  const KIND = ['fall', 'spray', 'ambient', 'orbit', 'launch', 'nodes', 'fly'];
  const starts = []; { let s = 0; for (const k of KIND) { starts.push(s); s += PA[k]; } starts.push(s); }
  const NODES = resonanceNodes();
  const nodeArr = new Float32Array(PA.nodes * 4); NODES.forEach((n, i) => nodeArr.set(n, i * 4));
  /* the pool's ripple sources: under COLLIMATE the seven channels (in a line, so their rings interfere cleanly); otherwise where the primary streams land */
  const srcArr = new Float32Array(48);
  if (mech === 1) for (let k = 0; k < 7; k++) srcArr.set([((k + 0.5) / 7 * 2 - 1) * P.fall.impact.half * 0.95, 0, 1.0, k * 2.1], k * 4);
  else impactPoints(12).forEach((s, i) => srcArr.set([s[0], s[1] - P.core.c[2], 0.7 + ((i * 37) % 10) / 20, i * 1.7], i * 4));

  /* ---------- textures & targets ---------- */
  function tex(w, h, ifmt, fmt, type, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, data = null) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  function fbo(t, depthRb = null) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (depthRb) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    return f;
  }
  const noiseTex = tex(256, 256, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT);
  const HN = P.state.histN;
  const histData = new Float32Array(HN * 2 * 4);
  const histTex = tex(HN, 2, gl.RGBA16F, gl.RGBA, gl.FLOAT);

  let T = null;
  function freeTargets() {
    if (!T) return;
    for (const t of T.texs) gl.deleteTexture(t);
    for (const f of T.fbos) gl.deleteFramebuffer(f);
    for (const r of T.rbs) gl.deleteRenderbuffer(r);
    T = null;
  }
  function makeTargets(w, h, msaa) {
    freeTargets();
    const texs = [], fbos = [], rbs = [];
    const H16 = (W, Hh) => { const t = tex(W, Hh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT); texs.push(t); return t; };
    const sceneTex = H16(w, h);
    let msFbo = null, sceneFbo;
    const depth = gl.createRenderbuffer(); rbs.push(depth);
    if (msaa) {
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
      const col = gl.createRenderbuffer(); rbs.push(col);
      gl.bindRenderbuffer(gl.RENDERBUFFER, col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      msFbo = gl.createFramebuffer(); fbos.push(msFbo); gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, col);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) msFbo = null;
      sceneFbo = fbo(sceneTex); fbos.push(sceneFbo);
    }
    if (!msFbo) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      sceneFbo = fbo(sceneTex, depth); fbos.push(sceneFbo);
    }
    const D = [], U = [];
    let bw = w, bh = h;
    for (let i = 0; i < 6; i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      const t = H16(bw, bh), f = fbo(t); fbos.push(f); D.push({ t, f, w: bw, h: bh });
      if (i < 5) { const t2 = H16(bw, bh), f2 = fbo(t2); fbos.push(f2); U.push({ t: t2, f: f2, w: bw, h: bh }); }
    }
    /* clear the reflection sources once — the first frame reads them */
    for (const d of D) { gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    T = { w, h, msaa: !!msFbo, msFbo, sceneTex, sceneFbo, D, U, texs, fbos, rbs };
  }

  /* ---------- the system ---------- */
  let sys = createSystem({ reduced });

  /* ---------- camera ---------- */
  /* THE SCROLL IS FILMED, NOT STEPPED. The page's scroll is a target; the camera follows it through two
     critically damped stages in cascade (0.10 s into 0.16 s): a wheel notch becomes one glide that starts
     soft, peaks at ~0.2 s and settles in ~0.6 s; a train of notches becomes one continuous move. (One stage
     alone starts at full acceleration — a burst, then a long tail — which is what a notch looked like.) */
  /* (scrollkit.js) the page's scroll is read once a frame (scrollSource) and followed by two first-order stages,
     rate limited: the one rendered progress, cam.scroll, drives the camera, the timeline and the words */
  const follow = createFollower(reduced ? { tau1: 0.05, tau2: 0.035, vmax: 4 } : {});
  let scrollSource = null, pastSource = null, firstTarget = true;
  /* ?film: THE PAGE'S OWN FRAME-BY-FRAME EXPORT. No requestAnimationFrame: the tool calls filmStep(dt) once per frame
     (exactly 1/60 s, or what it asks), scrolling the real page in between, and reads every frame — so a recording has
     every frame, whatever the machine or the recorder does */
  const filmMode = dev && !still && q.has('film');
  let filmNow = 0;
  /* THE BREAKTHROUGH IN TIME. The light (flash) is followed at a limited rate — its whole range in no less than 0.3 s,
     up or down — so no fling can whiten or darken the frame in a frame or two (≥ 18 frames at 60 Hz). The canyon gives
     way to the chamber only once that light has reached 0.8: until then the camera waits at the bottom of the well (or,
     scrolling back, on the chamber's side of the light) while it builds. The cut itself is crossfaded: the last frame of
     the world being left is kept and faded out over ~8 frames (the final pass). Stills and reduced motion use the
     journey's own values. */
  let flashShown = 0, flashOut = 0, worldShown = null, pSwitch = -1, xfade = 0;
  /* MOTION PERSISTENCE: in the plunge the camera can fall several of the well's rings in one frame, and the well's light
     rises and falls with each ring — at speed that rhythm aliases into a frame-to-frame strobe. So while the camera is
     travelling fast there (the plunge and the pull-back after the light), each frame keeps part of the last one — up
     to 62 % at 60 Hz, frame-rate independent, nothing at rest: motion blur in time, over the radial stretch */
  let persist = 0, peX = 0, peY = 0, peZ = 0, peOk = false, nearK = 0;
  /* the flow clock's step over the last frame (the streams blur their marks along it) */
  let flowStep = 0, lastFlowU = -1;
  const pOfS = (target) => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (sOf(m) < target) a = m; else b = m; } return b; };
  /* the instrument (with ?dev): ?log keeps every frame for a tool to read, ?debug=1 draws the overlay */
  const frameLog = dev && (q.has('log') || q.has('debug')) ? createFrameLog() : null;
  let overlay = null;
  const cam = { px: 0, pvx: 0, py: 0, pvy: 0, scroll: 0, sv: 0, mid: 0, mv: 0, scrollTarget: 0, mode: 'desk' };
  let JY = journeyAt(0, { f: P.cam.f, pp: P.cam.pp }, reduced);   // replaced by JYmain on the first frame
  let VP = new Float32Array(16), IVP = new Float32Array(16), prevVP = new Float32Array(16), prevVPm = new Float32Array(16), motK = 0, motStill = 0, eye = P.cam.eye.slice(), fNow = P.cam.f;
  let cssW = 1, cssH = 1, dpr = 1, frameHint = null, siteHint = null, logoZone = -1;
  /* THE FRAME LOOP ALLOCATES NOTHING (the smoothness pass): the responsive frame is rebuilt only when the screen or the
     page's hints change (the journey keys its prepared camera tracks on it); the journey fills JYmain; the camera
     writes into fixed matrices */
  let frC = null, frW = 0, frH = 0, frHint = null, frSite = null;
  const JYmain = newJourney(), JYwarm = newJourney();
  const VIEW = new Float32Array(16), PROJ = new Float32Array(16);
  function camera(dt, t, forceP = -1) {
    if (!frC || frW !== cssW || frH !== cssH || frHint !== frameHint || frSite !== siteHint) {
      frC = frameFor(cssW, cssH, frameHint); frC.site = siteHint; frW = cssW; frH = cssH; frHint = frameHint; frSite = siteHint;
    }
    const fr = frC;
    cam.mode = fr.mode;
    const tx = ptr.in && !reduced ? ptr.nx : 0, ty = ptr.in && !reduced ? ptr.ny : 0;
    if (dt > 0 && forceP < 0) {
      cam.px = springX(cam.px, cam.pvx, tx, P.cam.smooth, dt); cam.pvx = SPV;
      cam.py = springX(cam.py, cam.pvy, ty, P.cam.smooth, dt); cam.pvy = SPV;
      cam.scroll = follow.step(cam.scrollTarget, dt); cam.sv = follow.v;
    }
    /* the journey decides where the camera is; the hand's parallax and the breathing belong to the hero and fade with it */
    JY = journeyAt(forceP >= 0 ? forceP : cam.scroll, fr, reduced, forceP >= 0 ? JYwarm : JYmain);
    if (forceP < 0 && !still && !reduced) {
      if (pSwitch < 0) pSwitch = pOfS(SWITCH);
      if (worldShown === null) { worldShown = JY.world; flashShown = JY.flash; }
      /* while the view waits at the portal for the other world, the light it waits in is full (the held frame sits in
         it): the light always builds and the gate always opens — whichever way and however fast the hand went past
         (a target taken from the hand's own position, already beyond the light, left it shut: stuck at the portal) */
      const pending = JY.world !== worldShown;
      /* it builds over no less than 0.3 s and lets go over no less than 0.45 s (the release is the bigger change on screen:
         the room comes up out of it) */
      const tgt = pending ? 1 : JY.flash, m = dt > 0 ? dt / (tgt > flashShown ? 0.42 : 0.32) : 0;   // rises over 0.42 s (a peak spread over 25 frames), lets go over 0.32 s
      flashShown += Math.max(-m, Math.min(m, tgt - flashShown));
      if (JY.world !== worldShown) {
        if (flashShown >= 0.8) { worldShown = JY.world; xfade = 1; }
        else JY = journeyAt(worldShown === 'A' ? pSwitch - 2e-4 : pSwitch + 2e-4, fr, reduced, JYmain);
      }
      flashOut = flashShown;
    } else flashOut = JY.flash;
    const live = forceP >= 0 ? 0 : 1 - sm01(0.03, 0.18, cam.scroll);
    const C = JY.cam;
    const f = C.f, pp = C.pp;
    const br = reduced ? 0 : P.cam.breathe * live;
    const ex = cam.px * P.cam.move[0] * live, ey = -cam.py * P.cam.move[1] * live;
    eye[0] = C.eye[0] + ex + Math.sin(t * 0.071) * br; eye[1] = C.eye[1] + ey + Math.sin(t * 0.053 + 1.2) * br * 0.5; eye[2] = C.eye[2];
    /* re-aim at the pivot far behind the fall: near rock moves most, the fall least */
    const dz = eye[2] - P.cam.pivotZ;
    const yaw = C.yaw + Math.atan2(ex, dz) * live, pitch = C.pitch - Math.atan2(ey, dz) * live;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f0 = -sy * cp, f1 = sp, f2 = -cy * cp;                  // forward
    const r0 = cy, r1 = 0, r2 = -sy;                               // right
    const u0 = r1 * f2 - r2 * f1, u1 = r2 * f0 - r0 * f2, u2 = r0 * f1 - r1 * f0;   // up
    const z0 = -f0, z1 = -f1, z2 = -f2;
    const V = VIEW;
    V[0] = r0; V[1] = u0; V[2] = z0; V[3] = 0; V[4] = r1; V[5] = u1; V[6] = z1; V[7] = 0; V[8] = r2; V[9] = u2; V[10] = z2; V[11] = 0;
    V[12] = -(r0 * eye[0] + r1 * eye[1] + r2 * eye[2]); V[13] = -(u0 * eye[0] + u1 * eye[1] + u2 * eye[2]); V[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]); V[15] = 1;
    const a = cssW / cssH, n = P.cam.near, Fr = P.cam.far, Q = PROJ;
    Q.fill(0); Q[0] = f / a; Q[5] = f; Q[8] = -pp[0]; Q[9] = -pp[1]; Q[10] = (Fr + n) / (n - Fr); Q[11] = -1; Q[14] = (2 * Fr * n) / (n - Fr);
    mul(PROJ, VIEW, VP); inv(VP, IVP); fNow = f;
    if (forceP < 0) {
      const de = peOk ? Math.hypot(eye[0] - peX, eye[1] - peY, eye[2] - peZ) : 0;
      peX = eye[0]; peY = eye[1]; peZ = eye[2]; peOk = true;
      /* soft at both ends of its window: persistence that switched off at once would itself be a jump */
      /* two windows: the flight into the fall (the data streaming past the lens; up to 0.8 of the plunge's weight) and
         the plunge with the pull-back after the light */
      const winA = JY.s > 0.03 && JY.s < 0.63 ? 0.8 * sm01(0.03, 0.07, JY.s) * (1 - sm01(0.58, 0.63, JY.s)) : 0;
      const winB = JY.s > 0.76 && JY.s < 0.945 ? sm01(0.76, 0.79, JY.s) * (1 - sm01(0.91, 0.94, JY.s)) : 0;
      const fast = !still && !reduced ? sm01(0.6, 8, de) * Math.max(winA, winB) : 0;
      /* and its weight itself moves in time, not with the scroll: it lets go over no less than 0.2 s (a sudden release is
         a sudden sharpening — a jump), but takes hold over 0.06 s: a fling from rest is at full speed in three frames,
         and a trail that arrives late leaves those frames bare (each was 3–5× its neighbours' change) */
      const pT = fast > 0 && dt > 0 ? fast * Math.exp(-dt / 0.035) : 0, pm = dt > 0 ? dt / (pT > persist ? 0.06 : 0.2) : 1;
      persist += Math.max(-pm, Math.min(pm, pT - persist));
      /* the well's near fade follows the camera's speed too (0 at rest), its whole range in no less than 0.5 s (at 0.25 s a
         hand starting from rest at the bottom of the well dimmed the frame by 0.1 of luma in four frames) */
      const nT = !still && !reduced ? sm01(0.5, 6, de) : 0, nm = dt > 0 ? dt / 0.5 : 1;
      nearK += Math.max(-nm, Math.min(nm, nT - nearK));
    }
  }
  function project(p) {
    const c = xf(VP, p);
    if (c[3] <= 0.01) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * cssW, (0.5 - c[1] / c[3] * 0.5) * cssH, c[3]];
  }
  function rayAt(x, y) {
    const nx = (x / cssW) * 2 - 1, ny = 1 - (y / cssH) * 2;
    const w = xf(IVP, [nx, ny, 1]); const p = [w[0] / w[3], w[1] / w[3], w[2] / w[3]];
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]; const l = Math.hypot(...d);
    return d.map((v) => v / l);
  }

  /* ---------- pointer ---------- */
  const ptr = { in: false, x: 0, y: 0, nx: 0, ny: 0, last: 0, speed: 0, wake: 0 };
  function pointerAt(x, y, now) {
    const dx = x - ptr.x, dy = y - ptr.y, dtp = Math.max(1, now - ptr.last);
    ptr.speed = ptr.speed * 0.7 + 0.3 * Math.min(3, Math.hypot(dx, dy) / dtp);
    ptr.x = x; ptr.y = y; ptr.last = now; ptr.in = true;
    ptr.nx = clamp((x / cssW) * 2 - 1, -1, 1); ptr.ny = clamp((y / cssH) * 2 - 1, -1, 1);
  }
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); pointerAt(e.clientX - r.left, e.clientY - r.top, performance.now()); };
  const onLeave = () => { ptr.in = false; };
  if (!still) {
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
  }

  /* ---------- sizing & the governor ---------- */
  let scale = 1;
  const forcedScale = Number(q.get('scale')) || 0;
  const gov = { n: -90, sum: 0, partK: 1, steps: 0 };
  /* THE DIVE GOVERNOR (ui: govern(), as a dive or the autopilot starts moving the camera): the motion's first second
     decides at once. Under 45 fps the render resolution drops straight to the size that rate asks for (to half at most), then the particles (to 55 %),
     each step measured over half a second, until it holds 50. A GPU that holds 45 from the start is never touched. */
  const fast = { on: false, t: 0, n: 0, win: 1, skip: 0, stepped: false };
  function govern() { if (still || reduced) return; fast.on = true; fast.t = 0; fast.n = 0; fast.win = 1; fast.skip = 1; fast.stepped = false; }
  function fastStep(raw) {
    if (!fast.on) return;
    if (fast.skip > 0) { fast.skip--; return; }   // the frame after a resize carries the reallocation
    if (raw > 0.25) return;                       // a gap (a hidden tab) is not a frame
    fast.t += raw; fast.n++;
    if (fast.t < fast.win || fast.n < 6) return;
    const fps = fast.n / fast.t;
    if (fps >= (fast.stepped ? 50 : 45)) fast.on = false;
    /* straight to the size the measured rate asks for (the GPU's work scales with the pixels, so with scale²), at least one
       0.8 step: one reallocation of the targets, not three */
    else if (scale > 0.501) { scale = Math.max(0.5, Math.min(scale * 0.8, scale * Math.sqrt(fps / 55))); fast.skip = 2; fast.stepped = true; }
    else if (gov.partK > 0.56) { gov.partK = Math.max(0.55, gov.partK - 0.15); fast.stepped = true; }
    else fast.on = false;
    fast.t = 0; fast.n = 0; fast.win = 0.5;
    gov.n = -90; gov.sum = 0;   // the slow governor counts again from here
  }
  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, P.render.dprCap);
    let w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    const k = forcedScale || Math.min(1, Math.sqrt(P.render.maxPixels / (w * h))) * scale;
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (canvas.width !== w || canvas.height !== h || !T) {
      canvas.width = w; canvas.height = h;
      /* the resolution cap rounds to whole pixels, so allow the last percent */
      makeTargets(w, h, !q.has('nomsaa') && w * h <= P.render.msaaPixels * 1.01);
    }
  }

  function initPasses() {
    gl.bindVertexArray(empty);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const f = fbo(noiseTex); gl.viewport(0, 0, 256, 256);
    gl.useProgram(progs.noisegen.p); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.deleteFramebuffer(f);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ---------- per-frame uniforms ---------- */
  let S = sys.snapshot();
  const L = new Float32Array(32), CLA = new Float32Array(24);
  /* THE WEBSITE'S CARDS ANSWER IN THE ROOM: a hovered card's glyph brightens and turns faster, its channel and its light come back.
     outT the target (the card under the pointer or the focus), outH eased toward it, glyphX the extra turn it gave (none in a still) */
  const outT = [0, 0, 0], outH = new Float32Array(3), glyphX = [0, 0, 0];
  const ringA = new Float32Array(16), ringB = new Float32Array(16);
  const pkt = new Float32Array(16);
  /* ACT: its few bright streams (instance indices) and the ripples of the decisions that landed */
  const actIdx = new Float32Array(actStreams().map((a) => a.index));
  const ripArr = new Float32Array(16), actArr = new Float32Array(32);
  let uFall = 0, timeW = 0;
  const F = P.fall;
  const arcZ = (u) => F.lip.z + (F.impact.z - F.lip.z) * (1 - Math.pow(1 - u, 1.6));
  const setL = (i, x, y, z, I) => { const o = i * 4; L[o] = x; L[o + 1] = y; L[o + 2] = z; L[o + 3] = I > 0 ? I : 0; };
  const setCL = (i, x, y, z, I) => { const o = i * 4; CLA[o] = x; CLA[o + 1] = y; CLA[o + 2] = z; CLA[o + 3] = I > 0 ? I : 0; };
  function packState() {
    const [wI, wP, wU, wA] = S.w;
    const intro = S.intro, Lt = P.light;
    const set = setL, cl = setCL;
    {
      const B = JY.B, sim = B.simplify;
      cl(0, 0, CH.core.poolY + 9, 0, 9 * (0.4 + 0.6 * B.reveal) * (1 - 0.6 * sim));
      cl(1, 0, 170, 0, 2.4 * B.reveal * (1 - 0.7 * sim));
      for (let k = 0; k < 3; k++) { const o = CH.outs[k]; cl(2 + k, o.x * 0.82, 7, o.z - 26, 1.7 * B.outputs * (1 - 0.55 * sim) * (1 + 1.4 * outH[k])); }
      cl(5, 0, 290, -380, 1.1 * B.reveal * (1 - 0.85 * sim));
    }
    const sg0 = S.surge ? S.surge[0] : 99, sg1 = S.surge ? S.surge[1] : 0, flare = sg1 * Math.exp(-sg0 / 0.45) * sm01(0, 0.05, sg0);   // a 50 ms attack: no light arrives in one frame
    const uf = Math.pow(Math.min(1, Math.max(0, sg0 / (0.9 * PULSE_T))), 1.6), front = sg1 * (sg0 < 1.2 * PULSE_T ? 1 : 0);
    set(0, 0, F.lip.y - 3, F.lip.z + 6, Lt.lipGlow * intro * (1 + 0.15 * wI - 0.1 * wU + 0.5 * wA + 1.6 * flare));
    for (let k = 0; k < 3; k++) { const u = 0.25 * (k + 1); set(1 + k, 0, lerp(F.lip.y, F.impact.y, u), arcZ(u), Lt.fall * 0.42 * intro * (1 + 0.2 * wI + 0.15 * wP - 0.2 * wU + 1.4 * front * Math.exp(-(((uf - u) / 0.14) ** 2)))); }
    const life = 1;
    /* the orb, held at the journey's end, brightens toward a soft white */
    set(4, 0, 24, P.core.c[2], (Lt.core * S.arrive * (1 + 0.5 * wP + 1.1 * wA - 0.2 * wU) + 2.5 * S.ping * life) * (1 + 1.6 * JY.A.white));
    set(5, Lt.sourceP[0], Lt.sourceP[1], Lt.sourceP[2], Lt.source * (0.55 + 0.45 * intro));
    const wv = S.wave;
    set(6, 0, 40, P.core.c[2], (wv[1] * 7 * Math.exp(-wv[3] * 4.0) + 2.5 * S.ping) * life);
    set(7, 0, 0, 0, 0);
    uFall = Lt.fall * intro * (1 + 0.15 * wI + 0.12 * wP - 0.15 * wU);
    const RG = P.core.rings;
    for (let k = 0; k < RG.length; k++) {
      const r = RG[k], o = k * 4;
      ringA[o] = r[0] * (1 + 0.05 * wA * k / 3); ringA[o + 1] = r[1] * S.ringScale; ringA[o + 2] = r[2]; ringA[o + 3] = S.tilt[k];
      ringB[o] = S.spin[k]; ringB[o + 1] = S.prec[k]; ringB[o + 2] = r[6]; ringB[o + 3] = r[7];
    }
    pkt.fill(0);
    for (let i = 0; i < Math.min(4, S.packets.length); i++) { const p = S.packets[i]; pkt[i * 4] = p[0]; pkt[i * 4 + 1] = p[1]; pkt[i * 4 + 2] = p[2]; pkt[i * 4 + 3] = p[3]; }
    ripArr.fill(0);
    if (S.ripples) for (let i = 0; i < S.ripples.length; i++) ripArr.set(S.ripples[i], i * 4);
    actArr.fill(0);
    if (S.pulses) for (let i = 0; i < S.pulses.length; i++) actArr.set(S.pulses[i], i * 4);
  }
  function common(pr) {
    curProg = pr.name;
    const u = pr.u;
    gl.useProgram(pr.p);
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, VP);
    if (u.uEye) gl.uniform3fv(u.uEye, eye);
    if (u.uTime) gl.uniform1f(u.uTime, timeW);
    if (u.uRes) gl.uniform2f(u.uRes, T.w, T.h);
    if (u.uF) gl.uniform1f(u.uF, fNow);
    if (u.uW) gl.uniform4fv(u.uW, S.w);
    if (u.uPh) gl.uniform4f(u.uPh, S.flow, S.braid, S.swirl, S.res);
    if (u.uPh2) gl.uniform4f(u.uPh2, S.inPh, S.outPh, S.intro, (S.t * 0.35) % (Math.PI * 2));
    const life = 1;
    if (u.uRip) gl.uniform4fv(u.uRip, ripArr);
    if (u.uActP) gl.uniform4fv(u.uActP, actArr);
    if (u.uProc) gl.uniform4f(u.uProc, S.procPh || 0, S.surge ? S.surge[0] : 99, S.surge ? S.surge[1] : 0, Math.min(S.ingAge ?? 99, 99));
    if (u.uActIdx) gl.uniform1fv(u.uActIdx, actIdx);
    if (u.uWave) gl.uniform4f(u.uWave, S.wave[0], S.wave[1] * life, S.wave[2], S.wave[3]);
    if (u.uCore) gl.uniform4f(u.uCore, S.arrive, S.ping * life, S.pingRing, S.pingAge);
    if (u.uL) gl.uniform4fv(u.uL, L);
    if (u.uFall) gl.uniform1f(u.uFall, uFall);
    if (u.uMech) gl.uniform1f(u.uMech, mech);
    if (u.uSpeed) gl.uniform1f(u.uSpeed, S.speed);
    if (u.uLoop) gl.uniform1i(u.uLoop, 1);
    if (u.uDbg) gl.uniform1f(u.uDbg, dbg);
    const A = JY.A;
    if (u.uJ) gl.uniform4f(u.uJ, A.vol, A.sel, A.lean, A.dark);
    if (u.uJ2) gl.uniform4f(u.uJ2, A.open, A.periph, A.rings, A.fly);
    const inB = JY.world === 'B';
    if (u.uJ3) gl.uniform4f(u.uJ3, 0, A.white, P.core.poolY - (P.well.y0 - wellD(P.well.rings + 0.25, A.sep)), A.sep);
    if (u.uWB) gl.uniform3f(u.uWB, inB ? 1 : 0, (0.55 + 0.45 * JY.B.reveal) * (1 - 0.85 * JY.B.simplify), JY.B.simplify);
    if (inB){
      /* the chamber's streams are the column: no canyon journey on them */
      if (u.uJ) gl.uniform4f(u.uJ, 0, 0.45, 0, 0);
      if (u.uJ2) gl.uniform4f(u.uJ2, 0, 1, 0, 0);
    }
    if (u.uCL) gl.uniform4fv(u.uCL, CLA);
    if (u.uChB) gl.uniform4f(u.uChB, JY.B.reveal, JY.B.outputs, JY.B.simplify, (0.6 + 0.4 * JY.B.reveal) * (1 - 0.7 * JY.B.simplify));
    if (u.uChB2) gl.uniform4f(u.uChB2, 1 - 0.85 * JY.B.simplify, 1, JY.B.reveal * (1 - JY.B.simplify), 0);
    if (u.uChLogo) gl.uniform4f(u.uChLogo, inB && logoZone >= 0 ? JY.ui.brand || 0 : 0, (1 - logoZone / cssH) * T.h, 0.035 * T.h, 0);
    if (u.uOutH) gl.uniform3fv(u.uOutH, outH);
    if (u.uGlyphA) gl.uniform3f(u.uGlyphA, timeW * 0.24 + glyphX[0], -timeW * 0.24 + 1.3 + glyphX[1], timeW * 0.24 + 2.6 + glyphX[2]);
    if (u.uPxK) gl.uniform1f(u.uPxK, T.w / cssW);
    if (u.uNoise) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.uNoise, 0); }
    if (u.uHist) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, histTex); gl.uniform1i(u.uHist, 1); }
    return u;
  }

  /* particle counts: what the state asks for, times the governor */
  const active = new Float32Array(7);
  function particleCounts() {
    const [wI, wP, wU, wA] = S.w, intro = S.intro;
    const K = gov.partK;
    active[0] = clamp((2800 + 2400 * wI - 1500 * wU + 300 * wP) * intro, 0, PA.fall) * K;
    active[1] = clamp((1300 + 1200 * wI + 900 * wA - 800 * wU) * S.arrive, 0, PA.spray) * K;
    active[2] = clamp(1250 + 550 * wI - 450 * wU, 0, PA.ambient) * K;
    active[3] = clamp(PA.orbit * wP, 0, PA.orbit) * K;
    active[4] = S.wave[3] < 5 && S.wave[1] > 0.001 ? PA.launch * K : 0;
    active[5] = clamp(PA.nodes * Math.min(1, wU * 1.6), 0, PA.nodes);
    active[6] = PA.fly * JY.A.fly * K;
    return active;
  }

  /* ---------- the frame ---------- */
  let frame = 0, exposure = still ? 1 : 0;
  /* HELD (opts.hold, for a page that opens behind something): the system's clock waits at its first moment — the
     canyon dim, no data over the lip yet — until begin() lets it run */
  let held = !still && opts.hold === true;
  const timing = { cpu: 0 };
  function render(dt) {
    const c0 = performance.now();
    drawCount = 0;
    resize();
    prevVP.set(VP);
    camera(dt, S.t);
    if (frame === 0) prevVP.set(VP);
    /* THE MOTION THE LINES ANSWER TO EASES IN: the shaders widen and settle their lines by how far each point moved since the
       last frame (uPrevVP). From rest that went from nothing to full in a frame or two — at the bottom of the well, where the
       camera rolls, the fine ring patterns settled at once and the frame dimmed by 0.1 of luma in one step. So the last
       frame's matrix is blended in by motK, which rises over 0.2 s once the camera moves (and resets after 0.3 s at rest) */
    { let dvp = 0; for (let i = 0; i < 16; i++) dvp += Math.abs(VP[i] - prevVP[i]);
      if (dvp < 1e-6) { motStill += dt; if (motStill > 0.3) motK = 0; } else { motStill = 0; motK = Math.min(1, motK + Math.max(0, dt) / 0.2); }
      for (let i = 0; i < 16; i++) prevVPm[i] = VP[i] + (prevVP[i] - VP[i]) * motK; }
    packState();
    sys.historyTexels(histData);
    gl.bindTexture(gl.TEXTURE_2D, histTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, HN, 2, gl.RGBA, gl.FLOAT, histData);
    frame++;

    /* ---- scene ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.msaa ? T.msFbo : T.sceneFbo);
    gl.viewport(0, 0, T.w, T.h);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (JY.world === 'B') renderChamber(); else renderCanyon();
    sceneDone();
    timing.cpu = timing.cpu * 0.9 + 0.1 * (performance.now() - c0);
    stats.draws = drawCount;
  }
  /* the canyon and the orb (world A): the scene part only, into whatever target and viewport are bound */
  function renderCanyon() {
    let u;
    {
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    u = common(progs.sky);
    gl.uniformMatrix4fv(u.uIVP, false, IVP);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    u = common(progs.wall);
    gl.uniform2i(u.uGrid, SG[0], SG[1]); gl.uniform1i(u.uKind, 0);
    gl.bindVertexArray(sideVao); gl.drawElementsInstanced(gl.TRIANGLES, sideIdx.length, gl.UNSIGNED_INT, 0, 2);
    gl.uniform2i(u.uGrid, CG[0], CG[1]); gl.uniform1i(u.uKind, 1);
    gl.bindVertexArray(cliffVao); gl.drawElements(gl.TRIANGLES, cliffIdx.length, gl.UNSIGNED_INT, 0);

    u = common(progs.ground);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.D[0].t); gl.uniform1i(u.uRefl0, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.D[2].t); gl.uniform1i(u.uRefl1, 3);
    gl.uniformMatrix4fv(u.uPrevVP, false, prevVPm);
    gl.uniform1f(u.uReflK, q.has('noreflect') ? 0 : 2.4);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    { const up = common(progs.plat); if (up.uPrevVP) gl.uniformMatrix4fv(up.uPrevVP, false, prevVPm); }
    gl.bindVertexArray(platVao); gl.drawElements(gl.TRIANGLES, PM.idx.length, gl.UNSIGNED_INT, 0);
    /* the portal: the well under the pool, only once the pool has begun to open */
    if (JY.A.open > 0.001){ const uw = common(progs.well); if (uw.uPrevVP) gl.uniformMatrix4fv(uw.uPrevVP, false, prevVPm); if (uw.uNearK) gl.uniform1f(uw.uNearK, nearK); gl.bindVertexArray(wellVao); gl.drawElements(gl.TRIANGLES, WM.idx.length, gl.UNSIGNED_INT, 0); }
    common(progs.fin);
    gl.bindVertexArray(finVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, BOX.length / 6, FI.length / 4);
    u = common(progs.pool);
    gl.uniform4fv(u.uSrc, srcArr);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* the observer: coverage from alpha keeps the tiny silhouette smooth; then their reflection darkens the floor */
    u = common(progs.fig);
    gl.uniform3fv(u.uFig, P.figure.p);
    if (T.msaa) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 2);
    gl.enable(gl.DEPTH_TEST);

    /* ---- light: additive ---- */
    gl.blendFunc(gl.ONE, gl.ONE);
    common(progs.trace);
    gl.bindVertexArray(traceVao); gl.drawElements(gl.TRIANGLES, TR.idx.length, gl.UNSIGNED_INT, 0);
    common(progs.sheet);
    gl.bindVertexArray(sheetVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 161 * 2);
    u = common(progs.stream);
    if (u.uFlowStep) gl.uniform1f(u.uFlowStep, flowStep);
    gl.uniform4fv(u.uPkt, pkt);
    gl.bindVertexArray(streamVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2, STR.count);
    u = common(progs.ring);
    gl.uniform4fv(u.uRA, ringA); gl.uniform4fv(u.uRB, ringB);
    gl.bindVertexArray(ringVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 721 * 2, P.core.rings.length);
    common(progs.column);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    u = common(progs.part);
    const act = particleCounts();
    gl.uniform4f(u.uKS, starts[0], starts[1], starts[2], starts[3]);
    gl.uniform4f(u.uKS2, starts[4], starts[5], starts[6], starts[7]);
    gl.uniform4f(u.uN0, act[0], act[1], act[2], act[3]);
    gl.uniform4f(u.uN1, act[4], act[5], act[6], 0);
    gl.uniform4fv(u.uNodes, nodeArr);
    const cr = ptr.in ? rayAt(ptr.x, ptr.y) : [0, 0, -1];
    ptr.wake = ptr.wake * 0.94 + 0.06 * (ptr.in ? Math.min(1, ptr.speed * 0.8) : 0);
    gl.uniform4f(u.uCurO, eye[0], eye[1], eye[2], reduced ? 0 : ptr.wake);
    gl.uniform4f(u.uCurD, cr[0], cr[1], cr[2], 0);
    gl.uniform1f(u.uPxK, T.w / cssW);
    gl.bindVertexArray(partVao);
    let nPart = 0;
    for (let k = 0; k < 7; k++) {
      const n = Math.ceil(act[k]);
      if (n <= 0) continue;
      gl.uniform1f(u.uBase, starts[k]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      nPart += n;
    }
    stats.particles = nPart;
    gl.depthMask(true);
    }
  }
  /* THE PRE-WARM. Every scene of the journey is drawn once — into an 8 × 8 corner of the scene target, one state a
     frame, in the idle frames after load — so every first-draw cost (the driver's shader variants and input layouts,
     the chamber's programs, the well, the fragments) is paid before anyone scrolls. Nothing compiles, uploads or
     allocates for the first time mid-scroll. The real frame is drawn after it and overwrites the target; the camera,
     the bloom levels and the motion history are put back untouched. */
  /* journey positions (s): the streams, the turn, the orb, the descent, the aperture, the plunge, the light, both sides of
     the cut, the room coming up, the outputs, the room going, the website */
  const WARM_P = [0.2378, 0.3713, 0.5424, 0.64, 0.7439, 0.7873, 0.8565, 0.8785, 0.8819, 0.9083, 0.9545, 0.99, 1].map(pOfS);
  let warmI = 0, warmRes = null;
  const WVP = new Float32Array(16), WIVP = new Float32Array(16), WEYE = [0, 0, 0];
  const warm = new Promise((r) => (warmRes = r));
  function prewarmStep(force) {
    if (warmI >= WARM_P.length || (!force && frame < 20)) return;
    if (!force && par && !Object.values(progs).every((x) => x.u || gl.getProgramParameter(x.p, par.COMPLETION_STATUS_KHR))) return;
    if (!ensureB()) { warmI = WARM_P.length; warmRes(false); return; }
    WVP.set(VP); WIVP.set(IVP); WEYE[0] = eye[0]; WEYE[1] = eye[1]; WEYE[2] = eye[2]; const sJY = JY, sF = fNow;
    camera(0, S.t, WARM_P[warmI]);
    packState();
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.msaa ? T.msFbo : T.sceneFbo);
    gl.viewport(0, 0, 8, 8);
    gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (JY.world === 'B') renderChamber(); else renderCanyon();
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    VP.set(WVP); IVP.set(WIVP); eye[0] = WEYE[0]; eye[1] = WEYE[1]; eye[2] = WEYE[2]; JY = sJY; fNow = sF;
    if (++warmI === WARM_P.length) { try { performance.mark('waterfall:warm'); } catch {} warmRes(true); }
  }
  /* THE DIVE WAITS FOR THE PRE-WARM (ui: before a dive or the autopilot moves the camera): whatever of it is left is done
     at once — every program finished, every scene drawn once — and the motion starts only when the GPU has done that work
     (a fence, polled a frame at a time, at most 1.5 s). A cold cost lands before the camera moves, never as it enters the
     streams. */
  function prewarmNow() {
    if (still || warmI >= WARM_P.length) return Promise.resolve();
    if (!T) return Promise.race([warm, new Promise((r) => setTimeout(r, 2500))]);
    while (warmI < WARM_P.length) prewarmStep(true);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    const t0 = performance.now();
    return new Promise((res) => {
      const poll = () => {
        if (!fence || gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED || performance.now() - t0 > 1500) { if (fence) gl.deleteSync(fence); res(); }
        else requestAnimationFrame(poll);
      };
      poll();
    });
  }
  const lastTex = { t: null, w: 0, h: 0 };
  /* resolve, bloom, the final pass */
  function sceneDone() {
    let u;
    /* ---- resolve ---- */
    if (T.msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.sceneFbo);
      gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(empty);

    /* ---- bloom: the down levels are kept (next frame's floor reads them) ---- */
    u = common(progs.down);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.uSrc, 0); gl.uniform1f(u.uThresh, P.render.bloomThreshold);
    let srcT = T.sceneTex, sw = T.w, sh = T.h;
    T.D.forEach((b, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.viewport(0, 0, b.w, b.h);
      gl.bindTexture(gl.TEXTURE_2D, srcT); gl.uniform2f(u.uTexel, 1 / sw, 1 / sh); gl.uniform1f(u.uFirst, i === 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      srcT = b.t; sw = b.w; sh = b.h;
    });
    u = common(progs.up);
    gl.uniform1i(u.uSrc, 0); gl.uniform1i(u.uCur, 1);
    for (let i = T.U.length - 1; i >= 0; i--) {
      const src = i === T.U.length - 1 ? T.D[i + 1] : T.U[i + 1], dst = T.U[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.D[i].t);
      gl.uniform2f(u.uTexel, 1 / src.w, 1 / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ---- final ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    u = common(progs.final);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.sceneTex); gl.uniform1i(u.uLit, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.U[0].t); gl.uniform1i(u.uBloom, 1);
    const ex = (exposure < 1 ? 1 - Math.pow(1 - exposure, 2.2) : 1) * JY.dip;
    gl.uniform4f(u.uPost, P.light.exposure * ex, P.render.bloom * (1 - 0.45 * JY.B.simplify), P.render.grain, P.render.vignette * (1 - 0.5 * JY.B.simplify));
    if (u.uBreak) gl.uniform4f(u.uBreak, reduced ? 0 : JY.stretch, flashOut, 0, 0);
    if (u.uLast) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, lastTex.t); gl.uniform1i(u.uLast, 2); }
    if (u.uXfade) gl.uniform1f(u.uXfade, Math.max(xfade, persist));
    gl.uniform4f(u.uPost2, S.wave[1] * 0.05 * Math.exp(-S.wave[3] * 3), frame % 97, cam.scroll, 0);
    gl.uniform2f(u.uView, viewDev[0], viewDev[1]);
    if (u.uGrade) gl.uniformMatrix3fv(u.uGrade, false, grade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* near the switch, the frame as shown is kept (copied from the drawing buffer before it is presented) — the next
       frame may be the other world's; during a crossfade the kept frame is left alone */
    if (!still && xfade <= 0 && ((JY.s > 0.02 && JY.s < 0.65) || (JY.s > 0.76 && JY.s < 0.95))) {
      if (lastTex.w !== canvas.width || lastTex.h !== canvas.height) {
        if (lastTex.t) gl.deleteTexture(lastTex.t);
        lastTex.t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, lastTex.t);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGB8, canvas.width, canvas.height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        lastTex.w = canvas.width; lastTex.h = canvas.height;
      }
      gl.bindTexture(gl.TEXTURE_2D, lastTex.t);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, canvas.width, canvas.height);
    }
  }

  /* the chamber: the void, the floor, the core and its pool, the room's solids; then its light — the output
     channels, the column, the glyphs, the motes */
  function ensureB() {
    if (bChecked) return true;
    try { checkPrograms(isB); bChecked = true; } catch (e) { console.error(e.message); bChecked = 'failed'; }
    return bChecked === true;
  }
  const pktZero = new Float32Array(16);
  function renderChamber() {
    if (!ensureB()) return;
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    let u = common(progs.chsky);
    gl.uniformMatrix4fv(u.uIVP, false, IVP);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    u = common(progs.chfloor);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.D[0].t); gl.uniform1i(u.uRefl0, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.D[2].t); gl.uniform1i(u.uRefl1, 3);
    gl.uniformMatrix4fv(u.uPrevVP, false, prevVPm);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    common(progs.chcore); gl.bindVertexArray(coreVao); gl.drawElements(gl.TRIANGLES, CM.idx.length, gl.UNSIGNED_INT, 0);
    common(progs.chpool); gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    common(progs.chsolid); gl.bindVertexArray(solidVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, NSOL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    common(progs.chpath); gl.bindVertexArray(pathVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 65 * 2, NPATH);
    u = common(progs.stream); gl.uniform4fv(u.uPkt, pktZero);
    gl.bindVertexArray(streamVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2, STR.count);
    common(progs.chglyph); gl.bindVertexArray(glyphVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, NGLY);
    const nm = Math.round(NMOTE * JY.B.reveal * (1 - JY.B.simplify));
    if (nm > 0){ common(progs.chmote); gl.bindVertexArray(partVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nm); }
    stats.particles = nm;
    gl.disable(gl.BLEND); gl.depthMask(true);
  }

  /* ---------- loop ---------- */
  let last = 0, running = false, raf = 0, acc = 0, readyRes, t0 = 0;
  const ready = new Promise((r) => (readyRes = r));
  const hooks = { onFrame: null };
  let marked = 0;
  let frozen = false;
  /* dev: non-finite hunting — read a float target, count NaN/Inf and where they are */
  function readFloat(f, w, h) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); const a = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, a); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return a; }
  function nonFinite(a, w) { let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, neg = 0; for (let i = 0; i < a.length; i += 4) { const ok = Number.isFinite(a[i]) && Number.isFinite(a[i + 1]) && Number.isFinite(a[i + 2]); if (!ok) { n++; const p = i / 4, x = p % w, y = (p / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } else if (a[i] < 0 || a[i + 1] < 0 || a[i + 2] < 0) neg++; } return { n, neg, box: n ? [x0, y0, x1, y1] : null }; }
  function stepTo(dt) {
    acc += dt;
    const n = Math.floor(acc / DT);
    acc -= n * DT;
    for (let i = 0; i < Math.min(n, 30); i++) sys.step();
    S = sys.snapshot();
  }
  function tick(now) {
    if (!filmMode) raf = requestAnimationFrame(tick);
    stats.dt = last ? now - last : 0;
    stats.frames++;
    const raw = last ? (now - last) / 1000 : 0, dt = last ? Math.min(0.1, raw) : 1 / 60;
    last = now;
    if (scrollSource) {
      const tg = scrollSource(); if (tg === tg) cam.scrollTarget = tg < 0 ? 0 : tg > 1 ? 1 : tg;
      /* a page opened (or reloaded) part-way down starts where it is — no glide from the top */
      if (firstTarget) { firstTarget = false; follow.reset(cam.scrollTarget); cam.scroll = cam.scrollTarget; }
    }
    if (xfade > 0) xfade = Math.max(0, xfade - dt / 0.13);
    /* OFF THE SCREEN NOTHING IS DRAWN (the scene's clock waits). Not earlier: holding the last frame while the stage is
       still in view lets a GPU drop to idle clocks, and the section coming in then rasterises slowly */
    if (!onScreen) {
      if (hooks.onFrame) hooks.onFrame(S, sys, JY);
      if (frameLog) frameLog.push(now, stats.dt, cam.scrollTarget, cam.scroll, JY.s, JY.world === 'B' ? 1 : 0, JY.flash, cam.sv);
      if (overlay) overlay.frame(stats.dt, cam.scroll, cam.sv, JY.s, JY.world === 'B', JY.flash);
      return;
    }
    if (!frozen && !held) stepTo(dt);
    flowStep = lastFlowU >= 0 && S.flowU >= lastFlowU ? Math.min(0.2, S.flowU - lastFlowU) : 0; lastFlowU = S.flowU;
    for (let k = 0; k < 3; k++) { outH[k] += (outT[k] - outH[k]) * (1 - Math.exp(-dt / 0.16)); if (!reduced) glyphX[k] += dt * 0.75 * outH[k] * (k === 1 ? -1 : 1); }
    timeW = (S.t) % 3600;
    if (exposure < 1) exposure = held ? Math.min(0.3, exposure + dt / 1.1) : Math.min(1, exposure + dt / 1.1);
    /* the governor: particles first, resolution only after */
    gov.n++; if (gov.n > 0) gov.sum += dt;
    if (gov.n === 90) {
      const mean = gov.sum / gov.n;
      if (mean > 0.0205) {
        if (gov.partK > 0.56) gov.partK = Math.max(0.55, gov.partK - 0.15);
        else if (gov.steps < 3) { scale *= 0.85; gov.steps++; }
      }
      gov.n = 0; gov.sum = 0;
    }
    fastStep(raw);
    prewarmStep();
    let tqq = null;
    if (tq && tqPending.length < 8) { tqq = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, tqq); }
    render(dt);
    if (tqq) { gl.endQuery(tq.TIME_ELAPSED_EXT); tqPending.push(tqq); }
    if (tq) tqPoll();
    if (marked === 0) { marked = 1; try { performance.mark('waterfall:first-gl-draw'); } catch {} requestAnimationFrame(() => { try { performance.mark('cascade:first-visible-frame'); } catch {} }); }
    if (marked === 1 && S.arrive > 0.5) { marked = 2; try { performance.mark('waterfall:core-lit'); } catch {} }
    if (hooks.onFrame) hooks.onFrame(S, sys, JY);
    if (frameLog) frameLog.push(now, stats.dt, cam.scrollTarget, cam.scroll, JY.s, JY.world === 'B' ? 1 : 0, JY.flash, cam.sv);
    if (overlay) overlay.frame(stats.dt, cam.scroll, cam.sv, JY.s, JY.world === 'B', JY.flash);
  }

  /* stills: ?still&t=9&hover=process&at=4&leave=8&scroll=0.4&ptr=0.3,0.5 */
  function scriptFrom(qq) {
    const sc = [];
    if (qq.get('hover')) sc.push([Number(qq.get('at') || 0), qq.get('hover')]);
    if (qq.get('leave')) sc.push([Number(qq.get('leave')), null]);
    if (qq.get('hover2')) sc.push([Number(qq.get('at2') || 0), qq.get('hover2')]);
    if (qq.has('demo')) sc.push([Number(qq.get('demo') || 0), 'demo']);
    return sc;
  }
  let lastStill = null;
  function stillAt(t, sc, scroll = 0) {
    lastStill = [t, sc, scroll];
    sys = createSystem({ reduced });
    runScript(sys, sc, t);
    S = sys.snapshot();
    timeW = S.t % 3600;
    cam.scroll = cam.mid = cam.scrollTarget = scroll; cam.sv = cam.mv = 0; follow.reset(scroll);
    for (let i = 0; i < 400; i++) camera(1 / 60, S.t);
    exposure = 1;
    frame = 0;
    render(0); render(0);   // twice: the floor reflects the first
    if (hooks.onStill) hooks.onStill(S, scroll, JY);
  }

  function boot() {
    if (!programsReady()) { setTimeout(boot, 16); return; }
    try { checkPrograms(); } catch (e) { console.error(e.message); host.classList.add('no-gl'); readyRes(false); return; }
    resize(); initPasses();
    if (still) {
      ensureB();
      if (q.has('ptr')) { const [x, y] = q.get('ptr').split(',').map(Number); ptr.x = x * cssW; ptr.y = y * cssH; ptr.in = true; ptr.nx = x * 2 - 1; ptr.ny = y * 2 - 1; ptr.speed = 1; ptr.wake = 1; }
      /* the interface binds a frame later; draw once now, again when it is listening */
      stillAt(Number(q.get('t') || 9), scriptFrom(q), Number(q.get('scroll') || 0));
      setTimeout(() => { if (hooks.onStill) hooks.onStill(S, cam.scroll); }, 0);
      host.classList.add('running');
      readyRes(true);
      return;
    }
    running = true;
    if (dev && q.get('debug') === '1') overlay = createDebugOverlay(document.body);
    if (!filmMode) raf = requestAnimationFrame(tick);
    setTimeout(() => { if (!par || [...Object.entries(progs)].every(([n, x]) => !isB(n) || gl.getProgramParameter(x.p, par.COMPLETION_STATUS_KHR))) ensureB(); }, 3000);
    host.classList.add('running');
    readyRes(true);
  }
  setTimeout(boot, 0);

  let onScreen = true;
  if (!still && typeof IntersectionObserver === 'function') new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; }).observe(host);
  const ro = new ResizeObserver(() => { if (still && T && progs.final.u) { resize(); render(0); } });
  ro.observe(host);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); running = false; }
    else if (!running && !still && !filmMode) { last = 0; running = true; raf = requestAnimationFrame(tick); }
  });
  const renderer = (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })();

  return {
    ok: true, ready, gl, hooks, stats, compileT, compileCost, timing,
    get sys() { return sys; },
    get S() { return S; },
    hover: (name) => sys.hover(name),
    demo: () => sys.demo(),
    setScroll: (p) => { cam.scrollTarget = clamp(p); },
    /* the page hands over a reader of its scroll progress; it is called once per frame, never from a scroll event */
    ...(dev ? { filmStep: (dtSec = 1 / 60) => { if (!filmMode) return false; filmNow += dtSec * 1000; tick(filmNow); return true; } } : {}),
    setScrollSource: (fn, past) => { scrollSource = fn; pastSource = past || null; },
    /* resolves when every scene has been drawn once (tools wait for it) */
    warm, prewarmNow, govern,
    ...(dev ? { frameLog } : {}),
    /* begin(): the held system's clock starts */
    begin: () => { if (held) { held = false; acc = 0; } },
    /* the page says where its words end and its controls begin (portrait: the fall is framed between them) */
    setFrameHint: (h) => { frameHint = h; if (still && lastStill) stillAt(...lastStill); },
    journey: () => JY,
    /* each pedestal's front face on screen (CSS px), or null before the chamber */
    pedestalRects: () => {
      if (JY.world !== 'B') return null;
      return CH.outs.map((_, k) => {
        const pts = pedestalFace(k).map(project);
        if (pts.some((p) => !p)) return null;
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      });
    },
    /* THE POINTS' ANCHORS: each pedestal's foot, front and centre, on screen (CSS px) into out[2k], out[2k + 1] — false
       before the chamber. The interface reads it every frame the room is in view, so it allocates nothing. */
    pedestalAnchors: (out) => {
      if (JY.world !== 'B') return false;
      for (let k = 0; k < 3; k++) {
        const o = CH.outs[k], x = o.x, zz = o.z + CH.pedestal.d / 2;
        const cx = VP[0] * x + VP[8] * zz + VP[12], cy = VP[1] * x + VP[9] * zz + VP[13], cw = VP[3] * x + VP[11] * zz + VP[15];
        if (cw <= 0.01) return false;
        out[2 * k] = (cx / cw * 0.5 + 0.5) * cssW; out[2 * k + 1] = (0.5 - cy / cw * 0.5) * cssH;
      }
      return true;
    },
    /* the point under the pointer (0..2), or -1: its glyph brightens and turns faster, its channel and light come back */
    outHover: (k) => { for (let i = 0; i < 3; i++) outT[i] = i === k && !reduced ? 1 : i === k ? 0.6 : 0; },
    setSiteHint: (h) => { siteHint = h; if (still && lastStill) stillAt(...lastStill); },
    /* where a block under the cards begins (css px from the top, -1 none): the floor's rings fade out below it at the end */
    setLogoZone: (y) => { logoZone = y; },
    pointer: (x, y) => pointerAt(x * cssW, y * cssH, performance.now()),
    project,
    gpuTimes: (reset) => { const a = tqMs.slice(); if (reset) tqMs.length = 0; return a; },
    info: () => ({
      programs: Object.keys(progs).length, drawCalls: stats.draws, particles: stats.particles, streams: STR.count,
      buffer: [T && T.w, T && T.h], css: [cssW, cssH], dpr, msaa: T && T.msaa, mode: cam.mode, mech,
      t: +S.t.toFixed(3), w: S.w.map((x) => +x.toFixed(3)), scroll: +cam.scroll.toFixed(6), target: +cam.scrollTarget.toFixed(6), s: +JY.s.toFixed(4), world: JY.world, eye: eye.map((v) => +v.toFixed(3)), yaw: +JY.cam.yaw.toFixed(5), cpu: +timing.cpu.toFixed(2),
      partK: gov.partK, scale, renderer, tFall: +T_FALL.toFixed(3),
      points: Object.fromEntries(Object.entries({ lip: [0, F.lip.y, F.lip.z], core: [0, P.core.tiers[2][1], P.core.c[2]], front: [0, 0, P.core.c[2] + P.core.tiers[0][2]], figure: P.figure.p }).map(([k, p]) => [k, (project(p) || []).map((v) => +v.toFixed(1))])),
    }),
    still: (t, script = [], scroll = 0) => stillAt(t, script, scroll),
    /* dev only: the NaN hunt */
    maxLevel: (i = 1) => { const d = T.D[i]; const a = readFloat(d.f, d.w, d.h); let m = 0, at = 0; for (let k = 0; k < a.length; k += 4) { const v = Math.max(a[k], a[k + 1], a[k + 2]); if (Number.isFinite(v) && v > m) { m = v; at = k / 4; } } return { max: +m.toFixed(2), x: at % d.w / d.w, y: ((at / d.w) | 0) / d.h }; },
    probe: () => { const d = T.D[T.D.length - 1]; return nonFinite(readFloat(d.f, d.w, d.h), d.w); },
    probeScene: () => Object.assign(nonFinite(readFloat(T.sceneFbo, T.w, T.h), T.w), { size: [T.w, T.h] }),
    freeze: (on) => { frozen = !!on; },
    clearBloom: () => { for (const d of [...T.D, ...T.U]) { gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER, null); },
    renderWith: (names) => { const keep = new Set(skip); skip.clear(); for (const n of names) skip.add(n); render(0); skip.clear(); for (const n of keep) skip.add(n); },
    programNames: () => Object.keys(progs),
    setDbg: (d) => { dbg = d; },
    readScenePx: (x, y) => {
      const a = new Float32Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.sceneFbo); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, a); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return Array.from(a).map((v) => (Number.isNaN(v) ? 'NaN' : Number.isFinite(v) ? +v.toFixed(3) : (v > 0 ? '+Inf' : '-Inf')));
    },
    step(n = 1) { for (let i = 0; i < n; i++) { stepTo(1 / 60); timeW = S.t % 3600; render(1 / 60); } },
    STATES,
  };
}
