/* ============================================================================
   src/main.js — boot. The page is written from config.js before the first
   paint; the scene's code is fetched and started after it, so the words are
   on screen before a single shader compiles.

   For tools (only with ?dev in the address):
     ?dev&still&t=9&hover=process&at=4[&leave=8][&demo=1]&scroll=0.5&ptr=0.3,0.6
                                  one moment, drawn synchronously
     ?dev                         window.__waterfall and window.__autopilot
     ?dev&nomsaa ?dev&scale= ?dev&gputime   render-target and timing overrides
     ?dev&light=ffb547&accent=ffb547         another colour, without editing config.js
   ========================================================================== */
import config from '../config.js';
import { pageHtml, applyConfig } from './page.js';
import { decodeCopy } from './decode.js';

const q0 = new URLSearchParams(location.search);
const dev = q0.has('dev');
const q = dev ? q0 : { has: () => false, get: () => null };

/* tools: ?dev&light=ffb547&accent=ffb547 tries colours without editing the config (renders, comparisons) */
if (dev) for (const k of ['light', 'accent']) { const v = q0.get(k); if (v) config.colours[k] = '#' + v.replace('#', ''); }
applyConfig(config);
document.body.insertAdjacentHTML('afterbegin', pageHtml(config));
const track = config.motion && config.motion.track;
if (track) document.getElementById('hero').style.height = track + 'vh';

const still = q.has('still');
if (still) document.documentElement.classList.add('still');
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/* the headline decodes (decode.js): wrapped now, before the first paint — not in stills, not under reduced motion */
const decode = !still && !reduced && (config.motion || {}).decode !== false ? decodeCopy(document) : null;
/* whatever happens to the boot, the headline never stays noise */
if (decode) setTimeout(() => decode.start(), 2500);

async function boot() {
  const [{ startWaterfall }, { bindUI }] = await Promise.all([import('./engine/runtime.js'), import('./ui.js')]);
  const host = document.getElementById('stage'), canvas = document.getElementById('gl');
  const hero = startWaterfall({ canvas, host, still, query: q, dev, reduced: q.has('reduced') ? true : undefined });
  if (dev) window.__waterfall = hero;
  /* the scene has booted (the main thread is free again): the headline decodes */
  if (decode) requestAnimationFrame(() => decode.start());
  if (!hero.ok) {
    document.getElementById('hero').classList.add('no-gl');
    /* no WebGL2: the copy and the controls stand on a still gradient; the readout keeps WIRE */
    const ui = bindUI({ hover() {}, demo() {}, setScroll() {}, hooks: {}, stats: { dt: 0, particles: -1 } }, { dev });
    ui.measures.sceneLoaded(); ui.measures.noScene();
    return;
  }
  const ui = bindUI(hero, { dev });
  ui.measures.sceneLoaded();
}
if (still) boot();
else requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(boot, 0)));
