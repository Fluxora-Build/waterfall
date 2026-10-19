/* ============================================================================
   src/decode.js — THE WORDS DECODE. Each letter arrives as a run of
   changing glyphs (the readout's mono, in the accent, flickering) and locks
   into its own letter with a short flash, left to right: the fall's own signal
   resolving into words.

   THE HEADLINE GOES FIRST and takes its time (~1.7 s: 50 ms a letter, the
   second line 0.3 s after the first, each letter scrambling 0.5–0.9 s). Once
   its first line has mostly locked (1.0 s) the rest of the copy is released:
   the line above it and the sentence under it decode too, quicker, as they
   fade in, and the buttons, the controls and the readout follow on their own
   CSS entrances (held by html.dcq until then — page.js).

   The words are in the markup as they are (no-JS, search; a screen reader reads
   the real letters — the glyphs are aria-hidden); the
   script wraps each letter in a cell whose width is the real letter's (so a
   line never moves) and draws the glyph over it. Until the decode starts the
   headline is a faint field of glyphs (that is the first paint). It starts
   when the page says so (main.js: after the scene has booted — the boot
   blocks the main thread for a few hundred ms, and a clock that ran through it
   would skip half the letters), and its clock only moves with drawn frames (at
   most 1/30 s a frame): a stall pauses it, never skips. One rAF loop; it stops
   when the last letter locks. Not under reduced motion or ?still.
   ========================================================================== */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·—';
const pick = (r) => GLYPHS[(r * GLYPHS.length) | 0];

/* targets: [{ el, at, stagger, lineGap, dur: [min, max], noise }] */
export function createDecoder(targets, { release = 1.0 } = {}) {
  const cells = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const T of targets) {
    const el = T.el;
    if (!el) continue;
    const lines = el.children.length && [...el.children].every((c) => c.tagName === 'SPAN') ? [...el.children] : [el];
    lines.forEach((ln, li) => {
      let i = 0;
      const wrap = (node) => {
        for (const n of [...node.childNodes]) {
          if (n.nodeType === 1) { wrap(n); continue; }
          if (n.nodeType !== 3) continue;
          const frag = document.createDocumentFragment();
          for (const ch of n.textContent) {
            if (/\s/.test(ch)) { frag.appendChild(document.createTextNode(ch)); continue; }
            const c = document.createElement('span'), f = document.createElement('span'), g = document.createElement('span');
            c.className = 'dc'; f.className = 'dc-f'; g.className = 'dc-g'; f.textContent = ch;
            g.setAttribute('aria-hidden', 'true'); c.append(f, g); frag.appendChild(c);
            if (T.noise) { g.textContent = pick(Math.random()); g.style.opacity = (0.12 + Math.random() * 0.16).toFixed(2); }
            const start = T.at + li * (T.lineGap || 0) + i * T.stagger + rnd() * 0.05;
            cells.push({ c, g, start, end: start + T.dur[0] + rnd() * (T.dur[1] - T.dur[0]), next: 0, done: false });
            i++;
          }
          n.replaceWith(frag);
        }
      };
      wrap(ln);
    });
    el.classList.add('dcing');
  }
  const root = document.documentElement;
  root.classList.add('dcq');
  let last = -1, t = 0, released = false;
  const frame = (now) => {
    t += last < 0 ? 0 : Math.min(1 / 30, (now - last) / 1000); last = now;
    if (!released && t >= release) { released = true; root.classList.remove('dcq'); }
    let left = 0;
    for (const c of cells) {
      if (c.done) continue;
      left++;
      if (t < c.start) continue;
      if (t >= c.end) { c.done = true; c.g.textContent = ''; c.c.classList.add('on'); continue; }
      if (t >= c.next) {
        c.next = t + 0.045 + rnd() * 0.035;
        c.g.textContent = pick(rnd());
        c.g.style.opacity = (0.45 + rnd() * 0.55).toFixed(2);
      }
    }
    if (left) requestAnimationFrame(frame);
    else for (const T of targets) if (T.el) T.el.classList.remove('dcing');
  };
  let started = false;
  const go = () => { if (!started) { started = true; requestAnimationFrame(frame); } };
  return {
    /* the page is ready for it */
    start() { go(); },
  };
}

/* the hero's copy: the headline first, then the line above it and the sentence under it */
export function decodeCopy(doc = document) {
  return createDecoder([
    { el: doc.getElementById('h1'), at: 0, stagger: 0.05, lineGap: 0.3, dur: [0.5, 0.9], noise: true },
    { el: doc.querySelector('.copy .eyebrow'), at: 1.0, stagger: 0.022, dur: [0.25, 0.45] },
    { el: doc.querySelector('.copy .lede'), at: 1.1, stagger: 0.009, dur: [0.22, 0.4] },
  ], { release: 1.0 });
}
