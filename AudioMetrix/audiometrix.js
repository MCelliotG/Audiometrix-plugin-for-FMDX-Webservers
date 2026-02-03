(() => {
  // ─────────────────────────────────────────────────────────
  // AUDIO METRIX — FULL HARDENED VERSION
  // THEME ENGINE • SETTINGS UI • RENDER ENGINE • AUDIO ENGINE
  // ─────────────────────────────────────────────────────────

  // GLOBAL HARDENED CONSTANTS
  const VALID_THEMES = [
    "automatic", "aegean", "aurora", "emerald", "escapade", "goldenbrown",
    "iceblue", "neonlights", "pastel", "prism", "redvelvet", "retrospect",
    "secretgarden", "solar", "spaceship", "tangerine", "wicked", "vesper", "vintage"
  ];

  const VALID_STYLES = [
    "simple", "segment", "circledots", "matrixdots", "pillars",
    "beveled3d", "glasstube"
  ];

  const GRADIENT_CACHE = {
    mode: null,
    width: 0,
    colors: [],
    stops: [],
    peakThresholdX: -1,
    hash: ""
  };

  const GEOMETRY_CACHE = {
    segment: new Map(),
    pixelfill: new Map(),
    circledots: new Map(),
    matrixdots: new Map(),
    matrixCount: new Map()
  };

  const PERCENT_SCALE_PAD = {
    left: 10,
    right: 45
  };

  const FRAME_INTERVAL = 1000 / 30;
  let _lastRenderTime = 0;
  let _lastDrawn = { L:null, R:null, Q:null, A:null };

  function invalidateVisualCaches() {
    // Gradient cache
    GRADIENT_CACHE.width = 0;
    GRADIENT_CACHE.ctx = null;

    // Pillars geometry
    STATE.cache.pillar.path = null;
    STATE.cache.pillar.W = 0;
    STATE.cache.pillar.y = 0;
    STATE.cache.pillar.height = 0;
  }

  const STORAGE_ENABLE = "amx_enabled_state";
  const STORAGE_THEME = "AMX_THEME";
  const STORAGE_GLOW_ENABLED = "AMX_GLOW_ENABLED";
  const STORAGE_SHOW_PEAKS = "AMX_SHOW_PEAKS";
  const STORAGE_SHOW_READOUTS = "AMX_SHOW_READOUTS";
  const STORAGE_BARSTYLE = "AMX_BAR_STYLE";
  const STORAGE_GAIN = "AMX_GAIN";
  const STORAGE_LAYOUT = "AMX_LAYOUT_MODE"; // lr, sa, full
  const STORAGE_RENDER = "AMX_RENDER_MODE"; // bars, gauges, mirrored
  const AMX_DEBUG = false;

  // HARDENED LOCAL STORAGE HELPERS
  function safeLSGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeLSSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function safeLSRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  // LOCAL STORAGE SANITIZER — PREVENTS LOCKOUT
  (function sanitizeStorage() {
    try {
      // ENABLE FLAG
      let en = safeLSGet(STORAGE_ENABLE);
      if (en !== "true" && en !== "false") {
        safeLSSet(STORAGE_ENABLE, "true");
      }

      // THEME
      let th = safeLSGet(STORAGE_THEME);
      if (typeof th === "string" && VALID_THEMES.includes(th.trim())) {
        // valid → keep
      } else if (th === null) {
        // first run → set automatic
        safeLSSet(STORAGE_THEME, "automatic");
      } else {
        // unknown or invalid → soft fallback
        safeLSSet(STORAGE_THEME, "automatic");
      }

      // GLOW
      let ge = safeLSGet(STORAGE_GLOW_ENABLED);
      if (ge !== "true" && ge !== "false") {
        safeLSSet(STORAGE_GLOW_ENABLED, "false"); // default off
      }

      // GAIN (dB)
      let gRaw = safeLSGet(STORAGE_GAIN);
      let g = parseInt(gRaw, 10);
      if (isNaN(g) || g < -12 || g > 12) {
        safeLSSet(STORAGE_GAIN, "0");
      }

      // BAR STYLE
      let bs = safeLSGet(STORAGE_BARSTYLE);
      if (typeof bs === "string" && VALID_STYLES.includes(bs.trim())) {
        // valid → keep
      } else if (bs === null) {
        safeLSSet(STORAGE_BARSTYLE, "simple");
      } else {
        safeLSSet(STORAGE_BARSTYLE, "simple");
      }

      // Remove known legacy / deprecated keys
      ["amx_theme", "amx_theme_style", "amx_indicator_theme", "glow"].forEach((k) =>
        safeLSRemove(k)
      );
    } catch (e) {}
  })();

  // ─────────────────────────────────────────────────────
  // PART 1 — THEME ENGINE • SETTINGS UI • CONFIG • STATE
  // ─────────────────────────────────────────────────────

  // UTILITIES
  function darkenColor(rgb, percent) {
    try {
      const vals = rgb.match(/\d+/g).map(Number);
      const [r, g, b] = vals;
      const p = (100 - percent) / 100;
      return `rgb(${Math.round(r * p)},${Math.round(g * p)},${Math.round(b * p)})`;
    } catch (e) {}
  }

  // RGB blend
  function mixRGB(c1, c2, ratio) {
    try {
      const a = c1.match(/\d+/g).map(Number);
      const b = c2.match(/\d+/g).map(Number);
      const lerp = (x, y) => Math.round(x * (1 - ratio) + ratio * y);
      return `rgb(${lerp(a[0], b[0])}, ${lerp(a[1], b[1])}, ${lerp(a[2], b[2])})`;
    } catch (e) {
      return c1;
    }
  }

  // Procedural high color (FM-DX inheritance)
  function deriveHighColor(main, bright) {
    try {
      const m = main.match(/\d+/g).map(Number);
      const b = bright.match(/\d+/g).map(Number);

      // Stronger boost factor for clearer 3-step gradient
      const boost = 0.40;

      // Base boosted RGB
      let hi = [
        b[0] + (b[0] - m[0]) * boost,
        b[1] + (b[1] - m[1]) * boost,
        b[2] + (b[2] - m[2]) * boost
      ];

      // Adaptive lift: ensures high is always brighter than mid
      const adapt = 0.12;
      hi = [
        hi[0] + 255 * adapt,
        hi[1] + 255 * adapt,
        hi[2] + 255 * adapt
      ];

      // Clamp to safe visual range
      const clamp = (v) => Math.max(15, Math.min(255, Math.round(v)));
      const r = clamp(hi[0]);
      const g = clamp(hi[1]);
      const bl = clamp(hi[2]);

      return `rgb(${r},${g},${bl})`;
    } catch (e) {
      return bright;
    }
  }

  // External peak
  function drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW, gauge) {
    // GLOBAL TOGGLE
    if (!CONFIG.display.showPeaks) return;

    // STATE INIT (separate for bars / gauges)
    if (!STATE.render) STATE.render = {};

    const peakState = gauge
      ? (STATE.render.gaugePeak ??= {})
      : (STATE.render.barPeak   ??= {});

    if (typeof peakState.pos !== "number") {
      peakState.pos = gauge ? gauge.startAngle : peakX;
      peakState.vel = 0;
    }

    // DOMAIN SETUP
    let base, min, max, target;

    if (!gauge) {
      // BAR DOMAIN
      if (peakX <= 0) return;

      const fillX = Math.max(0, Math.min(levelX, effectiveW));
      base = Math.min(effectiveW - 2, fillX + 1);
      min  = base;
      max  = effectiveW - 1;
      target = peakX;

    } else {
      //GAUGE DOMAIN
      const fillAngle =
        gauge.startAngle + gauge.normLevel * gauge.sweepAngle;

      const angleEps = gauge.sweepAngle * 0.015;
      base = Math.min(
        gauge.startAngle + gauge.sweepAngle,
        fillAngle + angleEps
      );

      min = base;
      max = gauge.startAngle + gauge.sweepAngle;

      const pn =
        typeof gauge.peakNorm === "number"
          ? gauge.peakNorm
          : gauge.normLevel;

      target =
        gauge.startAngle + pn * gauge.sweepAngle;
    }

    // PHYSICS (same as bars)
    const IMPULSE = 0.45;
    const DAMPING = 0.15;
    const RETURN  = 0.05;

    const delta = target - peakState.pos;
    if (delta > 0) {
      peakState.vel += delta * IMPULSE;
    }

    peakState.vel += (base - peakState.pos) * RETURN;
    peakState.vel *= DAMPING;
    peakState.pos += peakState.vel;

    const p = Math.max(min, Math.min(max, peakState.pos));

    // DRAW
    ctx.save();
    ctx.fillStyle = ACTIVE_THEME.colors.peak;

    if (!gauge) {
      // BAR DRAW 
      ctx.fillRect(Math.round(p), y, 2, height);

    } else {
      // GAUGE DRAW (DOT INSIDE RING)
      const rMid =
        gauge.r - gauge.strokeW * 0.1;

      const dotR =
        Math.max(3, gauge.strokeW * 0.55);

      const x = gauge.cx + Math.cos(p) * rMid;
      const yDot = gauge.cy + Math.sin(p) * rMid;

      ctx.beginPath();
      ctx.arc(x, yDot, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // UNIFIED BARS GRADIENT ENGINE — pixel-accurate
  function buildBarsGradient(mode, width, y = 0) {

    // 1) Theme colors
    const col  = ACTIVE_THEME.colors;
    const low  = col.low;
    const mid  = col.mid;
    const high = col.high;

    const RED_ZONE_COLOR    = "#ff0000"; // audio peak
    const YELLOW_ZONE_COLOR = "#ffd400"; // stereo quality

    // 2) Threshold selector
    let THR;

    if (mode === 2) {
      THR = 0.74;
    } else {
      THR = 0.52;
    }

    const t   = THR;
    const t1  = t - 0.001;
    const t2  = t + 0.001;

    const mid_pos  = 0.40 * t;
    const high_pos = 0.80 * t;
    const THR_px   = Math.floor(width * THR);

    // 3) Cache signature
    const hash = `${mode}|${width}|${low}|${mid}|${high}|${RED_ZONE_COLOR}|${YELLOW_ZONE_COLOR}|${THR}`;
    if (GRADIENT_CACHE.hash === hash) {
      return GRADIENT_CACHE;
    }

    // 4) Init cache
    GRADIENT_CACHE.hash   = hash;
    GRADIENT_CACHE.mode   = mode;
    GRADIENT_CACHE.width  = width;
    GRADIENT_CACHE.colors = new Array(width);
    GRADIENT_CACHE.stops  = [];
    GRADIENT_CACHE.peakThresholdX = THR_px;

    // 5) Temp canvas
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width  = width;
    tempCanvas.height = 1;

    const tctx = tempCanvas.getContext("2d");
    tctx.clearRect(0, 0, width, 1);

    // 6) Build gradient
    const grad = (() => {

      const g = tctx.createLinearGradient(0, 0, width, 0);

      // ===== AUDIO PEAK =====
      if (mode === 1) {

        g.addColorStop(0.00, low);
        g.addColorStop(mid_pos, mid);
        g.addColorStop(high_pos, high);

        g.addColorStop(Math.max(0, t1), high);
        g.addColorStop(Math.min(1, t2), RED_ZONE_COLOR);
        g.addColorStop(1.00, RED_ZONE_COLOR);
        return g;
      }

      // ===== STEREO QUALITY =====
      if (mode === 2) {

        // Reverse theme gradient up to THR
        g.addColorStop(0.00, high);
        g.addColorStop(Math.min(mid_pos, t1), mid);
        g.addColorStop(Math.min(high_pos, t1), low);

        // Yellow zone starts at THR
        g.addColorStop(Math.max(0, t1), low);
        g.addColorStop(Math.min(1, t2), YELLOW_ZONE_COLOR);
        g.addColorStop(1.00, YELLOW_ZONE_COLOR);
        return g;
      }

      // ===== NORMAL =====
      g.addColorStop(0.00, low);
      g.addColorStop(0.50, mid);
      g.addColorStop(0.80, high);
      g.addColorStop(1.00, high);
      return g;

    })();

    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, width, 1);

    // 7) Sample pixels
    const img = tctx.getImageData(0, 0, width, 1).data;
    for (let x = 0; x < width; x++) {
      const i = x * 4;
      GRADIENT_CACHE.colors[x] =
        `rgba(${img[i]},${img[i+1]},${img[i+2]},${img[i+3]/255})`;
    }

    // 8) Stops (for glow)
    GRADIENT_CACHE.stops.push({ pos: 0.00, color: low });
    GRADIENT_CACHE.stops.push({ pos: mid_pos, color: mid });
    GRADIENT_CACHE.stops.push({ pos: high_pos, color: high });

    if (mode === 1) {
      GRADIENT_CACHE.stops.push({ pos: THR, color: RED_ZONE_COLOR });
    }

    if (mode === 2) {
      GRADIENT_CACHE.stops.push({ pos: THR, color: YELLOW_ZONE_COLOR });
    }

    GRADIENT_CACHE.stops.push({
      pos: 1.00,
      color: (mode === 1 ? RED_ZONE_COLOR :
              mode === 2 ? YELLOW_ZONE_COLOR : high)
    });

    return GRADIENT_CACHE;
  }

  // COLOR INTERPOLATION
  function interpolateColor(c1, c2, t) {
      const n1 = c1.match(/[\d\.]+/g).map(Number);
      const n2 = c2.match(/[\d\.]+/g).map(Number);

      const r = Math.round(n1[0] + (n2[0] - n1[0]) * t);
      const g = Math.round(n1[1] + (n2[1] - n1[1]) * t);
      const b = Math.round(n1[2] + (n2[2] - n1[2]) * t);
      const a = (n1[3] !== undefined)
          ? (n1[3] + (n2[3] - n1[3]) * t)
          : 1;

      return `rgba(${r},${g},${b},${a})`;
  }

  // CONIC GRADIENT BUILDER
  function buildConicGaugeGradient(ctx, cx, cy, mode, startAngle, START_EPS, arcSpan) {
    const col  = ACTIVE_THEME.colors;
    const low  = col.low;
    const mid  = col.mid;
    const high = col.high;

    const RED_ZONE_COLOR    = "#ff0000";
    const YELLOW_ZONE_COLOR = "#ffd400";

    const gcache = buildBarsGradient(mode, 512);

    // THR is the “one source of truth” threshold used by bars
    const THR = (gcache && gcache.width) ? (gcache.peakThresholdX / gcache.width) : 0.74;

    const t   = THR;
    const t1  = t - 0.001;
    const t2  = t + 0.001;

    const mid_pos  = 0.40 * t;
    const high_pos = 0.80 * t;

    // Keep your rotation
    const GRADIENT_ROT = arcSpan * 0.095;
    const g = ctx.createConicGradient(startAngle + START_EPS - GRADIENT_ROT, cx, cy);

    const add = (pos, color) => {
      const p = Math.max(0, Math.min(0.999999, pos));
      g.addColorStop(p, color);
    };

    if (mode === 1) {
      // AUDIO PEAK (hard transition at THR using t1/t2)
      add(0.00, low);
      add(mid_pos, mid);
      add(high_pos, high);

      add(Math.max(0, t1), high);
      add(Math.min(1, t2), RED_ZONE_COLOR);
      add(0.999999, RED_ZONE_COLOR);

    } else if (mode === 2) {
      // STEREO QUALITY — VISUAL 100% CLAMP
      const VISUAL_YELLOW = 0.63;

      const y1 = VISUAL_YELLOW - 0.003;
      const y2 = VISUAL_YELLOW + 0.003;

      add(0.00, high);
      add(Math.min(mid_pos, y1), mid);
      add(Math.min(high_pos, y1), low);

      add(Math.max(0, y1), low);
      add(Math.min(1, y2), YELLOW_ZONE_COLOR);
      add(0.999999, YELLOW_ZONE_COLOR);

    } else {
      // NORMAL (stereo L/R)
      add(0.00, low);
      add(mid_pos, mid);
      add(high_pos, high);
      add(0.999999, high);
    }

    const seamColor =
      (mode === 2) ? high :
      (mode === 1) ? low  :
      low;

    g.addColorStop(1.0, seamColor);

    const glowColor =
      (mode === 1) ? RED_ZONE_COLOR :
      (mode === 2) ? YELLOW_ZONE_COLOR :
      high;

    return { gradient: g, glowColor };
  }

  function getPixelFillXs(width) {
    // uniform geometry cache
    const cache = GEOMETRY_CACHE.pixelfill;
    
    let xs = cache.get(width);
    if (xs) return xs;
  
    xs = new Array(width);
    for (let i = 0; i < width; i++) xs[i] = i;
  
    cache.set(width, xs);
    return xs;
  }

  // ─────────────────────────────────────────────────────
  // THEME ENGINE — FM-DX INHERITANCE + MANUAL PRESETS
  // ─────────────────────────────────────────────────────
  function getFmDxThemeTriple() {
    try {
      const themeName = safeLSGet("theme") || safeLSGet("defaultTheme") || null;
      if (!themeName) return null;
      if (typeof themes === "undefined" || !themes) return null;

      const triple = themes[themeName];
      if (!triple) return null;

      // Validate correct triple
      if (!Array.isArray(triple) || triple.length < 3) return null;

      const [main, bright, text] = triple;

      // Validate color strings (basic RGB/HSL/HEX detection)
      const isColor = (c) => typeof c === "string" &&
        (c.startsWith("rgb") || c.startsWith("hsl") || c.startsWith("#"));

      if (!isColor(main) || !isColor(bright)) {
        return null;
      }

      // text color optional but validate if exists
      if (text && !isColor(text)) {
        return [main, bright, null];
      }

      return [main, bright, text || null];
    } catch (e) {
      return null;
    }
  }

  const THEME_REGISTRY = {
    automatic: () => {
      try {
        const triple = getFmDxThemeTriple();
        if (!triple) return THEME_REGISTRY.vesper;

        const [main, mid, textColor] = triple;
        // mid stays as reference
        const midColor = mid;

        // low = darker mid (NOT grey, NOT lifted)
        const lowColor = darkenColor(midColor, 0.70);

        // high derived perceptually
        const highColor = deriveHighColor(main, midColor);
        const peak = textColor || "rgb(255,255,255)";

        return {
          name: "automatic",
          colors: {
            low: lowColor,
            mid: midColor,
            high: highColor,
            peak: peak
          }
        };
      } catch (e) {
        return THEME_REGISTRY.vesper;
      }
    },

    aurora: {
      name: "aurora",
      colors: {
        low: "hsl(333, 100%, 65%)",
        mid: "hsl(75, 91%, 66%)",
        high: "hsl(195, 100%, 50%)",
        peak: "hsl(60, 100%, 82%)"
      }
    },

    aegean: {
      name: "aegean",
      colors: {
        low: "hsl(229, 100%, 36%)",
        mid: "hsl(226, 100%, 50%)",
        high: "hsl(24, 100%, 62%)",
        peak: "hsl(48, 48%, 90%)"
      }
    },

    emerald: {
      name: "emerald",
      colors: {
        low: "hsl(128, 100%, 25%)",
        mid: "hsl(132, 100%, 50%)",
        high: "hsl(156, 100%, 50%)",
        peak: "hsl(120, 100%, 80%)"
      }
    },

    escapade: {
      name: "escapade",
      colors: {
        low: "hsl(276, 100%, 19%)",
        mid: "hsl(287, 100%, 50%)",
        high: "hsl(316, 100%, 50%)",
        peak: "hsl(288, 100%, 86%)"
      }
    },

    goldenbrown: {
      name: "goldenbrown",
      colors: {
        low: "hsl(28, 44%, 33%)",
        mid: "hsl(34, 73%, 42%)",
        high: "hsl(36, 100%, 50%)",
        peak: "hsl(41, 100%, 72%)"
      }
    },

    iceblue: {
      name: "iceblue",
      colors: {
        low: "hsl(182, 100%, 50%)",
        mid: "hsl(210, 100%, 64%)",
        high: "hsl(222, 100%, 69%)",
        peak: "hsl(187, 100%, 86%)"
      }
    },

    neonlights: {
      name: "neonlights",
      colors: {
        low: "hsl(250, 53%, 46%)",
        mid: "hsl(277, 67%, 67%)",
        high: "hsl(96, 57%, 76%)",
        peak: "hsl(38, 90%, 60%)"
      }
    },

    pastel: {
      name: "pastel",
      colors: {
        low: "hsl(332, 88%, 73%)",
        mid: "hsl(0, 67%, 93%)",
        high: "hsl(204, 90%, 80%)",
        peak: "hsl(136, 100%, 97%)"
      }
    },

    prism: {
      name: "prism",
      colors: {
        low: "hsl(212, 100%, 50%)",
        mid: "hsl(61, 95%, 71%)",
        high: "hsl(338, 100%, 50%)",
        peak: "hsl(159, 100%, 44%)"
      }
    },

    redvelvet: {
      name: "redvelvet",
      colors: {
        low: "hsl(0, 100%, 33%)",
        mid: "hsl(0, 100%, 53%)",
        high: "hsl(0, 100%, 65%)",
        peak: "hsl(0, 100%, 84%)"
      }
    },

    retrospect: {
      name: "retrospect",
      colors: {
        low: "hsl(223, 63%, 19%)",
        mid: "hsl(28, 94%, 54%)",
        high: "hsl(71, 41%, 73%)",
        peak: "hsl(0, 0%, 93%)"
      }
    },

    secretgarden: {
      name: "secretgarden",
      colors: {
        low: "hsl(262, 50%, 32%)",
        mid: "hsl(282, 100%, 61%)",
        high: "hsl(44, 91%, 54%)",
        peak: "hsl(352, 100%, 67%)"
      }
    },

    solar: {
      name: "solar",
      colors: {
        low: "hsl(40, 100%, 57%)",
        mid: "hsl(7, 97%, 38%)",
        high: "hsl(51, 90%, 51%)",
        peak: "hsl(53, 59%, 64%)"
      }
    },

    spaceship: {
      name: "spaceship",
      colors: {
        low: "hsl(228, 85%, 13%)",
        mid: "hsl(0, 100%, 43%)",
        high: "hsl(0, 100%, 61%)",
        peak: "hsl(213, 100%, 17%)"
      }
    },

    tangerine: {
      name: "tangerine",
      colors: {
        low: "hsl(0, 100%, 41%)",
        mid: "hsl(28, 100%, 50%)",
        high: "hsl(41, 100%, 48%)",
        peak: "hsl(42, 100%, 73%)"
      }
    },

    wicked: {
      name: "wicked",
      colors: {
        low: "hsl(157, 100%, 28%)",
        mid: "hsl(330, 100%, 50%)",
        high: "hsl(329, 100%, 76%)",
        peak: "hsl(134, 100%, 37%)"
      }
    },

    vesper: {
      name: "vesper",
      colors: {
        low: "hsl(28, 97.6%, 50%)",
        mid: "hsl(274, 97.6%, 50%)",
        high: "hsl(181.9, 97.6%, 50%)",
        peak: "hsl(0, 0%, 100%)"
      }
    },

    vintage: {
      name: "vintage",
      colors: {
        low: "hsl(38, 26%, 47%)",
        mid: "hsl(35, 43%, 78%)",
        high: "hsl(55, 40%, 76%)",
        peak: "hsl(69, 22%, 67%)"
      }
    }
  };

  function loadActiveTheme() {
    try {
      const storedRaw = safeLSGet(STORAGE_THEME);
      const stored = typeof storedRaw === "string" && storedRaw.trim() ? storedRaw : "automatic";

      if (stored === "automatic") {
        const auto = THEME_REGISTRY.automatic();
        if (auto && auto.colors) return auto;
      }

      if (THEME_REGISTRY[stored]) {
        return THEME_REGISTRY[stored];
      }
    } catch (e) {
      console.error("[AudioMetrix] loadActiveTheme failed:", e);
    }
    return THEME_REGISTRY.vesper;
  }

  // HARDENED AUTO-INHERIT REFRESH FOR "AUTOMATIC" THEME
  let ACTIVE_THEME = loadActiveTheme();

  try {
    new MutationObserver(() => {
      try {
        const sel = safeLSGet(STORAGE_THEME) || "automatic";
        if (sel === "automatic") {
          ACTIVE_THEME = THEME_REGISTRY.automatic();
          invalidateVisualCaches();
        }

      } catch (e) {
        console.error(
          "[AudioMetrix] theme MutationObserver callback failed:",
          e
        );
      }
    }).observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "style"]
    });
  } catch (e) {
    console.error("[AudioMetrix] theme MutationObserver init failed:", e);
  }

  // ─────────────────────────────────────────
  // CONFIG + STATE
  // ─────────────────────────────────────────
  const CONFIG = {
    audio: {
      minThreshold: 0.0015,
      riseRate: 1.2,
      amplification: 1.0,
      bassReduction: -2,
      highPassCutoff: 1200,
      lowPassCutoff: 2000,
      attackSpeed: 0.45,
      releaseSpeed: 0.65,
      peakHoldMs: 1000,
      peakDecayDbPerFrame: 0.7,
      peakMinVolumeThreshold: 0.5,
      peakFftSize: 256,
      minDb: -40,
      maxDb: +3,
      dbGain: (() => {
        const raw = safeLSGet(STORAGE_GAIN);
        const n = parseInt(raw, 10);
        if (isNaN(n)) return 0;
        return Math.min(12, Math.max(-12, n));
      })()
    },
    display: {
      glowIntensity: (() => (safeLSGet(STORAGE_GLOW_ENABLED) === "true" ? 1 : 0))(),
      barStyle: (() => {
        const raw = safeLSGet(STORAGE_BARSTYLE) || "simple";
        return VALID_STYLES.includes(raw) ? raw : "simple";
      })(),
      layoutMode: (() => {
        const raw = safeLSGet("AMX_LAYOUT_MODE") || "lr";
        return ["lr", "sa", "full"].includes(raw) ? raw : "lr";
      })(),
      renderMode: (() => {
        const raw = safeLSGet("AMX_RENDER_MODE") || "bars";
        return ["bars", "gauges", "mirrored"].includes(raw) ? raw : "bars";
      })(),
      showPeaks: (() => {
        const raw = safeLSGet(STORAGE_SHOW_PEAKS);
        if (raw === null) return false;
        return raw === "true";
      })(),
      showReadouts: (() => {
        const raw = safeLSGet(STORAGE_SHOW_READOUTS);
        if (raw === null) return false;
        return raw === "true";
      })(),
      dimensions: {
        barHeight: 20,
        spacing: 10,
        labelLeft: 5,
        canvasLeft: 25,
        borderRadius: "20px",
        minTileWidth: 335,
        tileWidthPercent: 32.9
      },
      defaultTitle: "STEREO LEVELS"
    }
  };

  const INNER_BASE_TOP = 22;
  const WRAPPER_EXTRA = 50;
  const WRAPPER_HEIGHT = CONFIG.display.dimensions.barHeight * 2 + CONFIG.display.dimensions.spacing + WRAPPER_EXTRA;

  const STATE = {
    audio: {
      context: null,
      splitter: null,
      analyserLeft: null,
      analyserRight: null,
      analyserPeak: null,
      bassFilter: null,
      highPassFilter: null,
      lowPassFilter: null,
      source: null,
      dataLeft: null,
      dataRight: null,
      dataPeak: null
    },

    audioCadence: {
      frame: 0,
      interval: 1,
      min: 1,
      max: 4,
      lastEnergy: 0
    },

    levels: {
      left: {
        smoothDb: -999,
        peakDb: -999
      },
      right: {
        smoothDb: -999,
        peakDb: -999
      },
      audio: {
        smooth: 0,
        peak: 0
      },
      stereoQuality: {
        instant: 0,
        smooth: 0
      }
    },

    dom: {
      container: null,
      title: null,
      contentWrapper: null,
      canvas: null,
      ctx: null,
      labels: {
        left: null,
        right: null
      },
      scales: {
        left: null,
        right: null
      }
    },

    cache: {
      pillar: {
        path: null,
        W: 0,
        y: 0,
        height: 0
      }
    },

    layout: {
      width: 0,
      height: 0,
      dirty: true
    },

    fullBarsFrameSkip: 0,

    peakTimeout: {
      left: null,
      right: null,
      audio: null
    }
  };

  // ─────────────────────────────────────────
  // SETTINGS UI (ENABLE + THEME + GLOW + BAR STYLE)
  // ─────────────────────────────────────────
  function isStereoEnabled() {
    try {
      const v = safeLSGet(STORAGE_ENABLE);
      return v === null ? true : v === "true";
    } catch (e) {
      return true;
    }
  }

  function addAudioMetrixToggle() {
    const anchor = document.getElementById("imperial-units");
    if (!anchor) return;

    const wrapper = document.createElement("div");
    wrapper.className = "form-group";
    wrapper.innerHTML = `
      <div class="switch" style="display:flex; align-items:center;">
        <input type="checkbox" id="amx-toggle">
        <label for="amx-toggle"></label>
        <span class="text-smaller text-uppercase text-bold color-4 p-10"
              style="white-space:nowrap; margin-left:0;">
          ENABLE AUDIO METRIX
        </span>
      </div>
    `;

    anchor.closest(".form-group").insertAdjacentElement("afterend", wrapper);

    const cb = document.getElementById("amx-toggle");
    cb.checked = isStereoEnabled();

    cb.addEventListener("change", () => {
      safeLSSet(STORAGE_ENABLE, cb.checked ? "true" : "false");
      window.location.reload();
    });
  }

  // STEREO SOFT MESSAGE CSS
  if (!document.getElementById("amx-soft-overlay-css")) {
    const css = document.createElement("style");
    css.id = "amx-soft-overlay-css";
    css.textContent = `
      .amx-soft-overlay {
        position: fixed;
        inset: 0;
        z-index: 200000;
        display: flex;
        align-items: center;
        justify-content: center;

        background: transparent;

        opacity: 1;
        transition: opacity 0.18s ease;
      }

      .amx-soft-overlay.closing {
        opacity: 0;
      }

      .amx-soft-box {
        padding: 18px 22px;
        max-width: 320px;
        text-align: center;

        /* 🧊 glass look */
        background: rgba(18, 20, 22, 0.72);
        backdrop-filter: blur(18px) saturate(140%);
        -webkit-backdrop-filter: blur(18px) saturate(140%);

        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.15);

        box-shadow:
          0 12px 40px rgba(0,0,0,0.45),
          inset 0 0 0 1px rgba(255,255,255,0.04);

        color: var(--color-text);
        font-family: inherit;
      }

      .amx-soft-icon {
        font-size: 26px;
        margin-bottom: 10px;
        color: var(--color-5);
      }

      .amx-soft-text {
        font-size: 14px;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(css);
  }

  function showAMXSoftMessage(text, icon = "fa-circle-info") {
    // Remove any existing soft message (clean)
    const existing = document.querySelector(".amx-soft-overlay");
    if (existing) {
      existing.classList.add("closing");
      setTimeout(() => existing.remove(), 180);
    }

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "amx-soft-overlay";

    const box = document.createElement("div");
    box.className = "amx-soft-box";

    box.innerHTML = `
      <i class="fa-solid ${icon} amx-soft-icon"></i>
      <div class="amx-soft-text">${text}</div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Close logic
    const close = () => {
      overlay.classList.add("closing");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => overlay.remove(), 180);
    };

    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") close();
    };

    // click / touch outside box closes
    overlay.addEventListener("mousedown", close);
    overlay.addEventListener("touchstart", close);

    // prevent closing when clicking inside box
    box.addEventListener("mousedown", e => e.stopPropagation());
    box.addEventListener("touchstart", e => e.stopPropagation());

    document.addEventListener("keydown", onKey);
  }

  function ensureAMXSettingsLayer() {
    let layer = document.getElementById("amx-settings-layer");
    if (layer) return layer;
  
    layer = document.createElement("div");
    layer.id = "amx-settings-layer";
  
    // Base overlay (does NOT block the page)
    layer.style.position = "fixed";
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.width = "100vw";
    layer.style.height = "100vh";
    layer.style.zIndex = "99999";
    layer.style.pointerEvents = "none";
  
    // IMPORTANT → prevent external scrolling completely
    layer.style.overflow = "hidden";
  
    // Optional safety for mobile browsers
    layer.style.touchAction = "none";
    layer.style.webkitTapHighlightColor = "transparent";
  
    document.body.appendChild(layer);
  
    // Mobile touch guard: allow interaction inside floating panel
    if (!layer._touchGuardInstalled) {
      layer._touchGuardInstalled = true;
  
      document.addEventListener(
        "touchmove",
        function (e) {
          const panel = e.target.closest("#amx-floating-panel");
          if (panel) {
            e.stopPropagation();
          }
        },
        { passive: false }
      );
    }
  
    return layer;
  }

  function createAMXFloatingPanel() {
    const panel = document.createElement("div");
    panel.id = "amx-floating-panel";
  
    // REAL floating overlay
    panel.style.position = "fixed";
    panel.style.zIndex = "100000";
    panel.style.display = "none";
    panel.style.pointerEvents = "auto";
  
    // Touch & selection safety (mobile + desktop)
    panel.style.touchAction = "manipulation";
    panel.style.userSelect = "none";
    panel.style.webkitUserSelect = "none";
  
    // Sizing
    panel.style.width = "280px";
  
    // padding and appearance
    panel.style.padding = "12px";
    panel.style.borderRadius = "14px";
  
    panel.style.background = "rgba(18, 20, 22, 0.72)";
    panel.style.backdropFilter = "blur(18px) saturate(140%)";
    panel.style.webkitBackdropFilter = "blur(18px) saturate(140%)";
  
    panel.style.border = "1px solid rgba(255,255,255,0.15)";
    panel.style.boxShadow = `
      0 8px 32px rgba(0,0,0,0.45),
      inset 0 0 0 1px rgba(255,255,255,0.04)
    `;

    // Fallback for non blur browsers
    if (
      typeof CSS !== "undefined" &&
      !CSS.supports("backdrop-filter", "blur(2px)")
    ) {
      panel.style.background = "rgba(18, 20, 22, 0.92)";
    }
  
    // Attach to overlay layer
    const layer = ensureAMXSettingsLayer();
    layer.appendChild(panel);
  
    return panel;
  }

  function createAMXSettingsButton(container, panel) {
    const btn = document.createElement("div");

    // FontAwesome gear
    btn.innerHTML = `<i class="fa-solid fa-gear"></i>`;

    // positioning
    btn.style.position = "absolute";
    btn.style.top = "3px";
    btn.style.right = "3px";
    btn.style.left = "auto";
    btn.style.zIndex = "1000";

    // size & layout
    btn.style.width = "28px";
    btn.style.height = "28px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.borderRadius = "50%";

    // theme colors
    btn.style.background = "var(--color-1)";
    btn.style.border = "2px solid var(--color-4)";
    btn.style.color = "var(--color-4)";

    // behavior
    btn.style.cursor = "pointer";
    btn.style.userSelect = "none";

    // subtle depth
    btn.style.boxShadow =
      "0 0 4px rgba(0,0,0,0.45), inset 0 0 4px rgba(255,255,255,0.08)";

    // transitions (opacity + scale only)
    btn.style.opacity = "0";
    btn.style.transform = "scale(0.85)";
    btn.style.pointerEvents = "none";
    btn.style.transition =
      "opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease";

    // hover polish (when visible)
    btn.onmouseenter = () => {
      btn.style.background = "var(--color-2)";
      btn.style.boxShadow =
        "0 0 6px var(--color-4), inset 0 0 6px rgba(255,255,255,0.12)";
      btn.style.transform = "scale(1.05)";
    };

    btn.onmouseleave = () => {
      btn.style.background = "var(--color-1)";
      btn.style.boxShadow =
        "0 0 4px rgba(0,0,0,0.45), inset 0 0 4px rgba(255,255,255,0.08)";
      btn.style.transform = "scale(1)";
    };

    // toggle panel
    btn.onclick = (e) => {
      e.stopPropagation(); // important on mobile

      const willOpen = panel.style.display === "none";
      panel.style.display = willOpen ? "block" : "none";

      if (willOpen) {
        positionAMXFloatingPanel(panel, container);
      }
    };

    // attach button
    container.appendChild(btn);

    // SHOW / HIDE logic (hover + touch)
    // Desktop: show on hover
    container.addEventListener("mouseenter", () => {
      btn.style.opacity = "1";
      btn.style.transform = "scale(1)";
      btn.style.pointerEvents = "auto";
    });

    container.addEventListener("mouseleave", () => {
      btn.style.opacity = "0";
      btn.style.transform = "scale(0.85)";
      btn.style.pointerEvents = "none";
    });

    // Mobile: show on touch
    container.addEventListener("touchstart", () => {
      btn.style.opacity = "1";
      btn.style.transform = "scale(1)";
      btn.style.pointerEvents = "auto";
    });

    // Optional: hide again when touching elsewhere
    document.addEventListener("touchstart", (e) => {
      if (!container.contains(e.target)) {
        btn.style.opacity = "0";
        btn.style.transform = "scale(0.85)";
        btn.style.pointerEvents = "none";
      }
    });
  }

  function positionAMXFloatingPanel(panel, container) {
    if (!panel || !container) return;
  
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
  
    const panelW = parseInt(panel.style.width, 10) || 320;
    const tileRect = container.getBoundingClientRect();
  
    const ps = document.getElementById("ps-container");
    const psRect = ps ? ps.getBoundingClientRect() : null;
    const anchorTop = psRect ? Math.round(psRect.top) : 12;
  
    // reset
    panel.style.top = "auto";
    panel.style.left = "auto";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  
    const isPortrait = vh > vw || vw < 520;
  
    if (isPortrait) {
      const top = Math.round(tileRect.bottom + margin);
      const left = Math.max(margin, Math.round((vw - panelW) / 2));
  
      panel.style.top = top + "px";
      panel.style.left = left + "px";
      panel.style.maxHeight = Math.round(vh * 0.7) + "px";
      panel.style.overflowY = "hidden";
    } else {
      let left = Math.round(tileRect.left - panelW - margin);
      if (left < margin) left = margin;
  
      panel.style.top = anchorTop + "px";
      panel.style.left = left + "px";
      panel.style.maxHeight = Math.round(vh - anchorTop - margin) + "px";
      panel.style.overflowY = "hidden";
    }

    // UPDATE INNER CONTENT HEIGHT (stable scroll)
    if (panel._amxContentArea) {
      const topBarHeight = 36;
      const paddingVertical = 24;
      const panelMax = parseInt(panel.style.maxHeight, 10);
  
      const contentMax = panelMax - topBarHeight - paddingVertical;
      panel._amxContentArea.style.maxHeight = contentMax + "px";
    }
  }

  function bindFloatingPanelAutoPosition(panel, container) {
    if (!panel || panel._autoPositionBound) return;
    panel._autoPositionBound = true;

    let ticking = false;

    function requestReposition() {
      if (panel.style.display === "none") return;

      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          positionAMXFloatingPanel(panel, container);
          ticking = false;
        });
      }
    }

    window.addEventListener("scroll", requestReposition, { passive: true });
    window.addEventListener("resize", requestReposition);
    window.addEventListener("orientationchange", requestReposition);
  }

  function buildAMXFloatingSettings(panel) {
    try {
      // Clean panel content
      panel.innerHTML = "";

      // FIXED TOP BAR (Title + Close X)
      const topBar = document.createElement("div");
  
      topBar.style.width = "100%";
      topBar.style.height = "30px";
      topBar.style.display = "flex";
      topBar.style.alignItems = "center";
      topBar.style.justifyContent = "space-between";
      topBar.style.boxSizing = "border-box";
      topBar.style.padding = "0 8px 0 10px";
      topBar.style.marginBottom = "6px";
  
      // No dark overlay – uses panel background
      topBar.style.background = "transparent";
  
      const title = document.createElement("div");
      title.textContent = "AUDIOMETRIX SETTINGS";
      title.style.fontSize = "18px";
      title.style.fontWeight = "700";
      title.style.color = "var(--color-4)";
      title.style.textShadow = "0 0 4px rgba(0,0,0,0.55)";
  
      const closeBtn = document.createElement("div");
      closeBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
      closeBtn.style.width = "28px";
      closeBtn.style.height = "28px";
      closeBtn.style.display = "flex";
      closeBtn.style.alignItems = "center";
      closeBtn.style.justifyContent = "center";
      closeBtn.style.borderRadius = "50%";
      closeBtn.style.cursor = "pointer";
  
      closeBtn.style.background = "var(--color-1)";
      closeBtn.style.border = "2px solid var(--color-4)";
      closeBtn.style.color = "var(--color-4)";
      closeBtn.style.boxShadow =
        "0 0 4px rgba(0,0,0,0.45), inset 0 0 4px rgba(255,255,255,0.08)";
  
      closeBtn.onmouseenter = () => {
        closeBtn.style.background = "var(--color-2)";
        closeBtn.style.boxShadow =
          "0 0 6px var(--color-4), inset 0 0 6px rgba(255,255,255,0.12)";
      };
  
      closeBtn.onmouseleave = () => {
        closeBtn.style.background = "var(--color-1)";
        closeBtn.style.boxShadow =
          "0 0 4px rgba(0,0,0,0.45), inset 0 0 4px rgba(255,255,255,0.08)";
      };
  
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        panel.style.display = "none";
      };
  
      topBar.appendChild(title);
      topBar.appendChild(closeBtn);
      panel.appendChild(topBar);

      // SCROLLABLE CONTENT AREA
      const content = document.createElement("div");
      content.id = "amx-panel-content";
      
      content.style.width = "100%";
      content.style.boxSizing = "border-box";
      content.style.padding = "4px 0 0 0";
      
      // ONLY inner scrolling allowed
      content.style.overflowY = "auto";
      
      // Temporary height, will be updated by positionAMXFloatingPanel()
      content.style.maxHeight = "200px";
      
      // Attach content block
      panel.appendChild(content);
      
      // Store reference for dynamic resizing
      panel._amxContentArea = content;

    // SHARED SLIDER CSS (inject ONCE)
    if (!document.getElementById("amx-sliders-css")) {
      const css = document.createElement("style");
      css.id = "amx-sliders-css";
      css.textContent = `
        #peak-hold-slider,
        #attack-slider,
        #release-slider,
        #gain-slider {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 22px !important;
          border-radius: 22px !important;
          background: var(--color-1) !important;
          border: 2px solid var(--color-3) !important;
          cursor: pointer !important;
          outline: none !important;
        }

        #peak-hold-slider,
        #attack-slider,
        #release-slider,
        #gain-slider {
          width: 40% !important;
          min-width: 115px !important;
        }

        #peak-hold-slider::-webkit-slider-thumb,
        #attack-slider::-webkit-slider-thumb,
        #release-slider::-webkit-slider-thumb,
        #gain-slider::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          width: 20px !important;
          height: 20px !important;
          border-radius: 50% !important;
          background: var(--color-5) !important;
          cursor: pointer !important;
        }

        #peak-hold-slider::-moz-range-thumb,
        #attack-slider::-moz-range-thumb,
        #release-slider::-moz-range-thumb,
        #gain-slider::-moz-range-thumb {
          width: 20px !important;
          height: 20px !important;
          border-radius: 50% !important;
          background: var(--color-5) !important;
          cursor: pointer !important;
        }

        #peak-hold-slider::-webkit-slider-runnable-track,
        #attack-slider::-webkit-slider-runnable-track,
        #release-slider::-webkit-slider-runnable-track,
        #gain-slider::-webkit-slider-runnable-track,
        #peak-hold-slider::-moz-range-track,
        #attack-slider::-moz-range-track,
        #release-slider::-moz-range-track,
        #gain-slider::-moz-range-track {
          height: 22px !important;
          border-radius: 22px !important;
          background: var(--color-1) !important;
          border: 2px solid var(--color-3) !important;
        }

        .audio-row {
          display: flex;
          align-items: center;
          gap: 4px !important;
          margin-top: 4px;
        }

        .audio-row span.text-small:first-child {
          min-width: 80px !important;
          text-align: left;
        }

        .audio-row span.text-small:last-child {
          min-width: 35px !important;
          text-align: right;
        }
    /* -------------------------------
         BAR STYLE DISABLED (gauges)
      -------------------------------- */
      .form-group.is-disabled {
        opacity: 0.35;
        filter: grayscale(1);
      }

      .form-group.is-disabled .dropdown {
        pointer-events: none;
      }
      `;
      document.head.appendChild(css);
    }

      // THEME SELECTOR
      const themeDiv = document.createElement("div");
      themeDiv.className = "form-group";
      themeDiv.innerHTML = `
        <label class="form-label"><i class="fa-solid m-right-10"></i>AUDIO METRIX THEME</label>
        <div class="dropdown">
          <input type="text" id="amx-theme-input" class="form-control" readonly>
          <div id="amx-theme-options" class="options">
            <div class="option" data-value="automatic">Automatic</div>
            <div class="option" data-value="aegean">Aegean</div>
            <div class="option" data-value="aurora">Aurora</div>
            <div class="option" data-value="emerald">Emerald</div>
            <div class="option" data-value="escapade">Escapade</div>
            <div class="option" data-value="goldenbrown">Golden Brown</div>
            <div class="option" data-value="iceblue">Ice Blue</div>
            <div class="option" data-value="neonlights">Neon Lights</div>
            <div class="option" data-value="pastel">Pastel</div>
            <div class="option" data-value="prism">Prism</div>
            <div class="option" data-value="redvelvet">Red Velvet</div>
            <div class="option" data-value="retrospect">Retrospect</div>
            <div class="option" data-value="secretgarden">Secret Garden</div>
            <div class="option" data-value="solar">Solar</div>
            <div class="option" data-value="spaceship">Spaceship</div>
            <div class="option" data-value="tangerine">Tangerine</div>
            <div class="option" data-value="wicked">Wicked</div>
            <div class="option" data-value="vesper">Vesper</div>
            <div class="option" data-value="vintage">Vintage</div>
          </div>
        </div>
      `;
      content.appendChild(themeDiv);

      const themeInput = document.getElementById("amx-theme-input");
      const savedThemeRaw = safeLSGet(STORAGE_THEME) || "automatic";
      const savedTheme = VALID_THEMES.includes(savedThemeRaw) ? savedThemeRaw : "automatic";
      themeInput.value = savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);

      themeInput.onclick = () => {
        const opts = document.getElementById("amx-theme-options");
        if (opts) opts.classList.toggle("opened");
      };

      document.querySelectorAll("#amx-theme-options .option").forEach((opt) => {
        opt.onclick = () => {
          const val = opt.dataset.value;
          if (!VALID_THEMES.includes(val)) return;

          themeInput.value = opt.textContent;
          safeLSSet(STORAGE_THEME, val);
          ACTIVE_THEME = val === "automatic" ? THEME_REGISTRY.automatic() : THEME_REGISTRY[val];
          invalidateVisualCaches();
          requestRender();

          const opts = document.getElementById("amx-theme-options");
          if (opts) opts.classList.remove("opened");
        };
      });

      // BAR STYLE AVAILABILITY (renderMode dependent)
      function greyoutBarStyles() {
        return CONFIG.display.renderMode === "gauges";
      }

      // BAR STYLE SELECTOR
      const styleDiv = document.createElement("div");
      styleDiv.className = "form-group";
      if (greyoutBarStyles()) {
        styleDiv.classList.add("is-disabled");
      }
      styleDiv.innerHTML = `
        <label class="form-label"><i class="fa-solid m-right-10"></i>AUDIO METRIX BARS STYLE</label>
        <div class="dropdown">
          <input type="text" id="amx-barstyle-input" class="form-control" readonly>
          <div id="amx-barstyle-options" class="options">
            <div class="option" data-value="simple">Simple Gradient</div>
            <div class="option" data-value="segment">Segmented</div>
            <div class="option" data-value="circledots">Circle Dots</div>
            <div class="option" data-value="matrixdots">Matrix Dots</div>
            <div class="option" data-value="pillars">Pillars</div>
            <div class="option" data-value="beveled3d">Beveled 3D</div>
            <div class="option" data-value="glasstube">Glass Tube</div>
          </div>
        </div>
      `;
      content.appendChild(styleDiv);

      const styleInput = document.getElementById("amx-barstyle-input");
      const savedStyle = CONFIG.display.barStyle;
      styleInput.value = {
        simple: "Simple Gradient",
        segment: "Segmented",
        circledots: "Circle Dots",
        matrixdots: "Matrix Dots",
        pillars: "Pillars",
        beveled3d: "Beveled 3D",
        glasstube: "Glass Tube"
      }[savedStyle] || "Simple Gradient";

      styleInput.onclick = () => {
        const opts = document.getElementById("amx-barstyle-options");
        if (opts) opts.classList.toggle("opened");
      };

      document.querySelectorAll("#amx-barstyle-options .option").forEach((opt) => {
        opt.onclick = () => {
          const val = opt.dataset.value;
          if (!VALID_STYLES.includes(val)) return;

          CONFIG.display.barStyle = val;
          safeLSSet(STORAGE_BARSTYLE, val);
          styleInput.value = opt.textContent;
          invalidateVisualCaches();
          updateMirroredCanvasHeight();
          applyVisualState();
          requestRender();

          const opts = document.getElementById("amx-barstyle-options");
          if (opts) opts.classList.remove("opened");
        };
      });

      // LAYOUT MODE SELECTOR
      const layoutDiv = document.createElement("div");
      layoutDiv.className = "form-group";
      layoutDiv.innerHTML = `
        <label class="form-label"><i class="fa-solid m-right-10"></i>LAYOUT MODE</label>
        <div class="dropdown">
          <input type="text" id="amx-layout-input" class="form-control" readonly>
          <div id="amx-layout-options" class="options">
            <div class="option" data-value="lr">Stereo Bars</div>
            <div class="option" data-value="sa">Stereo Quality & Audio Peak Bars</div>
            <div class="option" data-value="full">Full Mode (Both)</div>
          </div>
        </div>
      `;
      content.appendChild(layoutDiv);

      const layoutInput = document.getElementById("amx-layout-input");
      const savedLayout = CONFIG.display.layoutMode;
      layoutInput.value =
        savedLayout === "lr" ? "Stereo Bars" :
        savedLayout === "sa" ? "Stereo Quality & Audio Peak Bars" :
        "Full Mode (Both)";

      layoutInput.onclick = () => {
        const opts = document.getElementById("amx-layout-options");
        if (opts) opts.classList.toggle("opened");
      };

      document.querySelectorAll("#amx-layout-options .option").forEach((opt) => {
        opt.onclick = () => {
          const val = opt.dataset.value;
          layoutInput.value = opt.textContent;
          CONFIG.display.layoutMode = val;
          safeLSSet("AMX_LAYOUT_MODE", val);

          if (CONFIG.display.renderMode === "mirrored" && val !== "lr") {
            CONFIG.display.renderMode = "bars";
            safeLSSet("AMX_RENDER_MODE", "bars");
            const renderInput = document.getElementById("amx-render-input");
            if (renderInput) renderInput.value = "Bars";
          }

          invalidateVisualCaches();
          updateMirroredCanvasHeight();
          applyVisualState();
          renderMeters();
          requestRender();

          const opts = document.getElementById("amx-layout-options");
          if (opts) opts.classList.remove("opened");
        };
      });

      // RENDER STYLE SELECTOR
      const renderDiv = document.createElement("div");
      renderDiv.className = "form-group";
      renderDiv.innerHTML = `
        <label class="form-label"><i class="fa-solid m-right-10"></i>RENDER STYLE</label>
        <div class="dropdown">
          <input type="text" id="amx-render-input" class="form-control" readonly>
          <div id="amx-render-options" class="options">
            <div class="option" data-value="bars">Bars</div>
            <div class="option" data-value="mirrored">Mirrored</div>
            <div class="option" data-value="gauges">Gauges</div>
          </div>
        </div>
      `;
      content.appendChild(renderDiv);

      const renderInput = document.getElementById("amx-render-input");
      const savedRender = CONFIG.display.renderMode;
      renderInput.value =
        savedRender === "bars" ? "Bars" :
        savedRender === "gauges" ? "Gauges" :
        "Mirrored";

      renderInput.onclick = () => {
        const opts = document.getElementById("amx-render-options");
        if (opts) opts.classList.toggle("opened");
      };

      document.querySelectorAll("#amx-render-options .option").forEach((opt) => {
        opt.onclick = () => {
          const val = opt.dataset.value;

          if (val === "mirrored" && CONFIG.display.layoutMode !== "lr") {
            showAMXSoftMessage(
              "Mirrored mode is only available when Layout Mode is set to Stereo Bars.",
              "fa-triangle-exclamation"
            );
            return;
          }

          CONFIG.display.renderMode = val;
          safeLSSet("AMX_RENDER_MODE", val);
          styleDiv.classList.toggle("is-disabled", greyoutBarStyles());
          renderInput.value = opt.textContent;
          invalidateVisualCaches();
          updateMirroredCanvasHeight();
          applyVisualState();
          renderMeters();
          requestRender();

          const opts = document.getElementById("amx-render-options");
          if (opts) opts.classList.remove("opened");
        };
      });

      // GLOW ENABLE / DISABLE
      {
        const wrapper = document.createElement("div");
        wrapper.className = "form-group";

        wrapper.innerHTML = `
          <div style="display:flex; align-items:center;">
            <label class="form-label">
              <i class="fa-solid m-right-10"></i>ENABLE GLOW ON BARS
            </label>
            <div class="switch"
                 style="display:flex;
                        transform:scale(0.6);
                        transform-origin:left center;
                        margin-left:28px;">
              <input type="checkbox" id="glow-toggle">
              <label for="glow-toggle"></label>
            </div>
          </div>
        `;

        content.appendChild(wrapper);

        const cb = wrapper.querySelector("#glow-toggle");
        cb.checked = (safeLSGet(STORAGE_GLOW_ENABLED) === "true");

        // fixed glow
        CONFIG.display.glowIntensity = cb.checked ? 1 : 0;

        cb.addEventListener("change", () => {
          safeLSSet(STORAGE_GLOW_ENABLED, cb.checked ? "true" : "false");
          CONFIG.display.glowIntensity = cb.checked ? 1 : 0;

          invalidateVisualCaches();
          requestRender();
        });
      }

      // SHOW PEAK INDICATOR
      {
        const wrapper = document.createElement("div");
        wrapper.className = "form-group";

        wrapper.innerHTML = `
          <div style="display:flex; align-items:center;">
            <label class="form-label">
              <i class="fa-solid m-right-10"></i>SHOW PEAK INDICATOR
            </label>
            <div class="switch"
                 style="display:flex; align-items:right;
                        transform:scale(0.6);
                        transform-origin:left center;
                        margin-left:30px;">
              <input type="checkbox" id="peak-toggle">
              <label for="peak-toggle"></label>
            </div>
          </div>
        `;

        content.appendChild(wrapper);

        const cb = wrapper.querySelector("#peak-toggle");
        cb.checked = CONFIG.display.showPeaks;

        cb.addEventListener("change", () => {
          CONFIG.display.showPeaks = cb.checked;
          localStorage.setItem(
            STORAGE_SHOW_PEAKS,
            cb.checked ? "true" : "false"
          );
        });
      }

        // SHOW REAL-TIME VALUES
        const readoutsDiv = document.createElement("div");
        readoutsDiv.className = "form-group";
        readoutsDiv.innerHTML = `
          <div style="display:flex; align-items:center;">
            <label class="form-label">
              <i class="fa-solid m-right-10"></i>SHOW REAL TIME VALUES
            </label>
            <div class="switch"
                 style="display:flex; align-items:right;
                        transform:scale(0.6);
                        transform-origin:left center;
                        margin-left:19px;">
              <input type="checkbox" id="amx-show-readouts">
              <label for="amx-show-readouts"></label>
            </div>
          </div>
        `;
        content.appendChild(readoutsDiv);
        
        const readoutsCb = document.getElementById("amx-show-readouts");
        readoutsCb.checked = CONFIG.display.showReadouts;
        
        readoutsCb.addEventListener("change", () => {
          CONFIG.display.showReadouts = readoutsCb.checked;
          safeLSSet(
            STORAGE_SHOW_READOUTS,
            readoutsCb.checked ? "true" : "false"
          );
          applyVisualState();
        });

      // AUDIO RESPONSE PANEL
          const audioDiv = document.createElement("div");
          audioDiv.className = "form-group";
          audioDiv.innerHTML = `
            <label class="form-label"><i class="fa-solid m-right-10"></i>AUDIO RESPONSE</label>

            <div class="audio-row">
              <span class="text-small">Peak hold (ms)</span>
              <input id="peak-hold-slider" type="range" min="50" max="2000" step="50" />
              <span id="peak-hold-value" class="text-small"></span>
            </div>

            <div class="audio-row">
              <span class="text-small">Attack speed</span>
              <input id="attack-slider" type="range" min="0.05" max="1.00" step="0.05" />
              <span id="attack-value" class="text-small"></span>
            </div>

            <div class="audio-row">
              <span class="text-small">Release speed</span>
              <input id="release-slider" type="range" min="0.05" max="1.00" step="0.05" />
              <span id="release-value" class="text-small"></span>
            </div>

            <div class="audio-row">
              <span class="text-small">Gain (dB)</span>
              <input id="gain-slider" type="range" min="-12" max="12" step="1" />
              <span id="gain-value" class="text-small"></span>
            </div>
          `;
          content.appendChild(audioDiv);

      // Peak hold
      const peakHoldSlider = document.getElementById("peak-hold-slider");
      const peakHoldValue  = document.getElementById("peak-hold-value");
      peakHoldSlider.value = CONFIG.audio.peakHoldMs;
      peakHoldValue.textContent = CONFIG.audio.peakHoldMs;
      peakHoldSlider.oninput = () => {
        const v = parseInt(peakHoldSlider.value, 10);
        peakHoldValue.textContent = v;
        CONFIG.audio.peakHoldMs = v;
      };

      // Attack
      const attackSlider = document.getElementById("attack-slider");
      const attackValue  = document.getElementById("attack-value");
      attackSlider.value = CONFIG.audio.attackSpeed;
      attackValue.textContent = Number(CONFIG.audio.attackSpeed).toFixed(2);
      attackSlider.oninput = () => {
        const v = parseFloat(attackSlider.value);
        attackValue.textContent = v.toFixed(2);
        CONFIG.audio.attackSpeed = v;
      };

      // Release
      const releaseSlider = document.getElementById("release-slider");
      const releaseValue  = document.getElementById("release-value");
      releaseSlider.value = CONFIG.audio.releaseSpeed;
      releaseValue.textContent = Number(CONFIG.audio.releaseSpeed).toFixed(2);
      releaseSlider.oninput = () => {
        const v = parseFloat(releaseSlider.value);
        releaseValue.textContent = v.toFixed(2);
        CONFIG.audio.releaseSpeed = v;
      };

      // Gain
      const gainSlider = document.getElementById("gain-slider");
      const gainValue  = document.getElementById("gain-value");
      gainSlider.value = CONFIG.audio.dbGain;
      gainValue.textContent = CONFIG.audio.dbGain;
      gainSlider.oninput = () => {
        const v = parseInt(gainSlider.value, 10);
        const nv = isNaN(v) ? 0 : Math.min(12, Math.max(-12, v));
        CONFIG.audio.dbGain = nv;
        gainValue.textContent = nv;
        safeLSSet(STORAGE_GAIN, String(nv));
      };

    } catch (e) {console.error("[AudioMetrix Floating Settings]", e);}
  }

  // ─────────────────────────────────────────────────────
  // PART 2 — ADVANCED RENDER ENGINE (ALL BAR STYLES + GLOW)
  // ─────────────────────────────────────────────────────
  function setCanvasActive(type) {
    const cn = STATE.dom.canvasNormal;
    const cm = STATE.dom.canvasMirror;
    const cg = STATE.dom.canvasGauges;

    // HIDE ALL CANVASES FIRST
    if (cn) {
      cn.style.display = "none";
      cn.style.visibility = "hidden";
      cn.style.pointerEvents = "none";
    }

    if (cm) {
      cm.style.display = "none";
      cm.style.visibility = "hidden";
      cm.style.pointerEvents = "none";
    }

    if (cg) {
      cg.style.display = "none";
      cg.style.visibility = "hidden";
      cg.style.pointerEvents = "none";
    }

    // ACTIVATE REQUESTED CANVAS
    if (type === "mirrored") {
      if (cm) {
        cm.style.display = "block";
        cm.style.visibility = "visible";
        cm.style.pointerEvents = "auto";
        STATE.dom.canvas = cm;
        STATE.dom.ctx = cm.getContext("2d");
      }
    } else if (type === "gauges") {
      if (cg) {
        cg.style.display = "block";
        cg.style.visibility = "visible";
        cg.style.pointerEvents = "auto";
        STATE.dom.canvas = cg;
        STATE.dom.ctx = cg.getContext("2d");
      }
    } else {
      // NORMAL (default)
      if (cn) {
        cn.style.display = "block";
        cn.style.visibility = "visible";
        cn.style.pointerEvents = "auto";
        STATE.dom.canvas = cn;
        STATE.dom.ctx = cn.getContext("2d");
      }
    }
  }

  let READOUT_FRAME_SKIP = 25;
  let _readoutFrame = 0;
  let _lastVisualStateKey = null;

  const RENDER_GATE = {
    rafId: null,
    dirty: false
  };

  function requestRender() {
    RENDER_GATE.dirty = true;
  }

  function shouldRunAudio() {
    const c = STATE.audioCadence;
    c.frame++;
  
    if (c.frame < c.interval) return false;
  
    c.frame = 0;
    return true;
  }

  function readLayoutOnce() {
    if (!STATE.dom.contentWrapper) return;
    if (!STATE.layout.dirty) return;
  
    const rect = STATE.dom.contentWrapper.getBoundingClientRect();
    STATE.layout.width  = rect.width  || 0;
    STATE.layout.height = rect.height || 0;
    STATE.layout.dirty  = false;
  }

  function resizeCanvasIfNeeded(canvas, w, h) {
    if (!canvas) return;
  
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  
    const sw = w + "px";
    const sh = h + "px";
  
    if (canvas.style.width !== sw)  canvas.style.width  = sw;
    if (canvas.style.height !== sh) canvas.style.height = sh;
  }

  function updateMirroredCanvasHeight() {
    const cm = STATE.dom.canvasMirror;
    if (!cm) return;

    const barH = CONFIG.display.dimensions.barHeight;
    const gap = CONFIG.display.dimensions.spacing;
    let h;

    if (CONFIG.display.barStyle === "circledots") {
      h = barH * 3.2;
    } else if (CONFIG.display.barStyle === "matrixdots") {
      h = barH * 3.6;
    } else {
      h = barH * 2 + gap + 15;
    }

    cm.style.height = h + "px";
    cm.style.minHeight = h + "px";
  }

  // MAP DB → X ABSOLUTE POSITION
  function mapDbToX(db, width) {
    const min = CONFIG.audio.minDb;
    const max = CONFIG.audio.maxDb;
    if (db < min) db = min;
    if (db > max) db = max;
    return ((db - min) / (max - min)) * width;
  }

  // EFFECTIVE WIDTH
  function getEffectiveBarWidth(width) {
    if (
      CONFIG.display.layoutMode === "lr" &&
      CONFIG.display.renderMode === "mirrored"
    ) {
      return width;
    }
    return width - CONFIG.display.dimensions.canvasLeft - 5;
  }

  // CLAMPING
  function clamp(v, min, max) {
    if (typeof v !== "number" || isNaN(v)) return null;
    return Math.max(min, Math.min(max, v));
  }

  // CURRENT READOUT
  function getCurrentReadout(channel) {
    switch (channel) {
      case "L":
        return clamp(
          STATE.levels.left.smoothDb,
          CONFIG.audio.minDb,
          CONFIG.audio.maxDb
        );
  
      case "R":
        return clamp(
          STATE.levels.right.smoothDb,
          CONFIG.audio.minDb,
          CONFIG.audio.maxDb
        );
  
      case "A":
        // Audio Peak
        return clamp(
          STATE.levels.audio.smoothDb ?? STATE.levels.audio.smooth,
          CONFIG.audio.minDb,
          CONFIG.audio.maxDb
        );
  
      case "Q":
        // Stereo Quality — 0–120 %
        return clamp(
          STATE.levels.stereoQuality.smooth,
          0,
          120
        );
  
      default:
        return null;
    }
  }

  // READOUT POSITIONING
  function positionReadouts(layout, render) {
    if (!STATE.dom.readouts) return;

    // 0) GLOBAL VISIBILITY GUARD
    // (single authority: applyVisualState decides showReadouts, but this keeps safety if called elsewhere)
    if (!CONFIG.display.showReadouts) {
      Object.values(STATE.dom.readouts).forEach(el => {
        if (!el) return;
        el.style.display = "none";
        el.style.left = "";
        el.style.top = "";
        el.style.transform = "";
      });
      return;
    }
  
    const barH = CONFIG.display.dimensions.barHeight;
    const gap  = CONFIG.display.dimensions.spacing;
    const T    = "translate(-100%, -70%)";
  
    const baseY = INNER_BASE_TOP;
    const xOut  = "calc(100% - 6px)";
  
    const useMirrored = (layout === "lr" && render === "mirrored");
  
    // 1) HIDE ALL FIRST (prevents 0,0 bleed)
    Object.entries(STATE.dom.readouts).forEach(([k, el]) => {
      if (!el) return;
      el.style.display = "none";
      el.style.left = "";
      el.style.top = "";
      el.style.transform = "";
    });
  
    // helper: show + set
    function showAt(key, left, top, transform) {
      const el = STATE.dom.readouts[key];
      if (!el) return;
      el.style.display = ""; // visible
      el.style.left = left;
      el.style.top  = top;
      el.style.transform = transform || "";
    }

    // 2) MIRRORED — outside of bars (L/R only)
    if (useMirrored) {
      const y = (INNER_BASE_TOP + barH * 0.9) + "px";
      showAt("L", "6px", y, "translate(0, -70%)");
      showAt("R", "calc(100% - 6px)", y, "translate(-100%, -70%)");
      return;
    }

    // 3) GAUGES — READOUTS POSITIONING
    if (render === "gauges") {
    
      const TOP = "40%";
      const TOP_FULL = "25%";
      const T   = "translate(-50%, 0)";

      // FULL — 4 gauges
      if (layout === "full") {
        showAt("L", "17.5%", TOP_FULL, T);
        showAt("R", "40%",   TOP_FULL, T);
        showAt("Q", "62.5%", TOP_FULL, T);
        showAt("A", "85%",   TOP_FULL, T);
        return;
      }

      // SA — 2 gauges (Q / A)
      if (layout === "sa") {
        showAt("Q", "27%", TOP, T);
        showAt("A", "75%", TOP, T);
        return;
      }

      // LR — 2 gauges (L / R)
      if (layout === "lr") {
        showAt("L", "27%", TOP, T);
        showAt("R", "75%", TOP, T);
        return;
      }
    
      return;
    }

    // 4) FULL MODE — 4 bars (L/R/Q/A)
    if (layout === "full" && render === "bars") {
      const FULL_GAP = Math.round(gap * 0.35);
      const TOP_PAD  = Math.round(barH * 0.05);
      const step     = barH + FULL_GAP;
  
      ["L", "R", "Q", "A"].forEach((k, i) => {
        showAt(
          k,
          xOut,
          (TOP_PAD + step * i + barH / 2) + "px",
          T
        );
      });
      return;
    }

    // 5) SA MODE — Q / A (bars)
    if (layout === "sa" && render === "bars") {
      showAt("Q", xOut, (baseY + barH / 2) + "px", T);
      showAt("A", xOut, (baseY + barH + gap + barH / 2) + "px", T);
      return;
    }

    // 6) LR MODE — L / R (bars)
    if (layout === "lr" && render === "bars") {
      showAt("L", xOut, (baseY + barH / 2) + "px", T);
      showAt("R", xOut, (baseY + barH + gap + barH / 2) + "px", T);
      return;
    }
    // anything else: keep hidden
  }

  // GAUGES VALUES
  function getGaugeInputs() {
    const layout = CONFIG.display.layoutMode;
    const width = STATE.dom.canvas
      ? STATE.dom.canvas.width
      : 1;

    // ---------- LR MODE ----------
    if (layout === "lr") {
      const lDb = STATE.levels.left.smoothDb;
      const rDb = STATE.levels.right.smoothDb;

      const AMX_GAUGE_GAIN = 1.10; // 1.25–1.45 ρυθμιζόμενο

      return [
        {
          id: "L",
          value: Math.max(
            0,
            Math.min(
              1,
              (mapDbToX(lDb, width) / width) * AMX_GAUGE_GAIN
            )
          )
        },
        {
          id: "R",
          value: Math.max(
            0,
            Math.min(
              1,
              (mapDbToX(rDb, width) / width) * AMX_GAUGE_GAIN
            )
          )
        }
      ];
    }

    // ---------- SA MODE ----------
    if (layout === "sa") {
      const q = STATE.levels.stereoQuality.smooth; // 0..100-ish
      const a = STATE.levels.audio.smooth;          // raw

      return [
        {
          id: "Q",
          value: Math.max(0, Math.min(1, q / 100))
        },
        {
          id: "A",
          value: Math.max(0, Math.min(1, a))
        }
      ];
    }

    return [];
  }

  function computeFracAndMode(layout, i, W) {
    // Returns { mode, frac }
    // mode: 0 stereo (L/R), 1 audio peak (A), 2 stereo quality (Q)
    // frac: 0..1 over the 120% arc domain

    // LR MODE (2 gauges: L, R)
    if (layout === "lr") {
      const inputs = getGaugeInputs();
      const v = inputs[i] ? inputs[i].value : 0;

      // Stereo gauges: 0..100% mapped onto 120% arc
      const AMX_ARC_MAX = 1.00;
      return { mode: 0, frac: Math.min(AMX_ARC_MAX, v / 1.0) };
    }

    // FULL MODE (4 gauges: L, R, Q, A)
    if (layout === "full") {

      const widthRef = W || 1;

      // Defensive defaults
      const minDb = (CONFIG && CONFIG.audio && typeof CONFIG.audio.minDb === "number")
        ? CONFIG.audio.minDb
        : -75;

      const maxDb = (CONFIG && CONFIG.audio && typeof CONFIG.audio.maxDb === "number")
        ? CONFIG.audio.maxDb
        : 0;

      const range = (maxDb - minDb) || 1;

      const SIGNAL_MAX_RATIO = 0.90;
      const Q_MAX = 120;

      // -------- L (index 0) --------
      if (i === 0) {
        const v = (STATE && STATE.levels && STATE.levels.left && typeof STATE.levels.left.smoothDb === "number")
          ? STATE.levels.left.smoothDb
          : minDb;

        const xNorm = Math.max(0, Math.min(1, mapDbToX(v, widthRef) / widthRef));
        return { mode: 0, frac: xNorm };
      }

      // -------- R (index 1) --------
      if (i === 1) {
        const v = (STATE && STATE.levels && STATE.levels.right && typeof STATE.levels.right.smoothDb === "number")
          ? STATE.levels.right.smoothDb
          : minDb;

        const xNorm = Math.max(0, Math.min(1, mapDbToX(v, widthRef) / widthRef));
        return { mode: 0, frac: xNorm };
      }

      // -------- Q (index 2) --------
      if (i === 2) {
        const q = (STATE && STATE.levels && STATE.levels.stereoQuality && typeof STATE.levels.stereoQuality.smooth === "number")
          ? STATE.levels.stereoQuality.smooth
          : 0;

        const qClamped = Math.max(0, Math.min(Q_MAX, q));

        let ratio;
        if (qClamped <= 100) {
          ratio = (qClamped / 100) * SIGNAL_MAX_RATIO;
        } else {
          ratio = SIGNAL_MAX_RATIO + ((qClamped - 100) / 20) * (1 - SIGNAL_MAX_RATIO);
        }

        const qSmoothDb = minDb + ratio * range;
        const xNorm = Math.max(0, Math.min(1, mapDbToX(qSmoothDb, widthRef) / widthRef));

        return { mode: 2, frac: xNorm };
      }

      // -------- A (index 3) --------
      const aSmooth = (STATE && STATE.levels && STATE.levels.audio && typeof STATE.levels.audio.smooth === "number")
        ? STATE.levels.audio.smooth
        : 0;

      const aSmoothDb = minDb + (Math.max(0, Math.min(255, aSmooth)) / 255) * range;
      const xNorm = Math.max(0, Math.min(1, mapDbToX(aSmoothDb, widthRef) / widthRef));

      return { mode: 1, frac: xNorm };
    }

    // SA MODE (2 gauges: Q, A)
    const widthRef = W || 1;

    // Defensive defaults
    const minDb = (CONFIG && CONFIG.audio && typeof CONFIG.audio.minDb === "number")
      ? CONFIG.audio.minDb
      : -75;

    const maxDb = (CONFIG && CONFIG.audio && typeof CONFIG.audio.maxDb === "number")
      ? CONFIG.audio.maxDb
      : 0;

    const range = (maxDb - minDb) || 1;

    const SIGNAL_MAX_RATIO = 0.90;
    const Q_MAX = 120;

    // Q (left)
    if (i === 0) {
      const q = (STATE && STATE.levels && STATE.levels.stereoQuality && typeof STATE.levels.stereoQuality.smooth === "number")
        ? STATE.levels.stereoQuality.smooth
        : 0;

      const qClamped = Math.max(0, Math.min(Q_MAX, q));

      let ratio;
      if (qClamped <= 100) {
        ratio = (qClamped / 100) * SIGNAL_MAX_RATIO;
      } else {
        ratio = SIGNAL_MAX_RATIO + ((qClamped - 100) / 20) * (1 - SIGNAL_MAX_RATIO);
      }

      const qSmoothDb = minDb + ratio * range;
      const xNorm = Math.max(0, Math.min(1, mapDbToX(qSmoothDb, widthRef) / widthRef));

      return { mode: 2, frac: xNorm };
    }

    // A (right)
    const aSmooth = (STATE && STATE.levels && STATE.levels.audio && typeof STATE.levels.audio.smooth === "number")
      ? STATE.levels.audio.smooth
      : 0;

    const aSmoothDb = minDb + (Math.max(0, Math.min(255, aSmooth)) / 255) * range;
    const xNorm = Math.max(0, Math.min(1, mapDbToX(aSmoothDb, widthRef) / widthRef));

    return { mode: 1, frac: xNorm };
  }

  // BASE GRADIENT BUILDER
  function darkenColor(rgb, factor) {
    // factor
    const m = rgb.match(/\d+/g).map(Number);
    const f = Math.max(0, Math.min(1, factor));
    const r = Math.round(m[0] * (1 - f));
    const g = Math.round(m[1] * (1 - f));
    const b = Math.round(m[2] * (1 - f));
    return `rgb(${r},${g},${b})`;
  }

  // GRADIENT COLOR SAMPLER (Unified)
  function getColorAtX(x) {
      const cache = GRADIENT_CACHE;
      if (!cache.colors || cache.colors.length === 0) return "#000";
      if (x < 0) x = 0;
      if (x >= cache.width) x = cache.width - 1;
      return cache.colors[x];
  }

  // UNIFIED GRADIENT SAMPLER FOR GLOW ENGINE
  function sampleBarGradientColor(x, width) {

      const cache = GRADIENT_CACHE;

      if (!cache || !cache.colors || cache.colors.length === 0) {
          return "rgb(0,0,0)";
      }

      // clamp
      if (x < 0) x = 0;
      if (x >= cache.width) x = cache.width - 1;

      let c = cache.colors[x];

      if (!c) return "rgb(0,0,0)";

      // Accept both rgba() and rgb()
      let m = c.match(/rgba?\(([\d\.]+),\s*([\d\.]+),\s*([\d\.]+)(?:,\s*([\d\.]+))?\)/);

      if (!m) {
          // fallback: treat the color as "high" intensity
          return "rgb(200,200,200)";
      }

      let r = +m[1];
      let g = +m[2];
      let b = +m[3];

      // ADD BRIGHTNESS BOOST (critical for visible glow)
      const boost = 1.25;
      r = Math.min(255, r * boost);
      g = Math.min(255, g * boost);
      b = Math.min(255, b * boost);

      // return *opaque* RGB so glow is visible
      return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  // STEREO QUALITY GRADIENT
  function buildStereoQualityGradient(ctx, y, width) {

    const col = ACTIVE_THEME.colors;

    // Stereo Q scale: 0…120%
    const Q_MAX = 120;
    const Q_WARN_START = 100;

    // threshold position (100 / 120)
    const t = Q_WARN_START / Q_MAX;

    const t1 = t - 0.001;
    const t2 = t + 0.001;

    const g = ctx.createLinearGradient(0, y, width, y);

    // ── REVERSE THEME GRADIENT (right → left)
    g.addColorStop(0.00, col.high);
    g.addColorStop(Math.min(t * 0.60, t1), col.mid);
    g.addColorStop(Math.min(t * 0.90, t1), col.low);

    // Safe transition
    g.addColorStop(Math.max(0, t1), col.low);
    g.addColorStop(Math.min(1, t2), "#ffd400"); // yellow transition

    // Hard yellow zone (100–120)
    g.addColorStop(1.00, "#ffd400");

    return g;
  }

  // AUDIO PEAK GRADIENT
  function buildAudioPeakGradient(ctx, y, width) {
    const col = ACTIVE_THEME.colors;
    const minDb = CONFIG.audio.minDb;
    const maxDb = CONFIG.audio.maxDb;
    const range = maxDb - minDb;

    // Map threshold at 70%
    const thresholdDb = minDb + range * 0.70;
    const thresholdX  = mapDbToX(thresholdDb, width);
    const t = thresholdX / width;

    const t1 = t - 0.001;
    const t2 = t + 0.001;

    const g = ctx.createLinearGradient(0, y, width, y);

    // Theme section
    g.addColorStop(0.00, col.low);
    g.addColorStop(Math.min(t * 0.40, t1), col.mid);
    g.addColorStop(Math.min(t * 0.80, t1), col.high);

    // Safe no-collapse transition
    g.addColorStop(Math.max(0, t1), col.high);
    g.addColorStop(Math.min(1, t2), col.peak || "#ff0000");

    // Hard red zone
    g.addColorStop(1.00, "#ff0000");

    return g;
  }

  // Segmented glass background
  function drawSegmentGlassLayer(ctx, y, height, barW, segW, segGap) {
    ctx.save();

    const glass = ctx.createLinearGradient(0, y, 0, y + height);
    glass.addColorStop(0.00, "rgba(255,255,255,0.32)");
    glass.addColorStop(0.22, "rgba(255,255,255,0.16)");
    glass.addColorStop(0.48, "rgba(255,255,255,0.05)");
    glass.addColorStop(0.75, "rgba(0,0,0,0.14)");
    glass.addColorStop(1.00, "rgba(0,0,0,0.28)");

    ctx.fillStyle = glass;

    // FULL segmented bar (independent of signal)
    for (let x = 0; x < barW; x += segW + segGap) {
      ctx.fillRect(x, y, segW, height);
    }

    ctx.restore();
  }

  // PILLARS — STATIC GEOMETRY BUILDER
  function buildPillarPath(width, y, height) {
    const W = (CONFIG.display.layoutMode === "lr" && CONFIG.display.renderMode === "mirrored")
      ? width
      : (width - CONFIG.display.dimensions.canvasLeft - 5);

    const topY = y;
    const midY = y + height * 0.5;
    const bottomY = y + height;

    const p = new Path2D();
    p.moveTo(0, midY);
    p.lineTo(W, topY);
    p.lineTo(W, bottomY);
    p.closePath();

    STATE.cache.pillar.path = p;
    STATE.cache.pillar.W = W;
    STATE.cache.pillar.y = y;
    STATE.cache.pillar.height = height;
  }

  function ensurePillarPath(width, y, height) {
    const effectiveW = getEffectiveBarWidth(width);
    const cache = STATE.cache.pillar;

    if (
      cache.path &&
      cache.W === effectiveW &&
      cache.y === y &&
      cache.height === height
    ) {
      return;
    }

    const W = effectiveW;
    const topY = y;
    const midY = y + height * 0.5;
    const bottomY = y + height;

    const path = new Path2D();
    path.moveTo(0, midY);
    path.lineTo(W, topY);
    path.lineTo(W, bottomY);
    path.closePath();

    cache.path = path;
    cache.W = W;
    cache.y = y;
    cache.height = height;
  }

  // ─────────────────────────────────────────────────────────
  // STYLE RENDERERS — 7 MODES
  // ─────────────────────────────────────────────────────────

  // 1) SIMPLE — Unified Gradient + Unified Glow
  function renderSimple(ctx, levelX, peakX, y, height, width, gcache) {
  
    const effectiveW = getEffectiveBarWidth(width);
    const barW       = Math.max(0, effectiveW - 5);
    const hasSignal  = levelX > 0;
  
    if (!gcache || !gcache.colors || !gcache.colors.length) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }
  
    const minLevel = Math.min(levelX, barW);
    if (!hasSignal || minLevel <= 0) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }
  
    const h      = Math.floor(height);
    const w      = Math.min(Math.floor(minLevel), gcache.colors.length);
    const colors = gcache.colors;
    const yy     = y;

    // UNIFIED GEOMETRY CACHE
    const xs = getPixelFillXs(barW);

    // DRAW BAR — pixel accurate
    const maxX = Math.min(w, xs.length);
    for (let i = 0; i < maxX; i++) {
      const x = xs[i];
      ctx.fillStyle = colors[x];
      ctx.fillRect(x, yy, 1, h);
    }

    // SIMPLE GLOW — rim + soft fade (NO BLUR)
    if (CONFIG.display.glowIntensity > 0) {
  
      const rimExpand  = 1.5;
      const fadeExpand = 3.5;
  
      const rimAlpha  = 0.14 * CONFIG.display.glowIntensity;
      const fadeAlpha = 0.02 * CONFIG.display.glowIntensity;
  
      ctx.save();
  
      // rim
      ctx.globalAlpha = rimAlpha;
      for (let i = 0; i < maxX; i++) {
        const x = xs[i];
        ctx.fillStyle = colors[x];
        ctx.fillRect(
          x - rimExpand,
          yy - rimExpand,
          1 + rimExpand * 2,
          h + rimExpand * 2
        );
      }
  
      // soft fade
      ctx.globalAlpha = fadeAlpha;
      for (let i = 0; i < maxX; i++) {
        const x = xs[i];
        ctx.fillStyle = colors[x];
        ctx.fillRect(
          x - fadeExpand,
          yy - fadeExpand,
          1 + fadeExpand * 2,
          h + fadeExpand * 2
        );
      }
  
      ctx.restore();
    }

    // EXTERNAL PEAK
    drawExternalPeak(ctx, levelX, peakX, yy, height, effectiveW);
  }

  // 2) SEGMENTED RECTANGLES — unified gradient + unified glow
  function renderSegment(ctx, levelX, peakX, y, height, width, gcache) {
  
    const effectiveW = getEffectiveBarWidth(width);
    const barW       = Math.max(0, effectiveW - 5);
    const hasSignal  = levelX > 0;
    const segGap     = 2;
  
    if (!gcache || !gcache.colors || !gcache.colors.length) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // MIRRORED MODE (2 ROWS)
    if (
      CONFIG.display.layoutMode === "lr" &&
      CONFIG.display.renderMode === "mirrored"
    ) {
  
      const rows   = 2;
      const rowGap = 8;
      const rowH   = Math.floor((height - rowGap) / 2);
  
      const segW     = Math.max(2, Math.floor(rowH / 3.2));
      const minLevel = Math.min(levelX, barW);
  
      for (let r = 0; r < rows; r++) {
        const ry = y + r * (rowH + rowGap);
  
        // static glass layer
        drawSegmentGlassLayer(ctx, ry, rowH, barW, segW, segGap);
  
        if (hasSignal) {
  
          // cached segment geometry
          const SEG_KEY = barW + "|" + segW + "|" + segGap;
          let xs = GEOMETRY_CACHE.segment.get(SEG_KEY);
  
          if (!xs) {
            xs = [];
            for (let x = 0; x < barW; x += segW + segGap) xs.push(x);
            GEOMETRY_CACHE.segment.set(SEG_KEY, xs);
          }
  
          for (let i = 0; i < xs.length; i++) {
            const x = xs[i];
            if (x > minLevel) break;
  
            const colorIndex = Math.min(x, gcache.colors.length - 1);
            const segColor   = gcache.colors[colorIndex];
  
            // segment fill
            ctx.fillStyle = segColor;
            ctx.fillRect(x, ry, segW, rowH);
  
            // unified glow (stronger around segment)
            if (CONFIG.display.glowIntensity > 0) {
  
              const rimExpand  = 1.2;
              const fadeExpand = 3.8;
  
              const rimAlpha  = 0.22 * CONFIG.display.glowIntensity;
              const fadeAlpha = 0.07 * CONFIG.display.glowIntensity;
  
              // rim glow
              ctx.save();
              ctx.globalAlpha = rimAlpha;
              ctx.fillStyle = segColor;
              ctx.fillRect(
                x - rimExpand,
                ry - rimExpand,
                segW + rimExpand * 2,
                rowH + rimExpand * 2
              );
              ctx.restore();
  
              // soft fade
              ctx.save();
              ctx.globalAlpha = fadeAlpha;
              ctx.fillStyle = segColor;
              ctx.fillRect(
                x - fadeExpand,
                ry - fadeExpand,
                segW + fadeExpand * 2,
                rowH + fadeExpand * 2
              );
              ctx.restore();
            }
          }
        }
      }
  
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // NORMAL MODE
    const segH     = height;
    const segW     = Math.max(2, Math.floor(segH / 2.9));
    const minLevel = Math.min(levelX, barW);
  
    // static glass layer
    drawSegmentGlassLayer(ctx, y, segH, barW, segW, segGap);
  
    if (hasSignal) {
  
      // cached segment geometry
      const SEG_KEY = barW + "|" + segW + "|" + segGap;
      let xs = GEOMETRY_CACHE.segment.get(SEG_KEY);
  
      if (!xs) {
        xs = [];
        for (let x = 0; x < barW; x += segW + segGap) xs.push(x);
        GEOMETRY_CACHE.segment.set(SEG_KEY, xs);
      }
  
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        if (x > minLevel) break;
  
        const colorIndex = Math.min(x, gcache.colors.length - 1);
        const segColor   = gcache.colors[colorIndex];
  
        // segment fill
        ctx.fillStyle = segColor;
        ctx.fillRect(x, y, segW, segH);
  
        // unified glow (same profile as mirrored)
        if (CONFIG.display.glowIntensity > 0) {
  
          const rimExpand  = 1.2;
          const fadeExpand = 3.8;
  
          const rimAlpha  = 0.22 * CONFIG.display.glowIntensity;
          const fadeAlpha = 0.07 * CONFIG.display.glowIntensity;
  
          // rim glow
          ctx.save();
          ctx.globalAlpha = rimAlpha;
          ctx.fillStyle = segColor;
          ctx.fillRect(
            x - rimExpand,
            y - rimExpand,
            segW + rimExpand * 2,
            segH + rimExpand * 2
          );
          ctx.restore();
  
          // soft fade
          ctx.save();
          ctx.globalAlpha = fadeAlpha;
          ctx.fillStyle = segColor;
          ctx.fillRect(
            x - fadeExpand,
            y - fadeExpand,
            segW + fadeExpand * 2,
            segH + fadeExpand * 2
          );
          ctx.restore();
        }
      }
    }
  
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 3) CIRCLE DOTS — unified gradient + geometry cache + unified glow
  function renderCircledots(ctx, levelX, peakX, y, height, width, gcache) {
  
    if (levelX <= 0) return;
  
    const effectiveW = getEffectiveBarWidth(width);
  
    if (!gcache || !gcache.colors || !gcache.colors.length) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // MIRRORED MODE (2 rows)
    if (
      CONFIG.display.layoutMode === "lr" &&
      CONFIG.display.renderMode === "mirrored"
    ) {
  
      const padding = 2;
      const radius  = Math.max(2, (height / 4) - (padding + 3));
      const gapX    = radius * 2 + 4;
  
      const row1Y = y + height * 0.40;
      const row2Y = y + height * 0.80;
  
      const minLevel = Math.min(levelX, effectiveW);
  
      // cache geometry
      const KEY = `${effectiveW}|${radius}|${gapX}|mirrored`;
      if (!GEOMETRY_CACHE.circledots) GEOMETRY_CACHE.circledots = new Map();
      let xs = GEOMETRY_CACHE.circledots.get(KEY);
  
      if (!xs) {
        xs = [];
        for (let x = radius; x < effectiveW; x += gapX) xs.push(x);
        GEOMETRY_CACHE.circledots.set(KEY, xs);
      }
  
      for (let row = 0; row < 2; row++) {
        const cy = (row === 0 ? row1Y : row2Y);
        const offset = row === 0 ? 0 : radius;
  
        for (let i = 0; i < xs.length; i++) {
  
          const x = xs[i] + offset;
          if (x > minLevel) break;
  
          if (x + radius > effectiveW) break;
  
          const idx = Math.min(x, gcache.colors.length - 1);
          const c   = gcache.colors[idx];
  
          // DOT
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, cy, radius, 0, Math.PI * 2);
          ctx.fill();
  
          // UNIFIED GLOW
          if (CONFIG.display.glowIntensity > 0) {
  
            const rimExpand  = 3.0;
            const fadeExpand = 3.2;
  
            const rimAlpha  = 1.00 * CONFIG.display.glowIntensity;
            const fadeAlpha = 1.80 * CONFIG.display.glowIntensity;
  
            // rim
            ctx.save();
            ctx.globalAlpha = rimAlpha;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(x, cy, radius + rimExpand, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
  
            // soft fade
            ctx.save();
            ctx.globalAlpha = fadeAlpha;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(x, cy, radius + fadeExpand, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
  
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // NORMAL MODE
    const radius  = Math.max(3, Math.floor(height * 0.54));
    const gap     = 4;
    const stepX   = radius * 2 + gap;
    const cy      = y + height / 2;
  
    const minLevel = Math.min(levelX, effectiveW);
  
    const KEY = `${effectiveW}|${radius}|${stepX}|normal`;
    if (!GEOMETRY_CACHE.circledots) GEOMETRY_CACHE.circledots = new Map();
    let xs = GEOMETRY_CACHE.circledots.get(KEY);
  
    if (!xs) {
      xs = [];
      for (let x = radius; x < effectiveW; x += stepX) xs.push(x);
      GEOMETRY_CACHE.circledots.set(KEY, xs);
    }
  
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      if (x > minLevel) break;
  
      if (x + radius > effectiveW) break;
  
      const idx = Math.min(x, gcache.colors.length - 1);
      const c   = gcache.colors[idx];
  
      // DOT
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, cy, radius, 0, Math.PI * 2);
      ctx.fill();
  
      // UNIFIED GLOW
      if (CONFIG.display.glowIntensity > 0) {
  
        const rimExpand  = 1.4;
        const fadeExpand = 4.5;
  
        const rimAlpha  = 0.24 * CONFIG.display.glowIntensity;
        const fadeAlpha = 0.08 * CONFIG.display.glowIntensity;
  
        // rim
        ctx.save();
        ctx.globalAlpha = rimAlpha;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, cy, radius + rimExpand, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
  
        // soft fade
        ctx.save();
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, cy, radius + fadeExpand, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 4) MATRIX dots — unified gradient + optimized geometry + precomputed counts
  function renderMatrixdots(ctx, levelX, peakX, y, height, width, gcache) {
  
    if (levelX <= 0) return;
  
    const effectiveW  = getEffectiveBarWidth(width);
    const glow        = CONFIG.display.glowIntensity;
    const isAudioPeak = (STATE._audioPeakGradient === true);
  
    if (!gcache || !gcache.colors || !gcache.colors.length) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }
  
    const minLevel = Math.min(levelX, effectiveW);

    // MIRRORED MODE (WEDGE)
    if (
      CONFIG.display.layoutMode === "lr" &&
      CONFIG.display.renderMode === "mirrored"
    ) {
  
      const padY   = 2;
      const maxR   = Math.max(2, Math.floor((height - padY * 2) / 20));
      const radius = Math.max(2, Math.min(maxR, Math.floor(height * 0.085)));
      const stepX  = radius * 2 + 2;
      const stepY  = radius * 2 + 2;
  
      const centerY = y + height * 0.5;
  
      const KEY = `${effectiveW}|${radius}|${stepX}|mirrored_matrix`;

      // Precompute X positions
      if (!GEOMETRY_CACHE.matrixdots) GEOMETRY_CACHE.matrixdots = new Map();
      let xs = GEOMETRY_CACHE.matrixdots.get(KEY);
  
      if (!xs) {
        xs = [];
        for (let x = radius; x < effectiveW; x += stepX) xs.push(x);
        GEOMETRY_CACHE.matrixdots.set(KEY, xs);
      }

      // Precompute counts for each column (only once per KEY)
      let counts = GEOMETRY_CACHE.matrixCount.get(KEY);
      if (!counts) {
  
        const maxCountRaw = Math.floor((height - padY * 2 + stepY) / stepY);
        const maxCount =
          Math.max(2, (maxCountRaw % 2 === 0) ? maxCountRaw : maxCountRaw - 1);
  
        counts = new Array(xs.length);
        for (let i = 0; i < xs.length; i++) {
          const desired = 2 + 2 * i;
          counts[i] = Math.min(maxCount, desired);
        }
  
        GEOMETRY_CACHE.matrixCount.set(KEY, counts);
      }
  
      // Glow constants precomputed
      const doGlow = glow > 0;
      const glowAlpha = 0.38 * glow;
      const glowBlur  = 5.5;
      const glowR     = radius + 1.9;

      // DRAW
      for (let i = 0; i < xs.length; i++) {
  
        const x = xs[i];
        if (x > minLevel) break;
        if (x + radius > effectiveW) break;
  
        const gx = (isAudioPeak && x >= gcache.peakThresholdX)
          ? gcache.peakThresholdX
          : x;
  
        const idx = Math.min(gx, gcache.colors.length - 1);
        const c = gcache.colors[idx];
  
        const count = counts[i];
  
        for (let j = 0; j < count; j++) {
  
          const offset = j - (count - 1) / 2;
          const cy = centerY + offset * stepY;
  
          if (cy < y + radius + padY) continue;
          if (cy > y + height - radius - padY) continue;
  
          // dot
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, cy, radius, 0, Math.PI * 2);
          ctx.fill();
  
          if (doGlow) {
            ctx.save();
            ctx.globalAlpha = glowAlpha;
            ctx.filter = `blur(${glowBlur}px)`;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(x, cy, glowR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
  
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // NORMAL MODE (2 ROWS — ORIGINAL GEOMETRY)
    const radius = Math.max(2, Math.round(height * 0.19));
    const gapX   = radius * 2 + 2;
    
    const row1Y = y + height * 0.28;  // ORIGINAL POSITIONS
    const row2Y = y + height * 0.72;
    
    const KEY = `${effectiveW}|${radius}|${gapX}|normal_matrix`;
    
    if (!GEOMETRY_CACHE.matrixdots) GEOMETRY_CACHE.matrixdots = new Map();
    let xs2 = GEOMETRY_CACHE.matrixdots.get(KEY);
    
    if (!xs2) {
      xs2 = [];
      for (let x = radius; x < effectiveW; x += gapX) xs2.push(x);
      GEOMETRY_CACHE.matrixdots.set(KEY, xs2);
    }
    
    // Glow constants precomputed
    const doGlow2 = glow > 0;
    const glowAlpha2 = 0.38 * glow;
    const glowBlur2  = 5.5;
    const glowR2     = radius + 1.9;

    // DRAW — EXACTLY LIKE THE ORIGINAL: 2 FIXED ROWS
    for (let i = 0; i < xs2.length; i++) {
    
      const x = xs2[i];
      if (x > minLevel) break;
      if (x + radius > effectiveW) break;
    
      const gx = (isAudioPeak && x >= gcache.peakThresholdX)
        ? gcache.peakThresholdX
        : x;
    
      const idx = Math.min(gx, gcache.colors.length - 1);
      const c   = gcache.colors[idx];

      // ROW 1
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, row1Y, radius, 0, Math.PI * 2);
      ctx.fill();
    
      if (doGlow2) {
        ctx.save();
        ctx.globalAlpha = glowAlpha2;
        ctx.filter = `blur(${glowBlur2}px)`;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, row1Y, glowR2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ROW 2
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, row2Y, radius, 0, Math.PI * 2);
      ctx.fill();
    
      if (doGlow2) {
        ctx.save();
        ctx.globalAlpha = glowAlpha2;
        ctx.filter = `blur(${glowBlur2}px)`;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, row2Y, glowR2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 5) TRIANGLE PILLARS — UNIFIED GRADIENT + GLASS + CACHED GLOW
  function renderPillars(ctx, levelX, peakX, y, height, width, gcache) {
  
    const effectiveW = getEffectiveBarWidth(width);
    const hasSignal = levelX > 1;
    const fillX = hasSignal ? Math.min(levelX, effectiveW) : 0;
  
    if (!gcache || !gcache.colors || !gcache.colors.length) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }
  
    const topY = y;
    const h = Math.floor(height);
    const W = Math.floor(effectiveW);

    // TRIANGLE PATH
    const midY = topY + h * 0.5;
    const bottomY = topY + h;
  
    const path = new Path2D();
    path.moveTo(0, midY);
    path.lineTo(W, topY);
    path.lineTo(W, bottomY);
    path.closePath();

    // BASE GLASS BODY
    ctx.save();
    ctx.clip(path);
  
    ctx.fillStyle = "rgba(80,80,80,0.22)";
    ctx.fillRect(0, topY, W, h);
  
    const glass = ctx.createLinearGradient(0, topY, 0, topY + h);
    glass.addColorStop(0.00, "rgba(255,255,255,0.38)");
    glass.addColorStop(0.10, "rgba(255,255,255,0.22)");
    glass.addColorStop(0.30, "rgba(255,255,255,0.10)");
    glass.addColorStop(0.55, "rgba(255,255,255,0.03)");
    glass.addColorStop(0.70, "rgba(0,0,0,0.08)");
    glass.addColorStop(0.88, "rgba(0,0,0,0.18)");
    glass.addColorStop(1.00, "rgba(0,0,0,0.26)");
  
    ctx.fillStyle = glass;
    ctx.fillRect(0, topY, W, h);
  
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, topY + 1);
    ctx.lineTo(1, topY + h - 1);
    ctx.stroke();
  
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(W - 1.2, topY + 1);
    ctx.lineTo(W - 1.2, topY + h - 1);
    ctx.stroke();
  
    ctx.restore();
    ctx.globalAlpha = 1;

    // GLASS TINT
    if (fillX > 0) {
      const sampleX = Math.max(
        1,
        Math.min(Math.floor(fillX) - 1, gcache.colors.length - 1)
      );
      const glassColor = gcache.colors[sampleX];
      const fillRatio = Math.min(fillX / effectiveW, 1);
      const tintA = 0.05 + fillRatio * 0.10;
  
      ctx.save();
      ctx.clip(path);
      ctx.globalAlpha = tintA;
      ctx.fillStyle = glassColor;
      ctx.fillRect(0, topY, W, h);
      ctx.restore();
    }

    // SIGNAL FILL (pixel fill) — CACHED GEOMETRY
    if (fillX > 0) {
      const fx = Math.min(Math.floor(fillX), gcache.colors.length);
  
      // geometry
      const xs = getPixelFillXs(W);

      ctx.save();
      ctx.clip(path);
  
      // draw only until fx
      for (let i = 0; i < fx; i++) {
        const x = xs[i];
        ctx.fillStyle = gcache.colors[i];
        ctx.fillRect(x, topY, 1, h);
      }
  
      ctx.restore();
    }

    // TRIANGLE GLOW — rim + soft fade + ultra-soft outer haze
    if (CONFIG.display.glowIntensity > 0 && fillX > 1) {
    
      const fx = Math.min(Math.floor(fillX), gcache.colors.length);
      if (fx > 0) {
    
        // glow profile
        const rimExpand   = 1.0;
        const fadeExpand  = 2.5;
        const hazeExpand  = 8.0;
    
        const rimAlpha   = 0.18 * CONFIG.display.glowIntensity;
        const fadeAlpha  = 0.06 * CONFIG.display.glowIntensity;
        const hazeAlpha  = 0.003 * CONFIG.display.glowIntensity;
        const edgeAlpha  = 1.10 * CONFIG.display.glowIntensity;
    
        function yTopAt(x) {
          return midY + (topY - midY) * (x / W);
        }
        function yBotAt(x) {
          return midY + (bottomY - midY) * (x / W);
        }
    
        ctx.save();

        // RIM GLOW
        ctx.globalAlpha = rimAlpha;
        for (let x = 0; x < fx; x++) {
          ctx.fillStyle = gcache.colors[x];
          ctx.fillRect(
            x - rimExpand,
            yTopAt(x) - rimExpand,
            1 + rimExpand * 2,
            (yBotAt(x) - yTopAt(x)) + rimExpand * 2
          );
        }

        // INNER SOFT FADE
        ctx.globalAlpha = fadeAlpha;
        for (let x = 0; x < fx; x++) {
          ctx.fillStyle = gcache.colors[x];
          ctx.fillRect(
            x - fadeExpand,
            yTopAt(x) - fadeExpand,
            1 + fadeExpand * 2,
            (yBotAt(x) - yTopAt(x)) + fadeExpand * 2
          );
        }

        // ULTRA-SOFT OUTER HAZE
        ctx.globalAlpha = hazeAlpha;
        for (let x = 0; x < fx; x++) {
          ctx.fillStyle = gcache.colors[x];
          ctx.fillRect(
            x - hazeExpand,
            yTopAt(x) - hazeExpand,
            1 + hazeExpand * 2,
            (yBotAt(x) - yTopAt(x)) + hazeExpand * 2
          );
        }

        // BC EDGE ACCENT
        ctx.globalAlpha = edgeAlpha;
        for (let x = fx - 2; x < fx; x++) {
          if (x < 0) continue;
          ctx.fillStyle = gcache.colors[x];
          ctx.fillRect(
            x - fadeExpand,
            yTopAt(x) - fadeExpand - 1,
            1 + fadeExpand * 2,
            (yBotAt(x) - yTopAt(x)) + fadeExpand * 2 + 2
          );
        }
    
        ctx.restore();
      }
    }

    // REFLECTION
    ctx.save();
    ctx.clip(path);
  
    const refl = ctx.createLinearGradient(0, topY, 0, topY + h);
    refl.addColorStop(0.00, "rgba(255,255,255,0.14)");
    refl.addColorStop(0.18, "rgba(255,255,255,0.08)");
    refl.addColorStop(0.55, "rgba(255,255,255,0.02)");
    refl.addColorStop(0.85, "rgba(0,0,0,0.05)");
    refl.addColorStop(1.00, "rgba(0,0,0,0.10)");
  
    ctx.fillStyle = refl;
    ctx.fillRect(0, topY, W, h);
    ctx.restore();
  
    // PEAK
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 6) BEVELED 3D — unified gradient + 3D bar + lighter glass + external glow
  function renderBeveled3D(ctx, levelX, peakX, y, height, width, gcache) {
  
    const effectiveW =
      (CONFIG.display.layoutMode === "lr" &&
       CONFIG.display.renderMode === "mirrored")
        ? width
        : getEffectiveBarWidth(width);
  
    const fillW = Math.max(0, Math.min(levelX, effectiveW));
  
    if (!gcache || !gcache.colors || !gcache.colors.length) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // inner 3D
    function buildOuterInner(ry, rh) {
      const radius = Math.min(rh * 0.42, 12);
      const inset  = Math.max(4, Math.floor(rh * 0.20));
  
      // OUTER GLASS SHAPE
      const outer = new Path2D();
      outer.moveTo(radius, ry);
      outer.lineTo(effectiveW - radius, ry);
      outer.quadraticCurveTo(effectiveW, ry, effectiveW, ry + radius);
      outer.lineTo(effectiveW, ry + rh - radius);
      outer.quadraticCurveTo(effectiveW, ry + rh, effectiveW - radius, ry + rh);
      outer.lineTo(radius, ry + rh);
      outer.quadraticCurveTo(0, ry + rh, 0, ry + rh - radius);
      outer.lineTo(0, ry + radius);
      outer.quadraticCurveTo(0, ry, radius, ry);
  
      // INNER 3D BAR SHAPE
      const innerY = ry + inset;
      const innerH = rh - inset * 2;
      const r2 = Math.max(3, radius - inset * 0.65);
  
      const inner = new Path2D();
      inner.moveTo(r2, innerY);
      inner.lineTo(effectiveW - r2, innerY);
      inner.quadraticCurveTo(effectiveW, innerY, effectiveW, innerY + r2);
      inner.lineTo(effectiveW, innerY + innerH - r2);
      inner.quadraticCurveTo(effectiveW, innerY + innerH, effectiveW - r2, innerY + innerH);
      inner.lineTo(r2, innerY + innerH);
      inner.quadraticCurveTo(0, innerY + innerH, 0, innerY + innerH - r2);
      inner.lineTo(0, innerY + r2);
      inner.quadraticCurveTo(0, innerY, r2, innerY);
  
      return { outer, inner, innerY, innerH };
    }

    // 1 ROW beveled bar
    function drawRow(ry, rh) {
  
      const { outer, inner, innerY, innerH } = buildOuterInner(ry, rh);
      const xs = getPixelFillXs(effectiveW);
      const maxFillX = Math.min(Math.floor(fillW), xs.length, gcache.colors.length);
  
      // INNER 3D BAR FILL
      if (maxFillX > 0) {
        ctx.save();
        ctx.clip(inner);
  
        for (let i = 0; i < maxFillX; i++) {
          const x = xs[i];
          ctx.fillStyle = gcache.colors[i];
          ctx.fillRect(x, innerY, 1, innerH);
        }
  
        ctx.restore();
      }
  
      // GLASS TINT από max color
      if (fillW > 0) {
        const sampleX = Math.max(
          1,
          Math.min(Math.floor(fillW) - 1, gcache.colors.length - 1)
        );
        const glassColor = gcache.colors[sampleX];
        const fillRatio  = Math.min(fillW / effectiveW, 1);
        const tintA = 0.06 + fillRatio * 0.22;
  
        ctx.save();
        ctx.clip(outer);
        ctx.globalAlpha = tintA;
        ctx.fillStyle = glassColor;
        ctx.fillRect(0, ry, effectiveW, rh);
        ctx.restore();
      }
  
      // bar glow
      if (CONFIG.display.glowIntensity > 0 && maxFillX > 0) {
        const gi = CONFIG.display.glowIntensity;
  
        const rimAlpha  = 0.16 * gi;
        const fadeAlpha = 0.05 * gi;
  
        // rim
        const yRim = innerY - 2;
        const hRim = innerH + 8;
  
        // fade
        const yFade = innerY - 6;
        const hFade = innerH + 14;
  
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
  
        // rim around
        if (rimAlpha > 0.001) {
          ctx.globalAlpha = rimAlpha;
          for (let i = 0; i < maxFillX; i++) {
            const x = xs[i];
            ctx.fillStyle = gcache.colors[i];
            ctx.fillRect(x - 1, yRim, 2, hRim);
          }
        }
  
        // fade further out
        if (fadeAlpha > 0.001) {
          ctx.globalAlpha = fadeAlpha;
          for (let i = 0; i < maxFillX; i++) {
            const x = xs[i];
            ctx.fillStyle = gcache.colors[i];
            ctx.fillRect(x - 2, yFade, 4, hFade);
          }
        }
  
        ctx.restore();
      }
  
      // GLASS OVERLAY / HIGHLIGHT
      ctx.save();
      ctx.clip(outer);
  
      const glass = ctx.createLinearGradient(0, ry, 0, ry + rh);
      glass.addColorStop(0.00, "rgba(255,255,255,0.58)");
      glass.addColorStop(0.18, "rgba(255,255,255,0.30)");
      glass.addColorStop(0.42, "rgba(255,255,255,0.12)");
      glass.addColorStop(0.72, "rgba(0,0,0,0.14)");
      glass.addColorStop(1.00, "rgba(0,0,0,0.32)");
  
      ctx.fillStyle = glass;
      ctx.fillRect(0, ry, effectiveW, rh);
  
      // Bevel stroke
      ctx.strokeStyle = "rgba(255,255,255,0.58)";
      ctx.lineWidth   = 1.1;
      ctx.stroke(outer);
  
      ctx.restore();
    }

    // MIRRORED MODE → 2 ROWS
    if (CONFIG.display.layoutMode === "lr" &&
        CONFIG.display.renderMode === "mirrored") {
  
      const gap = 8;
      const rowH = Math.floor((height - gap) / 2);
  
      drawRow(y, rowH);
      drawRow(y + rowH + gap, rowH);
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }
  
    // NORMAL MODE
    drawRow(y, height);
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 7) GLASS TUBE — Unified Gradient + Bar 3D + Glass + Glow Under Bar-3D
  function renderGlassTube(ctx, levelX, peakX, y, height, width, gcache) {
  
    const effectiveW =
      (CONFIG.display.layoutMode === "lr" &&
       CONFIG.display.renderMode === "mirrored")
        ? width
        : getEffectiveBarWidth(width);
  
    const drawTubeRow = (ry, rh) => {
  
      const radius = Math.max(4, rh * 0.18);
      const fillW  = Math.max(0, Math.min(levelX, effectiveW));
  
      // TUBE SHAPE
      const tubePath = new Path2D();
      tubePath.moveTo(radius, ry);
      tubePath.lineTo(effectiveW - radius, ry);
      tubePath.quadraticCurveTo(effectiveW, ry, effectiveW, ry + radius);
      tubePath.lineTo(effectiveW, ry + rh - radius);
      tubePath.quadraticCurveTo(effectiveW, ry + rh, effectiveW - radius, ry + rh);
      tubePath.lineTo(radius, ry + rh);
      tubePath.quadraticCurveTo(0, ry + rh, 0, ry + rh - radius);
      tubePath.lineTo(0, ry + radius);
      tubePath.quadraticCurveTo(0, ry, radius, ry);
  
      // ------------------------------------------------------------
      // 1) LIQUID FILL — EXACTLY AS NOW
      // ------------------------------------------------------------
      if (fillW > 0) {
  
        const xs = getPixelFillXs(effectiveW);
  
        ctx.save();
        ctx.clip(tubePath);
  
        const maxX = Math.min(fillW, xs.length);
        for (let i = 0; i < maxX; i++) {
          const x = xs[i];
          const idx = Math.min(x, gcache.colors.length - 1);
          ctx.fillStyle = gcache.colors[idx];
          ctx.fillRect(x, ry, 1, rh);
        }
        ctx.restore();
      }
  
      // ------------------------------------------------------------
      // 2) GLOW — NOW UNDER THE 3D BAR SHADING
      // ------------------------------------------------------------
      if (CONFIG.display.glowIntensity > 0 && fillW > 1) {
  
        const fx = Math.min(Math.floor(fillW), gcache.colors.length);
  
        const rimExpand  = 1.5;
        const fadeExpand = 4.5;
        const hazeExpand = 2.5;
  
        const rimAlpha  = 0.16 * CONFIG.display.glowIntensity;
        const fadeAlpha = 0.035 * CONFIG.display.glowIntensity;
        const hazeAlpha = 0.02 * CONFIG.display.glowIntensity;
  
        const xs = getPixelFillXs(effectiveW);
  
        ctx.save(); // NO CLIP — free halo
  
        // RIM
        ctx.globalAlpha = rimAlpha;
        for (let i = 0; i < fx; i++) {
          const idx = Math.min(xs[i], gcache.colors.length - 1);
          ctx.fillStyle = gcache.colors[idx];
          ctx.fillRect(
            xs[i] - rimExpand,
            ry - rimExpand,
            1 + rimExpand * 2,
            rh + rimExpand * 2
          );
        }
  
        // FADE
        ctx.globalAlpha = fadeAlpha;
        for (let i = 0; i < fx; i++) {
          const idx = Math.min(xs[i], gcache.colors.length - 1);
          ctx.fillStyle = gcache.colors[idx];
          ctx.fillRect(
            xs[i] - fadeExpand,
            ry - fadeExpand,
            1 + fadeExpand * 2,
            rh + fadeExpand * 2
          );
        }
  
        // HAZE
        ctx.globalAlpha = hazeAlpha;
        for (let i = 0; i < fx; i++) {
          const idx = Math.min(xs[i], gcache.colors.length - 1);
          ctx.fillStyle = gcache.colors[idx];
          ctx.fillRect(
            xs[i] - hazeExpand,
            ry - hazeExpand,
            1 + hazeExpand * 2,
            rh + hazeExpand * 2
          );
        }
  
        ctx.restore();
      }
  
      // ------------------------------------------------------------
      // 3) NEW BAR 3D SHADING — always above glow, inside tube
      // ------------------------------------------------------------
      if (fillW > 0) {
        ctx.save();
        ctx.clip(tubePath);
  
        const barShade = ctx.createLinearGradient(0, ry, 0, ry + rh);
        barShade.addColorStop(0.00, "rgba(255,255,255,0.32)");
        barShade.addColorStop(0.28, "rgba(255,255,255,0.14)");
        barShade.addColorStop(0.52, "rgba(0,0,0,0.10)");
        barShade.addColorStop(1.00, "rgba(0,0,0,0.20)");
  
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = barShade;
        ctx.fillRect(0, ry, fillW, rh);
        ctx.restore();
      }
  
      // ------------------------------------------------------------
      // 4) GLASS TINT (slightly stronger)
      // ------------------------------------------------------------
      if (fillW > 0) {
  
        const sampleX = Math.max(
          1,
          Math.min(Math.floor(fillW) - 1, gcache.colors.length - 1)
        );
        const glassColor = gcache.colors[sampleX];
        const fillRatio  = Math.min(fillW / effectiveW, 1);
  
        const tintA = 0.08 + fillRatio * 0.16;   // slightly stronger
  
        ctx.save();
        ctx.clip(tubePath);
        ctx.globalAlpha = tintA;
        ctx.fillStyle = glassColor;
        ctx.fillRect(0, ry, effectiveW, rh);
        ctx.restore();
      }
  
      // ------------------------------------------------------------
      // 5) GLASS SHELL (unchanged, light 3D)
      // ------------------------------------------------------------
      ctx.save();
      ctx.clip(tubePath);
  
      const glass = ctx.createLinearGradient(0, ry, 0, ry + rh);
      glass.addColorStop(0.00, "rgba(255,255,255,0.38)");
      glass.addColorStop(0.12, "rgba(255,255,255,0.22)");
      glass.addColorStop(0.35, "rgba(255,255,255,0.10)");
      glass.addColorStop(0.55, "rgba(255,255,255,0.03)");
      glass.addColorStop(0.75, "rgba(0,0,0,0.12)");
      glass.addColorStop(1.00, "rgba(0,0,0,0.26)");
  
      ctx.fillStyle = glass;
      ctx.fillRect(0, ry, effectiveW, rh);
  
      ctx.restore();
  
      // ------------------------------------------------------------
      // 6) SIDE GLOSS STROKES — topmost layer
      // ------------------------------------------------------------
      ctx.save();
  
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(255,255,255,0.40)";
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(1.0, ry + 1);
      ctx.lineTo(1.0, ry + rh - 1);
      ctx.stroke();
  
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.moveTo(effectiveW - 1.2, ry + 1);
      ctx.lineTo(effectiveW - 1.2, ry + rh - 1);
      ctx.stroke();
  
      ctx.restore();
    };
  
    // MIRRORED MODE
    if (CONFIG.display.layoutMode === "lr" &&
        CONFIG.display.renderMode === "mirrored") {
  
      const gap = 8;
      const rowH = Math.floor((height - gap) / 2);
  
      drawTubeRow(y, rowH);
      drawTubeRow(y + rowH + gap, rowH);
  
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }
  
    // NORMAL MODE
    drawTubeRow(y, height);
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // FULL RENDER CHANNEL — unified + stable
  function renderChannel(smoothDb, peakDb, y, width, barH) {

    const ctx   = STATE.dom.ctx;
    const style = CONFIG.display.barStyle;

    // mode:
    // 0 = normal
    // 1 = audio peak (red zone)
    // 2 = stereo quality (yellow zone + reverse)
    let mode = 0;

    if (STATE._audioPeakGradient) {
      mode = 1;
    } else if (STATE._stereoQualityGradient) {
      mode = 2;
    }

    const effectiveW = getEffectiveBarWidth(width);
    const levelX = mapDbToX(smoothDb, effectiveW);
    const peakX  = mapDbToX(peakDb, effectiveW);

    // unified gradient cache
    const gcache = buildBarsGradient(mode, width);

    // unified switch (simple included here)
    switch (style) {

      case "simple":
        return renderSimple(ctx, levelX, peakX, y, barH, width, gcache);

      case "segment":
        return renderSegment(ctx, levelX, peakX, y, barH, width, gcache);

      case "circledots":
        return renderCircledots(ctx, levelX, peakX, y, barH, width, gcache);

      case "matrixdots":
        return renderMatrixdots(ctx, levelX, peakX, y, barH, width, gcache);

      case "pillars":
        return renderPillars(ctx, levelX, peakX, y, barH, width, gcache);

      case "beveled3d":
        return renderBeveled3D(ctx, levelX, peakX, y, barH, width, gcache);

      case "glasstube":
        return renderGlassTube(ctx, levelX, peakX, y, barH, width, gcache);

      default:
        return renderSimple(ctx, levelX, peakX, y, barH, width, gcache);
    }
  }

  // METERS RENDERER
  function renderMeters() {
    const layout = CONFIG.display.layoutMode;
    const render = CONFIG.display.renderMode;

    const visualStateKey =
      CONFIG.display.layoutMode + "|" +
      CONFIG.display.renderMode + "|" +
      CONFIG.display.barStyle + "|" +
      CONFIG.display.showReadouts;
    
    if (visualStateKey !== _lastVisualStateKey) {
      _lastVisualStateKey = visualStateKey;
      applyVisualState();
    }

    const useMirrored =
      CONFIG.display.layoutMode === "lr" &&
      CONFIG.display.renderMode === "mirrored";

    if (useMirrored) {
      updateMirroredCanvasHeight();
    }

    const ctx    = STATE.dom.ctx;
    const canvas = STATE.dom.canvas;
    if (!ctx || !canvas) return;

    const width = canvas.width;
    const barH  = CONFIG.display.dimensions.barHeight;
    const gap   = CONFIG.display.dimensions.spacing;

    // HARD RESET CANVAS GEOMETRY WHEN NOT IN FULL+BARS
    // (prevents leftover full-stack drawings "below")
    if (!(layout === "full" && render === "bars") && canvas === STATE.dom.canvasNormal) {

      const normalHeight =
        (layout === "sa")
          ? (barH * 3 + gap * 2)
          : (barH * 2 + gap);

      if (canvas.height !== normalHeight) {
        canvas.height = normalHeight;
        canvas.style.height = normalHeight + "px";
      }

      // hard clear using the *current* intrinsic size
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // GAUGES MODE
    if (render === "gauges") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderGauges(ctx, canvas, layout);
      return;
    }

    // MIRRORED MODE (LR ONLY)
    if (layout === "lr" && render === "mirrored") {

      let height_mirrored;
      if (CONFIG.display.barStyle === "circledots") {
        height_mirrored = barH * 3.2;
      } else if (CONFIG.display.barStyle === "matrixdots") {
        height_mirrored = barH * 3.6;
      } else {
        height_mirrored = barH * 2 + gap + 15;
      }

      canvas.height       = height_mirrored;
      canvas.style.height = height_mirrored + "px";

      ctx.clearRect(0, 0, width, canvas.height);

      const BAR_GAP  = 35;
      const usableW  = Math.floor(width - BAR_GAP);
      const halfW    = Math.floor(usableW / 2);
      const Lw       = halfW;
      const Rw       = halfW;
      const baseLeft = Math.floor((width - (Lw + Rw + BAR_GAP)) / 2);
      const Lx       = Math.floor(baseLeft - 5);
      const Rx       = Math.floor(baseLeft + Lw + BAR_GAP + 5);

      // LEFT (mirrored)
      ctx.save();
      ctx.translate(Lx + Lw, 0);
      ctx.scale(-1, 1);
      renderChannel(
        STATE.levels.left.smoothDb,
        STATE.levels.left.peakDb,
        0,
        Lw,
        height_mirrored
      );
      ctx.restore();

      // RIGHT (normal)
      ctx.save();
      ctx.translate(Rx, 0);
      renderChannel(
        STATE.levels.right.smoothDb,
        STATE.levels.right.peakDb,
        0,
        Rw,
        height_mirrored
      );
      ctx.restore();

      return;
    }

    // FULL MODE — NORMAL BARS (L, R, Q, A stacked)
    if (layout === "full" && render === "bars") {

      // tighter spacing ONLY for full mode
      const FULL_GAP = Math.round(gap * 0.35);
      const TOP_PAD  = Math.round(barH * 0.05);

      const neededHeight =
        TOP_PAD * 2 +
        barH * 4 +
        FULL_GAP * 3;

      if (canvas.height !== neededHeight) {
        canvas.height       = neededHeight;
        canvas.style.height = neededHeight + "px";
      }

      // Ensure wrapper can contain 4 rows
      if (STATE.dom.contentWrapper) {
        STATE.dom.contentWrapper.style.height = neededHeight + "px";
      }

      ctx.clearRect(0, 0, width, canvas.height);

      let y = TOP_PAD;

      // L
      renderChannel(
        STATE.levels.left.smoothDb,
        STATE.levels.left.peakDb,
        y,
        width,
        barH
      );

      y += barH + FULL_GAP;

      // R
      renderChannel(
        STATE.levels.right.smoothDb,
        STATE.levels.right.peakDb,
        y,
        width,
        barH
      );

      y += barH + FULL_GAP;

      // Q — Stereo Quality
      {
        const Q_MAX = 120;
        const q = STATE.levels.stereoQuality.smooth;
        const qClamped = Math.max(0, Math.min(Q_MAX, q));

        const SIGNAL_MAX_RATIO = 0.74;
        let ratio;
        if (qClamped <= 100) {
          ratio = (qClamped / 100) * SIGNAL_MAX_RATIO;
        } else {
          ratio =
            SIGNAL_MAX_RATIO +
            ((qClamped - 100) / 20) * (1 - SIGNAL_MAX_RATIO);
        }

        const minDb = CONFIG.audio.minDb;
        const maxDb = CONFIG.audio.maxDb;

        const qSmoothDb =
          minDb + ratio * (maxDb - minDb);

        STATE._stereoQualityGradient = true;

        renderChannel(
          qSmoothDb,
          qSmoothDb,
          y,
          width,
          barH
        );

        STATE._stereoQualityGradient = false;
      }

      y += barH + FULL_GAP;

      // A — Audio
      {
        const minDb = CONFIG.audio.minDb;
        const maxDb = CONFIG.audio.maxDb;
        const range = maxDb - minDb;

        const audioSmoothDb =
          minDb + (STATE.levels.audio.smooth / 255) * range;

        STATE._audioPeakGradient = true;

        renderChannel(
          audioSmoothDb,
          audioSmoothDb,
          y,
          width,
          barH
        );

        STATE._audioPeakGradient = false;
      }

      return;
    }

    // NORMAL / SA MODES (UNCHANGED)
    const hasAudioPeak = (layout === "sa");
    const neededHeight = hasAudioPeak
      ? barH * 3 + gap * 2
      : barH * 2 + gap;

    if (canvas.height !== neededHeight) {
      canvas.height       = neededHeight;
      canvas.style.height = neededHeight + "px";
    }

    ctx.clearRect(0, 0, width, canvas.height);

    // L+R channels
    if (layout === "lr") {
      // L
      renderChannel(
        STATE.levels.left.smoothDb,
        STATE.levels.left.peakDb,
        0,
        width,
        barH
      );
      // R
      renderChannel(
        STATE.levels.right.smoothDb,
        STATE.levels.right.peakDb,
        barH + gap,
        width,
        barH
      );
    }

    // Stereo Quality (SA)
    if (layout === "sa") {

      const Q_MAX = 120;
      const q = STATE.levels.stereoQuality.smooth;
      const qClamped = Math.max(0, Math.min(Q_MAX, q));

      const SIGNAL_MAX_RATIO = 0.74;
      let ratio;
      if (qClamped <= 100) {
        ratio = (qClamped / 100) * SIGNAL_MAX_RATIO;
      } else {
        ratio =
          SIGNAL_MAX_RATIO +
          ((qClamped - 100) / 20) * (1 - SIGNAL_MAX_RATIO);
      }

      const minDb = CONFIG.audio.minDb;
      const maxDb = CONFIG.audio.maxDb;

      const qSmoothDb =
        minDb + ratio * (maxDb - minDb);

      STATE._stereoQualityGradient = true;

      renderChannel(
        qSmoothDb,
        qSmoothDb,
        0,
        width,
        barH
      );

      STATE._stereoQualityGradient = false;

      // Audio (SA)
      const minDbA = CONFIG.audio.minDb;
      const maxDbA = CONFIG.audio.maxDb;
      const rangeA = maxDbA - minDbA;

      const audioSmoothDb =
        minDbA + (STATE.levels.audio.smooth / 255) * rangeA;
      const audioPeakDb =
        minDbA + (STATE.levels.audio.peak / 255) * rangeA;

      STATE._audioPeakGradient = true;

      renderChannel(
        audioSmoothDb,
        audioPeakDb,
        barH + gap,
        width,
        barH
      );

      STATE._audioPeakGradient = false;
    }
  }

  function renderNumericScale(el, opts) {
    if (!el || !opts) return;
  
    const {
      type,    // "percent" | "db"
      min,
      max,
      values
    } = opts;
  
    const LEFT_PAD  = PERCENT_SCALE_PAD.left || 0;
    const RIGHT_PAD = PERCENT_SCALE_PAD.right || 0;
  
    el.innerHTML = "";

    // measure current width
    let rect = el.getBoundingClientRect();
    let refWidth = rect.width;
    
    // CASE 1 — layout not ready at all (0 px width)
    // try exactly ONE microtask later (no recursion, no animation-frame loops)
    if (refWidth === 0) {
      queueMicrotask(() => {
        const r2 = el.getBoundingClientRect().width;
        if (r2 > 40) {
          renderNumericScale(el, opts); // render correctly before play
        }
      });
      return;
    }
    
    // CASE 2 — width extremely small (e.g. 1–20px)
    // do NOT render yet (prevents crazy overlaps)
    // next applyVisualState() will call again with proper layout
    if (refWidth < 40) {
      return;
    }

    const track = document.createElement("div");
    track.style.position = "relative";
    track.style.width = "100%";
    track.style.height = "100%";
    track.style.pointerEvents = "none";
  
    const usableWidth = refWidth - LEFT_PAD - RIGHT_PAD;
  
    values.forEach(v => {
      const span = document.createElement("span");
  
      if (type === "percent") {
        span.textContent = (v === max) ? `${v} %` : String(v);
      } else {
        span.textContent = (v > 0 ? `+${v}` : String(v));
      }
  
      const ratio = (v - min) / (max - min);
      const x = LEFT_PAD + ratio * usableWidth;
  
      span.style.position = "absolute";
      span.style.left = x + "px";
      span.style.transform = "translateX(-50%)";
      span.style.whiteSpace = "nowrap";
      span.style.userSelect = "none";
      span.style.fontSize = "13px";
  
      track.appendChild(span);
    });
  
    el.appendChild(track);
  }

  function renderGauges(ctx, canvas, layout) {
    const W = canvas.width;
    const H = canvas.height;

    const gaugeCount = (layout === "lr" || layout === "sa") ? 2 : (layout === "full") ? 4 : 0;
    if (!gaugeCount) return;

    const cellW = W / gaugeCount;

    // Geometry
    const radius = (layout === "full") ? Math.min(W / 2, H) * 0.36 : Math.min(cellW, H) * 0.55;
    const ringWidth = radius * 0.26;
    const centerY   = radius + ringWidth / 2;
    const gapX = (layout === "full") ? 0 : 10;

    // Arc (~241° = visual 120%)
    const startAngle = -Math.PI * 1.17;
    const endAngle   =  Math.PI * 0.17;
    const arcSpan    = endAngle - startAngle;
    const START_EPS  = arcSpan * 0.010;

    const fracToAngle = (f) =>
      (startAngle + START_EPS) +
      (arcSpan - START_EPS) * Math.max(0, Math.min(1, f));

    // Shift both gauges as a group (optical centering)
    const GROUP_SHIFT = -cellW * 0.04;

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < gaugeCount; i++) {
      const { mode, frac } = computeFracAndMode(layout, i, W);

      let cx, cy;

      if (layout === "full" && gaugeCount === 4) {

        // 4 gauges in ONE row
        const fullCellW = W / 4;

        // optical centering for the whole group
        const fullGroupShift = -fullCellW * 0.06;

        cx = fullCellW * i + fullCellW / 2 + fullGroupShift;
        cy = centerY;

        // small spacing like stereo mode
        if (i === 0 || i === 1) cx -= gapX / 2;
        if (i === 2 || i === 3) cx += gapX / 2;

      } else {

        cx = cellW * i + cellW / 2 + GROUP_SHIFT;

        if (gaugeCount === 2) {
          if (i === 0) cx -= gapX / 2;
          if (i === 1) cx += gapX / 2;
        }

        cy = centerY;
      }

      // EMPTY ARC — GLASS STYLE (always visible)
      ctx.save();

      // Base glass
      ctx.lineWidth = ringWidth;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle + START_EPS, endAngle);
      ctx.stroke();

      // Inner highlight
      ctx.lineWidth = ringWidth * 0.55;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        radius - ringWidth * 0.20,
        startAngle + START_EPS,
        endAngle
      );
      ctx.stroke();

      // Soft depth
      ctx.shadowBlur = ringWidth * 0.35;
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.lineWidth = ringWidth;
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle + START_EPS, endAngle);
      ctx.stroke();

      ctx.restore();

      // ACTIVE ARC (with real glow using shadowBlur + masking)
      if (frac > 0) {
        const valueAngle = fracToAngle(frac);

        const { gradient, glowColor } =
          buildConicGaugeGradient(
            ctx,
            cx,
            cy,
            mode,
            startAngle,
            START_EPS,
            arcSpan
          );

        // GLOW PASS (shadowBlur, masked)
        if (CONFIG.display.glowIntensity > 0) {
          ctx.save();

          // Draw blurred arc
          ctx.lineCap = "round";
          ctx.lineWidth = ringWidth - 5;
          ctx.strokeStyle = gradient;
          ctx.shadowBlur  = ringWidth * 1.6 * CONFIG.display.glowIntensity;
          ctx.shadowColor = glowColor;

          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            radius,
            startAngle + START_EPS,
            valueAngle
          );
          ctx.stroke();

          // Cut inner part so glow doesn't fill the arc
          ctx.globalCompositeOperation = "destination-out";
          ctx.shadowBlur = 0;
          ctx.lineWidth = ringWidth * 0.85;

          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            radius,
            startAngle + START_EPS,
            valueAngle
          );
          ctx.stroke();

          ctx.restore();
        }

        // MAIN ARC (clean, sharp)
        ctx.save();

        ctx.lineCap = "round";
        ctx.lineWidth = ringWidth;
        ctx.strokeStyle = gradient;

        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          radius,
          startAngle + START_EPS,
          valueAngle
        );
        ctx.stroke();

        ctx.restore();
      }

      // PEAK INDICATOR (reuses drawExternalPeak physics)
      let peakFrac = 0;

      if (mode === 0) {
        // LR stereo peaks (per channel)
        const peakDb =
          (i === 0)
            ? STATE.levels?.left?.peakDb
            : STATE.levels?.right?.peakDb;

        if (typeof peakDb === "number") {
          const px = mapDbToX(peakDb, W);
          peakFrac = Math.max(0, Math.min(1, px / W));
        }

      } else {
        // Audio Peak (mode 1), Stereo Quality (mode 2), λοιπά
        peakFrac = frac;
      }

      if (peakFrac > 0) {
        drawExternalPeak(
          ctx,
          0, 0, 0, 0, 0,
          {
            cx,
            cy,
            r: radius,
            strokeW: ringWidth,
            startAngle: startAngle + START_EPS,
            sweepAngle: arcSpan - START_EPS,
            normLevel: frac,
            peakNorm: peakFrac
          }
        );
      }
    }
  }

  // ───────────────
  // VISUAL STATES
  // ───────────────
  function applyVisualState() {

    const layout = CONFIG.display.layoutMode;
    const render = CONFIG.display.renderMode;

    const useMirrored =
      layout === "lr" && render === "mirrored";

    // READOUTS — VISIBILITY (GLOBAL, SINGLE AUTHORITY)
    if (STATE.dom.readouts) {
      const show = CONFIG.display.showReadouts;
    
      Object.values(STATE.dom.readouts).forEach(el => {
        if (!el) return;
        el.style.display = show ? "" : "none";
      });
    }

    // SELECT ACTIVE CANVAS
    if (render === "gauges") {
      setCanvasActive("gauges");
    } else if (useMirrored) {
      setCanvasActive("mirrored");
    } else {
      setCanvasActive("normal");
    }

    // HARD RESET — ALWAYS FIRST (NO STATE LEAKS)

    // canvas position
    if (STATE.dom.canvasNormal && STATE._canvasNormalBaseTop != null) {
      STATE.dom.canvasNormal.style.top = STATE._canvasNormalBaseTop;
    }

    // wrapper height
    if (STATE.dom.contentWrapper) {
      STATE.dom.contentWrapper.style.height = "";
    }

    // hide gauge overlay by default
    if (STATE.dom.gaugeOverlay) {
      STATE.dom.gaugeOverlay.style.display = "none";
    }

    // reset labels
    if (STATE.dom.labels.left) {
      STATE.dom.labels.left.style.display = "";
      STATE.dom.labels.left.textContent = "L";
    }

    if (STATE.dom.labels.right) {
      STATE.dom.labels.right.style.display = "";
      STATE.dom.labels.right.textContent = "R";
    }

    if (STATE.dom.labels.q) {
      STATE.dom.labels.q.style.display = "none";
    }

    if (STATE.dom.labels.a) {
      STATE.dom.labels.a.style.display = "none";
    }

    // reset scales
    if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "";
    if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "";

    // hide mirrored UI
    if (STATE.dom.mirrorLabel)     STATE.dom.mirrorLabel.style.display     = "none";
    if (STATE.dom.mirrorScaleWrap) STATE.dom.mirrorScaleWrap.style.display = "none";

    // reset readouts position
    if (STATE.dom.readouts) {
      Object.values(STATE.dom.readouts).forEach(el => {
        if (!el) return;
        el.style.left = "";
        el.style.top = "";
        el.style.transform = "";
      });
    }

    // restore default L / R label positions
    const barH = CONFIG.display.dimensions.barHeight;
    const gap  = CONFIG.display.dimensions.spacing;

    if (STATE.dom.labels.left) {
      STATE.dom.labels.left.style.top =
        (INNER_BASE_TOP + barH / 2 - 12) + "px";
    }

    if (STATE.dom.labels.right) {
      STATE.dom.labels.right.style.top =
        (INNER_BASE_TOP + barH + gap + barH / 2 - 12) + "px";
    }

    // GAUGES MODE
    if (render === "gauges") {

      // reset numeric labels
      [
        STATE.dom.gaugeNumsLeft?.start,
        STATE.dom.gaugeNumsLeft?.mid,
        STATE.dom.gaugeNumsLeft?.high,
        STATE.dom.gaugeNumsLeft?.end,
        STATE.dom.gaugeNumsRight?.start,
        STATE.dom.gaugeNumsRight?.mid,
        STATE.dom.gaugeNumsRight?.high,
        STATE.dom.gaugeNumsRight?.end
      ].filter(Boolean).forEach(el => {
        el.textContent = "";
        el.style.display = "none";
      });

      // hide bar UI
      if (STATE.dom.labels.left)  STATE.dom.labels.left.style.display  = "none";
      if (STATE.dom.labels.right) STATE.dom.labels.right.style.display = "none";
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      // show gauge overlay
      if (STATE.dom.gaugeOverlay) {
        STATE.dom.gaugeOverlay.style.display = "";
      }
      positionReadouts(layout, render);

      // CENTER LABELS (DOM OVERLAY — POSITIONS DECIDED HERE)
      if (layout === "full") {

        // FULL MODE — 4 gauges in ONE ROW
        const TOP = "40%";
        const TRANSFORM = "translate(-50%, 30%)";

        // L
        STATE.dom.gaugeLabelLeft.textContent = "L";
        STATE.dom.gaugeLabelLeft.style.left = "12.5%";
        STATE.dom.gaugeLabelLeft.style.top = TOP;
        STATE.dom.gaugeLabelLeft.style.transform = TRANSFORM;
        STATE.dom.gaugeLabelLeft.style.display = "";

        // R
        STATE.dom.gaugeLabelRight.textContent = "R";
        STATE.dom.gaugeLabelRight.style.left = "39%";
        STATE.dom.gaugeLabelRight.style.top = TOP;
        STATE.dom.gaugeLabelRight.style.transform = TRANSFORM;
        STATE.dom.gaugeLabelRight.style.display = "";

        // Q
        STATE.dom.gaugeLabelQ.textContent = "Q";
        STATE.dom.gaugeLabelQ.style.left = "65.5%";
        STATE.dom.gaugeLabelQ.style.top = TOP;
        STATE.dom.gaugeLabelQ.style.transform = TRANSFORM;
        STATE.dom.gaugeLabelQ.style.display = "";

        // A
        STATE.dom.gaugeLabelA.textContent = "A";
        STATE.dom.gaugeLabelA.style.left = "92%";
        STATE.dom.gaugeLabelA.style.top = TOP;
        STATE.dom.gaugeLabelA.style.transform = TRANSFORM;
        STATE.dom.gaugeLabelA.style.display = "";

        if (STATE.dom.title) {
          STATE.dom.title.textContent = "AUDIO LEVELS";
          STATE.dom.title.style.display = "";
        }

      } else {

        // STEREO / SA — 2 gauges (restore baseline)
        const TOP = "50%";
        const TRANSFORM = "translate(-50%, 60%)";

        // hide FULL-only labels
        STATE.dom.gaugeLabelQ.style.display = "none";
        STATE.dom.gaugeLabelA.style.display = "none";

        // restore correct 2-gauge positions
        STATE.dom.gaugeLabelLeft.style.left  = "calc(25% - 6px)";
        STATE.dom.gaugeLabelRight.style.left = "calc(75% + 16px)";
        STATE.dom.gaugeLabelLeft.style.top = TOP;
        STATE.dom.gaugeLabelRight.style.top = TOP;
        STATE.dom.gaugeLabelLeft.style.transform = TRANSFORM;
        STATE.dom.gaugeLabelRight.style.transform = TRANSFORM;
        STATE.dom.gaugeLabelLeft.style.display = "";
        STATE.dom.gaugeLabelRight.style.display = "";

        if (layout === "sa") {
          STATE.dom.gaugeLabelLeft.textContent  = "Q";
          STATE.dom.gaugeLabelRight.textContent = "A";

          if (STATE.dom.title) {
            STATE.dom.title.textContent = "ST. QUALITY / AUDIO PEAK";
            STATE.dom.title.style.display = "";
          }
        } else {
          STATE.dom.gaugeLabelLeft.textContent  = "L";
          STATE.dom.gaugeLabelRight.textContent = "R";

          if (STATE.dom.title) {
            STATE.dom.title.textContent = "STEREO LEVELS";
            STATE.dom.title.style.display = "";
          }
        }
      }

      // NUMERIC LABELS
      if (layout === "lr") {

        ["Left", "Right"].forEach(side => {
          const g = STATE.dom["gaugeNums" + side];
          if (!g) return;

          g.start.textContent = "-40";
          g.mid.textContent   = "-25";
          g.high.textContent  = "-15";
          g.end.textContent   = "+3";

          g.start.style.display =
          g.mid.style.display   =
          g.high.style.display  =
          g.end.style.display   = "";
        });
      }

      if (layout === "sa") {

        ["Left", "Right"].forEach(side => {
          const g = STATE.dom["gaugeNums" + side];
          if (!g) return;

          g.start.textContent = "0";
          g.mid.textContent   = "30";
          g.high.textContent  = "70";
          g.end.textContent   = "120%";

          g.start.style.display =
          g.mid.style.display   =
          g.high.style.display  =
          g.end.style.display   = "";
        });
      }

      return;
    }

    // FULL MODE — BARS (LAYOUT ONLY)
    if (layout === "full" && render === "bars") {

    if (STATE.dom.title) {
      STATE.dom.title.textContent = "AUDIO LEVELS";
      STATE.dom.title.style.display = "";
    }

      // hide scales
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      // lift canvas
      if (STATE.dom.canvasNormal) {
        STATE.dom.canvasNormal.style.top = "0px";
      }

      const FULL_GAP = Math.round(gap * 0.35);
      const TOP_PAD  = Math.round(barH * 0.05);
      const baseY    = TOP_PAD;

      if (STATE.dom.labels.left) {
        STATE.dom.labels.left.style.top =
          (baseY + barH / 2 - 12) + "px";
      }

      if (STATE.dom.labels.right) {
        STATE.dom.labels.right.style.top =
          (baseY + (barH + FULL_GAP) + barH / 2 - 12) + "px";
      }

      if (STATE.dom.labels.q) {
        STATE.dom.labels.q.style.display = "";
        STATE.dom.labels.q.textContent = "Q";
        STATE.dom.labels.q.style.top =
          (baseY + 2 * (barH + FULL_GAP) + barH / 2 - 12) + "px";
      }

      if (STATE.dom.labels.a) {
        STATE.dom.labels.a.style.display = "";
        STATE.dom.labels.a.textContent = "A";
        STATE.dom.labels.a.style.top =
          (baseY + 3 * (barH + FULL_GAP) + barH / 2 - 12) + "px";
      }
      positionReadouts(layout, render);
      return;
    }

    // MIRRORED MODE
    if (useMirrored) {

      if (STATE.dom.labels.left)  STATE.dom.labels.left.style.display  = "none";
      if (STATE.dom.labels.right) STATE.dom.labels.right.style.display = "none";
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      if (STATE.dom.mirrorLabel)     STATE.dom.mirrorLabel.style.display     = "block";
      if (STATE.dom.mirrorScaleWrap) STATE.dom.mirrorScaleWrap.style.display = "block";
      positionReadouts(layout, render);
      return;
    }

    // SA / NORMAL MODES
    if (layout === "sa") {
    
      if (STATE.dom.labels.left)  STATE.dom.labels.left.textContent  = "Q";
      if (STATE.dom.labels.right) STATE.dom.labels.right.textContent = "A";
    
      if (STATE.dom.scales.left) {
        renderNumericScale(STATE.dom.scales.left, {
          type: "percent",
          min: 0,
          max: 120,
          values: [0, 10, 30, 50, 70, 100, 120]
        });
      }
    
      if (STATE.dom.scales.right) {
        renderNumericScale(STATE.dom.scales.right, {
          type: "percent",
          min: 0,
          max: 120,
          values: [0, 10, 30, 50, 70, 100, 120]
        });
      }
    
      if (STATE.dom.title) {
        STATE.dom.title.textContent = "ST. QUALITY / AUDIO PEAK";
      }
    
      positionReadouts(layout, render);
    
    } else {
    
      if (STATE.dom.labels.left)  STATE.dom.labels.left.textContent  = "L";
      if (STATE.dom.labels.right) STATE.dom.labels.right.textContent = "R";
    
      if (STATE.dom.scales.left) {
        renderNumericScale(STATE.dom.scales.left, {
          type: "db",
          min: -40,
          max: 3,
          values: [-40, -30, -20, -10, -5, 0,  3]
        });
      }
    
      if (STATE.dom.scales.right) {
        renderNumericScale(STATE.dom.scales.right, {
          type: "db",
          min: -40,
          max: 3,
          values: [-40, -30, -20, -10, -5, 0,  3]
        });
      }
    
      if (STATE.dom.title) {
        STATE.dom.title.textContent = CONFIG.display.defaultTitle;
      }
    
      positionReadouts(layout, render);
    }
  }

  // ─────────────────────────────────────────────────────────
  // PART 3 — DOM INITIALIZATION • AUDIO ENGINE • FINAL LOOP
  // ─────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    try {
      // Build settings UI
      addAudioMetrixToggle();
      if (!isStereoEnabled()) return;

      // CONTAINER TILE
      STATE.dom.container = document.createElement("div");
      STATE.dom.container.className = "panel-33 hover-brighten tooltip";
      STATE.dom.container.id = "audiometrix-container";
      STATE.dom.container.style.width = CONFIG.display.dimensions.tileWidthPercent + "%";
      STATE.dom.container.style.minWidth = CONFIG.display.dimensions.minTileWidth + "px";
      STATE.dom.container.style.borderRadius = CONFIG.display.dimensions.borderRadius;
      STATE.dom.container.setAttribute("data-tooltip","Stereo modulation L/R & Q | Audio Peaks");

      // Title
      STATE.dom.title = document.createElement("h2");
      STATE.dom.title.textContent = CONFIG.display.defaultTitle;
      STATE.dom.title.style.userSelect = "none";
      STATE.dom.container.appendChild(STATE.dom.title);

      // Content wrapper
      STATE.dom.contentWrapper = document.createElement("div");
      STATE.dom.contentWrapper.style.cssText = `
        position:relative;
        margin-top:8px;
        height:${WRAPPER_HEIGHT}px;
        min-height:${WRAPPER_HEIGHT}px;
        overflow:visible;
      `;
      STATE.dom.container.appendChild(STATE.dom.contentWrapper);

      // FLOATING SETTINGS PANEL + GEAR BUTTON
      const floatingPanel = createAMXFloatingPanel();
      buildAMXFloatingSettings(floatingPanel);
      createAMXSettingsButton(STATE.dom.container, floatingPanel);
      bindFloatingPanelAutoPosition(floatingPanel, STATE.dom.container);

      // CANVASES (NORMAL, MIRRORED, GAUGES)

      // NORMAL MODE CANVAS
      STATE.dom.canvasNormal = document.createElement("canvas");
      STATE.dom.canvasNormal.style.cssText = `
        position:absolute;
        top:${INNER_BASE_TOP - 2}px;
        left:${CONFIG.display.dimensions.canvasLeft + 0}px;
        width:calc(100% - ${CONFIG.display.dimensions.canvasLeft + 5}px);
        display:block;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.canvasNormal);

      // SAVE BASE TOP OF NORMAL CANVAS (for restoring after full mode)
      STATE._canvasNormalBaseTop = STATE.dom.canvasNormal.style.top;

      // MIRRORED MODE CANVAS
      STATE.dom.canvasMirror = document.createElement("canvas");
      STATE.dom.canvasMirror.style.cssText = `
        position:absolute;
        left:${Math.max(4, CONFIG.display.dimensions.canvasLeft - 20)}px;
        top:${INNER_BASE_TOP - 18}px;
        width:calc(100% - ${Math.max(8, CONFIG.display.dimensions.canvasLeft - 15)}px);
        visibility:hidden;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.canvasMirror);

      // GAUGES MODE CANVAS
      STATE.dom.canvasGauges = document.createElement("canvas");
      STATE.dom.canvasGauges.style.cssText = `
        position:absolute;
        top:5px;
        left:${CONFIG.display.dimensions.canvasLeft}px;
        width:calc(100% - ${CONFIG.display.dimensions.canvasLeft + 5}px);
        display:none;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.canvasGauges);

      // INITIAL CANVAS INTRINSIC SIZE SYNC (CRITICAL)

      // Default active canvas
      STATE.dom.canvas = STATE.dom.canvasNormal;
      
      readLayoutOnce();
      
      const w = STATE.layout.width;
      const barH = CONFIG.display.dimensions.barHeight;
      const gap = CONFIG.display.dimensions.spacing;
      
      const safeWidth = w && w > 40 ? w : 300;
      const normalHeight = barH * 2 + gap;


      // NORMAL canvas always gets size
      resizeCanvasIfNeeded(
        STATE.dom.canvasNormal,
        safeWidth,
        normalHeight
      );
      requestRender();

      // GAUGES canvas — initial intrinsic size
      if (STATE.dom.canvasGauges) {
        const gaugesHeight = WRAPPER_HEIGHT - 20;

        STATE.dom.canvasGauges.width  = safeWidth;
        STATE.dom.canvasGauges.height = gaugesHeight;
        STATE.dom.canvasGauges.style.width  = safeWidth + "px";
        STATE.dom.canvasGauges.style.height = gaugesHeight + "px";
      }

      // FLOATING PANEL REPOSITION ON RESIZE
      window.addEventListener("resize", () => {
        const panel = document.getElementById("amx-floating-panel");
        const container = STATE.dom.container;
        if (panel && panel.style.display !== "none") {
          positionAMXFloatingPanel(panel, container);
        }
      });

      // NATIVE LABELS L/R (normal mode only)
      function createLabel(text, top) {
        const el = document.createElement("div");
        el.textContent = text;
        el.style.cssText = `
          position:absolute;
          left:${CONFIG.display.dimensions.labelLeft}px;
          top:${top + CONFIG.display.dimensions.barHeight / 2 - 12}px;
          z-index:3;
          user-select:none;
        `;
        STATE.dom.contentWrapper.appendChild(el);
        return el;
      }

      STATE.dom.labels.left = createLabel("L", INNER_BASE_TOP);
      STATE.dom.labels.right = createLabel("R", INNER_BASE_TOP + CONFIG.display.dimensions.barHeight + CONFIG.display.dimensions.spacing);

      // FULL MODE EXTRA LABELS (Q / A)
      STATE.dom.labels.q = createLabel("Q", INNER_BASE_TOP);
      STATE.dom.labels.a = createLabel("A", INNER_BASE_TOP);

      // default hidden
      STATE.dom.labels.q.style.display = "none";
      STATE.dom.labels.a.style.display = "none";

      // NATIVE SCALE ROWS (normal mode only)
      function createScale(text, top) {
        const el = document.createElement("div");
        el.textContent = text;
        el.style.cssText = `
          position:absolute;
          left:20px;
          top:${top}px;
          width:calc(100% - 20px);
          text-align:center;
          user-select:none;
          white-space:nowrap;
          z-index:2;
        `;
        STATE.dom.contentWrapper.appendChild(el);
        return el;
      }

      const NB = "\u00A0";
      const scaleText =
        NB + NB + "-40" + NB.repeat(10) + "-30" + NB.repeat(10) +
        "-20" + NB.repeat(10) + "-10" + NB.repeat(5) + "-5" +
        NB.repeat(2) + "-3" + NB.repeat(2) + "-1" + NB.repeat(1) +
        "0" + NB.repeat(1) + "+1" + NB.repeat(2) + "+3";

      STATE.dom.scales.left = createScale(scaleText, INNER_BASE_TOP - 24);
      STATE.dom.scales.right = createScale(
        scaleText,
        INNER_BASE_TOP + CONFIG.display.dimensions.barHeight * 2 + CONFIG.display.dimensions.spacing - 0
      );

      // MIRRORED MODE — CLEAN, FINAL DOM ELEMENTS

      // FIXED CENTRAL L|R LABEL
      STATE.dom.mirrorLabel = document.createElement("div");
      STATE.dom.mirrorLabel.textContent = "L | R";
      STATE.dom.mirrorLabel.style.cssText = `
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%, -115%);
        white-space:nowrap;
        pointer-events:none;
        user-select:none;
        z-index:10;
        display:none;
        font-size:16px;
        line-height:1.2;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.mirrorLabel);

      // MIRRORED SCALES WRAPPER (STATIC, TILE-ANCHORED)
      STATE.dom.mirrorScaleWrap = document.createElement("div");
      STATE.dom.mirrorScaleWrap.style.cssText = `
        position:absolute;
        left:0;
        right:0;
        bottom:4px;
        height:18px;
        pointer-events:none;
        user-select:none;
        z-index:9;
        display:none;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.mirrorScaleWrap);

      // LEFT MIRRORED SCALE
      STATE.dom.mirrorScaleLeft = document.createElement("div");
      STATE.dom.mirrorScaleLeft.style.cssText = `
        position:absolute;
        left:6px;
        bottom:6px;
        width:42%;
        text-align:left;
        user-select:none;
        white-space:nowrap;
        pointer-events:none;
        font-size:12px;
        line-height:1.2;
      `;
      STATE.dom.mirrorScaleLeft.innerHTML = `
        <div style="position:relative;width:95%; display:inline-flex;justify-content:space-between;">
          <span data-db="3">+3</span>
          <span data-db="-10">-10</span>
          <span data-db="-20">-20</span>
          <span data-db="-40">-40</span>
        </div>
      `;
      STATE.dom.mirrorScaleWrap.appendChild(STATE.dom.mirrorScaleLeft);

      // RIGHT MIRRORED SCALE
      STATE.dom.mirrorScaleRight = document.createElement("div");
      STATE.dom.mirrorScaleRight.style.cssText = `
        position:absolute;
        right:6px;
        bottom:6px;
        width:42%;
        text-align:right;
        user-select:none;
        white-space:nowrap;
        pointer-events:none;
        font-size:12px;
        line-height:1.2;
      `;
      STATE.dom.mirrorScaleRight.innerHTML = `
        <div style="position:relative;width:95%; display:inline-flex;justify-content:space-between;">
          <span data-db="-40">-40</span>
          <span data-db="-20">-20</span>
          <span data-db="-10">-10</span>
          <span data-db="+3">+3</span>
        </div>
      `;
      STATE.dom.mirrorScaleWrap.appendChild(STATE.dom.mirrorScaleRight);

      // GAUGES MODE — DOM OVERLAY (CENTER LABELS + NUMBERS)
      STATE.dom.gaugeOverlay = document.createElement("div");
      STATE.dom.gaugeOverlay.id = "stereo-gauge-overlay";
      STATE.dom.gaugeOverlay.style.cssText = `
        position:absolute;
        left:0;
        top:0;
        right:0;
        bottom:0;
        pointer-events:none;
        user-select:none;
        z-index:30;
        display:none;
      `;

      // Helper to create a centered gauge label
      function createGaugeCenterLabel() {
        const el = document.createElement("div");
        el.style.cssText = `
          position:absolute;
          top:50%;
          transform:translate(-50%, 60%);
          font-weight:600;
          font-size:16px;
          opacity:0.92;
          pointer-events:none;
          user-select:none;
          z-index:31;
          white-space:nowrap;
          display:none;
        `;
        STATE.dom.gaugeOverlay.appendChild(el);
        return el;
      }

      // Base labels (used in LR / SA)
      STATE.dom.gaugeLabelLeft  = createGaugeCenterLabel(); // L or Q
      STATE.dom.gaugeLabelRight = createGaugeCenterLabel(); // R or A

      // Extra labels for FULL (exist, but NOT positioned here)
      STATE.dom.gaugeLabelQ = createGaugeCenterLabel();
      STATE.dom.gaugeLabelA = createGaugeCenterLabel();

      // Overlay anchoring (same as canvasGauges)
      const GAUGE_OVERLAY_LEFT  = CONFIG.display.dimensions.canvasLeft;
      const GAUGE_OVERLAY_W_SUB = (CONFIG.display.dimensions.canvasLeft + 5);

      STATE.dom.gaugeOverlay.style.left  = GAUGE_OVERLAY_LEFT + "px";
      STATE.dom.gaugeOverlay.style.right = GAUGE_OVERLAY_W_SUB + "px";

      // DEFAULT POSITIONS — 2 GAUGES ONLY (LR / SA)
      STATE.dom.gaugeLabelLeft.style.left  = "calc(25% - 6px)";
      STATE.dom.gaugeLabelRight.style.left = "calc(75% + 16px)";

      // FULL labels: hidden by default, positioned by applyVisualState
      STATE.dom.gaugeLabelQ.style.display = "none";
      STATE.dom.gaugeLabelA.style.display = "none";

      // Default text (will be overridden by applyVisualState)
      STATE.dom.gaugeLabelLeft.textContent  = "L";
      STATE.dom.gaugeLabelRight.textContent = "R";
      STATE.dom.gaugeLabelQ.textContent     = "Q";
      STATE.dom.gaugeLabelA.textContent     = "A";

      // Append overlay above canvases
      STATE.dom.contentWrapper.appendChild(STATE.dom.gaugeOverlay);

      // READOUTS — DOM OVERLAY (NUMERIC, REAL-TIME)
      STATE.dom.readouts = {
        L: createReadoutEl(),
        R: createReadoutEl(),
        Q: createReadoutEl(),
        A: createReadoutEl()
      };
      
      STATE.dom.contentWrapper.appendChild(STATE.dom.readouts.L);
      STATE.dom.contentWrapper.appendChild(STATE.dom.readouts.R);
      STATE.dom.contentWrapper.appendChild(STATE.dom.readouts.Q);
      STATE.dom.contentWrapper.appendChild(STATE.dom.readouts.A);

      // GAUGES MODE — NUMERIC LABELS (STATIC DOM)
      function createGaugeNumber() {
        const el = document.createElement("div");
        el.style.cssText = `
          position:absolute;
          transform:translate(-50%, -50%);
          font-weight:500;
          opacity:0.70;
          pointer-events:none;
          user-select:none;
          white-space:nowrap;
          z-index:31;
          display:none;
        `;
        STATE.dom.gaugeOverlay.appendChild(el);
        return el;
      }

      // LEFT GAUGE NUMBERS
      STATE.dom.gaugeNumsLeft = {
        start: createGaugeNumber(),
        mid:   createGaugeNumber(),
        high:  createGaugeNumber(),
        end:   createGaugeNumber()
      };

      // RIGHT GAUGE NUMBERS
      STATE.dom.gaugeNumsRight = {
        start: createGaugeNumber(),
        mid:   createGaugeNumber(),
        high:  createGaugeNumber(),
        end:   createGaugeNumber()
      };

      // LEFT GAUGE
      STATE.dom.gaugeNumsLeft.start.style.left = "2%";
      STATE.dom.gaugeNumsLeft.start.style.top  = "75%";

      STATE.dom.gaugeNumsLeft.mid.style.left   = "7%";
      STATE.dom.gaugeNumsLeft.mid.style.top    = "10%";

      STATE.dom.gaugeNumsLeft.high.style.left  = "38%";
      STATE.dom.gaugeNumsLeft.high.style.top   = "10%";

      STATE.dom.gaugeNumsLeft.end.style.left   = "45%";
      STATE.dom.gaugeNumsLeft.end.style.top    = "75%";

      // RIGHT GAUGE
      STATE.dom.gaugeNumsRight.start.style.left = "59%";
      STATE.dom.gaugeNumsRight.start.style.top  = "75%";

      STATE.dom.gaugeNumsRight.mid.style.left   = "64%";
      STATE.dom.gaugeNumsRight.mid.style.top    = "10%";

      STATE.dom.gaugeNumsRight.high.style.left  = "95%";
      STATE.dom.gaugeNumsRight.high.style.top   = "10%";

      STATE.dom.gaugeNumsRight.end.style.left   = "102%";
      STATE.dom.gaugeNumsRight.end.style.top    = "75%";

      function createReadoutEl() {
        const el = document.createElement("div");
        el.className = "stereo-readout";
      
        el.style.cssText = `
          position:absolute;
          pointer-events:none;
          user-select:none;
          white-space:nowrap;
          font-weight:600;
          font-size:13px;
          opacity:0.85;
          display:none;
          z-index:40;
        `;
      
        return el;
      }

      // FINAL INITIAL VISUAL SYNC (AFTER ALL DOM EXISTS)
      applyVisualState();
      renderMeters();

      // Insert tile after freq panel
      const freq = document.querySelector("#freq-container");
      const next = freq?.nextElementSibling;
      if (next?.parentNode) {
        next.parentNode.insertBefore(STATE.dom.container, next.nextSibling);
      } else if (freq?.parentNode) {
        freq.parentNode.appendChild(STATE.dom.container);
      } else {
        document.body.appendChild(STATE.dom.container);
      }

      // Skin inheritance (sync fonts/colors)
      function inheritTextStyles() {
        try {
          const freqContainer = document.querySelector("#freq-container");
          const freqTitle =
            freqContainer?.querySelector("h2") ||
            document.querySelector("#freq-container h2");

          // TITLE
          if (freqTitle && STATE.dom.title) {
            const cs = getComputedStyle(freqTitle);
            const t = STATE.dom.title.style;
            t.fontFamily = cs.fontFamily;
            t.fontWeight = cs.fontWeight;
            t.fontSize = cs.fontSize;
            t.letterSpacing = cs.letterSpacing;
            t.textTransform = cs.textTransform;
            t.color = cs.color;
            t.lineHeight = cs.lineHeight;
          }

          // BASE TEXT REFERENCE (labels / scales)
          const ref =
            freqContainer?.querySelector(".text-small") ||
            document.querySelector("#freq-container .text-small") ||
            document.querySelector(".text-small");
          if (!ref) return;

          const cs = getComputedStyle(ref);

          // NORMAL LABELS & SCALES
          const targets = [
            STATE.dom.labels.left,
            STATE.dom.labels.right,
            STATE.dom.scales.left,
            STATE.dom.scales.right
          ].filter(Boolean);

          targets.forEach((el) => {
            const base = parseFloat(cs.fontSize);

            el.style.fontFamily = cs.fontFamily;
            el.style.fontWeight = cs.fontWeight;
            el.style.letterSpacing = cs.letterSpacing;
            el.style.textTransform = cs.textTransform;
            el.style.lineHeight = cs.lineHeight;
            el.style.color = cs.color;

            if (
              el === STATE.dom.labels.left ||
              el === STATE.dom.labels.right
            ) {
              el.style.fontSize = base + 2 + "px";
            } else {
              el.style.fontSize = cs.fontSize;
            }
          });

          if (STATE.dom.scales.left)  STATE.dom.scales.left.style.opacity  = 0.7;
          if (STATE.dom.scales.right) STATE.dom.scales.right.style.opacity = 0.7;

          // GAUGES — NUMERIC LABELS (inheritance)
          const gaugeNums = [
            STATE.dom.gaugeNumsLeft?.start,
            STATE.dom.gaugeNumsLeft?.mid,
            STATE.dom.gaugeNumsLeft?.high,
            STATE.dom.gaugeNumsLeft?.end,
            STATE.dom.gaugeNumsRight?.start,
            STATE.dom.gaugeNumsRight?.mid,
            STATE.dom.gaugeNumsRight?.high,
            STATE.dom.gaugeNumsRight?.end
          ].filter(Boolean);

          gaugeNums.forEach((el) => {
            el.style.fontFamily = cs.fontFamily;
            el.style.fontWeight = cs.fontWeight;
            el.style.letterSpacing = cs.letterSpacing;
            el.style.textTransform = cs.textTransform;
            el.style.lineHeight = cs.lineHeight;
            el.style.color = cs.color;
            el.style.fontSize = (parseFloat(cs.fontSize) - 1) + "px";
            el.style.opacity = 0.7;
          });

        } catch (e) {
          console.error(
            "[AudioMetrix] inheritTextStyles failed:",
            e
          );
        }
      }

      function alignTitle() {
        try {
          const freqTitle = document.querySelector("#freq-container h2");
          const freqPanel = document.querySelector("#freq-container");
          if (!freqTitle || !freqPanel || !STATE.dom.title) return;

          const r1 = freqTitle.getBoundingClientRect();
          const r2 = freqPanel.getBoundingClientRect();
          STATE.dom.title.style.margin = "0 0 0 12px";
          STATE.dom.title.style.position = "relative";
          STATE.dom.title.style.top = r1.top - r2.top + "px";
        } catch (e) {
          console.error("[AudioMetrix] alignTitle failed:", e);
        }
      }

      const applySkin = () => {
        inheritTextStyles();
        alignTitle();
      };

      // Apply skin after DOM builds
      setTimeout(applySkin, 50);
      setTimeout(applySkin, 300);

      // Skin observer — visual sync only (fonts / alignment)
      const skinObserver = new MutationObserver(() => {
        applySkin();
      });
      skinObserver.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class", "style"]
      });

      // ──────────────
      // AUDIO ENGINE
      // ──────────────
      function resetAudioState() {
        STATE.audio = {
          context: null,
          splitter: null,

          // L / R
          analyserLeft: null,
          analyserRight: null,
          dataLeft: null,
          dataRight: null,

          // Mid / Side (NEW – not wired yet)
          mergerMS: null,
          analyserMid: null,
          analyserSide: null,
          dataMid: null,
          dataSide: null,

          // Audio Peak
          analyserPeak: null,
          bassFilter: null,
          highPassFilter: null,
          lowPassFilter: null,
          dataPeak: null,

          source: null
        };
      }

      function linearToDb(x) {
        if (x <= 0) return -120;
        return 20 * Math.log10(x);
      }

      function processChannel(data, prevSmoothDb) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 255;
          sum += v * v;
        }
        const linear = Math.sqrt(sum / data.length);

        if (linear < CONFIG.audio.minThreshold) {
          return { instantDb: -120, smoothDb: -120 };
        }

        const shaped = Math.min(
          Math.pow(linear * CONFIG.audio.amplification, CONFIG.audio.riseRate),
          1
        );

        let instantDb = linearToDb(shaped) + CONFIG.audio.dbGain;
        let smoothDb;

        if (instantDb > prevSmoothDb) {
          smoothDb = prevSmoothDb + (instantDb - prevSmoothDb) * CONFIG.audio.attackSpeed;
        } else {
          smoothDb = prevSmoothDb + (instantDb - prevSmoothDb) * CONFIG.audio.releaseSpeed;
        }

        return { instantDb, smoothDb };
      }

      function updatePeak(instDb, peakDb, side) {
        if (instDb > peakDb) {
          clearTimeout(STATE.peakTimeout[side]);
          STATE.peakTimeout[side] = setTimeout(() => {
            STATE.levels[side].peakDb = CONFIG.audio.minDb;
          }, CONFIG.audio.peakHoldMs);
          return instDb;
        }
        return peakDb - CONFIG.audio.peakDecayDbPerFrame;
      }

      function initAudioSystem() {
        try {
          if (
            typeof Stream !== "undefined" &&
            Stream?.Fallback?.Player?.Amplification &&
            Stream?.Fallback?.Audio
          ) {
            if (!STATE.audio.context) {
              STATE.audio.context = Stream.Fallback.Audio;
              STATE.audio.source = Stream.Fallback.Player.Amplification;
            }

            const ctx = STATE.audio.context;
            const src = STATE.audio.source;
            if (!ctx || !src) {
              throw new Error("Audio context or source missing");
            }

            // REAL STEREO ENGINE (Splitter + 2 Analyzers)
            STATE.audio.splitter = ctx.createChannelSplitter(2);

            STATE.audio.analyserLeft  = ctx.createAnalyser();
            STATE.audio.analyserRight = ctx.createAnalyser();

            STATE.audio.analyserLeft.fftSize  = 256;
            STATE.audio.analyserRight.fftSize = 256;

            STATE.audio.dataLeft = new Uint8Array(
              STATE.audio.analyserLeft.frequencyBinCount
            );
            STATE.audio.dataRight = new Uint8Array(
              STATE.audio.analyserRight.frequencyBinCount
            );

            // AUDIO PIPELINE
            // src → splitter → L/R analyzers
            src.connect(STATE.audio.splitter);
            STATE.audio.splitter.connect(STATE.audio.analyserLeft,  0);
            STATE.audio.splitter.connect(STATE.audio.analyserRight, 1);

            // MID / SIDE ENGINE (SAFE VERSION)
            // derived from splitter, NO ChannelMerger
            // Mid  = 0.5*(L + R)
            // Side = 0.5*(L - R)
            STATE.audio.analyserMid  = ctx.createAnalyser();
            STATE.audio.analyserSide = ctx.createAnalyser();

            STATE.audio.analyserMid.fftSize  = 256;
            STATE.audio.analyserSide.fftSize = 256;

            STATE.audio.dataMid = new Uint8Array(
              STATE.audio.analyserMid.frequencyBinCount
            );
            STATE.audio.dataSide = new Uint8Array(
              STATE.audio.analyserSide.frequencyBinCount
            );

            // Gains for Mid
            const gL_to_M = ctx.createGain();
            const gR_to_M = ctx.createGain();
            gL_to_M.gain.value = 0.5;
            gR_to_M.gain.value = 0.5;

            // Gains for Side
            const gL_to_S = ctx.createGain();
            const gR_to_S = ctx.createGain();
            gL_to_S.gain.value = 0.5;
            gR_to_S.gain.value = -0.5;

            // Routing from splitter
            STATE.audio.splitter.connect(gL_to_M, 0); // L
            STATE.audio.splitter.connect(gR_to_M, 1); // R
            STATE.audio.splitter.connect(gL_to_S, 0); // L
            STATE.audio.splitter.connect(gR_to_S, 1); // R (inverted)

            // Feed analysers directly (SAFE)
            gL_to_M.connect(STATE.audio.analyserMid);
            gR_to_M.connect(STATE.audio.analyserMid);

            gL_to_S.connect(STATE.audio.analyserSide);
            gR_to_S.connect(STATE.audio.analyserSide);

            // AUDIO PEAK (A) — independent mono branch
            // source → lowshelf → highpass → lowpass → analyserPeak
            STATE.audio.analyserPeak = ctx.createAnalyser();
            STATE.audio.analyserPeak.fftSize = CONFIG.audio.peakFftSize;

            STATE.audio.dataPeak = new Uint8Array(
              STATE.audio.analyserPeak.frequencyBinCount
            );

            STATE.audio.bassFilter = ctx.createBiquadFilter();
            STATE.audio.bassFilter.type = "lowshelf";
            STATE.audio.bassFilter.frequency.setValueAtTime(
              200, ctx.currentTime
            );
            STATE.audio.bassFilter.gain.setValueAtTime(
              CONFIG.audio.bassReduction, ctx.currentTime
            );

            STATE.audio.highPassFilter = ctx.createBiquadFilter();
            STATE.audio.highPassFilter.type = "highpass";
            STATE.audio.highPassFilter.frequency.setValueAtTime(
              CONFIG.audio.highPassCutoff, ctx.currentTime
            );

            STATE.audio.lowPassFilter = ctx.createBiquadFilter();
            STATE.audio.lowPassFilter.type = "lowpass";
            STATE.audio.lowPassFilter.frequency.setValueAtTime(
              CONFIG.audio.lowPassCutoff, ctx.currentTime
            );

            // Connect Audio Peak branch (does NOT affect splitter)
            src.connect(STATE.audio.bassFilter);
            STATE.audio.bassFilter.connect(STATE.audio.highPassFilter);
            STATE.audio.highPassFilter.connect(STATE.audio.lowPassFilter);
            STATE.audio.lowPassFilter.connect(STATE.audio.analyserPeak);

            if (AMX_DEBUG) {
              console.log(
                "%c[Stereo INIT] True stereo split engaged (L/R + safe Mid/Side).",
                "color: cyan; font-weight: bold;"
              );
            }

            startRendering();
          } else {
            setTimeout(initAudioSystem, 500);
          }
        } catch (e) {
          console.error("[AudioMetrix] initAudioSystem failed:", e);
          setTimeout(initAudioSystem, 1000);
        }
      }

      // RENDER LOOP HOOK
      function startRendering() {
        if (!STATE.dom.contentWrapper) return;
      
        // --- layout read (gated) ---
        readLayoutOnce();
      
        const w = STATE.layout.width;
        const barH = CONFIG.display.dimensions.barHeight;
        const gap  = CONFIG.display.dimensions.spacing;
      
        const safeWidth  = w && w > 40 ? w : 300;
        const safeHeight = barH * 2 + gap;
      
        // Do not decide active canvas/visibility here.
        // renderMeters() is the single authority for that.
        if (STATE.dom.canvasNormal) {
          resizeCanvasIfNeeded(
            STATE.dom.canvasNormal,
            safeWidth,
            safeHeight
          );
        }

        // ctx is set by renderMeters()
        renderMeters();
        requestAnimationFrame(updateMetersFrame);
      }

      // Resize canvas
      function forceResizeCanvas() {
        if (!STATE.dom.contentWrapper) return;
      
        // --- layout read ---
        readLayoutOnce();
      
        const w = STATE.layout.width;
        const safeW = w && w > 40 ? Math.floor(w) : 300;
      
        const barH = CONFIG.display.dimensions.barHeight;
        const gap  = CONFIG.display.dimensions.spacing;
        const baseH = barH * 2 + gap;
      
        // NORMAL canvas — force intrinsic reset
        if (STATE.dom.canvasNormal) {
          resizeCanvasIfNeeded(
            STATE.dom.canvasNormal,
            safeW,
            baseH
          );
        }
      
        // MIRRORED canvas — MUST also be reset, or it dies on rotate
        if (STATE.dom.canvasMirror) {
          resizeCanvasIfNeeded(
            STATE.dom.canvasMirror,
            safeW,
            baseH
          );
        }

        invalidateVisualCaches();
        requestRender();
      }

      // UPDATE METERS
      function updateMetersFrame() {
        try {
          // Wait for stereo
          if (!STATE.audio.analyserLeft || !STATE.audio.analyserRight) {
            requestAnimationFrame(updateMetersFrame);
            return;
          }
      
          // Adaptive audio cadence (single decision point)
          const runAudio = shouldRunAudio();
      
          if (runAudio) {

            // READ TRUE STEREO DATA (L / R)
            STATE.audio.analyserLeft.getByteFrequencyData(STATE.audio.dataLeft);
            STATE.audio.analyserRight.getByteFrequencyData(STATE.audio.dataRight);

            // READ MID / SIDE DATA
            if (STATE.audio.analyserMid && STATE.audio.dataMid) {
              STATE.audio.analyserMid.getByteFrequencyData(STATE.audio.dataMid);
            }
      
            if (STATE.audio.analyserSide && STATE.audio.dataSide) {
              STATE.audio.analyserSide.getByteFrequencyData(STATE.audio.dataSide);
            }

            // PROCESS LEFT / RIGHT SEPARATELY
            const L = processChannel(
              STATE.audio.dataLeft,
              STATE.levels.left.smoothDb
            );
            const R = processChannel(
              STATE.audio.dataRight,
              STATE.levels.right.smoothDb
            );
      
            STATE.levels.left.smoothDb = L.smoothDb;
            STATE.levels.right.smoothDb = R.smoothDb;

            // PEAKS (hold + decay)
            STATE.levels.left.peakDb = updatePeak(
              L.instantDb,
              STATE.levels.left.peakDb,
              "left"
            );
            STATE.levels.right.peakDb = updatePeak(
              R.instantDb,
              STATE.levels.right.peakDb,
              "right"
            );

            // AUDIO PEAK (A) — RMS BAR + PPM PEAK
            // Uses ONLY existing CONFIG.audio parameters
            if (STATE.audio.analyserPeak) {
      
              if (!STATE.audioPeak) {
                STATE.audioPeak = {
                  lastTs: 0,
                  bar: 0,
                  ppm: 0
                };
              }
      
              const now =
                (typeof performance !== "undefined" && performance.now)
                  ? performance.now()
                  : Date.now();
      
              const INTERVAL_MS = 75;
              const SILENCE_EPS = 0.015;
              const SCALE = 5.5; // visual calibration (same role as before)
      
              if (now - STATE.audioPeak.lastTs >= INTERVAL_MS) {
                STATE.audioPeak.lastTs = now;

                // Read TIME DOMAIN samples
                const buf = new Uint8Array(STATE.audio.analyserPeak.fftSize);
                STATE.audio.analyserPeak.getByteTimeDomainData(buf);

                // RMS + TRUE PEAK
                let sumSq = 0;
                let instPeak = 0;
      
                for (let i = 0; i < buf.length; i++) {
                  const v = (buf[i] - 128) / 128;
                  sumSq += v * v;
                  instPeak = Math.max(instPeak, Math.abs(v));
                }
      
                const rms = Math.sqrt(sumSq / buf.length);

                // RMS BAR (average energy)
                let targetBar = 0;
                if (rms > SILENCE_EPS) {
                  targetBar = Math.min(255, rms * 255 * SCALE);
                }
      
                // smooth bar (attack + release already agreed)
                if (targetBar > STATE.audioPeak.bar) {
                  STATE.audioPeak.bar +=
                    (targetBar - STATE.audioPeak.bar) * CONFIG.audio.attackSpeed;
                } else {
                  STATE.audioPeak.bar *= CONFIG.audio.releaseSpeed;
                }
      
                STATE.levels.audio.smooth = STATE.audioPeak.bar;

                // PPM PEAK (ballistic, no hold timeout)
                const targetPeak = Math.min(255, instPeak * 255 * SCALE);

                if (targetPeak > STATE.audioPeak.ppm) {
                  // PPM attack
                  STATE.audioPeak.ppm +=
                    (targetPeak - STATE.audioPeak.ppm) * CONFIG.audio.attackSpeed;
                } else {
                  // PPM release — linear fall toward target
                  STATE.audioPeak.ppm +=
                    (targetPeak - STATE.audioPeak.ppm) * CONFIG.audio.releaseSpeed;
                }
                
                STATE.levels.audio.peak = STATE.audioPeak.ppm;
                
              }
            }

            // STEREO QUALITY (Q) — calibrated + gated + richer debug
            if (STATE.audio.dataMid && STATE.audio.dataSide) {
      
              const midArr  = STATE.audio.dataMid;
              const sideArr = STATE.audio.dataSide;
              const len = midArr.length || 1;
      
              let sumMid = 0;
              let sumSide = 0;
      
              for (let i = 0; i < len; i++) {
                const m = midArr[i] / 255;
                const s = sideArr[i] / 255;
                sumMid  += m * m;
                sumSide += s * s;
              }
      
              const rmsMid  = Math.sqrt(sumMid  / len);
              const rmsSide = Math.sqrt(sumSide / len);
      
              const pMid  = rmsMid  * rmsMid;
              const pSide = rmsSide * rmsSide;
              const pTot  = pMid + pSide;

              // GATES (anti-noise / anti-silence / anti-collapse)

              // 1) Total energy gate (silence)
              const POWER_GATE = 0.0030;
              // 2) Mid must exist (avoid "side dominates when mid ~ 0")
              const MID_GATE   = 0.0012;
      
              // 3) Optional: side should not be almost equal to total in noise
              // (keeps absurd ratios from random correlation artifacts)
              const MAX_RATIO_HARD = 0.85;
      
              let stereoRatio = 0;
              let qInstant = 0;
      
              if (pTot > POWER_GATE && pMid > MID_GATE) {
      
                stereoRatio = pSide / (pTot + 1e-9);
                stereoRatio = Math.max(0, Math.min(MAX_RATIO_HARD, stereoRatio));

                // MAPPING: 0.40→75%, 0.50→100%, 0.60→120%
                // with smooth piecewise segments
                const mapStereoRatioToQ = (r) => {
      
                  // Noise / mono collapse
                  if (r <= 0.05) {
                    return (r / 0.05) * 5;              // 0 .. 5 %
                  }
      
                  // Very weak stereo
                  if (r <= 0.10) {
                    return 5 + ((r - 0.05) / 0.05) * 10; // 5 .. 15 %
                  }
      
                  // Weak stereo
                  if (r <= 0.20) {
                    return 15 + ((r - 0.10) / 0.10) * 20; // 15 .. 35 %
                  }
      
                  // Moderate / acceptable stereo
                  if (r <= 0.30) {
                    return 35 + ((r - 0.20) / 0.10) * 25; // 35 .. 60 %
                  }
      
                  // Good stereo
                  if (r <= 0.40) {
                    return 60 + ((r - 0.30) / 0.10) * 25; // 60 .. 85 %
                  }
      
                  // Very good stereo
                  if (r <= 0.50) {
                    return 85 + ((r - 0.40) / 0.10) * 15; // 85 .. 100 %
                  }
      
                  // Wide / exaggerated stereo
                  if (r <= 0.60) {
                    return 100 + ((r - 0.50) / 0.10) * 20; // 100 .. 120 %
                  }
      
                  // Clamp
                  return 120;
                };
      
                qInstant = mapStereoRatioToQ(stereoRatio);
              } else {
                // If gated out, we treat as no reliable stereo quality
                qInstant = 0;
              }

              // SMOOTHING
              const prev = STATE.levels.stereoQuality.smooth;
              const atk  = CONFIG.audio.attackSpeed;
              const rel  = CONFIG.audio.releaseSpeed;
      
              const qSmooth =
                qInstant > prev
                  ? prev + (qInstant - prev) * atk
                  : prev + (qInstant - prev) * rel;
      
              STATE.levels.stereoQuality.instant = qInstant;
              STATE.levels.stereoQuality.smooth  = qSmooth;

              // DEBUG (richer)
              if (AMX_DEBUG) {
                const gated = !(pTot > POWER_GATE && pMid > MID_GATE);
                console.log(
                  `[SQ] gated=${gated ? 1 : 0}` +
                  ` pTot=${pTot.toFixed(4)}` +
                  ` pMid=${pMid.toFixed(4)}` +
                  ` pSide=${pSide.toFixed(4)}` +
                  ` ratio=${stereoRatio.toFixed(3)}` +
                  ` Qinst=${qInstant.toFixed(1)}%` +
                  ` Q=${qSmooth.toFixed(1)}%`
                );
              }
            }

            // ADAPTIVE INTERVAL UPDATE (cheap)
            {
              const c = STATE.audioCadence;
      
              // Activity proxy (no extra audio reads):
              // - stronger LR instant levels
              // - audio bar (A)
              // - stereo quality (Q)
              const minDb = CONFIG.audio.minDb;
      
              const lDb = (typeof L.instantDb === "number") ? L.instantDb : minDb;
              const rDb = (typeof R.instantDb === "number") ? R.instantDb : minDb;
      
              const lAct = Math.max(0, lDb - (minDb + 0.5)); // 0..~range
              const rAct = Math.max(0, rDb - (minDb + 0.5));
      
              const aRaw = (STATE.levels?.audio && typeof STATE.levels.audio.smooth === "number")
                ? STATE.levels.audio.smooth
                : 0;
              const qRaw = (STATE.levels?.stereoQuality && typeof STATE.levels.stereoQuality.smooth === "number")
                ? STATE.levels.stereoQuality.smooth
                : 0;
      
              // Normalize into a single scalar
              const energy =
                (Math.min(1, Math.max(lAct, rAct) / 40) * 0.60) +   // LR activity
                (Math.min(1, Math.max(0, Math.min(255, aRaw)) / 255) * 0.25) + // A
                (Math.min(1, Math.max(0, Math.min(120, qRaw)) / 120) * 0.15);  // Q
      
              const delta = Math.abs(energy - (c.lastEnergy || 0));
              c.lastEnergy = energy;
      
              // Decision:
              // - big change => run often
              // - high energy => run often
              // - silence/stable => run less often
              let next = 2;
      
              if (delta > 0.10 || energy > 0.55) {
                next = 1; // 60Hz
              } else if (delta > 0.05 || energy > 0.30) {
                next = 2; // 30Hz
              } else if (delta > 0.02 || energy > 0.12) {
                next = 3; // 20Hz
              } else {
                next = 4; // 15Hz
              }
      
              // Clamp to configured bounds
              next = Math.max(c.min || 1, Math.min(c.max || 4, next));
              c.interval = next;
            }
            requestRender();
          }

          // FRAME THROTTLING
          const __now = performance.now();
          if (__now - _lastRenderTime < FRAME_INTERVAL) {
            requestAnimationFrame(updateMetersFrame);
            return;
          }
          _lastRenderTime = __now;

          const Ls = STATE.levels.left.smoothDb;
          const Rs = STATE.levels.right.smoothDb;
          const Qs = STATE.levels.stereoQuality.smooth;
          const As = STATE.levels.audio.smooth;
          
          const EPS_DB = 0.05;
          const EPS_PCT = 0.5;
          
          const dirtyValues =
            _lastDrawn.L === null ||
            Math.abs(Ls - _lastDrawn.L) > EPS_DB ||
            Math.abs(Rs - _lastDrawn.R) > EPS_DB ||
            Math.abs(Qs - _lastDrawn.Q) > EPS_PCT ||
            Math.abs(As - _lastDrawn.A) > EPS_PCT;
          
          if (!dirtyValues) {
            RENDER_GATE.dirty = false;
          } else {
            _lastDrawn.L = Ls;
            _lastDrawn.R = Rs;
            _lastDrawn.Q = Qs;
            _lastDrawn.A = As;
          }

          // DRAW EVERYTHING (GATED)
          if (RENDER_GATE.dirty) {
            renderMeters();
            RENDER_GATE.dirty = false;
          }

          // READOUTS — REAL-TIME UPDATE (THROTTLED)
          _readoutFrame++;
          if (_readoutFrame >= READOUT_FRAME_SKIP) {
            _readoutFrame = 0;
      
            if (CONFIG.display.showReadouts && STATE.dom.readouts) {
      
              const layout = CONFIG.display.layoutMode;
              const minDb = CONFIG.audio.minDb;
      
              const lNow = getCurrentReadout("L");
              const rNow = getCurrentReadout("R");
              const aRaw = (STATE.levels?.audio && typeof STATE.levels.audio.smooth === "number")
                ? STATE.levels.audio.smooth
                : 0;
              const qRaw = (STATE.levels?.stereoQuality && typeof STATE.levels.stereoQuality.smooth === "number")
                ? STATE.levels.stereoQuality.smooth
                : 0;
      
              const active =
                (lNow !== null && lNow > minDb + 0.5) ||
                (rNow !== null && rNow > minDb + 0.5) ||
                (aRaw > 1) ||
                (qRaw > 0.5);

              // LR — Stereo Levels
              if (layout === "lr") {
                const l = lNow;
                const r = rNow;
      
                STATE.dom.readouts.L.textContent =
                  (l !== null && l > minDb + 0.5) ? `${l.toFixed(1)} dB` : "";
      
                STATE.dom.readouts.R.textContent =
                  (r !== null && r > minDb + 0.5) ? `${r.toFixed(1)} dB` : "";
              }

              // SA — Stereo Quality / Audio Peak
              else if (layout === "sa") {
      
                if (!active) {
                  STATE.dom.readouts.Q.textContent = "";
                  STATE.dom.readouts.A.textContent = "";
                } else {
                  const q = getCurrentReadout("Q");
      
                  // Q
                  STATE.dom.readouts.Q.textContent =
                    (q !== null && q > 0.5) ? `${q.toFixed(0)} %` : "";
      
                  // A
                  const aClamped = Math.max(0, Math.min(255, aRaw));
                  const aPct = (aClamped / 255) * 100;
      
                  STATE.dom.readouts.A.textContent =
                    (aRaw > 1) ? `${Math.round(aPct)} %` : "";
                }
              }

              // FULL — L / R / Q / A
              else if (layout === "full") {
      
                if (!active) {
                  STATE.dom.readouts.L.textContent = "";
                  STATE.dom.readouts.R.textContent = "";
                  STATE.dom.readouts.Q.textContent = "";
                  STATE.dom.readouts.A.textContent = "";
                } else {
                  const l = lNow;
                  const r = rNow;
                  const q = getCurrentReadout("Q");
      
                  STATE.dom.readouts.L.textContent =
                    (l !== null && l > minDb + 0.5) ? `${l.toFixed(1)} dB` : "";
      
                  STATE.dom.readouts.R.textContent =
                    (r !== null && r > minDb + 0.5) ? `${r.toFixed(1)} dB` : "";
      
                  STATE.dom.readouts.Q.textContent =
                    (q !== null && q > 0.5) ? `${q.toFixed(0)} %` : "";
      
                  const aClamped = Math.max(0, Math.min(255, aRaw));
                  const aPct = (aClamped / 255) * 100;
      
                  STATE.dom.readouts.A.textContent =
                    (aRaw > 1) ? `${Math.round(aPct)} %` : "";
                }
              }
            }
          }
      
        } catch (e) {
          console.error("[AudioMetrix] updateMetersFrame failed:", e);
        }
        requestAnimationFrame(updateMetersFrame);
      }

      // AUTO REBIND WHEN FM-DX RECREATES AUDIO NODES
      let last = null;
      setInterval(() => {
        try {
          if (
            typeof Stream !== "undefined" &&
            Stream?.Fallback?.Player?.Amplification &&
            Stream?.Fallback?.Audio
          ) {
            const node = Stream.Fallback.Player.Amplification;
            if (node !== last) {
              last = node;
              resetAudioState();
              initAudioSystem();
            }
          }
        } catch (e) {}
      }, 1000);

      // Start system
      initAudioSystem();
    } catch (e) {
      console.error("[AudioMetrix] DOMContentLoaded init failed:", e);
    }
  });
})(); //END