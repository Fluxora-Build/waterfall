/* ============================================================================
   config.js — everything you would change, in one place: the words, the
   colours, the motion and the three things at the end. Edit, save, reload.
   Nothing else in the repo needs to change to make the page yours.
   ========================================================================== */
export default {
  /* the tab, the search result and the link preview */
  meta: {
    title: 'Your product — a headline in one line',
    description: 'Two sentences on what your product does and who it is for.',
    url: '',                       // 'https://example.com/' once it has a home (link previews want an absolute address)
    image: '',                     // a 1200 × 630 preview image, e.g. 'media/og.png'
  },

  /* the navigation: a wordmark on the left, links in the middle, one action on the right */
  brand: { name: 'BRAND', href: '#' },
  nav: {
    links: [['PRODUCT', '#'], ['DOCS', '#'], ['PRICING', '#'], ['ABOUT', '#']],
    action: ['GET STARTED', '#'],
  },

  /* the hero's words. In the headline, *stars* mark the words that take the accent colour. */
  hero: {
    eyebrow: 'A CATEGORY FOR YOUR PRODUCT',
    headline: ['Say *what you do*', 'in one line.'],
    lede: 'Two sentences on what it does and who it is for. Replace them, and everything else on this page, in config.js.',
    explore: 'EXPLORE THE SYSTEM',   // plays the whole journey to the three cards in about 12 s (motion.acts)
    watch: 'WATCH THE EXPERIENCE',   // plays the whole journey on autopilot (not shown on phones)
    scene: 'A canyon at night. A waterfall of light falls into a machine on the canyon floor, where it is turned into light. The four controls change what the machine is doing.',
  },

  /* the four controls on the right: hovering (or focusing, or tapping) one changes what the machine does.
     The four behaviours are fixed — take in, transform, single out, release — the words are yours. */
  controls: {
    title: 'THE SYSTEM',
    idle: 'IDLE',
    items: [
      { label: 'INGEST', note: 'Bring every signal in', status: 'INGESTING' },
      { label: 'PROCESS', note: 'Shape it into something useful', status: 'PROCESSING' },
      { label: 'FOCUS', note: 'Single out what matters', status: 'FOCUSING' },
      { label: 'ACT', note: 'Send it where it is needed', status: 'ACTING' },
    ],
  },

  /* the panel under the controls: this page, measured live (the fourth cell's numbers are the scene's own, and say so) */
  readout: { title: 'THIS PAGE', live: 'LIVE', note: 'STATE VALUES · DEMO DATA' },

  /* THE END: the waterfall splits into three channels, each to a pedestal with a glyph of light turning over it, and
     under each pedestal a card. `measure` makes a card a live reading of this page, measured in the visitor's
     browser: 'paint' (how soon the words were on screen), 'frames' (frames a second and the slow 5 %), 'bytes'
     (everything the page fetched, as sent). Leave `measure` out and give `value` and `unit` for words of your own.
     `glyph` is the shape over the pedestal: 'bolt', 'wave', 'feather', 'layers', 'prism' or 'network'.
     `icon` is the card's 20 × 20 SVG (stroke only). `colour` lights the channel, the glyph and the card. */
  ending: {
    label: 'This page, measured on this visit',
    items: [
      {
        title: 'FAST', measure: 'paint', glyph: 'bolt', colour: '#a6e4ff',
        note: 'How soon the words were on screen: LCP, the largest paint, and FCP, the first.',
        icon: '<path d="M11.4 1.8 4.6 11.2h5.2l-1.4 7 6.8-9.4H10z"/>',
      },
      {
        title: 'SMOOTH', measure: 'frames', glyph: 'wave', colour: '#ffd08a',
        note: 'Frames a second right now, and p95: the slowest 5 % of frames.',
        icon: '<path d="M1.8 10c2.05-3.4 4.1-3.4 6.15 0s4.1 3.4 6.15 0 3.3-3.1 4.1-1.4"/><path d="M1.8 14.6c2.05-3.4 4.1-3.4 6.15 0s4.1 3.4 6.15 0 3.3-3.1 4.1-1.4" opacity=".55"/>',
      },
      {
        title: 'LIGHT', measure: 'bytes', glyph: 'feather', colour: '#a6e4ff',
        note: 'Everything this page fetched, as it crossed the wire. No video, no images.',
        icon: '<path d="M16.6 3.4c-5.6.2-10 4.3-10.6 10.6l-2.6 2.6"/><path d="M16.6 3.4c.1 5.5-3.5 9.7-9.3 10.3"/><path d="M8.4 11.6l4-4"/>',
      },
    ],
  },

  /* the section after the journey */
  footer: {
    text: '© 2026 Your company',
    links: [['Privacy', '#'], ['Terms', '#'], ['Contact', '#']],
  },
  /* a small credit at the foot of the hero. Set `show: false` (or delete the block) to remove it. */
  credit: { show: true, text: 'BUILT WITH WATERFALL', href: 'https://github.com/Fluxora-Build/waterfall' },

  /* colours. `light` is the scene's light: its hue and saturation grade the whole frame (the scene was made in
     #5fe9de, which leaves it exactly as made; a grey takes the colour out). The rest are the page's. */
  colours: {
    light: '#5fe9de',          // presets (set accent to the same): teal #5fe9de (as made) · amber #ffb547 · electric blue #4f8bff
                               // · violet #9d7bff · white #e8f1ff
    background: '#040505',
    ink: '#ecefef',
    accent: '#5fe9de',
    onAccent: '#021110',       // the text on the accent (the primary button)
  },
  fonts: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },

  /* motion. Visitors who ask for reduced motion get held views and no autopilot, whatever is set here. */
  motion: {
    track: 1250,          // the journey's length, in screen heights × 100 (vh): longer is slower to scroll through
    acts: [1.2, 2.0, 1.5, 2.5, 1.0, 3.5],   // seconds: EXPLORE's dive, act by act — to the waterfall, down the streams,
                          // the core, the ring tunnel, the light, the split to the cards (then ~0.9 s while they come in)
    autopilot: 26,        // seconds: WATCH THE EXPERIENCE, start to end
    idleCycle: true,      // when nobody touches anything, walk through the four controls
    idleAfter: 8,         // seconds of no input before the walk starts
    decode: true,         // the headline resolves out of scrambled glyphs on arrival
  },
};
