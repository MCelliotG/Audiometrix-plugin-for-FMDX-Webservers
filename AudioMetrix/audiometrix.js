/*
 * AudioMetrix v5.1
 * FM-DX Webserver audio metering / visualization plugin
 *
 * v5.1 highlights:
 * - Phase 2 core audit and lifecycle cleanup
 * - Float32 RMS / sample-peak precision
 * - MAX L/R + CLIP admin diagnostics
 * - Optimized EQ / Hybrid analysis cadence with smooth 60 Hz visuals
 * - RMS+PEAK naming for Audio (A) meter
 * - Stereo Oscilloscope with Lines, Filled, Dots, Steps,
 *   Persistence, Carrier / Envelope and Spindle visual styles
 */

(() => {
  // ─────────────────────────────────────────────────────────
  // AUDIO METRIX 5.1.0 — RELEASE
  // THEME ENGINE • SETTINGS UI • RENDER ENGINE • AUDIO ENGINE
  // ─────────────────────────────────────────────────────────

  // PLUGIN METADATA
  const AMX_PLUGIN_NAME        = "AudioMetrix";
  const AMX_VERSION            = "5.1";
  const AMX_CHECK_FOR_UPDATES  = true;
  const AMX_UPDATE_URL         =
    "https://raw.githubusercontent.com/MCelliotG/Audiometrix-plugin-for-FMDX-Webservers/main/AudioMetrix/audiometrix.js";
  const AMX_HOMEPAGE_URL       =
    "https://github.com/MCelliotG/Audiometrix-plugin-for-FMDX-Webservers";

  // Generic plugin metadata for /setup updater (FM-DX Webserver convention)
  const pluginVersion         = AMX_VERSION;
  const pluginName            = AMX_PLUGIN_NAME;
  const pluginHomepageUrl     = AMX_HOMEPAGE_URL;
  const pluginUpdateUrl       = AMX_UPDATE_URL;
  const pluginSetupOnlyNotify = false;
  const CHECK_FOR_UPDATES     = AMX_CHECK_FOR_UPDATES;

  // GLOBAL HARDENED CONSTANTS
  const VALID_THEMES = [
    "automatic", "aegean", "aurora", "emerald", "escapade", "galactica", "goldenbrown", "heatmap",
    "iceblue", "neonlights", "pastel", "prism", "redvelvet", "retrospect", "scarlet",
    "secretgarden", "solar", "spaceship", "wicked", "valentines", "vesper", "vintage"
  ];

  const VALID_STYLES = [
    "simple", "segment", "circledots", "matrixdots", "pillars", "beveled3d", "glasstube"
  ];

  const GRADIENT_CACHE = {
    mode: null,
    width: 0,
    colors: [],
    stops: [],
    peakThresholdX: -1,
    hash: ""
  };

  const GRADIENT_CACHE_MAP = new Map();
  const FRAME_GRADIENT_CACHE = new Map();

  const GRADIENT_TEMP = {
    canvas: document.createElement("canvas"),
    ctx: null
  };
  GRADIENT_TEMP.ctx = GRADIENT_TEMP.canvas.getContext("2d");

  const GEOMETRY_CACHE = {
    segment: new Map(),
    pixelfill: new Map(),
    circledots: new Map(),
    matrixdots: new Map(),
    matrixCount: new Map()
  };

  const PERCENT_SCALE_PAD = {left: 5, right: 55};

  const FRAME_INTERVAL = 1000 / 30;
  let _lastRenderTime = 0;
  let _lastDrawn = {
    L: null,
    R: null,
    Q: null,
    A: null,
    EQ: null,
    Scope: null,
    Stream: null
  };

  const STEREO_Q_MAX = 120;
  const STEREO_Q_SIGNAL_RATIO = 0.74;

  function invalidateVisualCaches() {
    // Gradient cache
    GRADIENT_CACHE.mode = null;
    GRADIENT_CACHE.width = 0;
    GRADIENT_CACHE.colors = [];
    GRADIENT_CACHE.stops = [];
    GRADIENT_CACHE.peakThresholdX = -1;
    GRADIENT_CACHE.hash = "";
    if (GRADIENT_CACHE_MAP.size) {
      GRADIENT_CACHE_MAP.clear();
    }

    // Pillars geometry
    STATE.cache.pillar.path = null;
    STATE.cache.pillar.W = 0;
    STATE.cache.pillar.y = 0;
    STATE.cache.pillar.height = 0;
  }

  function clearTransientRenderState() {
    if (!STATE.render) return;
    STATE.render.barPeak = {};
    STATE.render.gaugePeak = {};
    STATE.render.analogVuPeak = {};
    STATE.render.canvasReadouts = {};
  }

  const STORAGE_ENABLE        = "amx_enabled_state";
  const STORAGE_THEME         = "AMX_THEME";
  const STORAGE_AUTO_PALETTE  = "AMX_AUTO_THEME_PALETTE";
  const STORAGE_GLOW_ENABLED  = "AMX_GLOW_ENABLED";
  const STORAGE_SHOW_PEAKS    = "AMX_SHOW_PEAKS";
  const STORAGE_SHOW_READOUTS = "AMX_SHOW_READOUTS";
  const STORAGE_BARSTYLE      = "AMX_BAR_STYLE";
  const STORAGE_GAIN          = "AMX_GAIN";
  const STORAGE_LAYOUT        = "AMX_LAYOUT_MODE";
  const STORAGE_RENDER        = "AMX_RENDER_MODE";
  const STORAGE_HYBRID_MODE   = "AMX_HYBRID_MODE";
  const STORAGE_EQ_RENDER     = "AMX_EQ_RENDER_MODE";
  const STORAGE_SCOPE_STYLE   = "AMX_OSCILLOSCOPE_STYLE";
  const STORAGE_ATTACK        = "AMX_ATTACK_SPEED";
  const STORAGE_RELEASE       = "AMX_RELEASE_SPEED";
  const STORAGE_PEAK_HOLD     = "AMX_PEAK_HOLD_MS";
  const STORAGE_PANEL_LEFT    = "AMX_PANEL_LEFT";
  const STORAGE_PANEL_TOP     = "AMX_PANEL_TOP";
  const STORAGE_PANEL_WIDTH   = "AMX_PANEL_WIDTH";
  const STORAGE_PANEL_HEIGHT  = "AMX_PANEL_HEIGHT";
  const STORAGE_DIAGNOSTICS   = "AMX_ADMIN_DIAGNOSTICS";

  const AMX_RUNTIME = {
    destroyed: false,
    pageVisible: document.visibilityState !== "hidden",
    autoRebindTimer: null,
    autoRebindState: "startup",
    autoRebindLastCheck: 0,
    diagnosticsTimer: null,
    diagnosticsEl: null,
    visibilityHandler: null,
    themeObserver: null,
    skinObserver: null,
    skinObserverRaf: 0,
    contentResizeObserver: null,
    barsResizeRaf: null,
    windowHandlers: [],
    pendingTimeouts: new Set(),
    initRetryTimer: null
  };
  const MIRRORED_LAYOUTS = ["lr", "sa", "full"];
  const EQ_CENTER_FREQUENCIES = [
    30, 50, 80, 125, 200, 315, 500, 800,
    1250, 2000, 3150, 5000, 8000, 12000, 16000, 20000
  ];
  const EQ_BAND_LABELS = [
    "30", "50", "80", "125", "200", "315", "500", "800",
    "1.25K", "2K", "3.15K", "5K", "8K", "12K", "16K", "20K"
  ];
  const EQ_PREAMP_GAINS = [
    0.95, 0.95, 0.95, 0.95, 0.92, 0.92, 0.96, 1.0,
    1.02, 1.04, 1.06, 1.10, 1.14, 1.18, 1.22, 1.25
  ];
  const EQ_FLOOR_LEVELS = [
    5, 5, 5, 5, 4, 4, 4, 4,
    4, 4, 4, 4, 5, 5, 5, 6
  ];
  const EQ_SENSITIVITY = 0.8;
  const EQ_HYSTERESIS = 0.006;

  // Raw sample-peak monitoring. This is deliberately independent from
  // meter smoothing, user dB gain and visual calibration.
  const SAMPLE_CLIP_THRESHOLD = 0.985; // ≈ -0.13 dBFS
  const SAMPLE_CLIP_HOLD_MS = 1500;
  const EQ_LABEL_ANCHORS = [
    { index: 0, text: "30" },
    { index: 3, text: "125" },
    { index: 7, text: "800" },
    { index: 11, text: "5K" },
    { index: 15, text: "20K" }
  ];
  const EQ_BAND_COUNT = EQ_BAND_LABELS.length;
  const HYBRID_STEREO_12_FREQUENCIES = [
    30, 50, 80, 125, 200, 315, 500, 800,
    1250, 3150, 8000, 16000
  ];
  const HYBRID_AUDIO_10_FREQUENCIES = [
    30, 63, 125, 250, 500,
    1000, 2000, 4000, 8000, 16000
  ];
  const HYBRID_MODES = [
    "stereo12",
    "audio10"
  ];

  // Fixed gauge geometry. One source of truth for both canvas gauges and DOM labels.
  // Lower values tighten the group symmetrically around the tile centre.
  const GAUGE_GAP_SCALE = 0.90;

  function getGaugeGeometry(layout) {
    const gaugeCount = (layout === "lr" || layout === "sa") ? 2 : (layout === "full" ? 4 : 0);
    if (!gaugeCount) {
      return { gaugeCount: 0, centers: [], numericLabels: [] };
    }

    const cellFraction = 1 / gaugeCount;
    const centers = Array.from({ length: gaugeCount }, (_, i) =>
      0.5 + (i - (gaugeCount - 1) / 2) * cellFraction * GAUGE_GAP_SCALE
    );

    // Numeric scale positions are stored as local offsets from each gauge centre.
    // This preserves the original arc-label shape while allowing the complete
    // gauge UI to follow GAUGE_GAP_SCALE as one unified geometry system.
    const numericLabels = gaugeCount === 2 ? [
      {
        start: { x: centers[0] - 0.15, y: 0.80, align: "right" },
        mid:   { x: centers[0] - 0.12, y: 0.15, align: "right" },
        high:  { x: centers[0] + 0.12, y: 0.15, align: "left" },
        end:   { x: centers[0] + 0.15, y: 0.80, align: "left" }
      },
      {
        start: { x: centers[1] - 0.15, y: 0.80, align: "right" },
        mid:   { x: centers[1] - 0.12, y: 0.15, align: "right" },
        high:  { x: centers[1] + 0.12, y: 0.15, align: "left" },
        end:   { x: centers[1] + 0.15, y: 0.80, align: "left" }
      }
    ] : [];

    return { gaugeCount, centers, numericLabels };
  }

  function getGaugeCenterFractions(layout) {
    return getGaugeGeometry(layout).centers;
  }

  function getGaugeHorizontalInset(layout) {
    // Full Gauges uses the nearly edge-to-edge canvas introduced for
    // 305px mobile clearance. Two-gauge layouts retain the original inset.
    return layout === "full" ? 1 : 5;
  }

  function syncGaugeOverlayGeometry(layout) {
    const overlay = STATE.dom.gaugeOverlay;
    if (!overlay) return;

    const inset = getGaugeHorizontalInset(layout);
    overlay.style.left = inset + "px";
    overlay.style.right = inset + "px";
  }

  function applyGaugeNumericGeometry(layout) {
    const geometry = getGaugeGeometry(layout);
    const groups = [STATE.dom.gaugeNumsLeft, STATE.dom.gaugeNumsRight];

    groups.forEach((group, index) => {
      const positions = geometry.numericLabels[index];
      if (!group || !positions) return;

      ["start", "mid", "high", "end"].forEach(key => {
        const el = group[key];
        const pos = positions[key];
        if (!el || !pos) return;

        el.style.left = `${pos.x * 100}%`;
        el.style.top  = `${pos.y * 100}%`;

        // Anchor the text toward the gauge arc. Left-side numerics end at
        // their geometry point; right-side numerics begin at theirs.
        if (pos.align === "right") {
          el.style.transform = "translate(-100%, -50%)";
          el.style.textAlign = "right";
        } else if (pos.align === "left") {
          el.style.transform = "translate(0, -50%)";
          el.style.textAlign = "left";
        } else {
          el.style.transform = "translate(-50%, -50%)";
          el.style.textAlign = "center";
        }
      });
    });
  }
  const AMX_DEBUG             = false;

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

  function loadLSFloat(key, def, min = null, max = null) {
    const raw = safeLSGet(key);
    const v = parseFloat(raw);
    if (isNaN(v)) return def;
    let x = v;
    if (min !== null) x = Math.max(min, x);
    if (max !== null) x = Math.min(max, x);
    return x;
  }

  function loadLSInt(key, def, min = null, max = null) {
    const raw = safeLSGet(key);
    const v = parseInt(raw, 10);
    if (isNaN(v)) return def;
    let x = v;
    if (min !== null) x = Math.max(min, x);
    if (max !== null) x = Math.min(max, x);
    return x;
  }

  function loadLSBool(key, def) {
    const raw = safeLSGet(key);
    if (raw === null) return def;
    return raw === "true";
  }

  function loadLSEnum(key, def, allowed) {
    const raw = safeLSGet(key);
    if (!raw) return def;
    return allowed.includes(raw) ? raw : def;
  }

  function applyAMXUpdateBanner() {
    if (!STATE || !STATE.dom || !STATE.dom.updateBanner) return;
  
    const banner = STATE.dom.updateBanner;
    const m = STATE.meta || {};
  
    if (m.updateAvailable && m.remoteVersion) {
      banner.textContent = `Update available: v${m.remoteVersion}`;
      banner.style.display = "block";
      banner.style.cursor = "pointer";
      banner.title = "Open update URL on GitHub";
      banner.onclick = () => window.open(AMX_HOMEPAGE_URL, "_blank", "noopener");
      banner.onmouseenter = () => banner.style.opacity = "0.85";
      banner.onmouseleave = () => banner.style.opacity = "1";
    } else {
      banner.style.display = "none";
      banner.style.cursor = "";
      banner.title = "";
      banner.onclick = null;
    }
  }

  // SETUP UPDATE CHECK
  function runAMXSetupUpdateCheck() {
    if (!CHECK_FOR_UPDATES) return;
    if (pluginSetupOnlyNotify && window.location.pathname !== "/setup") return;
    if (typeof fetch !== "function") return;
  
    const pluginVersionCheck = pluginVersion;
  
    function compareVersions(a, b) {
      const pa = String(a).trim().split(".").map(n => parseInt(n, 10) || 0);
      const pb = String(b).trim().split(".").map(n => parseInt(n, 10) || 0);
      const len = Math.max(pa.length, pb.length);
  
      for (let i = 0; i < len; i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
      }
      return 0;
    }
  
    function fetchRemoteVersion() {
      const urlCheckForUpdate =
        pluginUpdateUrl +
        (pluginUpdateUrl.includes("?") ? "&" : "?") +
        "_=" + Date.now();
  
      return fetch(urlCheckForUpdate, { cache: "no-store" })
        .then(resp => {
          if (!resp || !resp.ok) return null;
          return resp.text();
        })
        .then(text => {
          if (!text) return "Unknown";
  
          const match = text.match(
            /const\s+(?:pluginVersion|plugin_version|PLUGIN_VERSION|AMX_VERSION)\s*=\s*["']([^"']+)["']/
          );
  
          return match && match[1] ? match[1].trim() : "Unknown";
        })
        .catch(err => {
          console.warn("[AudioMetrix] Error fetching remote version:", err);
          return null;
        });
    }
  
    function notifySetup(pluginVersionCheck, newVersion) {
      if (window.location.pathname !== "/setup") return;
  
      const pluginSettings = document.getElementById("plugin-settings");
      if (pluginSettings) {
        const currentText = pluginSettings.textContent.trim();
        const linkHtml =
          `<a href="${pluginHomepageUrl}" target="_blank">` +
          `[${pluginName}] Update available: ${pluginVersionCheck} → ${newVersion}` +
          `</a>`;
  
        if (currentText === "No plugin settings are available.") {
          pluginSettings.innerHTML = linkHtml;
        } else {
          const existingHtml = pluginSettings.innerHTML.replace(/(?:<br>\s*)+$/i, "");
          pluginSettings.innerHTML = existingHtml + "<br>" + linkHtml;
        }
      }
  
      const pluginLabel = document.querySelector('label[for="enable-plugin-audiometrix"]');
      if (pluginLabel && !document.getElementById("plugin-update-audiometrix")) {
        const note = document.createElement("span");
        note.id = "plugin-update-audiometrix";
        note.style.color = "red";
        note.style.marginLeft = "6px";
        note.textContent = "● update";
        pluginLabel.appendChild(note);
      }
    }
  
    fetchRemoteVersion().then(newVersion => {
      if (!newVersion) return;
      if (typeof newVersion !== "string") return;
  
      const remoteVersion = newVersion.trim();
      if (!remoteVersion || remoteVersion.toLowerCase() === "unknown") return;
  
      const cmp = compareVersions(remoteVersion, pluginVersionCheck);
  
      if (cmp <= 0) {
        STATE.meta.updateAvailable = false;
        STATE.meta.remoteVersion = null;
        applyAMXUpdateBanner();
  
        if (AMX_DEBUG) {
          console.log(`[AudioMetrix] Setup up-to-date (${pluginVersionCheck})`);
        }
        return;
      }
  
      STATE.meta.updateAvailable = true;
      STATE.meta.remoteVersion = remoteVersion;
      applyAMXUpdateBanner();
  
      console.log(
        `[AudioMetrix] Setup update available: ${pluginVersionCheck} → ${remoteVersion}`
      );
      notifySetup(pluginVersionCheck, remoteVersion);
    }).catch(err => {
      console.warn("[AudioMetrix] Error checking setup update:", err);
    });
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
      const gRaw = safeLSGet(STORAGE_GAIN);
      const g = parseInt(gRaw, 10);
      if (isNaN(g) || g < -15 || g > 15) {
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

  // External peak — unified PLAY/floor visibility across all render modes
  function drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW, gauge, barPeakWidth, barPeakStep) {
    // GLOBAL TOGGLE
    if (!CONFIG.display.showPeaks) return;

    // STATE INIT (separate for bars / gauges)
    if (!STATE.render) STATE.render = {};

    const tf = (typeof ctx.getTransform === "function")
      ? ctx.getTransform() : null;

    const tx = tf ? Math.round(tf.e) : 0;
    const ty = tf ? Math.round(tf.f) : 0;

    const bucket = gauge
      ? (STATE.render.gaugePeak ??= {})
      : (STATE.render.barPeak ??= {});

    const stateKey = gauge
      ? `g:${tx}:${ty}:${Math.round((gauge.cx || 0) * 10)}:${Math.round((gauge.cy || 0) * 10)}:${Math.round((gauge.r || 0) * 10)}:${Math.round((gauge.startAngle || 0) * 1000)}:${Math.round((gauge.sweepAngle || 0) * 1000)}`
      : `b:${tx}:${ty}:${Math.round(y)}:${Math.round(effectiveW)}`;

    // Visual-floor state is NOT a hide condition while transport is playing.
    // Peak indicators must remain visible and settle at the beginning/bottom
    // of their scale even when both live and held values reach 0 / min dB.
    const atVisualFloor = gauge
      ? (
          Math.abs(gauge.normLevel || 0) <= 0.001 &&
          Math.abs(gauge.peakNorm || 0) <= 0.001
        )
      : (
          Math.abs(levelX || 0) <= 0.5 &&
          Math.abs(peakX || 0) <= 0.5
        );

    // Same visibility rule as readouts
    const hasStreamObject = STATE.hasStreamObject === true;

    if (!hasStreamObject) {
      delete bucket[stateKey];
      return;
    }

    const peakState = (bucket[stateKey] ??= {});

    if (typeof peakState.pos !== "number") {
      peakState.pos = gauge ? gauge.startAngle : peakX;
    }
    if (typeof peakState.vel !== "number") {
      peakState.vel = 0;
    }
    if (typeof peakState.lastPeak !== "number") {
      peakState.lastPeak = gauge ? gauge.startAngle : peakX;
    }

    // DOMAIN SETUP
    let base, min, max, target;

    if (!gauge) {
      // BAR DOMAIN
      const BAR_EDGE_INSET = 5;
      const PEAK_THROW_PX = 8;

      const barW = Math.max(0, effectiveW - BAR_EDGE_INSET);
      const fillX = Math.max(0, Math.min(levelX, barW));
      const peakBarX = Math.max(0, Math.min(peakX, barW));

      base = atVisualFloor
        ? 0
        : Math.min(barW - 2, fillX + 1);
      min  = base;
      max  = barW + PEAK_THROW_PX;

      // Throw outward only on a true new peak rise.
      // Held peak values should NOT keep the indicator stuck away from the bar.
      const isNewPeak = peakBarX > (peakState.lastPeak + 0.5);

      target = isNewPeak
        ? Math.min(max, peakBarX + PEAK_THROW_PX)
        : base;

      peakState.lastPeak = peakBarX;

    } else {
      // GAUGE DOMAIN
      const fillAngle =
        gauge.startAngle + gauge.normLevel * gauge.sweepAngle;

      const angleEps = gauge.sweepAngle * 0.015;
      base = atVisualFloor
        ? gauge.startAngle
        : Math.min(
            gauge.startAngle + gauge.sweepAngle,
            fillAngle + angleEps
          );

      min = base;
      max = gauge.startAngle + gauge.sweepAngle;

      const pn =
        typeof gauge.peakNorm === "number"
          ? gauge.peakNorm
          : gauge.normLevel;

      const peakAngle =
        gauge.startAngle + pn * gauge.sweepAngle;

      const isNewPeak =
        peakAngle > (peakState.lastPeak + gauge.sweepAngle * 0.0025);

      const throwAngle = Math.min(
        gauge.sweepAngle * 0.08,
        8 / Math.max(1, gauge.r)
      );

      // Exact bar behaviour in arc space: the held peak is the trigger for a
      // new outward throw, but the marker then returns to the live fill edge
      // instead of parking at the held value.
      target = isNewPeak
        ? Math.min(max, peakAngle + throwAngle)
        : base;
      peakState.lastPeak = peakAngle;
    }

    // PHYSICS (strong throw / faster soft return)
    const RETURN = 0.28;
    const DAMPING = 0.78;

    const delta = target - peakState.pos;

    if (delta > 0) {
      // Snap outward immediately on new peak
      peakState.pos = Math.min(max, target);
      peakState.vel = 0;
    } else {
      // Return quickly but smoothly toward the active target. For bars the
      // target is their current edge; for gauges it can remain at the held
      // peak, preventing frame-by-frame snap-back flicker on the arc.
      peakState.vel += (target - peakState.pos) * RETURN;
      peakState.vel *= DAMPING;
      peakState.pos += peakState.vel;
    }

    const p = Math.max(min, Math.min(max, peakState.pos));

    // DRAW
    ctx.save();
    ctx.fillStyle = ACTIVE_THEME.colors.peak;

    if (!gauge) {
      // BAR DRAW
      const peakW = Math.max(3, Math.round(barPeakWidth || 3));

      let drawX = Math.round(p);

      // Optional horizontal snap to bar grid (used by renderSegment)
      if (barPeakStep && barPeakStep > 0) {
        drawX = Math.round(drawX / barPeakStep) * barPeakStep;
      }

      ctx.fillRect(drawX, y, peakW, height);

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
  function buildBarsGradient(mode, width) {

    // 1) Theme colors
    const col  = ACTIVE_THEME.colors;
    const low  = col.low;
    const mid  = col.mid;
    const high = col.high;

    const RED_ZONE_COLOR    = "#ff0000"; // audio peak
    const YELLOW_ZONE_COLOR = "#ffd400"; // stereo quality

    // 2) Threshold selector
    const THR = (mode === 2) ? 0.82 : 0.58;

    const t   = THR;
    const t1  = t - 0.001;
    const t2  = t + 0.001;

    const mid_pos  = 0.40 * t;
    const high_pos = 0.80 * t;
    const THR_px   = Math.floor(width * THR);

    // 3) Cache signature
    const hash = `${mode}|${width}|${low}|${mid}|${high}|${RED_ZONE_COLOR}|${YELLOW_ZONE_COLOR}|${THR}`;

    let cache = GRADIENT_CACHE_MAP.get(hash);
    if (cache) {
      return cache;
    }

    cache = {
      mode: mode,
      width: width,
      colors: new Array(width),
      stops: [],
      peakThresholdX: THR_px,
      hash: hash
    };

    // 5) Reused temp canvas
    const tempCanvas = GRADIENT_TEMP.canvas;
    const tctx = GRADIENT_TEMP.ctx;

    if (tempCanvas.width !== width) {
      tempCanvas.width = width;
    }
    if (tempCanvas.height !== 1) {
      tempCanvas.height = 1;
    }

    tctx.clearRect(0, 0, width, 1);

    // 6) Build gradient
    const grad = tctx.createLinearGradient(0, 0, width, 0);

    // ===== RMS+PEAK (A) =====
    if (mode === 1) {
      grad.addColorStop(0.00, low);
      grad.addColorStop(mid_pos, mid);
      grad.addColorStop(high_pos, high);

      grad.addColorStop(Math.max(0, t1), high);
      grad.addColorStop(Math.min(1, t2), RED_ZONE_COLOR);
      grad.addColorStop(1.00, RED_ZONE_COLOR);

    // ===== STEREO QUALITY =====
    } else if (mode === 2) {
      // Reverse theme gradient up to THR
      grad.addColorStop(0.00, high);
      grad.addColorStop(Math.min(mid_pos, t1), mid);
      grad.addColorStop(Math.min(high_pos, t1), low);

      // Yellow zone starts at THR
      grad.addColorStop(Math.max(0, t1), low);
      grad.addColorStop(Math.min(1, t2), YELLOW_ZONE_COLOR);
      grad.addColorStop(1.00, YELLOW_ZONE_COLOR);

    // ===== NORMAL =====
    } else {
      grad.addColorStop(0.00, low);
      grad.addColorStop(0.50, mid);
      grad.addColorStop(0.80, high);
      grad.addColorStop(1.00, high);
    }

    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, width, 1);

    // 7) Sample pixels
    const img = tctx.getImageData(0, 0, width, 1).data;
    for (let x = 0; x < width; x++) {
      const i = x * 4;
      cache.colors[x] =
        `rgba(${img[i]},${img[i+1]},${img[i+2]},${img[i+3]/255})`;
    }

    // 8) Stops (for glow)
    cache.stops.push({ pos: 0.00, color: low });
    cache.stops.push({ pos: mid_pos, color: mid });
    cache.stops.push({ pos: high_pos, color: high });

    if (mode === 1) {
      cache.stops.push({ pos: THR, color: RED_ZONE_COLOR });
    }

    if (mode === 2) {
      cache.stops.push({ pos: THR, color: YELLOW_ZONE_COLOR });
    }

    cache.stops.push({
      pos: 1.00,
      color: (mode === 1 ? RED_ZONE_COLOR :
              mode === 2 ? YELLOW_ZONE_COLOR : high)
    });

    GRADIENT_CACHE_MAP.set(hash, cache);
    return cache;
  }

  // Native continuous bar gradient. Unlike the legacy one-column sampler,
  // this is rasterized as one uninterrupted fill by the browser. That avoids
  // faint vertical seams when browser zoom maps logical CSS pixels onto
  // fractional device pixels.
  function createBarsLinearGradient(ctx, width, mode) {
    const w = Math.max(1, Number(width) || 1);
    const col = ACTIVE_THEME.colors;
    const low = col.low;
    const mid = col.mid;
    const high = col.high;

    const RED_ZONE_COLOR = "#ff0000";
    const YELLOW_ZONE_COLOR = "#ffd400";
    const THR = (mode === 2) ? 0.82 : 0.58;
    const t1 = THR - 0.001;
    const t2 = THR + 0.001;
    const midPos = 0.40 * THR;
    const highPos = 0.80 * THR;

    const grad = ctx.createLinearGradient(0, 0, w, 0);

    if (mode === 1) {
      grad.addColorStop(0.00, low);
      grad.addColorStop(midPos, mid);
      grad.addColorStop(highPos, high);
      grad.addColorStop(Math.max(0, t1), high);
      grad.addColorStop(Math.min(1, t2), RED_ZONE_COLOR);
      grad.addColorStop(1.00, RED_ZONE_COLOR);
    } else if (mode === 2) {
      grad.addColorStop(0.00, high);
      grad.addColorStop(Math.min(midPos, t1), mid);
      grad.addColorStop(Math.min(highPos, t1), low);
      grad.addColorStop(Math.max(0, t1), low);
      grad.addColorStop(Math.min(1, t2), YELLOW_ZONE_COLOR);
      grad.addColorStop(1.00, YELLOW_ZONE_COLOR);
    } else {
      grad.addColorStop(0.00, low);
      grad.addColorStop(0.50, mid);
      grad.addColorStop(0.80, high);
      grad.addColorStop(1.00, high);
    }

    return grad;
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

    const t = Math.max(0, THR - 0.05);
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
      const VISUAL_YELLOW = 0.55;

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

    const seamColor = (mode === 2) ? high : low;

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
  let FM_DX_CSS_PALETTE_CHECK = -Infinity;
  let FM_DX_CSS_PALETTE = Object.create(null);
  let FM_DX_COLOR_PROBE = null;

  function refreshFmDxCssPalette(force = false) {
    const now = performance.now();
    if (!force && now - FM_DX_CSS_PALETTE_CHECK < 250) return;
    FM_DX_CSS_PALETTE_CHECK = now;

    try {
      // A detached AudioMetrix container does not inherit the FM-DX custom
      // properties. Use it only after insertion; otherwise read from :root.
      const amxContainer = STATE.dom && STATE.dom.container;
      const source =
        (amxContainer && amxContainer.isConnected ? amxContainer : null) ||
        document.documentElement ||
        document.body;
      if (!source) return;

      const computed = getComputedStyle(source);
      const next = Object.create(null);

      ["--color-2", "--color-3", "--color-4"].forEach((propertyName) => {
        const raw = computed.getPropertyValue(propertyName).trim();
        if (!raw) return;

        if (!raw.startsWith("var(") && (!window.CSS || CSS.supports("color", raw))) {
          next[propertyName] = raw;
          return;
        }

        // Resolve nested CSS variables to the actual RGB value understood by
        // CanvasRenderingContext2D.
        const parent = document.body || document.documentElement;
        if (!parent) return;
        if (!FM_DX_COLOR_PROBE) {
          FM_DX_COLOR_PROBE = document.createElement("span");
          FM_DX_COLOR_PROBE.setAttribute("aria-hidden", "true");
          FM_DX_COLOR_PROBE.style.cssText =
            "position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;";
          parent.appendChild(FM_DX_COLOR_PROBE);
        }
        FM_DX_COLOR_PROBE.style.color = `var(${propertyName})`;
        const resolved = getComputedStyle(FM_DX_COLOR_PROBE).color;
        if (resolved) next[propertyName] = resolved;
      });

      FM_DX_CSS_PALETTE = next;
    } catch (e) {}
  }

  function getFmDxCssColor(propertyName) {
    refreshFmDxCssPalette();
    return FM_DX_CSS_PALETTE[propertyName] || null;
  }

  function getFmDxThemeTriple() {
    try {
      const themeName = safeLSGet("theme") || safeLSGet("defaultTheme") || null;
      const isColor = (c) => typeof c === "string" &&
        (c.startsWith("rgb") || c.startsWith("hsl") || c.startsWith("#"));

      if (themeName && typeof themes !== "undefined" && themes) {
        const triple = themes[themeName];
        if (Array.isArray(triple) && triple.length >= 3) {
          const [main, bright, text] = triple;
          if (isColor(main) && isColor(bright)) {
            return [main, bright, isColor(text) ? text : null];
          }
        }
      }

      // The live CSS palette remains available even when the FM-DX JavaScript
      // theme registry is initialized after AudioMetrix.
      const cssTriple = [
        getFmDxCssColor("--color-2"),
        getFmDxCssColor("--color-3"),
        getFmDxCssColor("--color-4")
      ];
      if (cssTriple.every(isColor)) {
        return cssTriple;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function getFmDxAccentColor() {
    return (
      getFmDxCssColor("--color-4") ||
      (getFmDxThemeTriple() || [])[2] ||
      "rgb(184,194,204)"
    );
  }

  function isStoredThemeColor(value) {
    return typeof value === "string" &&
      (value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("#"));
  }

  function loadCachedAutomaticTriple() {
    try {
      const parsed = JSON.parse(safeLSGet(STORAGE_AUTO_PALETTE) || "null");
      return Array.isArray(parsed) &&
        parsed.length >= 3 &&
        parsed.every(isStoredThemeColor)
          ? parsed.slice(0, 3)
          : null;
    } catch (e) {
      return null;
    }
  }

  function cacheAutomaticTriple(triple) {
    if (
      Array.isArray(triple) &&
      triple.length >= 3 &&
      triple.every(isStoredThemeColor)
    ) {
      safeLSSet(STORAGE_AUTO_PALETTE, JSON.stringify(triple.slice(0, 3)));
    }
  }

  const THEME_REGISTRY = {
    automatic: () => {
      try {
        const triple =
          getFmDxThemeTriple() ||
          loadCachedAutomaticTriple() ||
          ["rgb(28,34,40)", "rgb(92,104,116)", "rgb(184,194,204)"];

        const [main, mid, textColor] = triple;

        // use real theme colors instead of synthetic derivation
        const candidates = [main, mid, textColor].filter(Boolean);

        // helper: extract rgb
        function _rgb(c) {
          const m = c.match(/\d+/g);
          return m ? { r: +m[0], g: +m[1], b: +m[2] } : { r: 0, g: 0, b: 0 };
        }

        // brightness
        function _b(c) {
          const { r, g, b } = _rgb(c);
          return 0.299 * r + 0.587 * g + 0.114 * b;
        }

        // simple saturation proxy
        function _s(c) {
          const { r, g, b } = _rgb(c);
          return Math.max(r, g, b) - Math.min(r, g, b);
        }

        // sort by brightness
        const sorted = candidates.slice().sort((a, b) => _b(a) - _b(b));

        // dark = actual dark, but lifted a bit toward the middle color
        const lowColor = sorted.length >= 2
          ? interpolateColor(sorted[0], sorted[1], 0.18)
          : (sorted[0] || mid);

        // light = actual brightest
        const highColor = sorted[sorted.length - 1] || main;

        // mid = most saturated candidate, fallback to brightness median
        const midColor = candidates.slice().sort((a, b) => _s(b) - _s(a))[0]
          || sorted[Math.floor(sorted.length / 2)]
          || mid;

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
        return {
          name: "automatic",
          colors: {
            low: "rgb(28,34,40)",
            mid: "rgb(92,104,116)",
            high: "rgb(184,194,204)",
            peak: "rgb(255,255,255)"
          }
        };
      }
    },

    aurora: {
      name: "aurora",
      colors: {
        low: "hsl(205, 99%, 42%)",
        mid: "hsl(283, 62%, 54%)",
        high: "hsl(91, 100%, 40%)",
        peak: "hsl(60, 100%, 82%)"
      }
    },

    aegean: {
      name: "aegean",
      colors: {
        low: "hsl(229, 100%, 36%)",
        mid: "hsl(226, 100%, 50%)",
        high: "hsl(24, 100%, 62%)",
        peak: "hsl(200, 100%, 60%)"
      }
    },

    emerald: {
      name: "emerald",
      colors: {
        low: "hsl(180 100% 22%)",
        mid: "hsl(140, 52%, 55%)",
        high: "hsl(160 100% 50%)",
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

    galactica: {
      name: "galactica",
      colors: {
        low: "hsl(250, 100%, 62%)",
        mid: "hsl(270, 100%, 66%)",
        high: "hsl(290, 100%, 67%)",
        peak: "hsl(240, 100%, 62%)"
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

    heatmap: {
      name: "heatmap",
      colors: {
        low: "hsl(30, 100%, 50%)",
        mid: "hsl(330, 100%, 50%)",
        high: "hsl(300, 100%, 50%)",
        peak: "hsl(60, 100%, 50%)"
      }
    },

    iceblue: {
      name: "iceblue",
      colors: {
        low: "hsl(182, 100%, 50%)",
        mid: "hsl(190, 100%, 88%)",
        high: "hsl(222, 100%, 69%)",
        peak: "hsl(200, 100%, 33%)"
      }
    },

    neonlights: {
      name: "neonlights",
      colors: {
        low: "hsl(250, 53%, 46%)",
        mid: "hsl(17, 100%, 59%)",
        high: "hsl(96, 57%, 76%)",
        peak: "hsl(305, 100%, 59%)"
      }
    },

    pastel: {
      name: "pastel",
      colors: {
        low: "hsl(332, 88%, 73%)",
        mid: "hsl(0, 67%, 93%)",
        high: "hsl(204, 90%, 80%)",
        peak: "hsl(326, 100%, 67%)"
      }
    },

    prism: {
      name: "prism",
      colors: {
        low: "hsl(212, 100%, 50%)",
        mid: "hsl(61, 95%, 71%)",
        high: "hsl(284, 91%, 37%)",
        peak: "hsl(159, 100%, 44%)"
      }
    },

    redvelvet: {
      name: "redvelvet",
      colors: {
        low: "hsl(360, 100%, 57%)",
        mid: "hsl(57, 100%, 91%)",
        high: "hsl(358, 97%, 31%)",
        peak: "hsl(359, 64%, 35%)"
      }
    },

    retrospect: {
      name: "retrospect",
      colors: {
        low: "hsl(223, 63%, 19%)",
        mid: "hsl(28, 94%, 54%)",
        high: "hsl(71, 41%, 73%)",
        peak: "hsl(223, 100%, 67%)"
      }
    },

    scarlet: {
      name: "scarlet",
      colors: {
        low: "hsl(0, 100%, 18%)",
        mid: "hsl(360, 83%, 41%)",
        high: "hsl(0, 100%, 25%)",
        peak: "hsl(0, 100%, 60%)"
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
        low: "hsl(43, 77%, 50%)",
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

    valentines: {
      name: "valentines",
      colors: {
        low: "hsl(330, 81%, 29%)",
        mid: "hsl(340, 82%, 76%)",
        high: "hsl(340, 81%, 85%)",
        peak: "hsl(350, 70%, 59%)"
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
        low: "hsl(28, 98%, 50%)",
        mid: "hsl(274, 98%, 50%)",
        high: "hsl(182, 98%, 50%)",
        peak: "hsl(296, 100%, 72%)"
      }
    },

    vintage: {
      name: "vintage",
      colors: {
        low: "hsl(38, 26%, 47%)",
        mid: "hsl(35, 43%, 78%)",
        high: "hsl(55, 40%, 76%)",
        peak: "hsl(33, 100%, 44%)"
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
  let LAST_AUTO_THEME_SIG = JSON.stringify(getFmDxThemeTriple() || []);
  let LAST_AUTO_THEME_CHECK = 0;

  function refreshAutomaticTheme(force = false) {
    try {
      if ((safeLSGet(STORAGE_THEME) || "automatic") !== "automatic") {
        return false;
      }

      const now = performance.now();
      if (!force && now - LAST_AUTO_THEME_CHECK < 250) return false;
      LAST_AUTO_THEME_CHECK = now;

      // FM-DX may expose its theme registry after AudioMetrix is evaluated.
      // Keep the current temporary fallback until a valid triple is ready.
      refreshFmDxCssPalette(force);
      const nextTriple = getFmDxThemeTriple();
      if (!nextTriple) return false;
      cacheAutomaticTriple(nextTriple);

      const nextSig = JSON.stringify(nextTriple);
      if (!force && nextSig === LAST_AUTO_THEME_SIG) return false;

      LAST_AUTO_THEME_SIG = nextSig;
      ACTIVE_THEME = THEME_REGISTRY.automatic();
      invalidateVisualCaches();

      // Theme resolution can complete after the startup canvas has already
      // been painted with the temporary fallback. Force a repaint even while
      // playback is stopped; otherwise the correct Automatic palette appears
      // only after the user changes a layout or render setting.
      requestRender();
      return true;
    } catch (e) {
      return false;
    }
  }

  try {
    AMX_RUNTIME.themeObserver = new MutationObserver(() => {
      try {
        refreshAutomaticTheme();

      } catch (e) {
        console.error(
          "[AudioMetrix] theme MutationObserver callback failed:",
          e
        );
      }
    });
    AMX_RUNTIME.themeObserver.observe(document.body, {
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
      riseRate: 1.25,
      amplification: 1.05,
      bassReduction: -2,
      highPassCutoff: 1200,
      lowPassCutoff: 2000,
      peakDecayDbPerFrame: 0.7,
      peakMinVolumeThreshold: 0.5,
      peakFftSize: 256,
      minDb: -35,
      maxDb: 5,
      calibrationDb: 9,
      attackSpeed: loadLSFloat(STORAGE_ATTACK,  0.45, 0.05, 1.0),
      releaseSpeed: loadLSFloat(STORAGE_RELEASE, 0.65, 0.05, 1.0),
      peakHoldMs: loadLSInt  (STORAGE_PEAK_HOLD, 1000, 50, 2000),
      dbGain: loadLSInt(STORAGE_GAIN, 0, -15, 15)
    },
    display: {
      glowIntensity: loadLSBool(STORAGE_GLOW_ENABLED, false) ? 1 : 0,
      barStyle: loadLSEnum(STORAGE_BARSTYLE, "simple", VALID_STYLES),
      layoutMode: loadLSEnum(STORAGE_LAYOUT, "lr", ["lr", "sa", "full", "equalizer", "vuHybrid", "oscilloscope"]),
      renderMode: loadLSEnum(STORAGE_RENDER, "bars", ["bars", "gauges", "mirrored", "analogVu"]),
      hybridMode: loadLSEnum(STORAGE_HYBRID_MODE, "stereo12", HYBRID_MODES),
      equalizerRenderMode: loadLSEnum(STORAGE_EQ_RENDER, "bars", ["bars", "spectrum"]),
      oscilloscopeStyle: loadLSEnum(
        STORAGE_SCOPE_STYLE,
        "lines",
        ["lines", "filled", "dots", "steps", "persistence", "envelope", "spindle"]
      ),
      showPeaks: loadLSBool(STORAGE_SHOW_PEAKS, false),
      showReadouts: loadLSBool(STORAGE_SHOW_READOUTS, false),
      dimensions: {
        barHeight: 20,
        spacing: 10,
        labelLeft: 5,
        canvasLeft: 25,
        borderRadius: "20px",
        minTileWidth: 350,
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
      analyserEqualizerLeft: null,
      analyserEqualizerRight: null,
      analyserPeak: null,
      midSideGainLToM: null,
      midSideGainRToM: null,
      midSideGainLToS: null,
      midSideGainRToS: null,
      bassFilter: null,
      highPassFilter: null,
      lowPassFilter: null,
      source: null,
      dataLeft: null,
      dataRight: null,
      dataEqualizerLeft: null,
      dataEqualizerRight: null,
      dataPeak: null
    },

    audioCadence: {
      frame: 0,
      interval: 1,
      min: 1,
      max: 4,
      lastEnergy: 0
    },

    // EQ/Hybrid stays visually updated at 60Hz. Only the expensive
    // 4096-point spectrum snapshot is sampled at a lower cadence.
    spectrumCadence: {
      frame: 0,
      interval: 2
    },

    oscilloscope: {
      peakHistoryLeft: [],
      peakHistoryRight: [],
      peakDisplayLeft: 0,
      peakDisplayRight: 0,
      peakHoldUntilLeft: 0,
      peakHoldUntilRight: 0,
      persistenceLeft: [],
      persistenceRight: [],
      persistenceFrame: 0,
      lastTs: 0
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
        smooth: 0,
        peakDb: -999
      },
      equalizer: {
        values: new Array(EQ_BAND_COUNT).fill(0),
        targetValues: new Array(EQ_BAND_COUNT).fill(0),
        peaks: new Array(EQ_BAND_COUNT).fill(0),
        dbValues: new Array(EQ_BAND_COUNT).fill(-100),
        peakHoldUntil: new Array(EQ_BAND_COUNT).fill(0),
        lastUpdateTs: 0
      },
      hybridStereo12: {
        values: new Array(HYBRID_STEREO_12_FREQUENCIES.length).fill(0),
        targetValues: new Array(HYBRID_STEREO_12_FREQUENCIES.length).fill(0),
        peaks: new Array(HYBRID_STEREO_12_FREQUENCIES.length).fill(0),
        dbValues: new Array(HYBRID_STEREO_12_FREQUENCIES.length).fill(-100),
        peakHoldUntil: new Array(HYBRID_STEREO_12_FREQUENCIES.length).fill(0),
        lastUpdateTs: 0
      },
      hybridAudio10: {
        values: new Array(HYBRID_AUDIO_10_FREQUENCIES.length).fill(0),
        targetValues: new Array(HYBRID_AUDIO_10_FREQUENCIES.length).fill(0),
        peaks: new Array(HYBRID_AUDIO_10_FREQUENCIES.length).fill(0),
        dbValues: new Array(HYBRID_AUDIO_10_FREQUENCIES.length).fill(-100),
        peakHoldUntil: new Array(HYBRID_AUDIO_10_FREQUENCIES.length).fill(0),
        lastUpdateTs: 0
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
      dpr: 1,
      dirty: true
    },

    peakHoldUntil: {
      left: 0,
      right: 0,
      audio: 0,
      quality: 0
    },

    monitoring: {
      maxSamplePeak: {
        left: 0,
        right: 0
      },
      maxSamplePeakDb: {
        left: -120,
        right: -120
      },
      clipUntil: {
        left: 0,
        right: 0
      },
      clipped: {
        left: false,
        right: false
      },
      clipCount: {
        left: 0,
        right: 0
      },
      lastResetTs: 0
    },

    meta: {
      updateAvailable: false,
      remoteVersion: null
    },
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


  function isAdminDiagnosticsEnabled() {
    return safeLSGet(STORAGE_DIAGNOSTICS) === "true";
  }

  function isFMdxAdmin() {
    // FM-DX renders this quick dashboard only for authenticated admins.
    // Using a server-rendered admin-only DOM marker avoids exposing the
    // diagnostics control to ordinary users.
    return !!document.querySelector(".admin-quick-dashboard");
  }


  function ensureDiagnosticsOverlay() {
    if (!isFMdxAdmin() || !isAdminDiagnosticsEnabled()) {
      if (AMX_RUNTIME.diagnosticsEl) {
        AMX_RUNTIME.diagnosticsEl.remove();
        AMX_RUNTIME.diagnosticsEl = null;
      }
      return null;
    }

    if (AMX_RUNTIME.diagnosticsEl?.isConnected) {
      return AMX_RUNTIME.diagnosticsEl;
    }

    const el = document.createElement("div");
    el.id = "amx-admin-diagnostics";

    // Use explicit inline properties instead of a cssText block. Some FM-DX
    // theme/plugin rules can override generic DIV sizing/display properties;
    // explicit dimensions also prevent the overlay collapsing into a dot.
    Object.assign(el.style, {
      position: "fixed",
      display: "block",
      boxSizing: "border-box",
      right: "12px",
      bottom: "12px",
      zIndex: "2147483000",
      width: "390px",
      minWidth: "300px",
      maxWidth: "calc(100vw - 24px)",
      minHeight: "112px",
      height: "auto",
      padding: "10px 12px",
      margin: "0",
      borderRadius: "10px",
      background: "rgba(8, 10, 12, 0.78)",
      backdropFilter: "blur(14px) saturate(135%)",
      WebkitBackdropFilter: "blur(14px) saturate(135%)",
      border: "1px solid rgba(255,255,255,.18)",
      boxShadow: "0 8px 28px rgba(0,0,0,.35)",
      color: "#eeeeee",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "11px",
      fontWeight: "400",
      lineHeight: "1.45",
      textAlign: "left",
      whiteSpace: "pre-wrap",
      overflow: "visible",
      opacity: "1",
      visibility: "visible",
      pointerEvents: "none",
      transform: "none"
    });
    el.textContent =
      "AudioMetrix — ADMIN DIAGNOSTICS\n" +
      "Initializing runtime data…";

    document.body.appendChild(el);
    AMX_RUNTIME.diagnosticsEl = el;
    return el;
  }

  function updateDiagnosticsOverlay() {
    const el = ensureDiagnosticsOverlay();
    if (!el) return;

    try {
      const ctx = STATE.audio?.context || null;
      const canvas =
        STATE.dom?.canvasNormal ||
        STATE.dom?.canvasBars ||
        STATE.dom?.canvasGauges ||
        null;

      // Do not depend on the locally-scoped isAudioTransportPlaying()
      // helper. FM-DX's transport icon is authoritative and globally visible.
      const transportIcon = document.querySelector(".playbutton .fa-solid");
      const transport = transportIcon
        ? (transportIcon.classList.contains("fa-stop") ? "PLAY" : "STOP")
        : "unknown";

      let logicalW = 0;
      let logicalH = 0;
      if (canvas) {
        logicalW =
          Number(canvas._amxLogicalWidth) ||
          Math.round(canvas.getBoundingClientRect?.().width || 0);
        logicalH =
          Number(canvas._amxLogicalHeight) ||
          Math.round(canvas.getBoundingClientRect?.().height || 0);
      }

      const dpr = Math.max(
        1,
        Math.min(Number(window.devicePixelRatio) || 1, 2)
      );

      let renderState = "unknown";
      try {
        renderState =
          typeof RENDER_GATE !== "undefined" &&
          RENDER_GATE?.rafId != null
            ? "active"
            : "paused";
      } catch (_) {}

      const lastRebind = AMX_RUNTIME.autoRebindLastCheck
        ? Math.round(
            (Date.now() - AMX_RUNTIME.autoRebindLastCheck) / 1000
          ) + "s ago"
        : "-";

      const formatMonitorDb = (value) =>
        Number.isFinite(value) && value > -119
          ? value.toFixed(1)
          : "-∞";

      const getMonitorClipLabel = (channel) => {
        const m = STATE.monitoring;
        if (!m) return "-";
        const active = performance.now() < (m.clipUntil?.[channel] || 0);
        const count = m.clipCount?.[channel] || 0;
        return active ? `CLIP(${count})` : (count ? `mem(${count})` : "OK");
      };

      el.textContent =
        `AudioMetrix ${AMX_VERSION} — ADMIN DIAGNOSTICS\n` +
        `Page: ${document.visibilityState} | Render: ${renderState} | Transport: ${transport}\n` +
        `AudioContext: ${ctx?.state || "none"} @ ${ctx?.sampleRate || "-"} Hz\n` +
        `Source: ${STATE.audio?.sourceLabel || STATE.audio?.sourceMode || "none"}\n` +
        `MAX L/R: ${formatMonitorDb(STATE.monitoring?.maxSamplePeakDb?.left)} / ${formatMonitorDb(STATE.monitoring?.maxSamplePeakDb?.right)} dBFS | ` +
        `CLIP: ${getMonitorClipLabel("left")} / ${getMonitorClipLabel("right")}\n` +
        `Rebind: ${AMX_RUNTIME.autoRebindState || "unknown"} | last ${lastRebind}\n` +
        `Layout: ${CONFIG.display?.layoutMode || "-"} | RenderMode: ${CONFIG.display?.renderMode || "-"}\n` +
        `Canvas: ${Math.round(logicalW)}×${Math.round(logicalH)} | DPR ${dpr.toFixed(2)} | FPS gate ${
          ["equalizer", "vuHybrid", "oscilloscope"].includes(CONFIG.display?.layoutMode) ? 60 : 30
        }`;

      el.style.borderColor = "rgba(255,255,255,.18)";
    } catch (err) {
      // Diagnostics must diagnose failures, never become one.
      el.textContent =
        `AudioMetrix ${AMX_VERSION} — ADMIN DIAGNOSTICS\n` +
        `Diagnostics update error: ${err?.message || String(err)}\n` +
        `Page: ${document.visibilityState}\n` +
        `AudioContext: ${STATE.audio?.context?.state || "none"}\n` +
        `Source: ${STATE.audio?.sourceMode || "none"}`;
      el.style.borderColor = "rgba(255,120,120,.55)";

      if (AMX_DEBUG) {
        console.warn("[AudioMetrix] diagnostics update failed:", err);
      }
    }
  }

  function startDiagnosticsLoop() {
    if (AMX_RUNTIME.diagnosticsTimer) clearInterval(AMX_RUNTIME.diagnosticsTimer);
    updateDiagnosticsOverlay();
    AMX_RUNTIME.diagnosticsTimer = setInterval(updateDiagnosticsOverlay, 750);
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

  // ================================================================
  // FLOATING SETTINGS PANEL MODULE
  // All panel geometry, styling, scrolling, drag/resize and UI code
  // is intentionally kept together in this section.
  // ================================================================

  function injectAMXPanelStyles() {
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

        .amx-settings-section {
          width: 100%;
          box-sizing: border-box;
          margin: 6px 0 3px 0;
          padding: 0 2px;
          clear: both;
          display: block;
          flex: 0 0 100%;
        }

        .amx-settings-section::after {
          content: "";
          display: block;
          width: 100%;
          height: 1px;
          margin-top: 1px;
          background: var(--color-3);
          opacity: 0.9;
        }

        .amx-settings-section-title {
          text-align: left;
          font-size: 14px;
          line-height: 1.15;
          font-weight: 600;
          letter-spacing: 0.65px;
          color: var(--color-4);
          text-transform: uppercase;
          opacity: 0.96;
        }


        /* Compact selector selected-fields only.
           FM-DX dropdown.css gives .dropdown a fixed 48px height and its
           input height:100%, so both wrapper and input must be resized.
           The .options dropdown menu itself is intentionally untouched. */
        #amx-floating-panel .form-group > .dropdown {
          height: 34px !important;
          min-height: 34px !important;
          box-sizing: border-box !important;
          border-radius: 5px !important;
        }

        #amx-floating-panel .form-group > .dropdown > input.form-control,
        #amx-floating-panel .form-group > .dropdown > input[type="text"][readonly] {
          height: 34px !important;
          min-height: 34px !important;
          line-height: 24px !important;
          padding: 4px 28px 4px 12px !important;
          box-sizing: border-box !important;
          border-radius: 5px !important;
        }

        #amx-floating-panel .form-group > .dropdown.opened > input {
          border-radius: 5px 5px 0 0 !important;
        }

        #amx-floating-panel .form-group > .dropdown.opened.dropdown-up > input {
          border-radius: 0 0 5px 5px !important;
        }

        /* Re-center the FM-DX dropdown arrow for the shorter field. */
        #amx-floating-panel .form-group > .dropdown::before {
          top: 50% !important;
          transform: translateY(-50%) rotate(-45deg) !important;
        }

        #amx-floating-panel .form-group > .dropdown.opened::before {
          top: 50% !important;
          transform: translateY(-50%) rotate(-225deg) !important;
        }

        /* Keep the selector title aligned to its own line rather than
           inheriting the old 48px control rhythm. */
        #amx-floating-panel .form-group > label.form-label {
          line-height: 1.15 !important;
          min-height: 0 !important;
          height: auto !important;
          margin-top: 0 !important;
          margin-bottom: 3px !important;
        }

        /* Compact vertical rhythm inside the floating settings panel. */
        #amx-floating-panel .form-group {
          margin-top: 2px !important;
          margin-bottom: 2px !important;
        }

        #amx-floating-panel .selectgroup {
          margin-top: 1px !important;
          margin-bottom: 1px !important;
        }

        /* Use the Audio Response slider rhythm as the common vertical rhythm. */
        #amx-floating-panel .audio-row {
          margin-top: 2px !important;
          margin-bottom: 2px !important;
        }

        #amx-floating-panel label.form-label {
          margin-top: 2px !important;
          margin-bottom: 2px !important;
        }

        #amx-floating-panel .form-group + .form-group {
          margin-top: 2px !important;
        }

        #amx-floating-panel .amx-settings-section + .form-group,
        #amx-floating-panel .amx-settings-section + .selectgroup {
          margin-top: 2px !important;
        }

        #amx-admin-diagnostics-setting .switch {
          transform: scale(0.62);
          transform-origin: right center;
          margin-right: -8px;
        }

        /* Compact only the real layout box of switch rows.
           The switches themselves keep their original transform:scale(...)
           and horizontal placement exactly as in the working version. */
        #amx-floating-panel .form-group.amx-compact-row {
          height: 22px !important;
          min-height: 22px !important;
          max-height: 22px !important;
          margin-top: 0 !important;
          margin-bottom: 3px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          overflow: visible !important;
        }

        #amx-floating-panel .form-group.amx-compact-row > div {
          height: 22px !important;
          min-height: 22px !important;
          max-height: 22px !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          overflow: visible !important;
        }

        #amx-floating-panel #amx-admin-diagnostics-setting {
          margin-top: 8px !important;
        }

        /* Diagnostics has two text lines, so it must not inherit the
           22px compact switch-row height used by Glow/Peaks/Readouts. */
        #amx-floating-panel .form-group.amx-diagnostics-row {
          height: auto !important;
          min-height: 34px !important;
          max-height: none !important;
          margin-bottom: 2px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          overflow: visible !important;
        }

        #amx-floating-panel .form-group.amx-diagnostics-row > div {
          height: auto !important;
          min-height: 34px !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }

        /* Final vertical rhythm for regular settings rows.
           Audio Response slider rows intentionally stay tighter. */
        #amx-floating-panel .form-group,
        #amx-floating-panel .selectgroup {
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }

        #amx-floating-panel .audio-row {
          margin-top: 2px !important;
          margin-bottom: 2px !important;
        }

        /* Glass scrollbar colored from the selected-field accent. */
        #amx-floating-panel #amx-panel-content {
          scrollbar-width: thin;
          scrollbar-color:
            color-mix(in srgb, var(--color-4) 72%, transparent)
            rgba(255,255,255,.05);
        }

        #amx-floating-panel #amx-panel-content::-webkit-scrollbar {
          width: 8px;
        }

        #amx-floating-panel #amx-panel-content::-webkit-scrollbar-track {
          margin: 4px 0;
          border-radius: 4px;
          background: rgba(255,255,255,.04);
          box-shadow: inset 0 0 4px rgba(0,0,0,.28);
        }

        #amx-floating-panel #amx-panel-content::-webkit-scrollbar-thumb {
          min-height: 28px;
          border-radius: 4px;
          border: 1px solid
            color-mix(in srgb, var(--color-4) 48%, rgba(255,255,255,.18));
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--color-4) 54%, transparent),
              color-mix(in srgb, var(--color-4) 90%, rgba(255,255,255,.16)),
              color-mix(in srgb, var(--color-4) 54%, transparent)
            );
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,.26),
            inset 0 -1px 2px rgba(0,0,0,.24),
            0 0 6px color-mix(in srgb, var(--color-4) 16%, transparent);
        }

        #amx-floating-panel #amx-panel-content::-webkit-scrollbar-thumb:hover {
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--color-4) 66%, transparent),
              var(--color-4),
              color-mix(in srgb, var(--color-4) 66%, transparent)
            );
        }

        /* --------------------------------
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

function isAMXMobileViewport() {
  return (window.innerWidth || document.documentElement.clientWidth || 0) <= 767;
}

function saveAMXPanelGeometry(panel) {
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  const left = Math.round(rect.left);
  const top = Math.round(rect.top);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (Number.isFinite(left)) safeLSSet(STORAGE_PANEL_LEFT, left);
  if (Number.isFinite(top)) safeLSSet(STORAGE_PANEL_TOP, top);
  if (Number.isFinite(width)) safeLSSet(STORAGE_PANEL_WIDTH, width);
  if (Number.isFinite(height)) safeLSSet(STORAGE_PANEL_HEIGHT, height);
}

  function restoreAMXPanelGeometry(panel) {
    if (!panel) return false;

    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = isAMXMobileViewport() ? 8 : 0;

    const left = loadLSInt(STORAGE_PANEL_LEFT, NaN);
    const top = loadLSInt(STORAGE_PANEL_TOP, NaN);
    const width = loadLSInt(STORAGE_PANEL_WIDTH, NaN);
    const height = loadLSInt(STORAGE_PANEL_HEIGHT, NaN);

    let restored = false;
    const maxW = Math.max(160, vw - margin * 2);
    const minW = Math.min(290, maxW);

    if (!isNaN(width) && width > 0) {
      panel.style.width = Math.min(Math.max(minW, width), maxW) + "px";
      restored = true;
    } else {
      panel.style.width = minW + "px";
    }

    if (!isNaN(height) && height > 0) {
      const maxH = Math.max(140, vh - margin * 2);
      panel.style.height = Math.min(Math.max(140, height), maxH) + "px";
      restored = true;
    } else {
      panel.style.height = "auto";
    }

    if (!isNaN(left) && !isNaN(top)) {
      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel._amxUserMoved = true;
      restored = true;
    }

    if (!isNaN(width) || !isNaN(height)) {
      panel._amxUserResized = true;
    }

    return restored;
  }

  function clampAMXPanelToViewport(panel) {
    if (!panel) return;

    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const mobile = isAMXMobileViewport();
    const margin = mobile ? 8 : 0;

    let rect = panel.getBoundingClientRect();
    let left = Number.isFinite(parseFloat(panel.style.left))
      ? parseFloat(panel.style.left)
      : rect.left;
    let top = Number.isFinite(parseFloat(panel.style.top))
      ? parseFloat(panel.style.top)
      : rect.top;

    if (mobile) {
      const maxW = Math.max(160, vw - margin * 2);
      const minW = Math.min(290, maxW);
      let width = rect.width;

      if (width < minW || width > maxW) {
        width = Math.min(Math.max(width, minW), maxW);
        panel.style.width = Math.round(width) + "px";
        rect = panel.getBoundingClientRect();
      }

      const maxH = Math.max(140, vh - margin * 2);
      let height = rect.height;

      if (height > maxH) {
        panel.style.height = Math.round(maxH) + "px";
        height = maxH;
      }

      const maxLeft = Math.max(margin, vw - rect.width - margin);
      const maxTop = Math.max(margin, vh - height - margin);

      left = Math.min(Math.max(left, margin), maxLeft);
      top = Math.min(Math.max(top, margin), maxTop);
    } else {
      const minVisible = 40;
      const maxLeft = Math.max(0, vw - minVisible);
      const maxTop = Math.max(0, vh - minVisible);

      if (left + minVisible > vw) left = maxLeft;
      if (top + minVisible > vh) top = maxTop;
      if (left < 0) left = 0;
      if (top < 0) top = 0;
    }

    panel.style.left = Math.round(left) + "px";
    panel.style.top = Math.round(top) + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    updateAMXContentScrolling(panel);
  }

  function createAMXFloatingPanel() {
    const panel = document.createElement("div");
    panel.id = "amx-floating-panel";

    // REAL floating overlay
    panel.style.position = "fixed";
    panel.style.zIndex = "100000";
    panel.style.display = "none";
    panel.style.flexDirection = "column";
    panel.style.boxSizing = "border-box";
    panel.style.overflow = "hidden";
    panel.style.pointerEvents = "auto";

    // Touch & selection safety (mobile + desktop)
    panel.style.touchAction = "manipulation";
    panel.style.userSelect = "none";
    panel.style.webkitUserSelect = "none";

    // Sizing
    panel.style.width = "290px";

    // padding and appearance
    panel.style.padding = "12px";
    panel.style.borderRadius = "10px";

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
      panel.style.display = willOpen ? "flex" : "none";

      if (willOpen) {
        const restored = restoreAMXPanelGeometry(panel);

        if (!restored) {
          positionAMXFloatingPanel(panel, container);
          settleAMXPanelLayout(panel, true);
        } else {
          settleAMXPanelLayout(panel, true);
        }
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

  // FLOATING SETTINGS PANEL — POSITION / DRAG / RESIZE / UI
  // ─────────────────────────────────────────────────────────
  function updateAMXContentScrolling(panel) {
    if (!panel || !panel._amxContentArea || panel.style.display === "none") return;

    const content = panel._amxContentArea;
    const topBar = panel._amxTopBar;

    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";

    if (topBar) {
      topBar.style.flex = "0 0 auto";
      topBar.style.minHeight = "30px";
    }

    content.style.flex = "1 1 auto";
    content.style.minHeight = "0";
    content.style.maxHeight = "none";
    content.style.overflowX = "hidden";
    content.style.overflowY = "auto";
    content.style.webkitOverflowScrolling = "touch";
  }

  function scheduleAMXContentScrollingUpdate(panel) {
    requestAnimationFrame(() => updateAMXContentScrolling(panel));
  }

  function settleAMXPanelLayout(panel, saveAfter = false) {
    if (!panel || panel.style.display === "none") return;

    // Mobile browsers can report stale geometry immediately after
    // orientation/restore. Two animation frames allow fonts, floats,
    // viewport and flex sizing to settle before the final clamp/scroll pass.
    requestAnimationFrame(() => {
      clampAMXPanelToViewport(panel);
      updateAMXContentScrolling(panel);

      requestAnimationFrame(() => {
        clampAMXPanelToViewport(panel);
        updateAMXContentScrolling(panel);

        // Never keep a scroll offset that is now beyond the real content.
        const content = panel._amxContentArea;
        if (content) {
          const maxScroll = Math.max(
            0,
            content.scrollHeight - content.clientHeight
          );
          if (content.scrollTop > maxScroll) {
            content.scrollTop = maxScroll;
          }
        }

        if (saveAfter) {
          saveAMXPanelGeometry(panel);
        }
      });
    });
  }

  function positionAMXFloatingPanel(panel, container) {
    if (!panel || !container) return;

    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const mobile = isAMXMobileViewport();
    const margin = 8;

    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    const maxW = Math.max(160, vw - margin * 2);
    const minW = Math.min(290, maxW);
    panel.style.minWidth = minW + "px";
    panel.style.maxWidth = maxW + "px";

    let panelW = parseFloat(panel.style.width);
    if (!Number.isFinite(panelW)) panelW = 290;
    panelW = Math.min(Math.max(panelW, minW), maxW);
    panel.style.width = Math.round(panelW) + "px";
    panel.style.minHeight = "140px";

    const tileRect = container.getBoundingClientRect();
    const ps = document.getElementById("ps-container");
    const psRect = ps ? ps.getBoundingClientRect() : null;
    const anchorTop = psRect ? Math.max(margin, Math.round(psRect.top)) : margin;

    let left = Math.round(tileRect.left - panelW - margin);
    if (left < margin) {
      left = mobile
        ? Math.max(margin, Math.round((vw - panelW) / 2))
        : margin;
    }
    if (left + panelW > vw - margin) {
      left = Math.max(margin, vw - panelW - margin);
    }

    panel.style.left = left + "px";
    panel.style.top = anchorTop + "px";

    const availableH = Math.max(140, vh - anchorTop - margin);
    panel.style.maxHeight = availableH + "px";

    if (!panel._amxUserResized) {
      panel.style.height = "auto";
      requestAnimationFrame(() => {
        const r = panel.getBoundingClientRect();
        if (r.height > availableH) {
          panel.style.height = availableH + "px";
        }
        clampAMXPanelToViewport(panel);
        updateAMXContentScrolling(panel);
      });
    } else {
      const currentH = parseFloat(panel.style.height);
      if (Number.isFinite(currentH) && currentH > availableH) {
        panel.style.height = availableH + "px";
      }
      clampAMXPanelToViewport(panel);
      updateAMXContentScrolling(panel);
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
        requestAnimationFrame(function () {
          if (panel._amxUserMoved || panel._amxUserResized) {
            clampAMXPanelToViewport(panel);
            updateAMXContentScrolling(panel);
            settleAMXPanelLayout(panel, true);
          } else {
            positionAMXFloatingPanel(panel, container);
            settleAMXPanelLayout(panel, true);
          }
          ticking = false;
        });
      }
    }

    window.addEventListener("scroll", requestReposition, { passive: true });
    window.addEventListener("resize", requestReposition);
    window.addEventListener("orientationchange", requestReposition);

    AMX_RUNTIME.windowHandlers.push(
      ["scroll", requestReposition, { passive: true }],
      ["resize", requestReposition, undefined],
      ["orientationchange", requestReposition, undefined]
    );
  }

  function createPointerHandlers({ onMove, onUp }) {
    function getPoint(e) {
      if (e.touches && e.touches.length) {
        return e.touches[0];
      }
      if (e.changedTouches && e.changedTouches.length) {
        return e.changedTouches[0];
      }

      return e;
    }

    function moveHandler(e) {
      if (typeof onMove === "function") {
        onMove(e, getPoint(e));
      }
    }

    function upHandler(e) {
      document.removeEventListener("mousemove", moveHandler);
      document.removeEventListener("mouseup", upHandler);
      document.removeEventListener("touchmove", moveHandler);
      document.removeEventListener("touchend", upHandler);
      document.removeEventListener("touchcancel", upHandler);

      if (typeof onUp === "function") {
        onUp(e, getPoint(e));
      }
    }

    function bind() {
      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
      document.addEventListener("touchmove", moveHandler, { passive: false });
      document.addEventListener("touchend", upHandler);
      document.addEventListener("touchcancel", upHandler);
    }

    return {
      getPoint,
      bind
    };
  }

  function enableAMXPanelDragging(panel, handle) {
    if (!panel || !handle || panel._amxDragEnabled) return;
    panel._amxDragEnabled = true;
  
    handle.style.cursor = "move";
    panel.style.cursor = "move";
  
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
  
    function shouldIgnoreDragTarget(target) {
      if (!target) return false;
  
      return !!target.closest(
        'input, select, textarea, button, a, label, option, [data-amx-no-drag], .amx-resize-handle, .dropdown, .options, .option, .form-control'
      );
    }
  
    const pointer = createPointerHandlers({
      onMove: (e, pt) => {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();
  
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
  
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  
        const rect = panel.getBoundingClientRect();
        const panelW = rect.width;
        const panelH = rect.height;
  
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
  
        const mobile = isAMXMobileViewport();
        const viewportMargin = mobile ? 8 : 0;
        const minVisibleX = 80;
        const minVisibleY = 36;

        const minLeft = mobile
          ? viewportMargin
          : Math.min(0, vw - panelW);
        const maxLeft = mobile
          ? Math.max(viewportMargin, vw - panelW - viewportMargin)
          : Math.max(0, vw - minVisibleX);

        const minTop = mobile ? viewportMargin : 0;
        const maxTop = mobile
          ? Math.max(viewportMargin, vh - panelH - viewportMargin)
          : Math.max(0, vh - minVisibleY);
  
        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < minTop) newTop = minTop;
        if (newTop > maxTop) newTop = maxTop;
  
        const snap = 14;
  
        if (Math.abs(newLeft) <= snap) newLeft = 0;
        if (Math.abs(newTop) <= snap) newTop = 0;
  
        const rightSnapLeft = vw - panelW;
        if (Math.abs(newLeft - rightSnapLeft) <= snap) {
          newLeft = rightSnapLeft;
        }
  
        const bottomSnapTop = vh - panelH;
        if (Math.abs(newTop - bottomSnapTop) <= snap) {
          newTop = bottomSnapTop;
        }
  
        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < minTop) newTop = minTop;
        if (newTop > maxTop) newTop = maxTop;
  
        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel._amxUserMoved = true;
      },
  
      onUp: () => {
        if (!isDragging) return;
        isDragging = false;
  
        saveAMXPanelGeometry(panel);
      }
    });
  
    function onDown(e) {
      if (e.type === "mousedown" && e.button !== 0) return;
      if (shouldIgnoreDragTarget(e.target)) return;
  
      const pt = pointer.getPoint(e);
      if (e.cancelable) e.preventDefault();
  
      isDragging = true;
      panel._amxUserMoved = true;
  
      const rect = panel.getBoundingClientRect();
      startX = pt.clientX;
      startY = pt.clientY;
      startLeft = rect.left;
      startTop = rect.top;
  
      pointer.bind();
    }
  
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: false });
  
    panel.addEventListener("mousedown", onDown);
    panel.addEventListener("touchstart", onDown, { passive: false });
  }

  function enableAMXPanelResize(panel) {
    if (!panel || panel._amxResizeEnabled) return;
    panel._amxResizeEnabled = true;
  
    const handles = [
      { dir: "n",  cursor: "ns-resize",   type: "edge" },
      { dir: "s",  cursor: "ns-resize",   type: "edge" },
      { dir: "w",  cursor: "ew-resize",   type: "edge" },
      { dir: "e",  cursor: "ew-resize",   type: "edge" },
      { dir: "nw", cursor: "nwse-resize", type: "corner" },
      { dir: "ne", cursor: "nesw-resize", type: "corner" },
      { dir: "sw", cursor: "nesw-resize", type: "corner" },
      { dir: "se", cursor: "nwse-resize", type: "corner" }
    ];

    handles.forEach(cfg => {
      const grip = document.createElement("div");
      grip.className = "amx-resize-handle amx-resize-" + cfg.dir;
      grip.dataset.amxNoDrag = "1";
      grip.style.position = "absolute";
      grip.style.zIndex = "30";
      grip.style.cursor = cfg.cursor;
      grip.style.userSelect = "none";
      grip.style.touchAction = "none";
      grip.style.background = "transparent";

      // Keep resize hit-zones INSIDE the panel. Because the panel uses
      // overflow:hidden, external hit-zones are clipped and hard to grab.
      if (cfg.type === "corner") {
        grip.style.width = "32px";
        grip.style.height = "32px";
      } else if (cfg.dir === "n" || cfg.dir === "s") {
        grip.style.left = "24px";
        grip.style.right = "24px";
        grip.style.height = "18px";
      } else {
        grip.style.top = "24px";
        grip.style.bottom = "24px";
        grip.style.width = "18px";
      }

      if (cfg.dir.includes("n")) grip.style.top = "0";
      if (cfg.dir.includes("s")) grip.style.bottom = "0";
      if (cfg.dir.includes("w")) grip.style.left = "0";
      if (cfg.dir.includes("e")) grip.style.right = "0";

      grip.style.touchAction = "none";
      grip.style.webkitUserSelect = "none";
      grip.style.userSelect = "none";
  
      panel.appendChild(grip);
  
      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startW = 0;
      let startH = 0;
      let startLeft = 0;
      let startTop = 0;
  
      const pointer = createPointerHandlers({
        onMove: (e, pt) => {
          if (!isResizing) return;
          if (e.cancelable) e.preventDefault();
  
          const dx = pt.clientX - startX;
          const dy = pt.clientY - startY;
  
          const vw = window.innerWidth || document.documentElement.clientWidth || 0;
          const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  
          const minW = 290;
          const minH = 140;
  
          let newW = startW;
          let newH = startH;
          let newLeft = startLeft;
          let newTop = startTop;
  
          if (cfg.dir.includes("e")) {
            newW = startW + dx;
          }
          if (cfg.dir.includes("s")) {
            newH = startH + dy;
          }
          if (cfg.dir.includes("w")) {
            newW = startW - dx;
            newLeft = startLeft + dx;
          }
          if (cfg.dir.includes("n")) {
            newH = startH - dy;
            newTop = startTop + dy;
          }
  
          if (newW < minW) {
            if (cfg.dir.includes("w")) newLeft -= (minW - newW);
            newW = minW;
          }
  
          if (newH < minH) {
            if (cfg.dir.includes("n")) newTop -= (minH - newH);
            newH = minH;
          }
  
          if (newLeft < 0) {
            newW += newLeft;
            newLeft = 0;
            if (newW < minW) newW = minW;
          }
  
          if (newTop < 0) {
            newH += newTop;
            newTop = 0;
            if (newH < minH) newH = minH;
          }
  
          if (newLeft + newW > vw) {
            if (cfg.dir.includes("e")) {
              newW = vw - newLeft - 20;
            } else {
              newLeft = Math.max(0, vw - newW - 20);
            }
          }
  
          if (newTop + newH > vh) {
            if (cfg.dir.includes("s")) {
              newH = vh - newTop - 20;
            } else {
              newTop = Math.max(0, vh - newH - 20);
            }
          }
  
          if (newW < minW) newW = minW;
          if (newH < minH) newH = minH;
  
          panel.style.left = newLeft + "px";
          panel.style.top = newTop + "px";
          panel.style.right = "auto";
          panel.style.bottom = "auto";
          panel.style.width = newW + "px";
          panel.style.height = newH + "px";
          panel.style.minHeight = minH + "px";
          panel.style.maxHeight = Math.max(minH, window.innerHeight - newTop - 8) + "px";
  
          scheduleAMXContentScrollingUpdate(panel);
  
          panel._amxUserMoved = true;
          panel._amxUserResized = true;
        },
  
        onUp: () => {
          if (!isResizing) return;
          isResizing = false;
  
          saveAMXPanelGeometry(panel);
        }
      });
  
      function onDown(e) {
        if (e.type === "mousedown" && e.button !== 0) return;
        const pt = pointer.getPoint(e);
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
  
        const rect = panel.getBoundingClientRect();
  
        isResizing = true;
        startX = pt.clientX;
        startY = pt.clientY;
        startW = rect.width;
        startH = rect.height;
        startLeft = rect.left;
        startTop = rect.top;
  
        pointer.bind();
      }
  
      grip.addEventListener("mousedown", onDown);
      grip.addEventListener("touchstart", onDown, { passive: false });
    });
  }

  // SETTINGS PANEL UI
  // ──────────────
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
      topBar.style.background = "transparent";
      topBar.style.flex = "0 0 auto";

      const title = document.createElement("div");
      title.id = "amx-panel-title";
      title.innerHTML = `<div style="font-size:18px; font-weight:700;">
          AUDIOMETRIX SETTINGS</div>
        <div style="font-size:16px; font-weight:600; margin-top:2px;">
          v${AMX_VERSION}</div>`;
      title.style.display = "flex";
      title.style.flexDirection = "column";
      title.style.lineHeight = "1.1";
      title.style.color = "var(--color-4)";
      title.style.textShadow = "0 0 4px rgba(0,0,0,0.55)";

      const closeBtn = document.createElement("div");
      closeBtn.dataset.amxNoDrag = "1";
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
      content.style.display = "flow-root";
      content.style.flex = "1 1 auto";
      content.style.minHeight = "0";
      content.style.overflowY = "auto";
      content.style.overflowX = "hidden";
      content.style.maxHeight = "none";
      content.style.webkitOverflowScrolling = "touch";

      // UPDATE BANNER
      const updateBanner = document.createElement("div");
      updateBanner.id = "amx-update-banner";
      updateBanner.style.display = "none";
      updateBanner.style.width = "100%";
      updateBanner.style.boxSizing = "border-box";
      updateBanner.style.padding = "4px 8px 6px 10px";
      updateBanner.style.margin = "0 0 6px 0";
      updateBanner.style.fontSize = "12px";
      updateBanner.style.fontWeight = "600";
      updateBanner.style.color = "var(--color-5)";
      updateBanner.style.textShadow = "0 0 3px rgba(0,0,0,0.55)";
      updateBanner.style.background = "rgba(0,0,0,0.25)";
      updateBanner.style.borderRadius = "8px";
      updateBanner.style.border = "1px solid var(--color-3)";
      updateBanner.style.boxShadow =
        "0 0 6px rgba(0,0,0,0.45), inset 0 0 4px rgba(255,255,255,0.15)";

      content.appendChild(updateBanner);
      STATE.dom.updateBanner = updateBanner;

      panel.appendChild(content);

      // Store references for dynamic resizing
      panel._amxContentArea = content;
      panel._amxTopBar = topBar;

      if (typeof ResizeObserver === "function") {
        const panelOverflowObserver = new ResizeObserver(() => {
          if (panel.style.display !== "none") {
            scheduleAMXContentScrollingUpdate(panel);
          }
        });
        panelOverflowObserver.observe(panel);
        panel._amxOverflowObserver = panelOverflowObserver;
      }

      applyAMXUpdateBanner();

      // Enable dragging + resize
      enableAMXPanelDragging(panel, title);
      enableAMXPanelResize(panel);

      injectAMXPanelStyles();

      function bindDropdown(input, optionsSelector, onSelect) {
        if (!input) return;

        const opts = document.querySelector(optionsSelector);
        if (!opts) return;

        input.onclick = () => {
          opts.classList.toggle("opened");
        };

        // Event delegation keeps dynamically replaced option sets functional.
        opts.onclick = (event) => {
          const opt = event.target.closest(".option");
          if (!opt || !opts.contains(opt)) return;

          const val = opt.dataset.value;
          input.value = opt.textContent;

          if (typeof onSelect === "function") {
            onSelect(val, opt);
          }

          opts.classList.remove("opened");
        };
      }

      function appendSettingsSectionTitle(label) {
        const title = document.createElement("div");
        title.className = "amx-settings-section amx-settings-section-title";
        title.dataset.amxNoDrag = "1";
        title.textContent = label;
        content.appendChild(title);
        return title;
      }

      // THEMING
      appendSettingsSectionTitle("THEMING");

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
            <div class="option" data-value="galactica">Galactica</div>
            <div class="option" data-value="goldenbrown">Golden Brown</div>
            <div class="option" data-value="heatmap">Heatmap</div>
            <div class="option" data-value="iceblue">Ice Blue</div>
            <div class="option" data-value="neonlights">Neon Lights</div>
            <div class="option" data-value="pastel">Pastel</div>
            <div class="option" data-value="prism">Prism</div>
            <div class="option" data-value="redvelvet">Red Velvet</div>
            <div class="option" data-value="retrospect">Retrospect</div>
            <div class="option" data-value="scarlet">Scarlet</div>
            <div class="option" data-value="secretgarden">Secret Garden</div>
            <div class="option" data-value="solar">Solar</div>
            <div class="option" data-value="spaceship">Spaceship</div>
            <div class="option" data-value="wicked">Wicked</div>
            <div class="option" data-value="valentines">Valentines</div>
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

      bindDropdown(themeInput, "#amx-theme-options", (val) => {
        if (!VALID_THEMES.includes(val)) return;

        safeLSSet(STORAGE_THEME, val);
        if (val === "automatic") {
          refreshAutomaticTheme(true);
        } else {
          ACTIVE_THEME = THEME_REGISTRY[val];
          invalidateVisualCaches();
        }
        requestRender();
      });

      // BAR STYLE AVAILABILITY (renderMode dependent)
      function updateBarStyleAvailability() {
        const disabled =
          CONFIG.display.layoutMode === "oscilloscope" ||
          (
            CONFIG.display.layoutMode === "equalizer" &&
            CONFIG.display.equalizerRenderMode === "spectrum"
          ) ||
          (
            CONFIG.display.layoutMode !== "equalizer" &&
            CONFIG.display.layoutMode !== "vuHybrid" &&
            CONFIG.display.layoutMode !== "oscilloscope" &&
            (
              CONFIG.display.renderMode === "gauges" ||
              CONFIG.display.renderMode === "analogVu"
            )
          );

        styleDiv.classList.toggle("is-disabled", disabled);
      }

      // BAR STYLE SELECTOR
      const styleDiv = document.createElement("div");
      styleDiv.className = "form-group";
      updateBarStyleAvailability();

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

      bindDropdown(styleInput, "#amx-barstyle-options", (val) => {
        if (!VALID_STYLES.includes(val)) return;

        CONFIG.display.barStyle = val;
        safeLSSet(STORAGE_BARSTYLE, val);
        invalidateVisualCaches();
        updateMirroredCanvasHeight();
        requestRender();
      });

      // GLOW ENABLE / DISABLE
      {
        const wrapper = document.createElement("div");
        wrapper.className = "form-group amx-compact-row";
        wrapper.innerHTML = `
          <div style="display:flex; align-items:center;">
            <label class="form-label">
              <i class="fa-solid m-right-10"></i>ENABLE GLOW ON BARS
            </label>
            <div class="switch"
                 style="display:flex;
                        transform:scale(0.6);
                        transform-origin:left center;
                        margin-left:30px;">
              <input type="checkbox" id="glow-toggle">
              <label for="glow-toggle"></label>
            </div>
          </div>
        `;

        content.appendChild(wrapper);

        const cb = wrapper.querySelector("#glow-toggle");
        cb.checked = CONFIG.display.glowIntensity === 1;

        cb.addEventListener("change", () => {
          safeLSSet(STORAGE_GLOW_ENABLED, cb.checked ? "true" : "false");
          CONFIG.display.glowIntensity = cb.checked ? 1 : 0;
          invalidateVisualCaches();
          requestRender();
        });
      }


      // DISPLAY
      appendSettingsSectionTitle("DISPLAY");

      // LAYOUT MODE SELECTOR
      const layoutDiv = document.createElement("div");
      layoutDiv.className = "form-group";
      layoutDiv.innerHTML = `
        <label class="form-label"><i class="fa-solid m-right-10"></i>LAYOUT MODE</label>
        <div class="dropdown">
          <input type="text" id="amx-layout-input" class="form-control" readonly>
          <div id="amx-layout-options" class="options">
            <div class="option" data-value="lr">Stereo levels</div>
            <div class="option" data-value="sa">Stereo quality &amp; RMS+Peak</div>
            <div class="option" data-value="full">Audio levels (Full mode)</div>
            <div class="option" data-value="equalizer">Equalizer</div>
            <div class="option" data-value="vuHybrid">Vu Hybrid</div>
            <div class="option" data-value="oscilloscope">Oscilloscope</div>
          </div>
        </div>
      `;
      content.appendChild(layoutDiv);

      const layoutInput = document.getElementById("amx-layout-input");
      const savedLayout = CONFIG.display.layoutMode;
      layoutInput.value =
        savedLayout === "lr" ? "Stereo levels" :
        savedLayout === "sa" ? "Stereo quality & RMS+Peak" :
        savedLayout === "full" ? "Audio levels (Full mode)" :
        savedLayout === "vuHybrid" ? "Vu Hybrid" :
        savedLayout === "oscilloscope" ? "Oscilloscope" :
        "Equalizer";

      bindDropdown(layoutInput, "#amx-layout-options", (val) => {
        if (!["lr", "sa", "full", "equalizer", "vuHybrid", "oscilloscope"].includes(val)) return;
        CONFIG.display.layoutMode = val;
        safeLSSet("AMX_LAYOUT_MODE", val);

        if (val === "equalizer" && CONFIG.display.renderMode !== "bars") {
          STATE._renderBeforeEqualizer = CONFIG.display.renderMode;
          CONFIG.display.renderMode = "bars";
          const renderInput = document.getElementById("amx-render-input");
          if (renderInput) renderInput.value = "Bars";
        } else if (
          val !== "equalizer" &&
          STATE._renderBeforeEqualizer &&
          ["bars", "gauges", "mirrored", "analogVu"].includes(STATE._renderBeforeEqualizer)
        ) {
          CONFIG.display.renderMode = STATE._renderBeforeEqualizer;
          const renderInput = document.getElementById("amx-render-input");
          if (renderInput) {
            renderInput.value =
              CONFIG.display.renderMode === "gauges" ? "Gauges" :
              CONFIG.display.renderMode === "analogVu" ? "Analog VU" :
              CONFIG.display.renderMode === "mirrored" ? "Mirrored" :
              "Bars";
          }
          STATE._renderBeforeEqualizer = null;
        }

        if (
          CONFIG.display.renderMode === "mirrored" &&
          val !== "vuHybrid" &&
          !MIRRORED_LAYOUTS.includes(val)
        ) {
          CONFIG.display.renderMode = "bars";
          safeLSSet("AMX_RENDER_MODE", "bars");
          const renderInput = document.getElementById("amx-render-input");
          if (renderInput) renderInput.value = "Bars";
        }

        updateBarStyleAvailability();
        const renderGroup = document.getElementById("amx-render-group");
        if (renderGroup) {
          renderGroup.classList.remove("is-disabled");
        }
        syncRenderSelectorOptions();
        invalidateVisualCaches();
        updateMirroredCanvasHeight();
        requestRender();
      });

      // RENDER STYLE SELECTOR
      const renderDiv = document.createElement("div");
      renderDiv.id = "amx-render-group";
      renderDiv.className = "form-group";
      renderDiv.innerHTML = `
        <label class="form-label"><i class="fa-solid m-right-10"></i>RENDER STYLE</label>
        <div class="dropdown">
          <input type="text" id="amx-render-input" class="form-control" readonly>
          <div id="amx-render-options" class="options">
            <div class="option" data-value="bars">Bars</div>
            <div class="option" data-value="mirrored">Mirrored</div>
            <div class="option" data-value="gauges">Gauges</div>
            <div class="option" data-value="analogVu">Analog VU</div>
          </div>
        </div>
      `;
      content.appendChild(renderDiv);

      const renderInput = document.getElementById("amx-render-input");
      const savedRender = CONFIG.display.renderMode;
      renderInput.value =
        CONFIG.display.layoutMode === "equalizer" ? "Bars" :
        savedRender === "bars" ? "Bars" :
        savedRender === "gauges" ? "Gauges" :
        savedRender === "analogVu" ? "Analog VU" :
        "Mirrored";

      bindDropdown(renderInput, "#amx-render-options", (val) => {
        if (CONFIG.display.layoutMode === "vuHybrid") {
          if (!HYBRID_MODES.includes(val)) return;
          CONFIG.display.hybridMode = val;
          safeLSSet(STORAGE_HYBRID_MODE, val);
          invalidateVisualCaches();
          requestRender();
          return;
        }

        if (CONFIG.display.layoutMode === "equalizer") {
          if (!["bars", "spectrum"].includes(val)) return;
          CONFIG.display.equalizerRenderMode = val;
          safeLSSet(STORAGE_EQ_RENDER, val);
          updateBarStyleAvailability();
          invalidateVisualCaches();
          requestRender();
          return;
        }

        if (CONFIG.display.layoutMode === "oscilloscope") {
          if (!["lines", "filled", "dots", "steps", "persistence", "envelope", "spindle"].includes(val)) return;
          CONFIG.display.oscilloscopeStyle = val;
          safeLSSet(STORAGE_SCOPE_STYLE, val);
          invalidateVisualCaches();
          requestRender();
          return;
        }

        if (
          val === "mirrored" &&
          !MIRRORED_LAYOUTS.includes(CONFIG.display.layoutMode)
        ) {
          showAMXSoftMessage(
            "Mirrored mode is only available with Stereo levels, Stereo quality & RMS+Peak, or Full mode.",
            "fa-triangle-exclamation"
          );
        
          renderInput.value =
            CONFIG.display.renderMode === "bars" ? "Bars" :
            CONFIG.display.renderMode === "gauges" ? "Gauges" :
            CONFIG.display.renderMode === "analogVu" ? "Analog VU" :
            "Mirrored";
        
          return;
        }

        CONFIG.display.renderMode = val;
        safeLSSet("AMX_RENDER_MODE", val);
        updateBarStyleAvailability();
        invalidateVisualCaches();
        updateMirroredCanvasHeight();
        requestRender();
      });

      function syncRenderSelectorOptions() {
        const options = document.getElementById("amx-render-options");
        if (!options || !renderInput) return;

        if (CONFIG.display.layoutMode === "vuHybrid") {
          options.innerHTML = `
            <div class="option" data-value="stereo12">Stereo levels &amp; 12-band EQ</div>
            <div class="option" data-value="audio10">Audio levels &amp; 10-band EQ</div>
          `;
          renderInput.value =
            CONFIG.display.hybridMode === "audio10"
              ? "Audio levels & 10-band EQ"
              : "Stereo levels & 12-band EQ";
          return;
        }

        if (CONFIG.display.layoutMode === "equalizer") {
          options.innerHTML = `
            <div class="option" data-value="bars">Bars</div>
            <div class="option" data-value="spectrum">Spectrum</div>
          `;
          renderInput.value =
            CONFIG.display.equalizerRenderMode === "spectrum"
              ? "Spectrum"
              : "Bars";
          return;
        }

        if (CONFIG.display.layoutMode === "oscilloscope") {
          options.innerHTML = `
            <div class="option" data-value="lines">Lines</div>
            <div class="option" data-value="filled">Filled</div>
            <div class="option" data-value="dots">Dots</div>
            <div class="option" data-value="steps">Steps</div>
            <div class="option" data-value="persistence">Persistence</div>
            <div class="option" data-value="envelope">Carrier / Envelope</div>
            <div class="option" data-value="spindle">Spindle</div>
          `;

          renderInput.value =
            CONFIG.display.oscilloscopeStyle === "filled" ? "Filled" :
            CONFIG.display.oscilloscopeStyle === "dots" ? "Dots" :
            CONFIG.display.oscilloscopeStyle === "steps" ? "Steps" :
            CONFIG.display.oscilloscopeStyle === "persistence" ? "Persistence" :
            CONFIG.display.oscilloscopeStyle === "envelope" ? "Carrier / Envelope" :
            CONFIG.display.oscilloscopeStyle === "spindle" ? "Spindle" :
            "Lines";
          return;
        }

        options.innerHTML = `
          <div class="option" data-value="bars">Bars</div>
          <div class="option" data-value="mirrored">Mirrored</div>
          <div class="option" data-value="gauges">Gauges</div>
          <div class="option" data-value="analogVu">Analog VU</div>
        `;
        renderInput.value =
          CONFIG.display.layoutMode === "equalizer" ? "Bars" :
          CONFIG.display.renderMode === "gauges" ? "Gauges" :
          CONFIG.display.renderMode === "analogVu" ? "Analog VU" :
          CONFIG.display.renderMode === "mirrored" ? "Mirrored" :
          "Bars";
      }

      syncRenderSelectorOptions();

      // SHOW PEAK INDICATOR
      {
        const wrapper = document.createElement("div");
        wrapper.className = "form-group amx-compact-row";
        wrapper.innerHTML = `
          <div style="display:flex; align-items:center;">
            <label class="form-label">
              <i class="fa-solid m-right-10"></i>SHOW PEAK INDICATORS
            </label>
            <div class="switch"
                 style="display:flex; align-items:right;
                        transform:scale(0.6);
                        transform-origin:left center;
                        margin-left:25px;">
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

          safeLSSet(
            STORAGE_SHOW_PEAKS,
            cb.checked ? "true" : "false"
          );

          invalidateVisualCaches();
          requestRender();
        });
      }

      // SHOW REAL-TIME VALUES
      const readoutsDiv = document.createElement("div");
      readoutsDiv.className = "form-group amx-compact-row";
      readoutsDiv.innerHTML = `
        <div style="display:flex; align-items:center;">
          <label class="form-label">
            <i class="fa-solid m-right-10"></i>SHOW REAL TIME VALUES
          </label>
          <div class="switch"
               style="display:flex; align-items:right;
                      transform:scale(0.6);
                      transform-origin:left center;
                      margin-left:21px;">
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
        requestRender();
      });

      // AUDIO RESPONSE
      appendSettingsSectionTitle("AUDIO RESPONSE");

      // AUDIO RESPONSE PANEL
      const audioDiv = document.createElement("div");
      audioDiv.className = "form-group";
      audioDiv.innerHTML = `
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
          <input id="gain-slider" type="range" min="-15" max="15" step="1" />
          <span id="gain-value" class="text-small"></span>
        </div>
      `;
      content.appendChild(audioDiv);


      // ADMIN-ONLY DIAGNOSTICS
      // This section is not created at all for normal users.
      if (isFMdxAdmin()) {
        appendSettingsSectionTitle("DIAGNOSTICS");

        const diagnosticsDiv = document.createElement("div");
        diagnosticsDiv.className = "form-group amx-diagnostics-row";
        diagnosticsDiv.id = "amx-admin-diagnostics-setting";
        diagnosticsDiv.dataset.amxNoDrag = "1";

        const diagnosticsRow = document.createElement("div");
        diagnosticsRow.style.display = "flex";
        diagnosticsRow.style.alignItems = "center";
        diagnosticsRow.style.justifyContent = "space-between";
        diagnosticsRow.style.gap = "10px";

        const diagnosticsLabel = document.createElement("div");
        diagnosticsLabel.innerHTML = `
          <div class="text-small text-bold">ADMIN RUNTIME DATA</div>
          <div class="text-small" style="opacity:.68; margin-top:2px;">
            Audio / rendering information
          </div>
        `;

        const diagnosticsSwitch = document.createElement("div");
        diagnosticsSwitch.className = "switch";
        diagnosticsSwitch.style.display = "flex";
        diagnosticsSwitch.style.alignItems = "center";
        diagnosticsSwitch.innerHTML = `
          <input type="checkbox" id="amx-diagnostics-toggle">
          <label for="amx-diagnostics-toggle"></label>
        `;

        diagnosticsRow.appendChild(diagnosticsLabel);
        diagnosticsRow.appendChild(diagnosticsSwitch);
        diagnosticsDiv.appendChild(diagnosticsRow);
        content.appendChild(diagnosticsDiv);

        const diagnosticsCb =
          diagnosticsSwitch.querySelector("#amx-diagnostics-toggle");

        diagnosticsCb.checked = isAdminDiagnosticsEnabled();
        diagnosticsCb.addEventListener("change", () => {
          safeLSSet(
            STORAGE_DIAGNOSTICS,
            diagnosticsCb.checked ? "true" : "false"
          );

          // Apply immediately; no page refresh required.
          updateDiagnosticsOverlay();
        });
      }

      // PEAK HOLD
      const peakHoldSlider = document.getElementById("peak-hold-slider");
      const peakHoldValue = document.getElementById("peak-hold-value");
      peakHoldSlider.value = CONFIG.audio.peakHoldMs;
      peakHoldValue.textContent = CONFIG.audio.peakHoldMs;

      peakHoldSlider.oninput = () => {
        const v = parseInt(peakHoldSlider.value, 10);
        const clamped = Math.min(2000, Math.max(50, isNaN(v) ? 1000 : v));
        peakHoldValue.textContent = clamped;
        CONFIG.audio.peakHoldMs = clamped;
        safeLSSet(STORAGE_PEAK_HOLD, String(clamped));
      };

      // ATTACK
      const attackSlider = document.getElementById("attack-slider");
      const attackValue = document.getElementById("attack-value");
      attackSlider.value = CONFIG.audio.attackSpeed;
      attackValue.textContent = Number(CONFIG.audio.attackSpeed).toFixed(2);

      attackSlider.oninput = () => {
        const v = parseFloat(attackSlider.value);
        const clamped = Math.min(1.0, Math.max(0.05, isNaN(v) ? 0.45 : v));
        attackValue.textContent = clamped.toFixed(2);
        CONFIG.audio.attackSpeed = clamped;
        safeLSSet(STORAGE_ATTACK, String(clamped));
      };

      // RELEASE
      const releaseSlider = document.getElementById("release-slider");
      const releaseValue = document.getElementById("release-value");
      releaseSlider.value = CONFIG.audio.releaseSpeed;
      releaseValue.textContent = Number(CONFIG.audio.releaseSpeed).toFixed(2);

      releaseSlider.oninput = () => {
        const v = parseFloat(releaseSlider.value);
        const clamped = Math.min(1.0, Math.max(0.05, isNaN(v) ? 0.65 : v));
        releaseValue.textContent = clamped.toFixed(2);
        CONFIG.audio.releaseSpeed = clamped;
        safeLSSet(STORAGE_RELEASE, String(clamped));
      };

      // GAIN
      const gainSlider = document.getElementById("gain-slider");
      const gainValue = document.getElementById("gain-value");
      gainSlider.value = CONFIG.audio.dbGain;
      gainValue.textContent = CONFIG.audio.dbGain;

      gainSlider.oninput = () => {
        const v = parseInt(gainSlider.value, 10);
        const nv = isNaN(v) ? 0 : Math.min(15, Math.max(-15, v));
        CONFIG.audio.dbGain = nv;
        gainValue.textContent = nv;
        safeLSSet(STORAGE_GAIN, String(nv));
      };

    } catch (e) {
      console.error("[AudioMetrix Floating Settings]", e);
    }
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

    let activeCanvas = null;

    if (type === "mirrored") {
      activeCanvas = cm;
    } else if (type === "gauges" || type === "analogVu") {
      activeCanvas = cg;
    } else {
      // NORMAL (default)
      activeCanvas = cn;
    }

    if (activeCanvas) {
      activeCanvas.style.display = "block";
      activeCanvas.style.visibility = "visible";
      activeCanvas.style.pointerEvents = "auto";
      STATE.dom.canvas = activeCanvas;
      STATE.dom.ctx = activeCanvas.getContext("2d");
    }
  }

  let READOUT_FRAME_SKIP = 5;
  let _readoutFrame = 0;
  let _lastVisualStateKey = null;

  const RENDER_GATE = {
    rafId: null,
    dirty: false
  };

  // ================================================================
  // END FLOATING SETTINGS PANEL MODULE
  // ================================================================

  function requestRender() {
    RENDER_GATE.dirty = true;

    // If audio RAF isn't running yet (idle/stop state), redraw immediately
    if (
      !STATE.audio ||
      !STATE.audio.analyserLeft ||
      !STATE.audio.analyserRight ||
      !STATE.audio.analyserPeak
    ) {
      renderMeters();
    }
  }

  function shouldRunAudio() {
    const c = STATE.audioCadence;
    c.frame++;

    if (c.frame < c.interval) return false;

    c.frame = 0;
    return true;
  }

  function shouldReadSpectrumSnapshot() {
    const c = STATE.spectrumCadence;
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

  function markLayoutDirty() {
    STATE.layout.dirty = true;
  }

  // HiDPI rendering: keep all meter geometry in logical CSS pixels while
  // allocating a denser backing store for Retina/high-DPI displays and zoom.
  const AMX_MAX_RENDER_DPR = 2;

  function getAMXRenderDpr() {
    const raw = Number(window.devicePixelRatio) || 1;
    // Keep a modest supersampling floor so browser zoom below 100% still
    // receives enough backing-store pixels, while avoiding fractional
    // logical geometry and the vertical seams it caused in bar fills.
    return Math.max(1.25, Math.min(AMX_MAX_RENDER_DPR, raw));
  }

  function getCanvasLogicalWidth(canvas) {
    if (!canvas) return 0;
    return Number(canvas._amxLogicalWidth) || 0;
  }

  function getCanvasLogicalHeight(canvas) {
    if (!canvas) return 0;
    return Number(canvas._amxLogicalHeight) || 0;
  }

  function getCanvasRenderedWidth(canvas) {
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.round(rect.width || 0));
  }

  function getExpectedCanvasWidth(canvas) {
    const wrapperW = Math.max(0, Math.round(STATE.layout.width || 0));
    if (!wrapperW) return getCanvasLogicalWidth(canvas);

    if (canvas === STATE.dom.canvasMirror) {
      const left = Math.max(4, CONFIG.display.dimensions.canvasLeft - 20);
      return Math.max(1, wrapperW - left - Math.max(8, CONFIG.display.dimensions.canvasLeft - 15));
    }

    if (canvas === STATE.dom.canvasGauges) {
      // Gauges use a symmetric full-width drawing surface so their group can
      // be mathematically centered in the tile without clipping either edge.
      return Math.max(1, wrapperW - 10);
    }

    // Normal bars keep their original inset track.
    return Math.max(1, wrapperW - CONFIG.display.dimensions.canvasLeft - 5);
  }

  function applyCanvasHiDpiTransform(canvas) {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const dpr = Number(canvas._amxDpr) || getAMXRenderDpr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function refreshLayoutAndCanvas() {
    const prevW = STATE.layout.width;
    const prevH = STATE.layout.height;
    const prevDpr = STATE.layout.dpr || 1;

    markLayoutDirty();
    readLayoutOnce();
    STATE.layout.dpr = getAMXRenderDpr();

    const layoutChanged =
      STATE.layout.width !== prevW ||
      STATE.layout.height !== prevH;
    const dprChanged = STATE.layout.dpr !== prevDpr;

    if (layoutChanged || dprChanged) {
      invalidateVisualCaches();

      // Reallocate existing canvases at the new density without changing
      // their logical drawing coordinates or current layout heights.
      [
        STATE.dom.canvasNormal,
        STATE.dom.canvasMirror,
        STATE.dom.canvasGauges
      ].forEach((canvas) => {
        if (!canvas) return;
        const renderedW = getCanvasRenderedWidth(canvas);
        const logicalW = renderedW > 40
          ? renderedW
          : getExpectedCanvasWidth(canvas);
        const logicalH = getCanvasLogicalHeight(canvas);
        if (logicalW > 0 && logicalH > 0) {
          resizeCanvasIfNeeded(canvas, logicalW, logicalH);
        }
      });
    }

    requestRender();
  }

  function resizeCanvasIfNeeded(canvas, w, h) {
    if (!canvas) return false;

    // Keep logical meter geometry on integer CSS pixels. Fractional logical
    // widths combined with a rounded backing store can create faint vertical
    // seams between adjacent 1px bar columns.
    const logicalW = Math.max(1, Math.round(Number(w) || 1));
    const logicalH = Math.max(1, Math.round(Number(h) || 1));
    const dpr = getAMXRenderDpr();
    const pixelW = Math.max(1, Math.round(logicalW * dpr));
    const pixelH = Math.max(1, Math.round(logicalH * dpr));

    let changed = false;

    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      changed = true;
    }

    canvas._amxLogicalWidth = logicalW;
    canvas._amxLogicalHeight = logicalH;
    canvas._amxDpr = dpr;
    delete canvas._amxScaleX;
    delete canvas._amxScaleY;

    // Keep the authored CSS width (usually calc(...)) intact. The backing
    // store follows the actually rendered width; forcing a px width here
    // breaks gauge/label alignment and can clip mirrored mode.
    const sh = logicalH + "px";

    if (canvas.style.height !== sh) {
      canvas.style.height = sh;
      changed = true;
    }

    applyCanvasHiDpiTransform(canvas);
    STATE.layout.dpr = dpr;
    return changed;
  }

  function updateMirroredCanvasHeight() {
    const cm = STATE.dom.canvasMirror;
    if (!cm) return;

    const { singlePanelHeight, canvasOffsetY } = getMirroredLayoutMetrics();

    const nextSize = singlePanelHeight + "px";
    const nextTransform =
      canvasOffsetY !== 0 ? `translateY(${canvasOffsetY}px)` : "";

    if (cm.style.height !== nextSize) {
      cm.style.height = nextSize;
    }
    if (cm.style.minHeight !== nextSize) {
      cm.style.minHeight = nextSize;
    }
    if (cm.style.transform !== nextTransform) {
      cm.style.transform = nextTransform;
    }
  }

  function getFullMirroredMetrics() {
    const barH = CONFIG.display.dimensions.barHeight;
    const gap = CONFIG.display.dimensions.spacing;
    const extraScaleBand = 18;

    // Fixed overlay reference height so labels/readouts stay stable
    // across all styles, including circledots and matrixdots.
    const height_mirrored = barH * 2 + gap + 15 + extraScaleBand;

    const mirrorHeightTrim = 16;
    const rowGap = 8;
    const mirroredYOffset = Math.floor(mirrorHeightTrim / 2);
    const singleRowHeight =
      Math.floor((height_mirrored - mirrorHeightTrim - rowGap) / 2);

    const halfRow = singleRowHeight / 2;
    const baseTopCenter =
      Math.floor(mirroredYOffset + halfRow);

    const baseBottomCenter =
      Math.floor(singleRowHeight + rowGap + mirroredYOffset + halfRow);

    const topCenterY = baseTopCenter + 4;
    const bottomCenterY = baseBottomCenter + 6;

    const readoutTopY = baseTopCenter + 8;
    const readoutBottomY = baseBottomCenter + 8;

    return {
      height_mirrored,
      mirrorHeightTrim,
      rowGap,
      mirroredYOffset,
      singleRowHeight,
      topCenterY,
      bottomCenterY,
      readoutTopY,
      readoutBottomY
    };
  }

  function getMirroredLayoutMetrics() {
    const barH = CONFIG.display.dimensions.barHeight;
    const gap = CONFIG.display.dimensions.spacing;
    const style = CONFIG.display.barStyle;
    const extraScaleBand = 18;

    const CircleDots = style === "circledots";
    const MatrixDots = style === "matrixdots";

    let singlePanelHeight;
    if (CircleDots) {
      singlePanelHeight = Math.round(barH * 3.2) + extraScaleBand;
    } else if (MatrixDots) {
      singlePanelHeight = Math.round(barH * 3.6) + extraScaleBand;
    } else {
      singlePanelHeight = barH * 2 + gap + 15 + extraScaleBand;
    }

    let canvasOffsetY = 0;
    if (CircleDots) {
      canvasOffsetY = -Math.round(barH * 0.32);
    } else if (MatrixDots) {
      canvasOffsetY = -Math.round(barH * 0.22);
    }

    let mirrorHeightTrim = 16;
    if (CircleDots || MatrixDots) {
      mirrorHeightTrim = 12;
    }

    const mirroredBarH = singlePanelHeight - mirrorHeightTrim;
    const mirroredYOffset = Math.floor(mirrorHeightTrim / 2);

    return {
      singlePanelHeight,
      canvasOffsetY,
      mirrorHeightTrim,
      mirroredBarH,
      mirroredYOffset
    };
  }

  // MAP DB → X ABSOLUTE POSITION
  function mapDbToX(db, width) {
    const min = CONFIG.audio.minDb;
    const max = CONFIG.audio.maxDb;
    const range = max - min;
    if (db < min) db = min;
    else if (db > max) db = max;
    return (db - min) * width / range;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function fracFromDb(db, widthRef) {
    return clamp01(mapDbToX(db, widthRef) / widthRef);
  }

  function getStereoDb(sideKey, fallbackDb) {
    const side = STATE && STATE.levels && STATE.levels[sideKey];
    return (side && typeof side.smoothDb === "number") ? side.smoothDb : fallbackDb;
  }

  function mapStereoQualityToDbRange(q, minDb, range) {
    const qClamped = Math.max(0, Math.min(STEREO_Q_MAX, q));

    let ratio;
    if (qClamped <= 100) {
      ratio = (qClamped / 100) * STEREO_Q_SIGNAL_RATIO;
    } else {
      ratio =
        STEREO_Q_SIGNAL_RATIO +
        ((qClamped - 100) / 20) * (1 - STEREO_Q_SIGNAL_RATIO);
    }

    return minDb + ratio * range;
  }

  function mapAudioSampleToDb(sample, minDb, range) {
    return minDb + (Math.max(0, Math.min(255, sample)) / 255) * range;
  }

  // EFFECTIVE WIDTH
  function getEffectiveBarWidth(width) {
    const display = CONFIG.display;

    if (
      display.renderMode === "mirrored" &&
      MIRRORED_LAYOUTS.includes(display.layoutMode)
    ) {
      return width;
    }

    if (display.renderMode === "bars") {
      return width - display.dimensions.canvasLeft - 20;
    }

    return width - display.dimensions.canvasLeft - 5;
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

      default:
        return null;
    }
  }

  // READOUT POSITIONING
  function positionReadouts(layout, render) {
    const readouts = STATE.dom.readouts;
    if (!readouts) return;

    function hideReadout(el, resetPosition) {
      if (!el) return;

      if (el.style.display !== "none") {
        el.style.display = "none";
      }

      if (resetPosition) {
        if (el.style.left !== "") {
          el.style.left = "";
        }
        if (el.style.top !== "") {
          el.style.top = "";
        }
        if (el.style.transform !== "") {
          el.style.transform = "";
        }
      }
    }

    // 0) GLOBAL VISIBILITY GUARD
    // (single authority: applyVisualState decides showReadouts, but this keeps safety if called elsewhere)
    if (!CONFIG.display.showReadouts) {
      Object.values(readouts).forEach(el => {
        hideReadout(el, true);
      });
      return;
    }

    const barH = CONFIG.display.dimensions.barHeight;
    const gap  = CONFIG.display.dimensions.spacing;
    const T    = "translate(-100%, -70%)";

    const baseY = INNER_BASE_TOP;
    const xOut  = "calc(100% - 6px)";

    const useMirrored = render === "mirrored" && MIRRORED_LAYOUTS.includes(layout);

    // 1) HIDE ALL FIRST (prevents 0,0 bleed)
    Object.values(readouts).forEach(el => {
      hideReadout(el, false);
    });

    // helper: show + set
    function showAt(key, left, top, transform) {
      const el = readouts[key];
      if (!el) return;

      if (el.style.display !== "") {
        el.style.display = "";
      }

      if (el.style.left !== left) {
        el.style.left = left;
      }

      if (el.style.top !== top) {
        el.style.top = top;
      }

      const tr = transform ?? "";
      if (el.style.transform !== tr) {
        el.style.transform = tr;
      }
    }

    // Gauge labels live inside an inset overlay, while readouts are direct
    // children of the full wrapper. Convert the same normalized gauge centre
    // using the exact active overlay/canvas inset.
    function gaugeReadoutLeft(centerFraction) {
      const f = clamp01(centerFraction);
      const inset = getGaugeHorizontalInset(layout);
      const insetCorrection = inset - (inset * 2) * f;
      const sign = insetCorrection < 0 ? "-" : "+";
      return `calc(${f * 100}% ${sign} ${Math.abs(insetCorrection)}px)`;
    }

    // 2) MIRRORED — outside of bars
    if (useMirrored) {
      let leftTopKey, rightTopKey, leftBottomKey, rightBottomKey;
      let yTop, yBottom;

      if (layout === "full") {
        const metrics = getFullMirroredMetrics();

        yTop = metrics.readoutTopY + "px";
        yBottom = metrics.readoutBottomY + "px";

        leftTopKey = "L";
        rightTopKey = "R";
        leftBottomKey = "Q";
        rightBottomKey = "A";

      } else {
        const y = (INNER_BASE_TOP + barH * 1.28) + "px";

        yTop = y;
        yBottom = null;

        if (layout === "sa") {
          leftTopKey = "Q";
          rightTopKey = "A";
        } else {
          leftTopKey = "L";
          rightTopKey = "R";
        }
      }

      showAt(leftTopKey, "6px", yTop, "translate(0, -70%)");
      showAt(rightTopKey, xOut, yTop, "translate(-100%, -70%)");

      if (yBottom !== null) {
        showAt(leftBottomKey, "6px", yBottom, "translate(0, -70%)");
        showAt(rightBottomKey, xOut, yBottom, "translate(-100%, -70%)");
      }

      return;
    }

    // OSCILLOSCOPE — L/R readouts aligned with the two enlarged lanes.
    if (layout === "oscilloscope") {
      const scopeHeight = 94;
      const scopeGap = 6;
      const scopeLaneH = (scopeHeight - scopeGap) / 2;
      const scopeTopCenter = scopeLaneH * 0.58 - 2;
      const scopeBottomCenter =
        scopeLaneH + scopeGap + scopeLaneH * 0.58 - 2;

      showAt("L", xOut, scopeTopCenter + "px", T);
      showAt("R", xOut, scopeBottomCenter + "px", T);
      return;
    }

    // 3) GAUGES — READOUTS POSITIONING
    if (render === "gauges") {

      const TOP = "40%";
      const TOP_FULL = "35%";
      const T   = "translate(-50%, 0)";

      const centers = getGaugeGeometry(layout).centers;

      // FULL — 4 gauges
      if (layout === "full" && centers.length === 4) {
        showAt("L", gaugeReadoutLeft(centers[0]), TOP_FULL, T);
        showAt("R", gaugeReadoutLeft(centers[1]), TOP_FULL, T);
        showAt("Q", gaugeReadoutLeft(centers[2]), TOP_FULL, T);
        showAt("A", gaugeReadoutLeft(centers[3]), TOP_FULL, T);
        return;
      }

      // SA — 2 gauges (Q / A)
      if (layout === "sa" && centers.length === 2) {
        showAt("Q", gaugeReadoutLeft(centers[0]), TOP, T);
        showAt("A", gaugeReadoutLeft(centers[1]), TOP, T);
        return;
      }

      // LR — 2 gauges (L / R)
      if (layout === "lr" && centers.length === 2) {
        showAt("L", gaugeReadoutLeft(centers[0]), TOP, T);
        showAt("R", gaugeReadoutLeft(centers[1]), TOP, T);
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
        showAt(k, xOut, (TOP_PAD + step * i + barH / 2) + "px", T);
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
  function computeFracAndMode(layout, i, W) {
    const widthRef = W || 1;
    const minDb = CONFIG.audio.minDb;
    const range = (CONFIG.audio.maxDb - minDb) || 1;
    const q = (STATE && STATE.levels && STATE.levels.stereoQuality &&
      typeof STATE.levels.stereoQuality.smooth === "number")
      ? STATE.levels.stereoQuality.smooth
      : 0;

    const aSmooth = (STATE && STATE.levels && STATE.levels.audio &&
      typeof STATE.levels.audio.smooth === "number")
      ? STATE.levels.audio.smooth
      : 0;

    const qualityDb = mapStereoQualityToDbRange(q, minDb, range);
    const audioPeakDb = mapAudioSampleToDb(aSmooth, minDb, range);

    // LR MODE (2 gauges: L, R)
    if (layout === "lr") {
      if (i === 0) {
        return { mode: 0, frac: fracFromDb(getStereoDb("left", minDb), widthRef) };
      }

      return { mode: 0, frac: fracFromDb(getStereoDb("right", minDb), widthRef) };
    }

    // FULL MODE (4 gauges: L, R, Q, A)
    if (layout === "full") {
      if (i === 0) {
        return { mode: 0, frac: fracFromDb(getStereoDb("left", minDb), widthRef) };
      }

      if (i === 1) {
        return { mode: 0, frac: fracFromDb(getStereoDb("right", minDb), widthRef) };
      }

      if (i === 2) {
        return { mode: 2, frac: fracFromDb(qualityDb, widthRef) };
      }

      return { mode: 1, frac: fracFromDb(audioPeakDb, widthRef) };
    }

    // SA MODE (2 gauges: Q, A)
    if (i === 0) {
      return { mode: 2, frac: fracFromDb(qualityDb, widthRef) };
    }

    return { mode: 1, frac: fracFromDb(audioPeakDb, widthRef) };
  }

  // Segmented glass background
  function drawSegmentGlassLayer(ctx, y, height, barW, segW, segGap) {
    ctx.save();

    if (!renderBeveled3D._glassCache) renderBeveled3D._glassCache = new Map();
    const glassKey = `${y}|${height}`;

    let glass = renderBeveled3D._glassCache.get(glassKey);
    if (!glass) {
      glass = ctx.createLinearGradient(0, y, 0, y + height);
      glass.addColorStop(0.00, "rgba(255,255,255,0.45)");
      glass.addColorStop(0.08, "rgba(255,255,255,0.25)");
      glass.addColorStop(0.25, "rgba(255,255,255,0.12)");
      glass.addColorStop(0.55, "rgba(255,255,255,0.03)");
      glass.addColorStop(0.70, "rgba(0,0,0,0.08)");
      glass.addColorStop(0.88, "rgba(0,0,0,0.18)");
      glass.addColorStop(1.00, "rgba(0,0,0,0.28)");
      renderBeveled3D._glassCache.set(glassKey, glass);
    }

    ctx.fillStyle = glass;

    // FULL segmented bar (independent of signal)
    for (let x = 0; x <= barW; x += segW + segGap) {
      ctx.fillRect(x, y, segW, height);
    }

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────
  // STYLE RENDERERS — 7 MODES
  // ─────────────────────────────────────────────────────────

  // 1) SIMPLE BARS
  // -------------
  function renderSimple(ctx, levelX, peakX, y, height, width, gcache) {

    const effectiveW = getEffectiveBarWidth(width);
    const barW = Math.max(0, effectiveW - 5);
    const glowIntensity = CONFIG.display.glowIntensity | 0;

    if (!gcache || !(gcache.colors && gcache.colors.length)) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    const colors = gcache.colors;
    const colorLen = colors.length;
    const minLevel = Math.min(levelX, barW);

    if (minLevel <= 0) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    const h = Math.floor(height);
    const yy = y;
    const fillFloor = Math.floor(minLevel);

    // UNIFIED GEOMETRY CACHE
    const xs = getPixelFillXs(barW);

    const maxX = Math.min(fillFloor, colorLen, xs.length);
    if (glowIntensity > 0 && maxX > 0) {
      ctx.save();
      ctx.globalAlpha = 0.44 * glowIntensity;
      ctx.filter = "blur(7px)";
      ctx.fillStyle = createBarsLinearGradient(ctx, barW, gcache.mode);
      ctx.fillRect(0, yy, maxX, h);
      ctx.restore();
    }

    // DRAW BAR — clean fill above the unified gradient halo.
    if (maxX > 0) {
      ctx.fillStyle = createBarsLinearGradient(ctx, barW, gcache.mode);
      ctx.fillRect(0, yy, maxX, h);
    }

    // EXTERNAL PEAK
    drawExternalPeak(ctx, levelX, peakX, yy, height, effectiveW);
  }

  // 2) SEGMENTED RECTANGLES
  // -------------
  function renderSegment(ctx, levelX, peakX, y, height, width, gcache) {
    const effectiveW = getEffectiveBarWidth(width);
    const barW = Math.max(0, effectiveW - 5);
    const segGap = 2;
    const glowIntensity = CONFIG.display.glowIntensity | 0;

    if (!gcache || !(gcache.colors && gcache.colors.length)) {
      drawExternalPeak(
        ctx,
        levelX,
        peakX,
        y,
        height,
        effectiveW,
        null,
        Math.max(2, Math.floor(height / 2.9)),
        Math.max(2, Math.floor(height / 2.9)) + segGap
      );
      return;
    }

    const colors = gcache.colors;
    const colorLen = colors.length;
    const segmentCache = GEOMETRY_CACHE.segment;

    const doGlow = glowIntensity > 0;

    const renderMode = CONFIG.display.renderMode;
    const layoutMode = CONFIG.display.layoutMode;
    const isMirrored = renderMode === "mirrored" && MIRRORED_LAYOUTS.includes(layoutMode);

    // MIRRORED MODE (LR/SA = 2 ROWS, FULL = 1 ROW)
    if (isMirrored) {
      const isFullMirrored = layoutMode === "full";
      const rows = isFullMirrored ? 1 : 2;
      const rowGap = 8;
      const rowH = isFullMirrored ? height : Math.floor((height - rowGap) / 2);

      const segW = Math.max(2, Math.floor(rowH / 3.2));
      const minLevel = Math.min(levelX, barW);

      const segKey = `${barW}|${segW}|${segGap}`;
      let xs = segmentCache.get(segKey);

      if (!xs) {
        xs = [];
        for (let x = 0; x <= barW; x += segW + segGap) {
          xs.push(x);
        }
        segmentCache.set(segKey, xs);
      }

      for (let r = 0; r < rows; r++) {
        const ry = isFullMirrored ? y : y + r * (rowH + rowGap);

        // static glass layer
        drawSegmentGlassLayer(ctx, ry, rowH, barW, segW, segGap);

        if (minLevel > 0) {
          for (let i = 0, len = xs.length; i < len; i++) {
            const x = xs[i];
            if (x + segW > minLevel) break;

            const colorIndex = Math.min(x, colorLen - 1);
            const segColor = colors[colorIndex];

            // segment fill
            ctx.fillStyle = segColor;
            ctx.fillRect(x, ry, segW, rowH);

            if (doGlow) {
              ctx.save();
              ctx.globalAlpha = 0.50 * glowIntensity;
              ctx.filter = "blur(6px)";
              ctx.fillStyle = segColor;
              ctx.fillRect(x, ry, segW, rowH);
              ctx.restore();

              // Restore a crisp fill above the blurred segment halo.
              ctx.fillStyle = segColor;
              ctx.fillRect(x, ry, segW, rowH);
            }
          }
        }
      }

      for (let r = 0; r < rows; r++) {
        const ry = isFullMirrored ? y : y + r * (rowH + rowGap);
        drawExternalPeak(
          ctx,
          levelX,
          peakX,
          ry,
          rowH,
          effectiveW,
          null,
          segW,
          segW + segGap
        );
      }
      return;
    }

    // NORMAL MODE
    const segH = height;
    const segW = Math.max(2, Math.floor(segH / 2.9));
    const minLevel = Math.min(levelX, barW);

    const segKey = `${barW}|${segW}|${segGap}`;
    let xs = segmentCache.get(segKey);

    if (!xs) {
      xs = [];
      for (let x = 0; x <= barW; x += segW + segGap) {
        xs.push(x);
      }
      segmentCache.set(segKey, xs);
    }

    // static glass layer
    drawSegmentGlassLayer(ctx, y, segH, barW, segW, segGap);

    if (minLevel > 0) {
      for (let i = 0, len = xs.length; i < len; i++) {
        const x = xs[i];
        if (x + segW > minLevel) break;

        const colorIndex = Math.min(x, colorLen - 1);
        const segColor = colors[colorIndex];

        // segment fill
        ctx.fillStyle = segColor;
        ctx.fillRect(x, y, segW, segH);

        if (doGlow) {
          ctx.save();
          ctx.globalAlpha = 0.50 * glowIntensity;
          ctx.filter = "blur(6px)";
          ctx.fillStyle = segColor;
          ctx.fillRect(x, y, segW, segH);
          ctx.restore();

          // Restore a crisp fill above the blurred segment halo.
          ctx.fillStyle = segColor;
          ctx.fillRect(x, y, segW, segH);
        }
      }
    }

    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW, null, segW, segW + segGap);
  }

  // 3) CIRCLE DOTS
  // -------------
  function renderCircledots(ctx, levelX, peakX, y, height, width, gcache) {

    const effectiveW = getEffectiveBarWidth(width);
    const glowIntensity = CONFIG.display.glowIntensity | 0;
    const renderMode = CONFIG.display.renderMode;
    const layoutMode = CONFIG.display.layoutMode;
    const isMirrored = renderMode === "mirrored";
    const isMirroredLRSA = isMirrored && (layoutMode === "lr" || layoutMode === "sa");
    const peakYOffset = isMirrored ? 8 : 0;

    if (levelX <= 0) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    if (!gcache || !(gcache.colors && gcache.colors.length)) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    const colors = gcache.colors;
    const colorLen = colors.length;
    const minLevel = (levelX < effectiveW) ? levelX : effectiveW;
    const circledotsCache = GEOMETRY_CACHE.circledots;

    const doGlow = glowIntensity > 0;
    const glowAlpha = 0.58 * glowIntensity;
    const glowBlur = 7;

    // MIRRORED MODE (2 rows) — only for LR / SA
    if (isMirroredLRSA) {
      const padding = 2;
      const radius  = Math.max(2, Math.floor((height / 4) - (padding + 3)));
      const gapX    = radius * 2 + 4;

      const row1Y = Math.round(y + height * 0.40);
      const row2Y = Math.round(y + height * 0.80);

      // cache geometry
      const key = `${effectiveW}|${radius}|${gapX}|mirrored`;
      let xs = circledotsCache.get(key);

      if (!xs) {
        xs = [];
        for (let x = radius; x < effectiveW; x += gapX) xs.push(x);
        circledotsCache.set(key, xs);
      }

      for (let row = 0; row < 2; row++) {
        const cy = (row === 0 ? row1Y : row2Y);
        const offset = row === 0 ? 0 : radius;

        for (let i = 0, len = xs.length; i < len; i++) {
          const x = xs[i] + offset;
          if (x > minLevel) break;
          if (x + radius > effectiveW) break;

          const idx = Math.min(x, colorLen - 1);
          const c = colors[idx];

          // DOT
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
            ctx.arc(x, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(x, cy, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      drawExternalPeak(ctx, levelX, peakX, y + peakYOffset, height, effectiveW);
      return;
    }

    // NORMAL MODE
    const dotBaseHeight =
      (isMirrored && layoutMode === "full")
        ? CONFIG.display.dimensions.barHeight
        : height;

    const radius = Math.max(3, Math.floor(dotBaseHeight * 0.54));
    const gap = 4;
    const stepX = radius * 2 + gap;
    const cy = y + height / 2 + peakYOffset;

    const key = `${effectiveW}|${radius}|${stepX}|normal`;
    let xs = circledotsCache.get(key);

    if (!xs) {
      xs = [];
      for (let x = radius; x < effectiveW; x += stepX) xs.push(x);
      circledotsCache.set(key, xs);
    }

    for (let i = 0, len = xs.length; i < len; i++) {
      const x = xs[i];
      if (x > minLevel) break;
      if (x + radius > effectiveW) break;

      const idx = Math.min(x, colorLen - 1);
      const c = colors[idx];

      // DOT
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
        ctx.arc(x, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawExternalPeak(ctx, levelX, peakX, y + peakYOffset, height, effectiveW);
  }

  // 4) MATRIX DOTS
  // -------------
  function renderMatrixdots(ctx, levelX, peakX, y, height, width, gcache) {
    const effectiveW = getEffectiveBarWidth(width);
    const glowIntensity = CONFIG.display.glowIntensity | 0;
    const renderMode = CONFIG.display.renderMode;
    const layoutMode = CONFIG.display.layoutMode;
    const isMirrored = renderMode === "mirrored";
    const isMirroredLRSA = isMirrored && (layoutMode === "lr" || layoutMode === "sa");
    const isFullMirrored = isMirrored && layoutMode === "full";

    if (levelX <= 0) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    if (!gcache || !(gcache.colors && gcache.colors.length)) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    const colors = gcache.colors;
    const colorLen = colors.length;
    const minLevel = (levelX < effectiveW) ? levelX : effectiveW;

    // Glow constants precomputed once
    const doGlow = glowIntensity > 0;
    const glowAlpha = 0.66 * glowIntensity;
    const glowBlur = 7;

    const matrixdotsCache = GEOMETRY_CACHE.matrixdots;
    const matrixCountCache = GEOMETRY_CACHE.matrixCount;

    // MIRRORED MODE (WEDGE) — only for LR / SA
    if (isMirroredLRSA) {
      const padY = 2;
      const maxR = Math.max(2, Math.floor((height - padY * 2) / 20));
      const radius = Math.max(2, Math.min(maxR, Math.floor(height * 0.085)));
      const stepX = radius * 2 + 2;
      const stepY = radius * 2 + 2;

      const centerY = y + height * 0.5;

      const key = `${effectiveW}|${radius}|${stepX}|mirrored_matrix`;

      // Precompute X positions
      let xs = matrixdotsCache.get(key);
      if (!xs) {
        xs = [];
        for (let x = radius; x < effectiveW; x += stepX) xs.push(x);
        matrixdotsCache.set(key, xs);
      }

      // Precompute counts for each column (only once per key)
      let counts = matrixCountCache.get(key);
      if (!counts) {
        const maxCountRaw = Math.floor((height - padY * 2 + stepY) / stepY);
        const maxCount =
          Math.max(2, (maxCountRaw % 2 === 0) ? maxCountRaw : maxCountRaw - 1);

        counts = new Array(xs.length);
        for (let i = 0, len = xs.length; i < len; i++) {
          const desired = 2 + 2 * i;
          counts[i] = Math.min(maxCount, desired);
        }

        matrixCountCache.set(key, counts);
      }

      // DRAW
      for (let i = 0, len = xs.length; i < len; i++) {
        const x = xs[i];
        if (x > minLevel) break;
        if (x + radius > effectiveW) break;

        const idx = Math.min(x, colorLen - 1);
        const c = colors[idx];
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
            ctx.arc(x, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(x, cy, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // NORMAL MODE (2 ROWS — ORIGINAL GEOMETRY)
    const visualHeight = isFullMirrored
      ? CONFIG.display.dimensions.barHeight
      : height;

    const radius = Math.max(2, Math.round(visualHeight * 0.19));
    const gapX = radius * 2 + 2;

    const matrixYOffset = isFullMirrored ? 6 : 0;
    const visualTop = isFullMirrored
      ? y + Math.floor((height - visualHeight) / 2) + matrixYOffset
      : y;

    const row1Y = visualTop + visualHeight * 0.28;
    const row2Y = visualTop + visualHeight * 0.72;

    const key = `${effectiveW}|${radius}|${gapX}|normal_matrix`;

    let xs2 = matrixdotsCache.get(key);
    if (!xs2) {
      xs2 = [];
      for (let x = radius; x < effectiveW; x += gapX) xs2.push(x);
      matrixdotsCache.set(key, xs2);
    }

    // DRAW — EXACTLY LIKE THE ORIGINAL: 2 FIXED ROWS
    for (let i = 0; i < xs2.length; i++) {
      const x = xs2[i];
      if (x > minLevel) break;
      if (x + radius > effectiveW) break;

      const idx = Math.min(x, colorLen - 1);
      const c = colors[idx];

      // ROW 1
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, row1Y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (doGlow) {
        ctx.save();
        ctx.globalAlpha = glowAlpha;
        ctx.filter = `blur(${glowBlur}px)`;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, row1Y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, row1Y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ROW 2
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, row2Y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (doGlow) {
        ctx.save();
        ctx.globalAlpha = glowAlpha;
        ctx.filter = `blur(${glowBlur}px)`;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, row2Y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, row2Y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawExternalPeak(ctx, levelX, peakX, isFullMirrored ? y + matrixYOffset : y, height, effectiveW);
  }

  // 5) TRIANGLE PILLARS
  // -------------
  function renderPillars(ctx, levelX, peakX, y, height, width, gcache) {

    const effectiveW = getEffectiveBarWidth(width);
    const fillX = levelX <= 1
      ? 0
      : (levelX < effectiveW ? levelX : effectiveW);
    const fillFloor = Math.floor(fillX);
    const glowIntensity = CONFIG.display.glowIntensity | 0;

    if (!gcache || !(gcache.colors && gcache.colors.length)) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    const colors = gcache.colors;
    const topY = y;
    const h = Math.floor(height);
    const W = Math.floor(effectiveW);
    const xs = getPixelFillXs(W);

    const pathCache =
      renderPillars._pathCache ||
      (renderPillars._pathCache = new Map());

    const glassCache =
      renderPillars._glassCache ||
      (renderPillars._glassCache = new Map());

    const reflCache =
      renderPillars._reflCache ||
      (renderPillars._reflCache = new Map());

    // TRIANGLE PATH
    const midY = topY + h * 0.5;
    const bottomY = topY + h;

    const pathKey = `${topY}|${h}|${W}`;

    let path = pathCache.get(pathKey);
    if (!path) {
      path = new Path2D();
      path.moveTo(0, midY);
      path.lineTo(W, topY);
      path.lineTo(W, bottomY);
      path.closePath();
      pathCache.set(pathKey, path);
    }

    // BASE GLASS BODY
    ctx.save();
    ctx.clip(path);

    ctx.fillStyle = "rgba(80,80,80,0.22)";
    ctx.fillRect(0, topY, W, h);

    const glassKey = `${topY}|${h}`;

    let glass = glassCache.get(glassKey);
    if (!glass) {
      glass = ctx.createLinearGradient(0, topY, 0, topY + h);
      glass.addColorStop(0.00, "rgba(255,255,255,0.38)");
      glass.addColorStop(0.10, "rgba(255,255,255,0.22)");
      glass.addColorStop(0.30, "rgba(255,255,255,0.10)");
      glass.addColorStop(0.55, "rgba(255,255,255,0.03)");
      glass.addColorStop(0.70, "rgba(0,0,0,0.08)");
      glass.addColorStop(0.88, "rgba(0,0,0,0.18)");
      glass.addColorStop(1.00, "rgba(0,0,0,0.26)");
      glassCache.set(glassKey, glass);
    }

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
        Math.min(fillFloor - 1, colors.length - 1)
      );
      const glassColor = colors[sampleX];
      const fillRatio = Math.min(fillX / effectiveW, 1);
      const tintA = 0.05 + fillRatio * 0.10;

      ctx.save();
      ctx.clip(path);
      ctx.globalAlpha = tintA;
      ctx.fillStyle = glassColor;
      ctx.fillRect(0, topY, W, h);
      ctx.restore();
    }

    // UNIFIED GRADIENT HALO — same mechanism as the vertical pillar.
    // The active triangular path is blurred behind the clean signal fill.
    if (glowIntensity > 0 && fillX > 1) {
      const fx = Math.min(fillFloor, colors.length, xs.length);
      if (fx > 0) {
        const fillRatio = fx / Math.max(1, W);
        const activeTop =
          midY + (topY - midY) * fillRatio;
        const activeBottom =
          midY + (bottomY - midY) * fillRatio;
        const activePath = new Path2D();
        activePath.moveTo(0, midY);
        activePath.lineTo(fx, activeTop);
        activePath.lineTo(fx, activeBottom);
        activePath.closePath();

        ctx.save();
        ctx.globalAlpha = 0.46 * glowIntensity;
        ctx.filter = "blur(7px)";
        ctx.fillStyle = createBarsLinearGradient(
          ctx,
          W,
          gcache.mode
        );
        ctx.fill(activePath);
        ctx.restore();
      }
    }

    // SIGNAL FILL (pixel fill) — CACHED GEOMETRY
    if (fillX > 0) {
      const fx = Math.min(fillFloor, colors.length, xs.length);

      ctx.save();
      ctx.clip(path);

      ctx.fillStyle = createBarsLinearGradient(ctx, W, gcache.mode);
      ctx.fillRect(0, topY, fx, h);

      ctx.restore();
    }

    // REFLECTION
    ctx.save();
    ctx.clip(path);

    const reflKey = `${topY}|${h}`;

    let refl = reflCache.get(reflKey);
    if (!refl) {
      refl = ctx.createLinearGradient(0, topY, 0, topY + h);
      refl.addColorStop(0.00, "rgba(255,255,255,0.14)");
      refl.addColorStop(0.18, "rgba(255,255,255,0.08)");
      refl.addColorStop(0.55, "rgba(255,255,255,0.02)");
      refl.addColorStop(0.85, "rgba(0,0,0,0.05)");
      refl.addColorStop(1.00, "rgba(0,0,0,0.10)");
      reflCache.set(reflKey, refl);
    }

    ctx.fillStyle = refl;
    ctx.fillRect(0, topY, W, h);
    ctx.restore();

    // PEAK
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 6) BEVELED 3D
  // -------------
  function renderBeveled3D(ctx, levelX, peakX, y, height, width, gcache) {

    const renderMode = CONFIG.display.renderMode;
    const layoutMode = CONFIG.display.layoutMode;
    const isMirrored = renderMode === "mirrored" && MIRRORED_LAYOUTS.includes(layoutMode);

    const effectiveW = isMirrored
      ? width
      : getEffectiveBarWidth(width);

    const fillW = Math.max(0, Math.min(levelX, effectiveW));
    const fillFloor = Math.floor(fillW);
    const glowIntensity = CONFIG.display.glowIntensity | 0;

    if (!gcache || !(gcache.colors && gcache.colors.length)) {
      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    const colors = gcache.colors;
    let xs = getPixelFillXs(effectiveW);

    const pathCache =
      renderBeveled3D._pathCache ||
      (renderBeveled3D._pathCache = new Map());

    const glassCache =
      renderBeveled3D._glassCache ||
      (renderBeveled3D._glassCache = new Map());

    const liquidLightCache =
      renderBeveled3D._liquidLightCache ||
      (renderBeveled3D._liquidLightCache = new Map());

    // inner 3D
    function buildOuterInner(ry, rh) {
      const radius = Math.min(rh * 0.42, 12);
      const inset  = Math.max(4, Math.floor(rh * 0.20));

      // INNER 3D BAR SHAPE
      const innerY = ry + inset;
      const innerH = rh - inset * 2;
      const r2 = Math.max(3, radius - inset * 0.65);

      const pathKey = `${effectiveW}|${ry}|${rh}|${radius}|${innerY}|${innerH}|${r2}`;

      let cached = pathCache.get(pathKey);
      if (cached) return cached;

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

      cached = { outer, inner, innerY, innerH };
      pathCache.set(pathKey, cached);
      return cached;
    }

    // 1 ROW beveled bar
    function drawRow(ry, rh) {

      const { outer, inner, innerY, innerH } = buildOuterInner(ry, rh);
      const maxFillX = Math.min(fillFloor, xs.length, colors.length);

      // GLASS TINT
      if (fillW > 0) {
        const sampleX = Math.max(
          1,
          Math.min(fillFloor - 1, colors.length - 1)
        );
        const glassColor = colors[sampleX];
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
      if (glowIntensity > 0 && maxFillX > 0) {
        ctx.save();
        ctx.globalAlpha = 0.54 * glowIntensity;
        ctx.filter = "blur(8px)";
        ctx.fillStyle = createBarsLinearGradient(
          ctx,
          effectiveW,
          gcache.mode
        );
        ctx.beginPath();
        ctx.roundRect(
          0,
          innerY,
          maxFillX,
          innerH,
          Math.min(innerH / 2, maxFillX / 2)
        );
        ctx.fill();
        ctx.restore();
      }

      // GLASS OVERLAY / HIGHLIGHT
      ctx.save();
      ctx.clip(outer);

      const glassKey = `${ry}|${rh}`;

      let glass = glassCache.get(glassKey);
      if (!glass) {
        glass = ctx.createLinearGradient(0, ry, 0, ry + rh);
        glass.addColorStop(0.00, "rgba(255,255,255,0.58)");
        glass.addColorStop(0.18, "rgba(255,255,255,0.30)");
        glass.addColorStop(0.42, "rgba(255,255,255,0.12)");
        glass.addColorStop(0.72, "rgba(0,0,0,0.14)");
        glass.addColorStop(1.00, "rgba(0,0,0,0.32)");
        glassCache.set(glassKey, glass);
      }

      ctx.fillStyle = glass;
      ctx.fillRect(0, ry, effectiveW, rh);

      ctx.restore();

      // INNER 3D BAR FILL — above glass
      if (maxFillX > 0) {
        ctx.save();
        ctx.clip(inner);

        ctx.fillStyle = createBarsLinearGradient(ctx, effectiveW, gcache.mode);
        ctx.fillRect(0, innerY, maxFillX, innerH);

        ctx.restore();
      }

      // TOP LIGHT ON FILL
      if (fillW > 0) {
        ctx.save();
        ctx.clip(inner);

        const lightH = Math.max(1, Math.round(innerH * 0.24));
        const lightOffset = Math.max(1, Math.round(innerH * 0.08));
        const lightY = innerY + lightOffset;

        const liquidLightKey = `${innerH}|${lightOffset}|${lightH}`;

        let liquidLight = liquidLightCache.get(liquidLightKey);
        if (!liquidLight) {
          liquidLight = ctx.createLinearGradient(0, lightOffset, 0, lightOffset + lightH);
          liquidLight.addColorStop(0.00, "rgba(255,255,255,0.40)");
          liquidLight.addColorStop(0.30, "rgba(255,255,255,0.20)");
          liquidLight.addColorStop(0.65, "rgba(255,255,255,0.08)");
          liquidLight.addColorStop(1.00, "rgba(255,255,255,0.00)");
          liquidLightCache.set(liquidLightKey, liquidLight);
        }

        ctx.fillStyle = liquidLight;
        ctx.fillRect(0, lightY, fillW, lightH);

        ctx.restore();
      }

      // Bevel stroke — topmost frame
      ctx.save();
      ctx.clip(outer);

      ctx.strokeStyle = "rgba(255,255,255,0.58)";
      ctx.lineWidth   = 1.1;
      ctx.stroke(outer);

      ctx.restore();
    }

    // MIRRORED MODE → LR/SA = 2 ROWS, FULL = 1 ROW
    if (isMirrored) {
      const isFullMirrored = layoutMode === "full";

      if (isFullMirrored) {
        drawRow(y, height);
      } else {
        const gap = 8;
        const rowH = Math.floor((height - gap) / 2);

        drawRow(y, rowH);
        drawRow(y + rowH + gap, rowH);
      }

      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // NORMAL MODE
    drawRow(y, height);
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  // 7) GLASS TUBE
  // -------------
  function renderGlassTube(ctx, levelX, peakX, y, height, width, gcache) {

    const renderMode = CONFIG.display.renderMode;
    const layoutMode = CONFIG.display.layoutMode;
    const isMirrored = renderMode === "mirrored" && MIRRORED_LAYOUTS.includes(layoutMode);

    const effectiveW = isMirrored
      ? width
      : getEffectiveBarWidth(width);

    const glowIntensity = CONFIG.display.glowIntensity | 0;
    let xs = getPixelFillXs(effectiveW);

    const pathCache =
      renderGlassTube._pathCache ||
      (renderGlassTube._pathCache = new Map());

    const barShadeCache =
      renderGlassTube._barShadeCache ||
      (renderGlassTube._barShadeCache = new Map());

    const glassCache =
      renderGlassTube._glassCache ||
      (renderGlassTube._glassCache = new Map());

    const liquidLightCache =
      renderGlassTube._liquidLightCache ||
      (renderGlassTube._liquidLightCache = new Map());

    const drawTubeRow = (ry, rh) => {

      const radius = Math.max(4, rh * 0.18);
      const fillW = levelX <= 0
        ? 0
        : (levelX >= effectiveW ? effectiveW : levelX);
      const fillFloor = Math.floor(fillW);
      const colors = gcache.colors;
      const fillLimit = Math.min(fillFloor, xs.length, colors.length);

      // TUBE SHAPE
      const pathKey = `${effectiveW}|${ry}|${rh}|${radius}`;

      let tubePath = pathCache.get(pathKey);
      if (!tubePath) {
        tubePath = new Path2D();
        tubePath.moveTo(radius, ry);
        tubePath.lineTo(effectiveW - radius, ry);
        tubePath.quadraticCurveTo(effectiveW, ry, effectiveW, ry + radius);
        tubePath.lineTo(effectiveW, ry + rh - radius);
        tubePath.quadraticCurveTo(effectiveW, ry + rh, effectiveW - radius, ry + rh);
        tubePath.lineTo(radius, ry + rh);
        tubePath.quadraticCurveTo(0, ry + rh, 0, ry + rh - radius);
        tubePath.lineTo(0, ry + radius);
        tubePath.quadraticCurveTo(0, ry, radius, ry);
        pathCache.set(pathKey, tubePath);
      }

      // 1) GLOW
      if (glowIntensity > 0 && fillW > 1) {
        ctx.save();
        ctx.globalAlpha = 0.56 * glowIntensity;
        ctx.filter = "blur(8px)";
        ctx.fillStyle = createBarsLinearGradient(
          ctx,
          effectiveW,
          gcache.mode
        );
        ctx.beginPath();
        ctx.roundRect(
          0,
          ry,
          fillLimit,
          rh,
          Math.min(radius, fillLimit / 2)
        );
        ctx.fill();
        ctx.restore();
      }

      // 2) BAR 3D SHADING
      if (fillW > 0) {
        ctx.save();
        ctx.clip(tubePath);

        const barShadeKey = `${ry}|${rh}`;

        let barShade = barShadeCache.get(barShadeKey);
        if (!barShade) {
          barShade = ctx.createLinearGradient(0, ry, 0, ry + rh);
          barShade.addColorStop(0.00, "rgba(0,0,0,0.12)");
          barShade.addColorStop(0.25, "rgba(0,0,0,0.06)");
          barShade.addColorStop(0.50, "rgba(0,0,0,0.02)");
          barShade.addColorStop(0.75, "rgba(0,0,0,0.06)");
          barShade.addColorStop(1.00, "rgba(0,0,0,0.14)");
          barShadeCache.set(barShadeKey, barShade);
        }

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = barShade;
        ctx.fillRect(0, ry, fillW, rh);
        ctx.restore();
      }

      // 3) GLASS TINT
      if (fillW > 0) {

        const sampleX = Math.max(
          1,
          Math.min(fillFloor - 1, colors.length - 1)
        );
        const glassColor = colors[sampleX];
        const fillRatio  = Math.min(fillW / effectiveW, 1);

        const tintA = 0.08 + fillRatio * 0.16;

        ctx.save();
        ctx.clip(tubePath);
        ctx.globalAlpha = tintA;
        ctx.fillStyle = glassColor;
        ctx.fillRect(0, ry, effectiveW, rh);
        ctx.restore();
      }

      // 4) GLASS SHELL
      ctx.save();
      ctx.clip(tubePath);

      const glassKey = `${ry}|${rh}`;

      let glass = glassCache.get(glassKey);
      if (!glass) {
        glass = ctx.createLinearGradient(0, ry, 0, ry + rh);
        glass.addColorStop(0.00, "rgba(255,255,255,0.38)");
        glass.addColorStop(0.12, "rgba(255,255,255,0.20)");
        glass.addColorStop(0.35, "rgba(255,255,255,0.08)");
        glass.addColorStop(0.55, "rgba(255,255,255,0.02)");
        glass.addColorStop(0.75, "rgba(0,0,0,0.14)");
        glass.addColorStop(1.00, "rgba(0,0,0,0.32)");
        glassCache.set(glassKey, glass);
      }

      ctx.fillStyle = glass;
      ctx.fillRect(0, ry, effectiveW, rh);

      ctx.restore();

      // 5) LIQUID FILL
      if (fillW > 0) {

        ctx.save();
        ctx.clip(tubePath);
        ctx.globalAlpha = 0.90;

        const maxX = fillLimit;
        ctx.fillStyle = createBarsLinearGradient(ctx, effectiveW, gcache.mode);
        ctx.fillRect(0, ry, maxX, rh);
        ctx.restore();
      }

      // 6) TOP LIGHT ON LIQUID
      if (fillW > 0) {
        ctx.save();
        ctx.clip(tubePath);

        const lightH = Math.max(1, Math.round(rh * 0.24));
        const lightOffset = Math.max(1, Math.round(rh * 0.04));
        const lightY = ry + lightOffset;

        const liquidLightKey = `${rh}|${lightOffset}|${lightH}`;

        let liquidLight = liquidLightCache.get(liquidLightKey);
        if (!liquidLight) {
          liquidLight = ctx.createLinearGradient(0, lightOffset, 0, lightOffset + lightH);
          liquidLight.addColorStop(0.00, "rgba(255,255,255,0.34)");
          liquidLight.addColorStop(0.22, "rgba(255,255,255,0.20)");
          liquidLight.addColorStop(0.55, "rgba(255,255,255,0.08)");
          liquidLight.addColorStop(1.00, "rgba(255,255,255,0.00)");
          liquidLightCache.set(liquidLightKey, liquidLight);
        }

        ctx.fillStyle = liquidLight;
        ctx.fillRect(0, lightY, fillW, lightH);

        ctx.restore();
      }

      // 7) SIDE GLOSS STROKES — topmost layer
      ctx.save();

      ctx.globalAlpha = 0.62;
      ctx.strokeStyle = "rgba(255,255,255,0.46)";
      ctx.lineWidth   = 1.0;
      ctx.beginPath();
      ctx.moveTo(1.0, ry + 1);
      ctx.lineTo(1.0, ry + rh - 1);
      ctx.stroke();

      ctx.globalAlpha = 0.52;
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.beginPath();
      ctx.moveTo(effectiveW - 1.2, ry + 1);
      ctx.lineTo(effectiveW - 1.2, ry + rh - 1);
      ctx.stroke();

      ctx.restore();
    };

    // MIRRORED MODE → LR/SA = 2 ROWS, FULL = 1 ROW
    if (isMirrored) {
      const isFullMirrored = layoutMode === "full";

      if (isFullMirrored) {
        drawTubeRow(y, height);
      } else {
        const gap = 8;
        const rowH = Math.floor((height - gap) / 2);

        drawTubeRow(y, rowH);
        drawTubeRow(y + rowH + gap, rowH);
      }

      drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
      return;
    }

    // NORMAL MODE
    drawTubeRow(y, height);
    drawExternalPeak(ctx, levelX, peakX, y, height, effectiveW);
  }

  const RENDER_CHANNEL_RENDERERS = {
    simple: renderSimple,
    segment: renderSegment,
    circledots: renderCircledots,
    matrixdots: renderMatrixdots,
    pillars: renderPillars,
    beveled3d: renderBeveled3D,
    glasstube: renderGlassTube
  };

  // FULL RENDER CHANNEL — unified + stable
  function renderChannel(smoothDb, peakDb, y, width, barH, effectiveWOverride = null, barStyleOverride = null) {

    const ctx   = STATE.dom.ctx;
    const style = (barStyleOverride != null)
      ? barStyleOverride
      : CONFIG.display.barStyle;

    // mode:
    // 0 = normal
    // 1 = audio peak (red zone)
    // 2 = stereo quality (yellow zone + reverse)
    const mode = STATE._audioPeakGradient
      ? 1
      : (STATE._stereoQualityGradient ? 2 : 0);

    const effectiveW = (effectiveWOverride != null)
      ? effectiveWOverride
      : getEffectiveBarWidth(width);

    const mapX = mapDbToX;
    const levelX = mapX(smoothDb, effectiveW);
    const peakX  = (peakDb === smoothDb)
      ? levelX
      : mapX(peakDb, effectiveW);

    // unified gradient cache
    const key = (mode << 16) | effectiveW;
    
    let gcache = FRAME_GRADIENT_CACHE.get(key);
    
    if (gcache === undefined) {
      gcache = buildBarsGradient(mode, effectiveW);
      FRAME_GRADIENT_CACHE.set(key, gcache);
    }
    
    const renderer = RENDER_CHANNEL_RENDERERS[style] || renderSimple;
    return renderer(ctx, levelX, peakX, y, barH, width, gcache);
  }

  // Stereo quality/Audio peak common helpers
  function mapStereoQualityToDb(q, minDb, range) {
    return mapStereoQualityToDbRange(q, minDb, range);
  }

  function mapAudioLevelsToDb(audioLevels, minDb, range) {
    const audioSmoothDb = mapAudioSampleToDb(audioLevels.smooth, minDb, range);
    const audioPeakDb = mapAudioSampleToDb(audioLevels.peak, minDb, range);

    return { audioSmoothDb, audioPeakDb };
  }

  function withGradientMode(mode, fn) {
    const useStereo = mode === 2;
    const useAudio = mode === 1;

    if (useStereo) STATE._stereoQualityGradient = true;
    if (useAudio) STATE._audioPeakGradient = true;

    try {
      return fn();
    } finally {
      if (useStereo) STATE._stereoQualityGradient = false;
      if (useAudio) STATE._audioPeakGradient = false;
    }
  }

  function renderMirroredChannel(ctx, baseX, mirrored, smoothDb, peakDb, y, width, barH, barStyle, mode = 0) {
    ctx.save();
    ctx.translate(baseX, 0);
    if (mirrored) ctx.scale(-1, 1);

    try {
      return withGradientMode(mode, () => (
        renderChannel(
          smoothDb,
          peakDb,
          y,
          width,
          barH,
          null,
          barStyle
        )
      ));
    } finally {
      ctx.restore();
    }
  }

  function syncCanvasAndWrapperHeight(canvas, canvasStyle, contentWrapperStyle, neededHeight) {
    const logicalWidth = getCanvasLogicalWidth(canvas) || STATE.layout.width || 300;
    const logicalHeight = Math.max(1, Math.round(neededHeight));
    const nextHeight = logicalHeight + "px";

    resizeCanvasIfNeeded(canvas, logicalWidth, logicalHeight);

    if (canvasStyle.height !== nextHeight) {
      canvasStyle.height = nextHeight;
    }

    if (contentWrapperStyle && contentWrapperStyle.height !== nextHeight) {
      contentWrapperStyle.height = nextHeight;
    }
  }

  function renderBarChannelWithMode(smoothDb, peakDb, y, width, barH, effectiveW, barStyle, mode = 0) {
    return withGradientMode(mode, () => (
      renderChannel(
        smoothDb,
        peakDb,
        y,
        width,
        barH,
        effectiveW,
        barStyle
      )
    ));
  }

  function createEqualizerGradient(ctx, x, top, width, height) {
    const colors = ACTIVE_THEME.colors;
    // Identical X coordinates force a strictly vertical colour axis.
    const gradientX = Math.round(x + width / 2) + 0.5;
    const gradient = ctx.createLinearGradient(
      gradientX,
      top + height,
      gradientX,
      top
    );
    gradient.addColorStop(0, colors.low);
    gradient.addColorStop(0.50, colors.mid);
    gradient.addColorStop(1, colors.high);
    return gradient;
  }

  function getVerticalSegmentMetrics(width) {
    const gap = 2;
    const height = Math.max(3, Math.min(6, Math.round(width * 0.30)));
    return { gap, height, step: height + gap };
  }

  function snapVerticalThresholdToSegmentGap(threshold, height, width) {
    const segment = getVerticalSegmentMetrics(width);
    const targetPx = clamp(threshold, 0, 1) * height;
    const gapIndex = Math.max(
      1,
      Math.round((targetPx + segment.gap / 2) / segment.step)
    );
    const gapMidPx = gapIndex * segment.step - segment.gap / 2;
    return clamp(gapMidPx / Math.max(1, height), 0.001, 0.999);
  }

  function getVerticalDotMetrics(width, height, style) {
    const cols = style === "matrixdots" ? 2 : 1;
    const columnGap = style === "matrixdots" ? 2 : 0;
    const widthRadius =
      (width - columnGap * (cols - 1)) / (cols * 2);
    const heightRadius =
      height / (style === "matrixdots" ? 30 : 15);
    const radius = Math.max(
      1.5,
      Math.min(widthRadius * 0.88, heightRadius)
    );
    const rowGap = style === "matrixdots" ? 2 : 3;
    return {
      cols,
      columnGap,
      radius,
      rowGap,
      stepY: radius * 2 + rowGap
    };
  }

  function snapVerticalThresholdToDotGap(
    threshold,
    height,
    width,
    style
  ) {
    const dot = getVerticalDotMetrics(width, height, style);
    const targetPx = clamp(threshold, 0, 1) * height;
    const gapIndex = Math.max(
      1,
      Math.round((targetPx + dot.rowGap / 2) / dot.stepY)
    );
    const gapMidPx = gapIndex * dot.stepY - dot.rowGap / 2;
    return clamp(gapMidPx / Math.max(1, height), 0.001, 0.999);
  }

  function snapVerticalThreshold(threshold, height, width, style) {
    if (style === "segment") {
      return snapVerticalThresholdToSegmentGap(threshold, height, width);
    }
    if (style === "circledots" || style === "matrixdots") {
      return snapVerticalThresholdToDotGap(
        threshold,
        height,
        width,
        style
      );
    }
    return threshold;
  }

  function createVerticalMeterGradient(
    ctx,
    x,
    top,
    width,
    height,
    mode = 0,
    discreteStyle = null
  ) {
    const colors = ACTIVE_THEME.colors;
    const gradientX = Math.round(x + width / 2) + 0.5;
    const gradient = ctx.createLinearGradient(
      gradientX,
      top + height,
      gradientX,
      top
    );

    if (mode === 1) {
      const baseThreshold = 0.58;
      const threshold = snapVerticalThreshold(
        baseThreshold,
        height,
        width,
        discreteStyle
      );
      gradient.addColorStop(0.00, colors.low);
      gradient.addColorStop(0.40 * baseThreshold, colors.mid);
      gradient.addColorStop(0.80 * baseThreshold, colors.high);
      gradient.addColorStop(threshold - 0.001, colors.high);
      gradient.addColorStop(threshold + 0.001, "#ff0000");
      gradient.addColorStop(1.00, "#ff0000");
    } else if (mode === 2) {
      const baseThreshold = 0.82;
      const threshold = snapVerticalThreshold(
        baseThreshold,
        height,
        width,
        discreteStyle
      );
      gradient.addColorStop(0.00, colors.high);
      gradient.addColorStop(0.40 * baseThreshold, colors.mid);
      gradient.addColorStop(0.80 * baseThreshold, colors.low);
      gradient.addColorStop(threshold - 0.001, colors.low);
      gradient.addColorStop(threshold + 0.001, "#ffd400");
      gradient.addColorStop(1.00, "#ffd400");
    } else {
      gradient.addColorStop(0.00, colors.low);
      gradient.addColorStop(0.50, colors.mid);
      gradient.addColorStop(0.80, colors.high);
      gradient.addColorStop(1.00, colors.high);
    }
    return gradient;
  }

  const EQUALIZER_SEGMENT_GLASS_CACHE = new WeakMap();

  function getEqualizerSegmentGlass(ctx, y, height) {
    let cache = EQUALIZER_SEGMENT_GLASS_CACHE.get(ctx);
    if (!cache) {
      cache = new Map();
      EQUALIZER_SEGMENT_GLASS_CACHE.set(ctx, cache);
    }

    const glassKey = `${y}|${height}`;
    let glass = cache.get(glassKey);
    if (!glass) {
      // Same emboss profile used by drawSegmentGlassLayer. In the vertical
      // equalizer the segments are stacked, but each individual segment keeps
      // the original top-to-bottom glass axis.
      glass = ctx.createLinearGradient(0, y, 0, y + height);
      glass.addColorStop(0.00, "rgba(255,255,255,0.45)");
      glass.addColorStop(0.08, "rgba(255,255,255,0.25)");
      glass.addColorStop(0.25, "rgba(255,255,255,0.12)");
      glass.addColorStop(0.55, "rgba(255,255,255,0.03)");
      glass.addColorStop(0.70, "rgba(0,0,0,0.08)");
      glass.addColorStop(0.88, "rgba(0,0,0,0.18)");
      glass.addColorStop(1.00, "rgba(0,0,0,0.28)");
      cache.set(glassKey, glass);
    }
    return glass;
  }

  function drawEqualizerPeak(
    ctx,
    x,
    top,
    width,
    height,
    levelNorm,
    peakNorm,
    style
  ) {
    if (
      !CONFIG.display.showPeaks ||
      STATE.hasStreamObject !== true
    ) return;

    const level = clamp(levelNorm, 0, 1);
    const effectivePeak = Math.max(
      level,
      clamp(peakNorm, 0, 1)
    );
    const fillTop =
      top + height - Math.round(level * height);
    let peakY = Math.round(
      top + height - effectivePeak * height
    );
    let peakH = Math.max(2, Math.round(width * 0.10));

    if (style === "segment") {
      const segment = getVerticalSegmentMetrics(width);
      const segmentGap = segment.gap;
      const segmentH = segment.height;
      const segmentStep = segment.step;
      const peakFromBottom = Math.max(
        segmentH,
        top + height - peakY
      );
      const peakSegmentIndex = Math.max(
        1,
        Math.ceil(peakFromBottom / segmentStep)
      );
      peakY =
        top + height -
        peakSegmentIndex * segmentStep +
        segmentGap;
      peakH = segmentH;

      // Keep the indicator in the first free segment above the live fill.
      // This prevents the active colour from visually merging with, or
      // appearing above, the held peak.
      let highestActiveY = null;
      for (
        let y = top + height - segmentH;
        y >= top;
        y -= segmentStep
      ) {
        if (y + segmentH >= fillTop) {
          highestActiveY = y;
        } else {
          break;
        }
      }
      if (highestActiveY !== null) {
        peakY = Math.min(
          peakY,
          highestActiveY - segmentStep
        );
      }
    } else {
      // The complete peak marker stays above the live fill, even when the
      // held peak and current level have the same value.
      peakY = Math.min(
        peakY,
        fillTop - Math.ceil(peakH / 2)
      );
    }
    ctx.save();
    ctx.fillStyle = ACTIVE_THEME.colors.peak;
    const drawY =
      style === "segment"
        ? Math.max(top, peakY)
        : Math.max(top, peakY - peakH / 2);
    ctx.fillRect(x, drawY, width, peakH);
    ctx.restore();
  }

  function getVerticalAudioPeakNorm(
    levelNorm,
    heldPeakNorm,
    height,
    stateKey
  ) {
    if (!STATE.render) STATE.render = {};
    if (!STATE.render.verticalAudioPeak) {
      STATE.render.verticalAudioPeak = {};
    }

    const bucket = STATE.render.verticalAudioPeak;
    if (STATE.hasStreamObject !== true) {
      delete bucket[stateKey];
      return clamp(levelNorm, 0, 1);
    }

    const pixelNorm = 1 / Math.max(1, height);
    const live = clamp(levelNorm, 0, 1);
    const held = clamp(heldPeakNorm, 0, 1);
    const atVisualFloor =
      live <= 0.5 * pixelNorm &&
      held <= 0.5 * pixelNorm;

    const state = (
      bucket[stateKey] ??= {
        pos: live,
        vel: 0,
        lastPeak: held
      }
    );

    const base = atVisualFloor
      ? 0
      : Math.min(
          1,
          live + pixelNorm
        );
    const throwNorm = 8 * pixelNorm;
    const isNewPeak =
      held > state.lastPeak + 0.5 * pixelNorm;
    const target = isNewPeak
      ? Math.min(1, held + throwNorm)
      : base;

    state.lastPeak = held;

    const RETURN = 0.28;
    const DAMPING = 0.78;
    const delta = target - state.pos;

    if (delta > 0) {
      state.pos = Math.min(1, target);
      state.vel = 0;
    } else {
      state.vel += (base - state.pos) * RETURN;
      state.vel *= DAMPING;
      state.pos += state.vel;
    }

    state.pos = Math.max(base, Math.min(1, state.pos));
    return state.pos;
  }

  function renderEqualizerBand(
    ctx,
    x,
    top,
    width,
    height,
    levelNorm,
    peakNorm,
    style,
    gradient,
    meterMode = 0
  ) {
    const level = clamp(levelNorm, 0, 1);
    const fillHeight = Math.round(height * level);
    const fillTop = top + height - fillHeight;
    const glow = CONFIG.display.glowIntensity > 0;
    const shellRadius = Math.max(2, Math.min(width * 0.42, 7));
    // Only the glass styles tint their inactive shell dynamically.
    let tintColor = null;
    if (
      fillHeight > 0 &&
      (
        style === "pillars" ||
        style === "beveled3d" ||
        style === "glasstube"
      )
    ) {
      const tintPalette = buildBarsGradient(meterMode, 256).colors;
      tintColor = tintPalette[
        Math.max(
          0,
          Math.min(
            tintPalette.length - 1,
            Math.round(level * (tintPalette.length - 1))
          )
        )
      ];
    }

    const drawGradientGlowRect = (
      gx,
      gy,
      gw,
      gh,
      blur = 4,
      alpha = 0.16
    ) => {
      if (!glow || gw <= 0 || gh <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = gradient;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();
    };

    const drawGradientGlowPath = (
      path,
      blur = 4,
      alpha = 0.18
    ) => {
      if (!glow || !path || fillHeight <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = gradient;
      ctx.fill(path);
      ctx.restore();
    };

    if (style === "segment") {
      const segment = getVerticalSegmentMetrics(width);
      const segmentGap = segment.gap;
      const segmentH = segment.height;
      const step = segment.step;
      for (let y = top + height - segmentH; y >= top; y -= step) {
        const active = y + segmentH >= fillTop;

        if (active && glow) {
          ctx.save();
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(
            x - 1,
            y - 1,
            width + 2,
            segmentH + 2
          );
          ctx.globalAlpha = 0.14;
          ctx.fillRect(
            x - 2,
            y - 2,
            width + 4,
            segmentH + 4
          );
          ctx.restore();
        }

        // Exact glass/emboss profile from the horizontal segmented renderer.
        // The static glass is painted first and remains strictly inside the
        // segment, so it cannot produce an external shadow.
        ctx.fillStyle = getEqualizerSegmentGlass(ctx, y, segmentH);
        ctx.fillRect(x, y, width, segmentH);

        // Match renderSegment exactly: active fill is painted over the glass,
        // therefore the coloured segment itself is not embossed.
        if (active) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, width, segmentH);
          ctx.clip();
          ctx.fillStyle = gradient;
          ctx.fillRect(x, top, width, height);
          ctx.restore();
        }
      }
    } else if (style === "circledots" || style === "matrixdots") {
      const dot = getVerticalDotMetrics(width, height, style);
      const cols = dot.cols;
      const dotGap = dot.columnGap;
      const dotR = dot.radius;
      const stepY = dot.stepY;
      const totalDotsW = cols * dotR * 2 + (cols - 1) * dotGap;
      const startX = x + (width - totalDotsW) / 2 + dotR;

      for (let cy = top + height - dotR; cy >= top + dotR; cy -= stepY) {
        if (cy - dotR < fillTop) continue;
        for (let col = 0; col < cols; col++) {
          const cx = startX + col * (dotR * 2 + dotGap);
          if (glow) {
            ctx.save();
            ctx.globalAlpha =
              style === "matrixdots" ? 0.70 : 0.54;
            ctx.filter = "blur(6px)";
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = gradient;
          ctx.fillRect(x, top, width, height);
          ctx.restore();
        }
      }
    } else if (style === "pillars") {
      // Full vertical glass wedge: point at the floor, widening upwards.
      if (fillHeight > 0) {
        const halfActiveWidth =
          (fillHeight / height) * (width / 2);
        const activePillar = new Path2D();
        activePillar.moveTo(x + width / 2, top + height);
        activePillar.lineTo(
          x + width / 2 - halfActiveWidth,
          fillTop
        );
        activePillar.lineTo(
          x + width / 2 + halfActiveWidth,
          fillTop
        );
        activePillar.closePath();
        drawGradientGlowPath(activePillar, 7, 0.48);
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + width / 2, top + height);
      ctx.lineTo(x, top);
      ctx.lineTo(x + width, top);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "rgba(80,80,80,0.20)";
      ctx.fillRect(x, top, width, height);
      if (fillHeight > 0) {
        ctx.globalAlpha = 0.05 + level * 0.10;
        ctx.fillStyle = tintColor;
        ctx.fillRect(x, top, width, height);
        ctx.globalAlpha = 1;
      }
      if (fillHeight > 0) {
        ctx.fillStyle = gradient;
        ctx.fillRect(x, fillTop, width, fillHeight);
      }
      const glass = ctx.createLinearGradient(x, 0, x + width, 0);
      glass.addColorStop(0, "rgba(0,0,0,0.30)");
      glass.addColorStop(0.24, "rgba(255,255,255,0.24)");
      glass.addColorStop(0.72, "rgba(255,255,255,0.06)");
      glass.addColorStop(1, "rgba(0,0,0,0.34)");
      ctx.fillStyle = glass;
      ctx.fillRect(x, top, width, height);
      ctx.restore();
    } else if (style === "beveled3d") {
      const inset = Math.max(2, Math.round(width * 0.18));
      const bevelRadius = Math.max(
        2,
        Math.min(3.5, width * 0.22)
      );

      // Outer glass shell.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, top, width, height, bevelRadius);
      ctx.clip();
      ctx.fillStyle = "rgba(70,70,70,0.18)";
      ctx.fillRect(x, top, width, height);
      if (fillHeight > 0) {
        ctx.globalAlpha = 0.06 + level * 0.22;
        ctx.fillStyle = tintColor;
        ctx.fillRect(x, top, width, height);
        ctx.globalAlpha = 1;
      }
      const shell = ctx.createLinearGradient(x, 0, x + width, 0);
      shell.addColorStop(0, "rgba(0,0,0,0.42)");
      shell.addColorStop(0.20, "rgba(255,255,255,0.34)");
      shell.addColorStop(0.55, "rgba(255,255,255,0.10)");
      shell.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = shell;
      ctx.fillRect(x, top, width, height);
      ctx.restore();

      // Inner coloured core.
      if (fillHeight > 0) {
        const innerX = x + inset;
        const innerW = Math.max(2, width - inset * 2);
        const innerTop = Math.max(top + inset, fillTop);
        const innerBottom = top + height - inset;
        if (innerBottom > innerTop) {
          drawGradientGlowRect(
            innerX,
            innerTop,
            innerW,
            innerBottom - innerTop,
            8,
            0.52
          );
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(
            innerX,
            innerTop,
            innerW,
            innerBottom - innerTop,
            Math.max(1.5, bevelRadius - inset * 0.35)
          );
          ctx.clip();
          ctx.fillStyle = gradient;
          ctx.fillRect(innerX, top, innerW, height);
          const liquidLight = ctx.createLinearGradient(innerX, 0, innerX + innerW, 0);
          liquidLight.addColorStop(0, "rgba(255,255,255,0.38)");
          liquidLight.addColorStop(0.40, "rgba(255,255,255,0.10)");
          liquidLight.addColorStop(1, "rgba(0,0,0,0.26)");
          ctx.fillStyle = liquidLight;
          ctx.fillRect(innerX, innerTop, innerW, innerBottom - innerTop);
          ctx.restore();
        }
      }

      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(
        x + 0.5,
        top + 0.5,
        width - 1,
        height - 1,
        bevelRadius
      );
      ctx.stroke();
    } else if (style === "glasstube") {
      // Translucent tube body remains visible even at silence.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, top, width, height, shellRadius);
      ctx.clip();
      ctx.fillStyle = "rgba(70,70,70,0.18)";
      ctx.fillRect(x, top, width, height);
      if (fillHeight > 0) {
        ctx.globalAlpha = 0.08 + level * 0.16;
        ctx.fillStyle = tintColor;
        ctx.fillRect(x, top, width, height);
        ctx.globalAlpha = 1;
      }

      if (fillHeight > 0) {
        ctx.restore();
        drawGradientGlowRect(
          x,
          fillTop,
          width,
          fillHeight,
          8,
          0.52
        );
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, top, width, height, shellRadius);
        ctx.clip();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = gradient;
        ctx.fillRect(x, fillTop, width, fillHeight);
        ctx.globalAlpha = 1;
      }

      const tubeGlass = ctx.createLinearGradient(x, 0, x + width, 0);
      tubeGlass.addColorStop(0, "rgba(0,0,0,0.36)");
      tubeGlass.addColorStop(0.18, "rgba(255,255,255,0.40)");
      tubeGlass.addColorStop(0.42, "rgba(255,255,255,0.12)");
      tubeGlass.addColorStop(0.78, "rgba(255,255,255,0.04)");
      tubeGlass.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = tubeGlass;
      ctx.fillRect(x, top, width, height);
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.44)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, top + 0.5, width - 1, height - 1, shellRadius);
      ctx.stroke();
    } else {
      // Simple vertical bar.
      if (fillHeight > 0) {
        drawGradientGlowRect(
          x,
          fillTop,
          width,
          fillHeight,
          7,
          0.44
        );
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(x, fillTop, width, fillHeight);
        ctx.restore();
      }
    }

    drawEqualizerPeak(
      ctx,
      x,
      top,
      width,
      height,
      levelNorm,
      peakNorm,
      style
    );
  }

  function renderEqualizer(ctx, canvas, barStyle) {
    const renderedWidth = getCanvasRenderedWidth(canvas);
    const width =
      renderedWidth > 40 ? renderedWidth : getCanvasLogicalWidth(canvas);
    const desiredHeight = 100;

    if (
      getCanvasLogicalWidth(canvas) !== width ||
      getCanvasLogicalHeight(canvas) !== desiredHeight
    ) {
      resizeCanvasIfNeeded(canvas, width, desiredHeight);
      STATE.dom.ctx = canvas.getContext("2d");
      ctx = STATE.dom.ctx;
      applyCanvasHiDpiTransform(canvas);
    }

    const height = getCanvasLogicalHeight(canvas);
    ctx.clearRect(0, 0, width, height);

    const sidePad = 5;
    const showValues =
      CONFIG.display.showReadouts &&
      STATE.hasStreamObject === true;
    const topPad = 0;
    const labelH = 11;
    const gap = 3;
    const drawingW = Math.max(1, width - sidePad * 2);
    const bandW = Math.max(
      6,
      (drawingW - gap * (EQ_BAND_COUNT - 1)) / EQ_BAND_COUNT
    );
    const groupW = bandW * EQ_BAND_COUNT + gap * (EQ_BAND_COUNT - 1);
    const startX = (width - groupW) / 2;
    const meterH = height - labelH;
    const eq = STATE.levels.equalizer;
    const fontSource = STATE.dom.labels?.left || STATE.dom.title;
    const inheritedFont = fontSource
      ? getComputedStyle(fontSource)
      : null;
    const fontFamily =
      inheritedFont?.fontFamily || "sans-serif";
    const fontWeight =
      inheritedFont?.fontWeight || "600";
    const verticalGradient = createEqualizerGradient(
      ctx,
      startX,
      topPad,
      groupW,
      meterH
    );

    for (let i = 0; i < EQ_BAND_COUNT; i++) {
      const x = startX + i * (bandW + gap);
      renderEqualizerBand(
        ctx,
        x,
        topPad,
        bandW,
        meterH,
        eq.values[i] || 0,
        eq.peaks[i] || 0,
        barStyle,
        verticalGradient
      );

      if (showValues) {
        const db = eq.dbValues[i];
        const valueText =
          Number.isFinite(db) && db > -99
            ? String(Math.round(db))
            : "–";
        const displayedValue = getThrottledCanvasReadout(
          "equalizer16",
          i,
          valueText
        );
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.95;
        ctx.font = `${fontWeight} 7px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.95)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(
          displayedValue,
          x + bandW / 2,
          2
        );
        ctx.restore();
      }
    }

    // One compact label per band; typography follows the active FM-DX theme.
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.92;
    ctx.font = `${fontWeight} 7px ${fontFamily}`;
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 2;

    EQ_BAND_LABELS.forEach((label, index) => {
      const labelX =
        startX + index * (bandW + gap) + bandW / 2;
      ctx.textAlign = "center";
      ctx.fillText(label, labelX, height - 1);
    });
    ctx.restore();
  }

  function renderEqualizerSpectrum(ctx, canvas) {
    const renderedWidth = getCanvasRenderedWidth(canvas);
    const width =
      renderedWidth > 40 ? renderedWidth : getCanvasLogicalWidth(canvas);
    const desiredHeight = 100;

    if (
      getCanvasLogicalWidth(canvas) !== width ||
      getCanvasLogicalHeight(canvas) !== desiredHeight
    ) {
      resizeCanvasIfNeeded(canvas, width, desiredHeight);
      STATE.dom.ctx = canvas.getContext("2d");
      ctx = STATE.dom.ctx;
      applyCanvasHiDpiTransform(canvas);
    }

    const height = getCanvasLogicalHeight(canvas);
    ctx.clearRect(0, 0, width, height);

    const sidePad = 5;
    const gap = 3;
    const labelH = 11;
    const top = 0;
    const plotH = height - labelH;
    const baseline = top + plotH;
    const drawingW = Math.max(1, width - sidePad * 2);
    const bandW = Math.max(
      6,
      (drawingW - gap * (EQ_BAND_COUNT - 1)) /
        EQ_BAND_COUNT
    );
    const groupW =
      bandW * EQ_BAND_COUNT +
      gap * (EQ_BAND_COUNT - 1);
    const startX = (width - groupW) / 2;
    const endX = startX + groupW;
    const eq = STATE.levels.equalizer;
    const gradient = createEqualizerGradient(
      ctx,
      startX,
      top,
      groupW,
      plotH
    );

    const pointX = (index) =>
      startX + index * (bandW + gap) + bandW / 2;
    const levelY = (value) =>
      baseline - clamp(value || 0, 0, 1) * plotH;

    const traceFill = new Path2D();
    traceFill.moveTo(startX, baseline);
    traceFill.lineTo(pointX(0), levelY(eq.values[0]));
    for (let i = 1; i < EQ_BAND_COUNT; i++) {
      traceFill.lineTo(pointX(i), levelY(eq.values[i]));
    }
    traceFill.lineTo(endX, baseline);
    traceFill.closePath();

    if (CONFIG.display.glowIntensity > 0) {
      ctx.save();
      ctx.globalAlpha =
        0.48 * CONFIG.display.glowIntensity;
      ctx.filter = "blur(7px)";
      ctx.fillStyle = gradient;
      ctx.fill(traceFill);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = gradient;
    ctx.fill(traceFill);
    ctx.restore();

    const traceLine = new Path2D();
    traceLine.moveTo(pointX(0), levelY(eq.values[0]));
    for (let i = 1; i < EQ_BAND_COUNT; i++) {
      traceLine.lineTo(pointX(i), levelY(eq.values[i]));
    }

    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = gradient;
    ctx.stroke(traceLine);
    ctx.restore();

    if (
      CONFIG.display.showPeaks &&
      STATE.hasStreamObject === true
    ) {
      const peakLine = new Path2D();
      peakLine.moveTo(pointX(0), levelY(eq.peaks[0]));
      for (let i = 1; i < EQ_BAND_COUNT; i++) {
        peakLine.lineTo(pointX(i), levelY(eq.peaks[i]));
      }
      ctx.save();
      ctx.lineWidth = 1.35;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = ACTIVE_THEME.colors.peak;
      ctx.stroke(peakLine);
      ctx.restore();
    }

    const fontSource = STATE.dom.labels?.left || STATE.dom.title;
    const inheritedFont = fontSource
      ? getComputedStyle(fontSource)
      : null;
    const fontFamily =
      inheritedFont?.fontFamily || "sans-serif";
    const fontWeight =
      inheritedFont?.fontWeight || "600";

    if (
      CONFIG.display.showReadouts &&
      STATE.hasStreamObject === true
    ) {
      for (let i = 0; i < EQ_BAND_COUNT; i++) {
        const db = eq.dbValues[i];
        const valueText =
          Number.isFinite(db) && db > -99
            ? String(Math.round(db))
            : "–";
        const displayedValue = getThrottledCanvasReadout(
          "equalizer16:spectrum",
          i,
          valueText
        );
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.95;
        ctx.font = `${fontWeight} 7px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.95)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(displayedValue, pointX(i), 2);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.92;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 2;
    ctx.font = `${fontWeight} 8px ${fontFamily}`;
    EQ_LABEL_ANCHORS.forEach((anchor) => {
      ctx.fillText(
        anchor.text,
        pointX(anchor.index),
        height - 1
      );
    });
    ctx.restore();
  }

  function formatSpectrumFrequencyLabel(frequency) {
    if (frequency >= 1000) {
      const value = frequency / 1000;
      return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}K`;
    }
    return String(frequency);
  }

  function getThrottledCanvasReadout(groupKey, index, nextValue) {
    if (!STATE.render) STATE.render = {};
    if (!STATE.render.canvasReadouts) {
      STATE.render.canvasReadouts = {};
    }

    const group = (
      STATE.render.canvasReadouts[groupKey] ??= []
    );
    if (
      group[index] === undefined ||
      _readoutFrame === 0
    ) {
      group[index] =
        nextValue == null ? "" : String(nextValue);
    }
    return group[index];
  }

  function renderVuHybrid(ctx, canvas, barStyle) {
    const renderedWidth = getCanvasRenderedWidth(canvas);
    const width =
      renderedWidth > 40 ? renderedWidth : getCanvasLogicalWidth(canvas);
    const desiredHeight = 100;

    if (
      getCanvasLogicalWidth(canvas) !== width ||
      getCanvasLogicalHeight(canvas) !== desiredHeight
    ) {
      resizeCanvasIfNeeded(canvas, width, desiredHeight);
      STATE.dom.ctx = canvas.getContext("2d");
      ctx = STATE.dom.ctx;
      applyCanvasHiDpiTransform(canvas);
    }

    const height = getCanvasLogicalHeight(canvas);
    ctx.clearRect(0, 0, width, height);

    const mode = CONFIG.display.hybridMode;
    const audioPreset = mode === "audio10";
    const meterKeys = audioPreset
      ? ["L", "R", "Q", "A"]
      : ["L", "R"];
    const frequencies = audioPreset
      ? HYBRID_AUDIO_10_FREQUENCIES
      : HYBRID_STEREO_12_FREQUENCIES;
    const spectrum = audioPreset
      ? STATE.levels.hybridAudio10
      : STATE.levels.hybridStereo12;

    const sidePad = 5;
    const gap = 3;
    const labelH = 11;
    const top = 0;
    const meterH = height - labelH;
    const referenceDrawingW = Math.max(1, width - sidePad * 2);
    const bandW = Math.max(
      6,
      (referenceDrawingW - gap * (EQ_BAND_COUNT - 1)) /
        EQ_BAND_COUNT
    );
    const referenceGridW =
      EQ_BAND_COUNT * bandW +
      gap * (EQ_BAND_COUNT - 1);
    const startX = (width - referenceGridW) / 2;
    const eqStartSlot = audioPreset ? 6 : 4;
    const eqStartX =
      startX + eqStartSlot * (bandW + gap);
    const eqGroupW =
      frequencies.length * bandW +
      Math.max(0, frequencies.length - 1) * gap;
    const showValues =
      CONFIG.display.showReadouts &&
      STATE.hasStreamObject === true;

    const fontSource = STATE.dom.labels?.left || STATE.dom.title;
    const inheritedFont = fontSource
      ? getComputedStyle(fontSource)
      : null;
    const fontFamily =
      inheritedFont?.fontFamily || "sans-serif";
    const fontWeight =
      inheritedFont?.fontWeight || "600";

    const minDb = CONFIG.audio.minDb;
    const range = CONFIG.audio.maxDb - minDb;
    const qRaw = clamp(
      STATE.levels.stereoQuality.smooth,
      0,
      STEREO_Q_MAX
    ) || 0;
    const audioSmooth = clamp(
      STATE.levels.audio.smooth,
      0,
      255
    ) || 0;
    const qDb = mapStereoQualityToDb(qRaw, minDb, range);
    const qPeakDb = Number.isFinite(
      STATE.levels.stereoQuality.peakDb
    )
      ? STATE.levels.stereoQuality.peakDb
      : qDb;
    const audioMapped = mapAudioLevelsToDb(
      STATE.levels.audio,
      minDb,
      range
    );

    const meterData = {
      L: {
        level: fracFromDb(STATE.levels.left.smoothDb, 1),
        peak: fracFromDb(STATE.levels.left.peakDb, 1),
        mode: 0,
        readout: Math.round(clamp(
          STATE.levels.left.smoothDb,
          minDb,
          CONFIG.audio.maxDb
        ) ?? minDb)
      },
      R: {
        level: fracFromDb(STATE.levels.right.smoothDb, 1),
        peak: fracFromDb(STATE.levels.right.peakDb, 1),
        mode: 0,
        readout: Math.round(clamp(
          STATE.levels.right.smoothDb,
          minDb,
          CONFIG.audio.maxDb
        ) ?? minDb)
      },
      Q: {
        level: fracFromDb(qDb, 1),
        peak: fracFromDb(qPeakDb, 1),
        mode: 2,
        readout: `${Math.round(qRaw)}%`
      },
      A: {
        level: fracFromDb(audioMapped.audioSmoothDb, 1),
        peak: 0,
        mode: 1,
        readout: `${Math.round((audioSmooth / 255) * 100)}%`
      }
    };

    meterData.A.peak = getVerticalAudioPeakNorm(
      meterData.A.level,
      fracFromDb(audioMapped.audioPeakDb, 1),
      meterH,
      `audio:${Math.round(startX)}:${Math.round(meterH)}`
    );

    meterKeys.forEach((key, index) => {
      const x = startX + index * (bandW + gap);
      const data = meterData[key];
      const meterGradient = createVerticalMeterGradient(
        ctx,
        x,
        top,
        bandW,
        meterH,
        data.mode,
        barStyle
      );
      renderEqualizerBand(
        ctx,
        x,
        top,
        bandW,
        meterH,
        data.level,
        data.peak,
        barStyle,
        meterGradient,
        data.mode
      );

      if (showValues) {
        const nextReadout = String(data.readout);
        const displayedReadout = getThrottledCanvasReadout(
          `${mode}:meters`,
          index,
          nextReadout
        );
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.95;
        ctx.font = `${fontWeight} 7px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.95)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(
          displayedReadout,
          x + bandW / 2,
          2
        );
        ctx.restore();
      }
    });

    const spectrumGradient = createEqualizerGradient(
      ctx,
      eqStartX,
      top,
      eqGroupW,
      meterH
    );

    frequencies.forEach((frequency, index) => {
      const x = eqStartX + index * (bandW + gap);
      renderEqualizerBand(
        ctx,
        x,
        top,
        bandW,
        meterH,
        spectrum.values[index] || 0,
        spectrum.peaks[index] || 0,
        barStyle,
        spectrumGradient
      );

      if (showValues) {
        const db = spectrum.dbValues[index];
        const valueText =
          Number.isFinite(db) && db > -99
            ? String(Math.round(db))
            : "–";
        const displayedValue = getThrottledCanvasReadout(
          `${mode}:equalizer`,
          index,
          valueText
        );
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.95;
        ctx.font = `${fontWeight} 7px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.95)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(displayedValue, x + bandW / 2, 2);
        ctx.restore();
      }
    });

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.92;
    ctx.font = `${fontWeight} 7px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 2;

    meterKeys.forEach((key, index) => {
      const x = startX + index * (bandW + gap);
      ctx.fillText(key, x + bandW / 2, height - 1);
    });

    frequencies.forEach((frequency, index) => {
      const x = eqStartX + index * (bandW + gap);
      ctx.fillText(
        formatSpectrumFrequencyLabel(frequency),
        x + bandW / 2,
        height - 1
      );
    });
    ctx.restore();
  }

  // METERS RENDERER

  // ─────────────────────────────────────────────────────────
  // STEREO OSCILLOSCOPE — Float32 L/R waveform, no extra analyser
  // ─────────────────────────────────────────────────────────
  function findScopeTrigger(samples) {
    if (!samples || samples.length < 8) return 0;

    // Positive-going zero crossing in the first half stabilizes the waveform
    // without adding DSP or a second time-domain buffer.
    const limit = Math.max(2, Math.floor(samples.length * 0.5));
    for (let i = 1; i < limit; i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0) {
        return i;
      }
    }
    return 0;
  }

  function createScopeThemeGradient(ctx, x, width) {
    // Reuse the exact horizontal low→mid→high gradient engine of LR Bars.
        return createBarsLinearGradient(ctx, width, 0);
  }

  function getScopeSmoothedSample(samples, index) {
    if (!samples || !samples.length) return 0;

    const i = Math.max(0, Math.min(samples.length - 1, index));
    let sum = 0;
    let count = 0;

    // Small visual-only smoothing, keeping the trace uniform and fluid.
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < samples.length) {
        sum += samples[j] || 0;
        count++;
      }
    }

    return Math.max(-1, Math.min(1, count ? sum / count : 0));
  }

  function getScopeGainLinear() {
    return Math.pow(10, (CONFIG.audio.dbGain || 0) / 20);
  }

  function getScopeResponseScale(channel) {
    const levels =
      channel === "right"
        ? STATE.levels.right
        : STATE.levels.left;

    const minDb = CONFIG.audio.minDb;
    const maxDb = CONFIG.audio.maxDb;
    const range = Math.max(1, maxDb - minDb);

    const db = clamp(
      Number.isFinite(levels.smoothDb) ? levels.smoothDb : minDb,
      minDb,
      maxDb
    );

    // The waveform still preserves its real shape, but its visible excursion
    // follows the same smoothed level response as L/R Bars.
    const normalized = Math.max(0, Math.min(1, (db - minDb) / range));
    return 0.48 + normalized * 0.52;
  }

  function getScopeInstantPeak(samples) {
    if (!samples || !samples.length) return 0;
    const gain = getScopeGainLinear();
    let peak = 0;

    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs((samples[i] || 0) * gain);
      if (v > peak) peak = v;
    }

    return Math.min(1.5, peak);
  }

  function updateScopePeakHistory(channel, samples, now, historyLength) {
    const scope = STATE.oscilloscope;
    if (!scope) return [];

    const isRight = channel === "right";
    const history = isRight
      ? scope.peakHistoryRight
      : scope.peakHistoryLeft;

    const displayKey = isRight ? "peakDisplayRight" : "peakDisplayLeft";
    const holdKey = isRight ? "peakHoldUntilRight" : "peakHoldUntilLeft";

    const instantPeak = getScopeInstantPeak(samples);
    let displayed = scope[displayKey] || 0;

    const attack = Math.max(0.01, Math.min(1, CONFIG.audio.attackSpeed));
    const release = Math.max(0.01, Math.min(1, CONFIG.audio.releaseSpeed));

    if (instantPeak >= displayed) {
      // Same attack idea as the bars: rise toward the new peak.
      displayed += (instantPeak - displayed) * attack;
      scope[holdKey] = now + CONFIG.audio.peakHoldMs;
    } else if (now >= (scope[holdKey] || 0)) {
      // After hold expires, release smoothly toward the live signal.
      displayed += (instantPeak - displayed) * release;
    }

    if (displayed < 0.001) displayed = 0;
    scope[displayKey] = displayed;

    history.push(displayed);

    const maxLen = Math.max(32, Math.floor(historyLength));
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }

    return history;
  }

  function getScopeWaveformPoints(
    samples,
    trigger,
    x,
    yCenter,
    width,
    amplitude,
    channel
  ) {
    if (!samples || samples.length < 2 || width <= 1) return [];

    const available = Math.max(2, samples.length - trigger);
    const count = Math.min(samples.length, available);
    const gain = getScopeGainLinear();
    const responseScale = getScopeResponseScale(channel);
    const points = new Array(count);

    for (let i = 0; i < count; i++) {
      const idx = trigger + i;
      let sample = getScopeSmoothedSample(samples, idx);
      sample *= gain * responseScale;
      sample = Math.max(-1.15, Math.min(1.15, sample));

      points[i] = {
        x: x + (i / Math.max(1, count - 1)) * width,
        y: yCenter - sample * amplitude
      };
    }

    return points;
  }

  function buildScopeLinePath(ctx, points) {
    if (!points || points.length < 2) return false;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    return true;
  }

  function buildScopeStepPath(ctx, points) {
    if (!points || points.length < 2) return false;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;

      ctx.lineTo(midX, prev.y);
      ctx.lineTo(midX, cur.y);
      ctx.lineTo(cur.x, cur.y);
    }

    return true;
  }

  function drawScopeGlowPasses(ctx, points, gradient, activeAlpha) {
    if (CONFIG.display.glowIntensity <= 0) return;

    const glow = Math.max(0, CONFIG.display.glowIntensity);

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = activeAlpha * 0.18;
    ctx.lineWidth = 8 + glow * 2.4;
    ctx.filter = `blur(${3 + glow * 2.2}px)`;
    if (buildScopeLinePath(ctx, points)) ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = activeAlpha * 0.28;
    ctx.lineWidth = 5.5 + glow * 1.15;
    ctx.filter = `blur(${1.5 + glow * 0.95}px)`;
    if (buildScopeLinePath(ctx, points)) ctx.stroke();
    ctx.restore();
  }

  function drawScopePersistence(ctx, points, gradient, activeAlpha, channel) {
    const scope = STATE.oscilloscope;
    const history = channel === "right" ? scope.persistenceRight : scope.persistenceLeft;

    scope.persistenceFrame = (scope.persistenceFrame + 1) % 2;
    if (scope.persistenceFrame === 0) {
      const stride = Math.max(1, Math.floor(points.length / 180));
      const snapshot = [];
      for (let i = 0; i < points.length; i += stride) snapshot.push({ x: points[i].x, y: points[i].y });
      history.push(snapshot);
      if (history.length > 8) history.shift();
    }

    for (let h = 0; h < history.length; h++) {
      const age = (h + 1) / history.length;
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.1 + age * 0.9;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = activeAlpha * (0.08 + age * 0.22);
      if (buildScopeLinePath(ctx, history[h])) ctx.stroke();
      ctx.restore();
    }

    if (CONFIG.display.glowIntensity > 0) drawScopeGlowPasses(ctx, points, gradient, activeAlpha * 0.72);

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = activeAlpha * 1.0;
    if (buildScopeLinePath(ctx, points)) ctx.stroke();
    ctx.restore();
  }

  function drawScopeEnvelope(ctx, points, gradient, activeAlpha, yCenter) {
    const bucketCount = Math.max(28, Math.min(72, Math.round(points.length / 6)));
    const bucketSize = Math.max(1, Math.floor(points.length / bucketCount));
    const upper = [];
    const lower = [];

    for (let b = 0; b < bucketCount; b++) {
      const from = b * bucketSize;
      const to = Math.min(points.length, from + bucketSize);
      if (from >= points.length) break;

      let maxDeviation = 0;
      let px = points[from].x;
      for (let i = from; i < to; i++) {
        maxDeviation = Math.max(maxDeviation, Math.abs(points[i].y - yCenter));
        px = points[i].x;
      }
      upper.push({ x: px, y: yCenter - maxDeviation });
      lower.push({ x: px, y: yCenter + maxDeviation });
    }

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.0;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = activeAlpha * 0.78;
    if (buildScopeLinePath(ctx, points)) ctx.stroke();
    ctx.restore();

    for (const trace of [upper, lower]) {
      if (CONFIG.display.glowIntensity > 0) {
        ctx.save();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4.2;
        ctx.globalAlpha = activeAlpha * 0.18;
        ctx.filter = `blur(${1.5 + CONFIG.display.glowIntensity * 0.8}px)`;
        if (buildScopeLinePath(ctx, trace)) ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.25;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = activeAlpha * 0.98;
      if (buildScopeLinePath(ctx, trace)) ctx.stroke();
      ctx.restore();
    }
  }


  function drawScopeSpindle(ctx, points, gradient, activeAlpha, yCenter) {
    if (!points || points.length < 8) return;

    // Build a slow amplitude envelope from the real waveform.
    // This produces the repeated fusiform / AM lobes seen on a real scope.
    const bucketCount = Math.max(
      34,
      Math.min(86, Math.round(points.length / 5))
    );
    const bucketSize = Math.max(
      1,
      Math.floor(points.length / bucketCount)
    );

    const envelope = [];

    for (let b = 0; b < bucketCount; b++) {
      const from = b * bucketSize;
      const to = Math.min(points.length, from + bucketSize);
      if (from >= points.length) break;

      let maxDeviation = 0;
      let x = points[from].x;

      for (let i = from; i < to; i++) {
        const deviation = Math.abs(points[i].y - yCenter);
        if (deviation > maxDeviation) {
          maxDeviation = deviation;
        }
        x = points[i].x;
      }

      envelope.push({
        x,
        amp: maxDeviation
      });
    }

    if (envelope.length < 3) return;

    // Smooth envelope slightly so each lobe looks spindle-shaped rather
    // than jagged, while still following the source audio.
    const smoothEnvelope = envelope.map((item, i) => {
      let sum = 0;
      let count = 0;

      for (let k = -2; k <= 2; k++) {
        const j = i + k;
        if (j >= 0 && j < envelope.length) {
          sum += envelope[j].amp;
          count++;
        }
      }

      return {
        x: item.x,
        amp: count ? sum / count : item.amp
      };
    });

    const upper = smoothEnvelope.map(p => ({
      x: p.x,
      y: yCenter - p.amp
    }));
    const lower = smoothEnvelope.map(p => ({
      x: p.x,
      y: yCenter + p.amp
    }));

    // Dense carrier strokes inside the envelope. Their varying height creates
    // the classic AM / spindle appearance rather than a simple outline.
    const carrierCount = Math.max(
      70,
      Math.min(180, Math.round((points[points.length - 1].x - points[0].x) / 2.2))
    );

    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 0.72;
    ctx.globalAlpha = activeAlpha * 0.58;

    if (CONFIG.display.glowIntensity > 0) {
      ctx.shadowColor = ACTIVE_THEME.colors.mid;
      ctx.shadowBlur = 1 + CONFIG.display.glowIntensity * 0.9;
    }

    ctx.beginPath();

    for (let i = 0; i < carrierCount; i++) {
      const t = i / Math.max(1, carrierCount - 1);

      // Interpolate the slow envelope at this x.
      const ePos = t * (smoothEnvelope.length - 1);
      const e0 = Math.floor(ePos);
      const e1 = Math.min(smoothEnvelope.length - 1, e0 + 1);
      const mix = ePos - e0;
      const amp =
        smoothEnvelope[e0].amp * (1 - mix) +
        smoothEnvelope[e1].amp * mix;

      const x =
        points[0].x +
        t * (points[points.length - 1].x - points[0].x);

      // Fast carrier phase with a tiny phase wobble to avoid sterile
      // computer-perfect lines and resemble a real oscilloscope trace.
      const carrier =
        Math.sin(t * Math.PI * 2 * 24 + Math.sin(t * Math.PI * 6) * 0.35);

      const top = yCenter - amp * Math.abs(carrier);
      const bottom = yCenter + amp * Math.abs(carrier);

      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }

    ctx.stroke();
    ctx.restore();

    // Envelope outlines stay brighter and define the spindle lobes.
    if (CONFIG.display.glowIntensity > 0) {
      for (const trace of [upper, lower]) {
        ctx.save();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4.5;
        ctx.globalAlpha = activeAlpha * 0.14;
        ctx.filter = `blur(${1.4 + CONFIG.display.glowIntensity * 0.85}px)`;
        if (buildScopeLinePath(ctx, trace)) ctx.stroke();
        ctx.restore();
      }
    }

    for (const trace of [upper, lower]) {
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.55;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = activeAlpha * 0.88;
      if (buildScopeLinePath(ctx, trace)) ctx.stroke();
      ctx.restore();
    }

    // Fine centre carrier line, similar to the bright central body seen
    // in modulated-signal oscilloscope captures.
    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = activeAlpha * 0.42;
    if (buildScopeLinePath(ctx, points)) ctx.stroke();
    ctx.restore();
  }


  function drawScopeWaveform(ctx, samples, trigger, x, yCenter, width, amplitude, channel) {
    if (!samples || samples.length < 2 || width <= 1) return;

    const points = getScopeWaveformPoints(samples, trigger, x, yCenter, width, amplitude, channel);
    if (points.length < 2) return;

    const gradient = createScopeThemeGradient(ctx, x, width);
    const activeAlpha = STATE.hasStreamObject ? 1 : 0.34;
    const style = CONFIG.display.oscilloscopeStyle || "lines";

    // LINES = former Glow.
    if (style === "lines") {
      drawScopeGlowPasses(ctx, points, gradient, activeAlpha);
      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3.8;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = activeAlpha * 0.99;
      if (buildScopeLinePath(ctx, points)) ctx.stroke();
      ctx.restore();
      return;
    }

    // FILLED: substantially more opaque, close to Spectrum density.
    if (style === "filled") {
      if (CONFIG.display.glowIntensity > 0) {
        ctx.save();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 5.2;
        ctx.globalAlpha = activeAlpha * 0.25;
        ctx.filter = `blur(${2 + CONFIG.display.glowIntensity * 1.2}px)`;
        if (buildScopeLinePath(ctx, points)) ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, yCenter);
      for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.lineTo(points[points.length - 1].x, yCenter);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.globalAlpha = activeAlpha * 0.58;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = activeAlpha;
      if (buildScopeLinePath(ctx, points)) ctx.stroke();
      ctx.restore();
      return;
    }

    // DOTS: deliberately larger phosphor dots.
    if (style === "dots") {
      const step = Math.max(3, Math.round(points.length / Math.max(30, width / 7)));

      if (CONFIG.display.glowIntensity > 0) {
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.globalAlpha = activeAlpha * 0.25;
        ctx.filter = `blur(${1.8 + CONFIG.display.glowIntensity}px)`;
        ctx.beginPath();
        for (let i = 0; i < points.length; i += step) {
          ctx.moveTo(points[i].x + 3.4, points[i].y);
          ctx.arc(points[i].x, points[i].y, 3.4, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.globalAlpha = activeAlpha;
      ctx.beginPath();
      for (let i = 0; i < points.length; i += step) {
        ctx.moveTo(points[i].x + 2.05, points[i].y);
        ctx.arc(points[i].x, points[i].y, 2.05, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
      return;
    }

    // STEPS: fewer, visibly larger sample-and-hold steps.
    if (style === "steps") {
      const coarse = [];
      const targetSteps = Math.max(16, Math.round(width / 18));
      const stride = Math.max(1, Math.floor(points.length / targetSteps));
      for (let i = 0; i < points.length; i += stride) coarse.push(points[i]);
      if (coarse[coarse.length - 1] !== points[points.length - 1]) coarse.push(points[points.length - 1]);

      if (CONFIG.display.glowIntensity > 0) {
        ctx.save();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4.2;
        ctx.globalAlpha = activeAlpha * 0.18;
        ctx.filter = `blur(${1.5 + CONFIG.display.glowIntensity}px)`;
        if (buildScopeStepPath(ctx, coarse)) ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "square";
      ctx.globalAlpha = activeAlpha * 0.98;
      if (buildScopeStepPath(ctx, coarse)) ctx.stroke();
      ctx.restore();
      return;
    }

    if (style === "persistence") {
      drawScopePersistence(ctx, points, gradient, activeAlpha, channel);
      return;
    }

    if (style === "envelope") {
      drawScopeEnvelope(ctx, points, gradient, activeAlpha, yCenter);
      return;
    }

    if (style === "spindle") {
      drawScopeSpindle(ctx, points, gradient, activeAlpha, yCenter);
      return;
    }
  }


  function drawScopePeakHistory(
    ctx,
    history,
    x,
    yCenter,
    width,
    amplitude
  ) {
    if (!history || history.length < 2) return;

    ctx.save();
    ctx.strokeStyle = ACTIVE_THEME.colors.peak;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = STATE.hasStreamObject ? 0.96 : 0.30;

    if (CONFIG.display.glowIntensity > 0) {
      ctx.shadowColor = ACTIVE_THEME.colors.peak;
      ctx.shadowBlur = 2 + CONFIG.display.glowIntensity * 3;
    }

    ctx.beginPath();

    for (let i = 0; i < history.length; i++) {
      const norm = Math.max(0, Math.min(1.25, history[i] || 0));
      const px = x + (i / Math.max(1, history.length - 1)) * width;

      // Independent peak-history line: upper region of each channel lane,
      // like the held peak line in Spectrum rather than an outline.
      // Same vertical reference as the main waveform. The held-peak trace
      // now lives inside the waveform lane rather than floating above it.
      const py =
        yCenter -
        Math.min(1, norm) * amplitude * 0.42;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.stroke();
    ctx.restore();
  }

  function renderOscilloscope(ctx, canvas) {
    const left = STATE.audio.timeLeft;
    const right = STATE.audio.timeRight;
    if (!ctx || !canvas || !left || !right) return;

    // Use the full normal canvas area. L/R labels live outside the canvas at
    // the left, and readouts live at the right edge of the wrapper.
    const logicalW = getCanvasLogicalWidth(canvas);
    const targetH = 94;

    if (getCanvasLogicalHeight(canvas) !== targetH) {
      resizeCanvasIfNeeded(canvas, logicalW, targetH);
      STATE.dom.ctx = canvas.getContext("2d");
      ctx = STATE.dom.ctx;
      applyCanvasHiDpiTransform(canvas);
    }

    const width = getCanvasLogicalWidth(canvas);
    const height = getCanvasLogicalHeight(canvas);
    if (width <= 2 || height <= 2) return;

    ctx.clearRect(0, 0, width, height);

    const padX = 0;

    // EXACT drawable length of normal LR Bars, independent of the user's
    // stored render mode. This keeps the waveform ending before the readouts.
    const drawW = Math.max(
      1,
      width - CONFIG.display.dimensions.canvasLeft - 26
    );

    // Two large lanes use almost all available vertical canvas space.
    const laneGap = 6;
    const laneH = (height - laneGap) / 2;
    const topLaneTop = 0;
    const bottomLaneTop = laneH + laneGap;
    const topCenter = topLaneTop + laneH * 0.58;
    const bottomCenter = bottomLaneTop + laneH * 0.58;

    // Much larger excursion than before.
    const amplitude = laneH * 0.47;

    // Background grid retained.
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = ACTIVE_THEME.colors.low;
    ctx.globalAlpha = 0.20;

    for (let i = 0; i <= 8; i++) {
      const gx = padX + (drawW * i) / 8;
      ctx.beginPath();
      ctx.moveTo(gx, 2);
      ctx.lineTo(gx, height - 2);
      ctx.stroke();
    }

    [topCenter, bottomCenter].forEach(y => {
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + drawW, y);
      ctx.stroke();
    });

    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.moveTo(padX, laneH + laneGap / 2);
    ctx.lineTo(padX + drawW, laneH + laneGap / 2);
    ctx.stroke();
    ctx.restore();

    const trigger = findScopeTrigger(left);
    const now =
      (typeof performance !== "undefined" && performance.now)
        ? performance.now()
        : Date.now();

    drawScopeWaveform(
      ctx,
      left,
      trigger,
      padX,
      topCenter,
      drawW,
      amplitude,
      "left"
    );

    drawScopeWaveform(
      ctx,
      right,
      trigger,
      padX,
      bottomCenter,
      drawW,
      amplitude,
      "right"
    );

    if (CONFIG.display.showPeaks) {
      const historyLength = Math.max(64, Math.round(drawW / 2));

      const peakLeft = updateScopePeakHistory(
        "left",
        left,
        now,
        historyLength
      );

      const peakRight = updateScopePeakHistory(
        "right",
        right,
        now,
        historyLength
      );

      drawScopePeakHistory(
        ctx,
        peakLeft,
        padX,
        topCenter,
        drawW,
        amplitude
      );

      drawScopePeakHistory(
        ctx,
        peakRight,
        padX,
        bottomCenter,
        drawW,
        amplitude
      );
    }
  }


  function renderMeters() {
    refreshAutomaticTheme();

    const layout = CONFIG.display.layoutMode;
    const render =
      layout === "equalizer" || layout === "vuHybrid" || layout === "oscilloscope"
        ? "bars"
        : CONFIG.display.renderMode;
    const barStyle = CONFIG.display.barStyle;
    const showReadouts = CONFIG.display.showReadouts;

    const minDb = CONFIG.audio.minDb;
    const range = CONFIG.audio.maxDb - minDb;

    FRAME_GRADIENT_CACHE.clear();

    const visualStateKey =
      `${layout}|${render}|${barStyle}|${showReadouts}|${CONFIG.display.hybridMode}|${CONFIG.display.equalizerRenderMode}|${CONFIG.display.oscilloscopeStyle}`;

    if (visualStateKey !== _lastVisualStateKey) {
      _lastVisualStateKey = visualStateKey;
      clearTransientRenderState();
      applyVisualState();
    }

    const GaugesRender = (render === "gauges");
    const AnalogVuRender = (render === "analogVu");
    const BarsRender = (render === "bars");
    const SALayout = (layout === "sa");
    const FullLayout = (layout === "full");
    const useMirrored = (render === "mirrored") && MIRRORED_LAYOUTS.includes(layout);
    const mirrorMetrics = useMirrored ? getMirroredLayoutMetrics() : null;

    let ctx    = STATE.dom.ctx;
    const canvas = STATE.dom.canvas;
    if (!ctx || !canvas) return;

    const canvasStyle = canvas.style;
    const contentWrapper = STATE.dom.contentWrapper;
    const contentWrapperStyle = contentWrapper ? contentWrapper.style : null;

    let width = getCanvasLogicalWidth(canvas);
    let height = getCanvasLogicalHeight(canvas);
    if (!width || !height) return;

    // A layout may change the authored CSS width of the shared normal canvas
    // (Equalizer uses symmetric 5px insets). Synchronize the backing store
    // before drawing so entry and exit remain geometrically centred.
    const renderedWidth = getCanvasRenderedWidth(canvas);
    if (renderedWidth > 40 && Math.abs(renderedWidth - width) > 1) {
      resizeCanvasIfNeeded(canvas, renderedWidth, height);
      ctx = canvas.getContext("2d");
      STATE.dom.ctx = ctx;
      width = getCanvasLogicalWidth(canvas);
      height = getCanvasLogicalHeight(canvas);
    }

    // canvas width/height assignments reset the 2D context state.
    // Reassert the HiDPI transform before every render pass.
    applyCanvasHiDpiTransform(canvas);

    const leftLevels = STATE.levels.left;
    const rightLevels = STATE.levels.right;
    const stereoQualityLevels = STATE.levels.stereoQuality;
    const audioLevels = STATE.levels.audio;

    const barH  = CONFIG.display.dimensions.barHeight;
    const gap   = CONFIG.display.dimensions.spacing;

    if (layout === "oscilloscope") {
      renderOscilloscope(ctx, canvas);
      return;
    }

    if (layout === "equalizer") {
      if (CONFIG.display.equalizerRenderMode === "spectrum") {
        renderEqualizerSpectrum(ctx, canvas);
      } else {
        renderEqualizer(ctx, canvas, barStyle);
      }
      return;
    }

    if (layout === "vuHybrid") {
      renderVuHybrid(ctx, canvas, barStyle);
      return;
    }

    // GAUGES MODE
    if (GaugesRender) {
      renderGauges(ctx, canvas, layout);
      return;
    }

    // ANALOG VU MODE
    if (AnalogVuRender) {
      renderAnalogVu(ctx, canvas, layout);
      return;
    }

    // MIRRORED MODE
    if (useMirrored) {
      const nextHeight = mirrorMetrics.singlePanelHeight + "px";
      const nextTransform =
        mirrorMetrics.canvasOffsetY !== 0
          ? `translateY(${mirrorMetrics.canvasOffsetY}px)`
          : "";
    
      if (getCanvasLogicalHeight(canvas) !== mirrorMetrics.singlePanelHeight) {
        resizeCanvasIfNeeded(canvas, width, mirrorMetrics.singlePanelHeight);
        // Intrinsic resize resets all context state. Reassert both the active
        // context reference and the HiDPI transform before mirrored drawing.
        STATE.dom.ctx = canvas.getContext("2d");
        applyCanvasHiDpiTransform(canvas);
      }
      if (canvasStyle.height !== nextHeight) {
        canvasStyle.height = nextHeight;
      }
      if (canvasStyle.minHeight !== nextHeight) {
        canvasStyle.minHeight = nextHeight;
      }
      if (canvasStyle.transform !== nextTransform) {
        canvasStyle.transform = nextTransform;
      }

      ctx.clearRect(0, 0, width, getCanvasLogicalHeight(canvas));

      const BAR_GAP  = 35;
      const usableW  = Math.floor(width - BAR_GAP);
      const halfW    = Math.floor(usableW / 2);
      const baseLeft = Math.floor((width - (halfW + halfW + BAR_GAP)) / 2);
      const Lx       = Math.floor(baseLeft - 5);
      const Rx       = Math.floor(baseLeft + halfW + BAR_GAP + 5);

      const leftBaseX = Lx + halfW;
      const rightBaseX = Rx;

      if (layout === "full") {
        const qSmoothDb = mapStereoQualityToDb(stereoQualityLevels.smooth, minDb, range);
        const qPeakDb = Number.isFinite(stereoQualityLevels.peakDb)
          ? stereoQualityLevels.peakDb
          : qSmoothDb;
        const { audioSmoothDb, audioPeakDb } = mapAudioLevelsToDb(audioLevels, minDb, range);
        const metrics = getFullMirroredMetrics();
        const mirroredBarH = metrics.singleRowHeight;
        const bottomBlockY = mirroredBarH + metrics.rowGap;
        const mirroredYOffset = metrics.mirroredYOffset;
        const topY = mirroredYOffset;
        const bottomY = bottomBlockY + mirroredYOffset;

        // TOP LEFT (L mirrored)
        renderMirroredChannel(
          ctx, leftBaseX, true,
          leftLevels.smoothDb, leftLevels.peakDb,
          topY, halfW, mirroredBarH, barStyle
        );

        // TOP RIGHT (R normal)
        renderMirroredChannel(
          ctx, rightBaseX, false,
          rightLevels.smoothDb, rightLevels.peakDb,
          topY, halfW, mirroredBarH, barStyle
        );

        // BOTTOM LEFT (Q mirrored)
        renderMirroredChannel(
          ctx, leftBaseX, true,
          qSmoothDb, qPeakDb,
          bottomY, halfW, mirroredBarH, barStyle, 2
        );

        // BOTTOM RIGHT (A normal)
        renderMirroredChannel(
          ctx, rightBaseX, false,
          audioSmoothDb, audioPeakDb,
          bottomY, halfW, mirroredBarH, barStyle, 1
        );

        return;
      }

      const mirroredBarH = mirrorMetrics.mirroredBarH;
      const mirroredYOffset = mirrorMetrics.mirroredYOffset;
      let qSmoothDb = null;
      let qPeakDb = null;
      let audioSmoothDb = null;
      let audioPeakDb = null;

      if (SALayout) {
        qSmoothDb = mapStereoQualityToDb(stereoQualityLevels.smooth, minDb, range);
        qPeakDb = Number.isFinite(stereoQualityLevels.peakDb)
          ? stereoQualityLevels.peakDb
          : qSmoothDb;

        const audioMapped = mapAudioLevelsToDb(audioLevels, minDb, range);
        audioSmoothDb = audioMapped.audioSmoothDb;
        audioPeakDb = audioMapped.audioPeakDb;
      }

      // LEFT (mirrored)
      renderMirroredChannel(
        ctx, leftBaseX, true,
        SALayout ? qSmoothDb : leftLevels.smoothDb,
        SALayout ? qPeakDb : leftLevels.peakDb,
        mirroredYOffset, halfW, mirroredBarH, barStyle,
        SALayout ? 2 : 0
      );

      // RIGHT (normal)
      renderMirroredChannel(
        ctx, rightBaseX, false,
        SALayout ? audioSmoothDb : rightLevels.smoothDb,
        SALayout ? audioPeakDb : rightLevels.peakDb,
        mirroredYOffset, halfW, mirroredBarH, barStyle,
        SALayout ? 1 : 0
      );

      return;
    }

    const effectiveW = getEffectiveBarWidth(width);

    // FULL MODE — NORMAL BARS (L, R, Q, A stacked)
    if (FullLayout && BarsRender) {

      // tighter spacing ONLY for full mode
      const FULL_GAP = Math.round(gap * 0.35);
      const TOP_PAD  = Math.round(barH * 0.05);

      const neededHeight =
        TOP_PAD * 2 +
        barH * 4 +
        FULL_GAP * 3;

      syncCanvasAndWrapperHeight(
        canvas,
        canvasStyle,
        contentWrapperStyle,
        neededHeight
      );

      ctx.clearRect(0, 0, width, getCanvasLogicalHeight(canvas));

      let y = TOP_PAD;
      const fullStep = barH + FULL_GAP;

      // L
      renderBarChannelWithMode(
        leftLevels.smoothDb,
        leftLevels.peakDb,
        y,
        width,
        barH,
        effectiveW,
        barStyle,
        0
      );

      y += fullStep;

      // R
      renderBarChannelWithMode(
        rightLevels.smoothDb,
        rightLevels.peakDb,
        y,
        width,
        barH,
        effectiveW,
        barStyle,
        0
      );

      y += fullStep;

      // Q — Stereo Quality
      const qSmoothDb = mapStereoQualityToDb(stereoQualityLevels.smooth, minDb, range);
      const qPeakDb = Number.isFinite(stereoQualityLevels.peakDb)
        ? stereoQualityLevels.peakDb
        : qSmoothDb;
      renderBarChannelWithMode(
        qSmoothDb,
        qPeakDb,
        y,
        width,
        barH,
        effectiveW,
        barStyle,
        2
      );

      y += fullStep;

      // A — Audio
      const { audioSmoothDb, audioPeakDb } = mapAudioLevelsToDb(audioLevels, minDb, range);
      renderBarChannelWithMode(
        audioSmoothDb,
        audioPeakDb,
        y,
        width,
        barH,
        effectiveW,
        barStyle,
        1
      );

      return;
    }

    // NORMAL / SA MODES (UNCHANGED)
    const rowStep = barH + gap;
    const neededHeight = SALayout
      ? barH * 3 + gap * 2
      : barH * 2 + gap;

    syncCanvasAndWrapperHeight(
      canvas,
      canvasStyle,
      contentWrapperStyle,
      neededHeight
    );

    ctx.clearRect(0, 0, width, getCanvasLogicalHeight(canvas));

    // L+R channels
    if (layout === "lr") {

      // L
      renderBarChannelWithMode(
        leftLevels.smoothDb,
        leftLevels.peakDb,
        0,
        width,
        barH,
        effectiveW,
        barStyle,
        0
      );
      // R
      renderBarChannelWithMode(
        rightLevels.smoothDb,
        rightLevels.peakDb,
        rowStep,
        width,
        barH,
        effectiveW,
        barStyle,
        0
      );
    }

    // Stereo Quality (SA)
    else if (SALayout) {
      const qSmoothDb = mapStereoQualityToDb(stereoQualityLevels.smooth, minDb, range);
      const qPeakDb = Number.isFinite(stereoQualityLevels.peakDb)
        ? stereoQualityLevels.peakDb
        : qSmoothDb;

      renderBarChannelWithMode(
        qSmoothDb,
        qPeakDb,
        0,
        width,
        barH,
        effectiveW,
        barStyle,
        2
      );

      // Audio (SA)
      const { audioSmoothDb, audioPeakDb } = mapAudioLevelsToDb(audioLevels, minDb, range);

      renderBarChannelWithMode(
        audioSmoothDb,
        audioPeakDb,
        rowStep,
        width,
        barH,
        effectiveW,
        barStyle,
        1
      );
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
    const refWidth = el.getBoundingClientRect().width;

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
    const W = getCanvasLogicalWidth(canvas);
    const desiredH = Math.max(1, WRAPPER_HEIGHT - 20);
    if (!W) return;

    if (getCanvasLogicalHeight(canvas) !== desiredH) {
      resizeCanvasIfNeeded(canvas, W, desiredH);
      ctx = canvas.getContext("2d");
    }
    canvas.style.height = `${desiredH}px`;
    if (STATE.dom.contentWrapper) {
      STATE.dom.contentWrapper.style.height = `${WRAPPER_HEIGHT}px`;
      STATE.dom.contentWrapper.style.minHeight = `${WRAPPER_HEIGHT}px`;
    }

    const H = desiredH;

    applyCanvasHiDpiTransform(canvas);

    const gaugeCount = (layout === "lr" || layout === "sa") ? 2 : (layout === "full") ? 4 : 0;
    if (!gaugeCount) return;

    const cellW = W / gaugeCount;
    const centerFractions = getGaugeCenterFractions(layout);

    // Geometry
    const radius = (layout === "full") ? Math.min(W / 2, H) * 0.36 : Math.min(cellW, H) * 0.55;
    const ringWidth = radius * 0.26;
    const centerY   = radius + ringWidth / 2;

    // Arc (~241° = visual 120%)
    const startAngle = -Math.PI * 1.17;
    const endAngle   =  Math.PI * 0.17;
    const arcSpan    = endAngle - startAngle;
    const START_EPS  = arcSpan * 0.010;

    const fracToAngle = (f) =>
      (startAngle + START_EPS) +
      (arcSpan - START_EPS) * Math.max(0, Math.min(1, f));

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < gaugeCount; i++) {
      const { mode, frac } = computeFracAndMode(layout, i, W);

      let cx, cy;

      // Canvas gauges and DOM labels share the exact same normalized centres.
      cx = centerFractions[i] * W;
      cy = (layout === "full" && gaugeCount === 4) ? centerY + 8 : centerY;

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

        const { gradient } =
          buildConicGaugeGradient(
            ctx,
            cx,
            cy,
            mode,
            startAngle,
            START_EPS,
            arcSpan
          );

        // UNIFIED GRADIENT HALO — active arc only.
        if (CONFIG.display.glowIntensity > 0) {
          ctx.save();
          ctx.lineCap = "round";
          ctx.lineWidth = ringWidth;
          ctx.strokeStyle = gradient;
          ctx.globalAlpha =
            0.52 * CONFIG.display.glowIntensity;
          ctx.filter =
            `blur(${Math.max(4, ringWidth * 0.72)}px)`;

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

      } else if (mode === 1) {
        // RMS+Peak uses the same held A peak as bars and mirrored modes.
        const audioPeakDb = mapAudioLevelsToDb(
          STATE.levels.audio,
          CONFIG.audio.minDb,
          CONFIG.audio.maxDb - CONFIG.audio.minDb
        ).audioPeakDb;
        const px = mapDbToX(audioPeakDb, W);
        peakFrac = Math.max(0, Math.min(1, px / W));
      } else {
        // Q uses its own held quality peak in every gauge layout.
        const qualityPeakDb = STATE.levels.stereoQuality.peakDb;
        if (Number.isFinite(qualityPeakDb)) {
          const px = mapDbToX(qualityPeakDb, W);
          peakFrac = Math.max(0, Math.min(1, px / W));
        } else {
          peakFrac = frac;
        }
      }

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

  function getAnalogVuPeakFrac(key, widthRef, liveFrac) {
    const minDb = CONFIG.audio.minDb;
    const range = CONFIG.audio.maxDb - minDb;
    let peakDb = minDb;

    if (key === "L") {
      peakDb = STATE.levels.left.peakDb;
    } else if (key === "R") {
      peakDb = STATE.levels.right.peakDb;
    } else if (key === "Q") {
      peakDb = Number.isFinite(STATE.levels.stereoQuality.peakDb)
        ? STATE.levels.stereoQuality.peakDb
        : mapStereoQualityToDb(
            STATE.levels.stereoQuality.smooth,
            minDb,
            range
          );
    } else if (key === "A") {
      peakDb = mapAudioLevelsToDb(
        STATE.levels.audio,
        minDb,
        range
      ).audioPeakDb;
    }

    return Math.max(
      clamp01(liveFrac),
      fracFromDb(Number.isFinite(peakDb) ? peakDb : minDb, widthRef)
    );
  }

  function getAnalogVuReadout(key) {
    if (key === "L" || key === "R") {
      const db = key === "L"
        ? STATE.levels.left.smoothDb
        : STATE.levels.right.smoothDb;
      const value = clamp(
        Number.isFinite(db) ? db : CONFIG.audio.minDb,
        CONFIG.audio.minDb,
        CONFIG.audio.maxDb
      );
      return `${value.toFixed(1)} dB`;
    }

    if (key === "Q") {
      return `${Math.round(clamp(
        STATE.levels.stereoQuality.smooth,
        0,
        120
      ) || 0)} %`;
    }

    return `${Math.round(
      (clamp(STATE.levels.audio.smooth, 0, 255) || 0) /
        255 * 100
    )} %`;
  }

  function getAnalogVuScale(mode) {
    if (mode === 2) {
      return ["0", "30", "60", "90", "120"];
    }
    if (mode === 1) {
      return ["0", "25", "50", "75", "100"];
    }
    return ["-35", "-25", "-15", "-5", "+5"];
  }

  function getAnalogCirclePoint(cx, cy, radius, startAngle, endAngle, t) {
    const angle = startAngle + (endAngle - startAngle) * clamp01(t);
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  }

  function getAnalogPeakPathFrac(stateKey, liveFrac, peakFrac, pathLength) {
    if (!STATE.render) STATE.render = {};
    const bucket = (STATE.render.analogVuPeak ??= {});
    const live = clamp01(liveFrac);
    const held = clamp01(peakFrac);

    if (
      !CONFIG.display.showPeaks ||
      STATE.hasStreamObject !== true
    ) {
      delete bucket[stateKey];
      return null;
    }

    const state = (
      bucket[stateKey] ??= {
        pos: live,
        vel: 0,
        lastPeak: held
      }
    );
    const pixelFrac = 1 / Math.max(1, pathLength);
    const isNewPeak = held > state.lastPeak + 0.5 * pixelFrac;
    const target = isNewPeak
      ? Math.min(1, held + 8 * pixelFrac)
      : live;
    state.lastPeak = held;

    if (target > state.pos) {
      state.pos = target;
      state.vel = 0;
    } else {
      state.vel += (target - state.pos) * 0.28;
      state.vel *= 0.78;
      state.pos += state.vel;
    }

    state.pos = Math.max(live, Math.min(1, state.pos));
    return state.pos;
  }

  function drawAnalogVuInstrument(
    ctx,
    frame,
    key,
    mode,
    liveFrac,
    peakFrac,
    readoutText,
    compact,
    fontFamily
  ) {
    const { x, y, w, h } = frame;
    const colors = ACTIVE_THEME.colors;
    const peakColor = colors.peak;
    const accentColor = getFmDxAccentColor();
    const frameRadius = compact ? 5.2 : 8;
    const rim = compact ? 3.4 : 5.2;
    const inner = {
      x: x + rim,
      y: y + rim,
      w: w - rim * 2,
      h: h - rim * 2
    };
    const innerRadius = Math.max(3, frameRadius - 2);
    const pivotX = inner.x + inner.w / 2;
    const pivotY = inner.y + inner.h - (compact ? 2.2 : 3.5);
    const arcInset = compact ? 3 : 5;
    // The needle length is a true, invariant radius. The ticker is an exact
    // segment of that same circle; only its visible angular span is clipped
    // to the horizontal room available in each frame.
    const arcTopInset = compact ? 2.5 : 4;
    const needleRadius = Math.max(8, pivotY - (inner.y + arcTopInset));
    const availableHalfWidth = Math.max(4, inner.w / 2 - arcInset);
    const maxHalfSpan = compact ? 1.22 : 1.20;
    const widthHalfSpan = Math.asin(Math.min(1, availableHalfWidth / needleRadius));
    const halfSpan = Math.min(maxHalfSpan, widthHalfSpan);
    const arcStartAngle = -Math.PI / 2 - halfSpan;
    const arcEndAngle = -Math.PI / 2 + halfSpan;
    const approximatePathLength = Math.max(
      1,
      needleRadius * (arcEndAngle - arcStartAngle)
    );
    // Fixed FM-DX accent with light and shadow passes for a cylindrical,
    // three-dimensional metal rim. It is intentionally independent of the
    // AudioMetrix low/mid/high palette.
    const frameGradient = ctx.createLinearGradient(x, y, x + w, y + h);
    frameGradient.addColorStop(0.00, accentColor);
    frameGradient.addColorStop(0.18, "rgba(255,255,255,0.88)");
    frameGradient.addColorStop(0.38, accentColor);
    frameGradient.addColorStop(0.76, "rgba(0,0,0,0.78)");
    frameGradient.addColorStop(1.00, accentColor);
    // Gauge-like theme halo around the frame.
    if (CONFIG.display.glowIntensity > 0) {
      ctx.save();
      ctx.globalAlpha = 0.48 * CONFIG.display.glowIntensity;
      ctx.filter = `blur(${compact ? 3.5 : 6}px)`;
      ctx.strokeStyle = frameGradient;
      ctx.lineWidth = compact ? 4.7 : 7;
      ctx.beginPath();
      ctx.roundRect(x + rim / 2, y + rim / 2, w - rim, h - rim, frameRadius);
      ctx.stroke();
      ctx.restore();
    }

    // Dark support plus thick, clean gauge-style gradient frame.
    ctx.save();
    ctx.fillStyle = "rgba(2,4,7,0.94)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, frameRadius);
    ctx.fill();
    ctx.strokeStyle = frameGradient;
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.roundRect(
      x + rim / 2,
      y + rim / 2,
      w - rim,
      h - rim,
      Math.max(2, frameRadius - rim / 3)
    );
    ctx.stroke();
    ctx.restore();

    // Recessed inner glass without the former white/black pillow emboss.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.72)";
    ctx.shadowBlur = compact ? 3 : 5;
    ctx.fillStyle = "rgba(2,5,8,0.88)";
    ctx.beginPath();
    ctx.roundRect(inner.x, inner.y, inner.w, inner.h, innerRadius);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = frameGradient;
    ctx.lineWidth = compact ? 0.8 : 1.15;
    ctx.beginPath();
    ctx.roundRect(
      inner.x + 0.5,
      inner.y + 0.5,
      inner.w - 1,
      inner.h - 1,
      innerRadius
    );
    ctx.stroke();
    ctx.restore();

    // Recessed glass face.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(inner.x, inner.y, inner.w, inner.h, innerRadius);
    ctx.clip();
    const face = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
    face.addColorStop(0, "rgba(12,16,21,0.78)");
    face.addColorStop(0.58, "rgba(4,7,11,0.88)");
    face.addColorStop(1, "rgba(0,1,3,0.94)");
    ctx.fillStyle = face;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

    // Theme-coloured instrument face: low/mid/high are softly blended into
    // the dark recessed base, beneath the glass and every readable element.
    const themeFace = ctx.createLinearGradient(
      inner.x,
      inner.y + inner.h,
      inner.x + inner.w,
      inner.y
    );
    themeFace.addColorStop(0.00, colors.low);
    themeFace.addColorStop(0.50, colors.mid);
    themeFace.addColorStop(1.00, colors.high);
    ctx.save();
    ctx.globalAlpha = compact ? 0.30 : 0.34;
    ctx.filter = `blur(${compact ? 3 : 5}px)`;
    ctx.fillStyle = themeFace;
    ctx.fillRect(inner.x - 4, inner.y - 4, inner.w + 8, inner.h + 8);
    ctx.restore();

    // Dark edge vignette preserves depth and ticker/readout contrast.
    const retroFace = ctx.createRadialGradient(
      pivotX,
      inner.y + inner.h * 0.34,
      0,
      pivotX,
      inner.y + inner.h * 0.40,
      Math.max(inner.w * 0.62, inner.h)
    );
    retroFace.addColorStop(0.00, "rgba(255,255,255,0.025)");
    retroFace.addColorStop(0.50, "rgba(0,0,0,0.08)");
    retroFace.addColorStop(1.00, "rgba(0,0,0,0.46)");
    ctx.fillStyle = retroFace;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = "rgba(255,225,178,0.08)";
    ctx.lineWidth = 0.45;
    for (let textureY = inner.y + 2.5; textureY < inner.y + inner.h; textureY += 4) {
      ctx.beginPath();
      ctx.moveTo(inner.x + 2, textureY);
      ctx.lineTo(inner.x + inner.w - 2, textureY);
      ctx.stroke();
    }
    ctx.restore();

    // Stronger broad reflection beneath the readable graphics.
    const underGlass = ctx.createLinearGradient(
      inner.x,
      inner.y,
      inner.x + inner.w,
      inner.y + inner.h
    );
    underGlass.addColorStop(0.00, "rgba(255,255,255,0.13)");
    underGlass.addColorStop(0.18, "rgba(255,255,255,0.055)");
    underGlass.addColorStop(0.42, "rgba(255,255,255,0.02)");
    underGlass.addColorStop(0.72, "rgba(0,0,0,0.10)");
    underGlass.addColorStop(1.00, "rgba(255,255,255,0.025)");
    ctx.globalAlpha = 1;
    ctx.filter = `blur(${compact ? 2.5 : 4}px)`;
    ctx.fillStyle = underGlass;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.restore();

    // Double concentric ticker arc. The outer/upper arc is the stronger
    // instrument rim; the inner/lower arc retains the former fine line.
    const innerTickerRadius = Math.max(
      4,
      needleRadius - (compact ? 3.2 : 5)
    );
    const warningStartFrac =
      mode === 1 ? 70 / 100 :
      mode === 2 ? 100 / 120 :
      null;
    const warningColor =
      mode === 1 ? "#ff3131" :
      mode === 2 ? "#ffd400" :
      null;
    const warningStartAngle = warningStartFrac === null
      ? null
      : arcStartAngle + (arcEndAngle - arcStartAngle) * warningStartFrac;

    // Glow pass for the complete double arc, followed by a stronger coloured
    // warning-zone halo for Q and A.
    if (CONFIG.display.glowIntensity > 0) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.filter = `blur(${compact ? 2.4 : 3.8}px)`;
      ctx.globalAlpha = 0.36 * CONFIG.display.glowIntensity;
      ctx.strokeStyle = "rgba(255,255,255,0.72)";

      [
        [needleRadius, compact ? 1.8 : 2.6],
        [innerTickerRadius, compact ? 1.1 : 1.55]
      ].forEach(([radius, lineWidth]) => {
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, radius, arcStartAngle, arcEndAngle);
        ctx.stroke();
      });

      if (warningColor && warningStartAngle !== null) {
        ctx.globalAlpha = 0.72 * CONFIG.display.glowIntensity;
        ctx.strokeStyle = warningColor;
        [
          [needleRadius, compact ? 2.0 : 3.0],
          [innerTickerRadius, compact ? 1.25 : 1.8]
        ].forEach(([radius, lineWidth]) => {
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.arc(pivotX, pivotY, radius, warningStartAngle, arcEndAngle);
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.54)";
    ctx.lineWidth = compact ? 1.35 : 2.0;
    ctx.beginPath();
    ctx.arc(
      pivotX,
      pivotY,
      needleRadius,
      arcStartAngle,
      arcEndAngle
    );
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = compact ? 0.8 : 1.1;
    ctx.beginPath();
    ctx.arc(
      pivotX,
      pivotY,
      innerTickerRadius,
      arcStartAngle,
      arcEndAngle
    );
    ctx.stroke();

    // Both concentric lines adopt the exact Q/A warning colour beyond the
    // corresponding 100/70 threshold.
    if (warningColor && warningStartAngle !== null) {
      ctx.strokeStyle = warningColor;
      ctx.lineWidth = compact ? 1.35 : 2.0;
      ctx.beginPath();
      ctx.arc(
        pivotX,
        pivotY,
        needleRadius,
        warningStartAngle,
        arcEndAngle
      );
      ctx.stroke();

      ctx.lineWidth = compact ? 0.8 : 1.1;
      ctx.beginPath();
      ctx.arc(
        pivotX,
        pivotY,
        innerTickerRadius,
        warningStartAngle,
        arcEndAngle
      );
      ctx.stroke();
    }
    ctx.restore();

    const tickCount = 20;
    const scaleLabels = getAnalogVuScale(mode);
    for (let i = 0; i <= tickCount; i++) {
      const f = i / tickCount;
      const point = getAnalogCirclePoint(
        pivotX,
        pivotY,
        needleRadius,
        arcStartAngle,
        arcEndAngle,
        f
      );
      const dx = pivotX - point.x;
      const dy = pivotY - point.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / distance;
      const ny = dy / distance;
      const major = i % 5 === 0;
      const tickLength = major
        ? (compact ? 5.5 : 9)
        : (compact ? 3.2 : 5.5);
      const zoneColor =
        warningColor && warningStartFrac !== null && f >= warningStartFrac
          ? warningColor
          : "rgba(255,255,255,0.76)";

      ctx.save();
      ctx.strokeStyle = zoneColor;
      ctx.lineWidth = major ? (compact ? 1 : 1.3) : 0.65;
      if (CONFIG.display.glowIntensity > 0) {
        ctx.shadowColor = zoneColor;
        ctx.shadowBlur = (compact ? 2.2 : 3.4) * CONFIG.display.glowIntensity;
      }
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(
        point.x + nx * tickLength,
        point.y + ny * tickLength
      );
      ctx.stroke();
      ctx.restore();

      if (major) {
        const labelDistance = tickLength + (compact ? 4 : 7.5);
        ctx.save();
        ctx.fillStyle = zoneColor;
        ctx.font = `600 ${compact ? 5.2 : 7}px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (CONFIG.display.glowIntensity > 0) {
          ctx.shadowColor = zoneColor;
          ctx.shadowBlur = (compact ? 1.8 : 2.8) * CONFIG.display.glowIntensity;
        }
        ctx.fillText(
          scaleLabels[i / 5],
          point.x + nx * labelDistance,
          point.y + ny * labelDistance
        );
        ctx.restore();
      }
    }

    // Channel label bottom-left; readout bottom-right.
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `700 13px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      key,
      inner.x + (compact ? 4 : 7),
      inner.y + inner.h - (compact ? 2 : 4)
    );
    ctx.restore();

    if (
      CONFIG.display.showReadouts &&
      STATE.hasStreamObject === true
    ) {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${compact ? 10 : 13}px ${fontFamily}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = "rgba(0,0,0,0.95)";
      ctx.shadowBlur = 3;
      ctx.fillText(
        readoutText,
        inner.x + inner.w - (compact ? 4 : 7),
        inner.y + inner.h - (compact ? 2 : 4)
      );
      ctx.restore();
    }

    // Longer, thicker 3D theme-high needle ending exactly on the ticker arc.
    const needleTip = getAnalogCirclePoint(
      pivotX,
      pivotY,
      needleRadius,
      arcStartAngle,
      arcEndAngle,
      liveFrac
    );
    if (CONFIG.display.glowIntensity > 0 && liveFrac > 0) {
      ctx.save();
      ctx.globalAlpha = 0.76 * CONFIG.display.glowIntensity;
      ctx.filter = `blur(${compact ? 3 : 5}px)`;
      ctx.strokeStyle = colors.high;
      ctx.lineWidth = compact ? 3.6 : 5.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(needleTip.x, needleTip.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.82)";
    ctx.lineWidth = compact ? 2.8 : 4.0;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(needleTip.x, needleTip.y);
    ctx.stroke();
    ctx.strokeStyle = colors.high;
    ctx.lineWidth = compact ? 2.1 : 3.1;
    ctx.stroke();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = compact ? 0.55 : 0.8;
    ctx.stroke();
    ctx.restore();

    // Slightly larger peak bead moving directly on the ticker path.
    const peakPathFrac = getAnalogPeakPathFrac(
      `${key}:${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`,
      liveFrac,
      peakFrac,
      approximatePathLength
    );
    if (peakPathFrac !== null) {
      const peakPoint = getAnalogCirclePoint(
        pivotX,
        pivotY,
        needleRadius,
        arcStartAngle,
        arcEndAngle,
        peakPathFrac
      );
      ctx.save();
      ctx.fillStyle = peakColor;
      ctx.beginPath();
      ctx.arc(
        peakPoint.x,
        peakPoint.y,
        compact ? 3.1 : 4.1,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    // Metallic lower hub remains unchanged in character.
    ctx.save();
    const hubRadius = compact ? 3.6 : 4.7;
    const hub = ctx.createRadialGradient(
      pivotX - 1,
      pivotY - 1,
      0,
      pivotX,
      pivotY,
      hubRadius + 1
    );
    hub.addColorStop(0, "rgba(255,255,255,0.92)");
    hub.addColorStop(0.34, colors.high);
    hub.addColorStop(1, "rgba(0,0,0,0.92)");
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, hubRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Clear but stronger final glass reflections.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(inner.x, inner.y, inner.w, inner.h, innerRadius);
    ctx.clip();
    const topGloss = ctx.createLinearGradient(
      0,
      inner.y,
      0,
      inner.y + inner.h * 0.55
    );
    topGloss.addColorStop(0, "rgba(255,255,255,0.13)");
    topGloss.addColorStop(0.30, "rgba(255,255,255,0.04)");
    topGloss.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.filter = `blur(${compact ? 3 : 5}px)`;
    ctx.fillStyle = topGloss;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h * 0.55);
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(inner.x + inner.w * 0.08, inner.y);
    ctx.lineTo(inner.x + inner.w * 0.32, inner.y);
    ctx.lineTo(inner.x + inner.w * 0.56, inner.y + inner.h);
    ctx.lineTo(inner.x + inner.w * 0.42, inner.y + inner.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Crisp, coloured frame edge matching the visual language of gauges.
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = frameGradient;
    ctx.lineWidth = compact ? 1.2 : 1.8;
    ctx.beginPath();
    ctx.roundRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, frameRadius);
    ctx.stroke();
    ctx.restore();
  }

  function renderAnalogVu(ctx, canvas, layout) {
    const renderedWidth = getCanvasRenderedWidth(canvas);
    const width = renderedWidth > 40
      ? renderedWidth
      : getCanvasLogicalWidth(canvas);
    if (!width) return;

    const full = layout === "full";
    const desiredHeight = 100;
    if (
      getCanvasLogicalWidth(canvas) !== width ||
      getCanvasLogicalHeight(canvas) !== desiredHeight
    ) {
      resizeCanvasIfNeeded(canvas, width, desiredHeight);
      ctx = canvas.getContext("2d");
    }
    applyCanvasHiDpiTransform(canvas);
    canvas.style.height = `${desiredHeight}px`;

    const wrapperHeight = desiredHeight;
    if (STATE.dom.contentWrapper) {
      STATE.dom.contentWrapper.style.height = `${wrapperHeight}px`;
      STATE.dom.contentWrapper.style.minHeight = `${wrapperHeight}px`;
    }

    ctx.clearRect(0, 0, width, desiredHeight);

    const keys = full
      ? ["L", "R", "Q", "A"]
      : layout === "sa"
        ? ["Q", "A"]
        : ["L", "R"];
    const pad = 3;
    const gapX = 5;
    const gapY = full ? 3 : 0;
    const columns = 2;
    const rows = full ? 2 : 1;
    const frameW = (width - pad * 2 - gapX) / columns;
    const frameH =
      (desiredHeight - pad * 2 - gapY * (rows - 1)) / rows;
    const inheritedFont = STATE.dom.title
      ? getComputedStyle(STATE.dom.title)
      : null;
    const analogFontFamily =
      inheritedFont?.fontFamily || "sans-serif";

    keys.forEach((key, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const frame = {
        x: pad + column * (frameW + gapX),
        y: pad + row * (frameH + gapY),
        w: frameW,
        h: frameH
      };
      const meter = computeFracAndMode(layout, index, width);
      const peakFrac = getAnalogVuPeakFrac(
        key,
        width,
        meter.frac
      );
      const readoutText = getThrottledCanvasReadout(
        `analogVu:${layout}`,
        index,
        getAnalogVuReadout(key)
      );
      drawAnalogVuInstrument(
        ctx,
        frame,
        key,
        meter.mode,
        meter.frac,
        peakFrac,
        readoutText,
        full,
        analogFontFamily
      );
    });
  }

  // Tile title helper
  function getTileTitle(layout, render, useMirrored) {
    if (layout === "equalizer") {
      return CONFIG.display.equalizerRenderMode === "spectrum"
        ? "16-BAND SPECTRUM"
        : "16-BAND EQ";
    }
    if (layout === "vuHybrid") {
      return CONFIG.display.hybridMode === "audio10"
        ? "AUDIO LEVELS & 10B EQ"
        : "STEREO LEVELS & 12B EQ";
    }

    if (layout === "oscilloscope") return "STEREO OSCILLOSCOPE";

    if (layout === "full") return "AUDIO LEVELS";

    if (layout === "sa") return "ST. QUALITY / RMS+PEAK";

    if (render === "gauges" || render === "analogVu" || useMirrored) {
      return "STEREO LEVELS";
    }

    return CONFIG.display.defaultTitle;
  }

  function setTitleText(nextTitle) {
    if (!STATE.dom.title) return;

    if (STATE.dom.title.textContent !== nextTitle) {
      STATE.dom.title.textContent = nextTitle;
    }

    if (STATE.dom.title.style.display !== "") {
      STATE.dom.title.style.display = "";
    }
  }

  function setTextIfChanged(el, nextText) {
    if (!el) return;
    if (el.textContent !== nextText) {
      el.textContent = nextText;
    }
  }

  // Mirror scale helper
  function getMirroredScaleHTML(layout, side) {
    if (layout === "sa") {
      if (side === "left") {
        return `
          <div style="position:relative;width:95%; display:inline-flex;justify-content:space-between;">
            <span>120</span>
            <span>90</span>
            <span>60</span>
            <span>30</span>
            <span>0</span>
          </div>
        `;
      }

      return `
          <div style="position:relative;width:95%; display:inline-flex;justify-content:space-between;">
            <span>0</span>
            <span>30</span>
            <span>60</span>
            <span>90</span>
            <span>120</span>
          </div>
        `;
    }

    if (side === "left") {
      return `
          <div style="position:relative;width:95%; display:inline-flex;justify-content:space-between;">
            <span data-db="5">+5</span>
            <span data-db="-10">-10</span>
            <span data-db="-20">-20</span>
            <span data-db="-35">-35</span>
          </div>
        `;
    }

    return `
          <div style="position:relative;width:95%; display:inline-flex;justify-content:space-between;">
            <span data-db="-35">-35</span>
            <span data-db="-20">-20</span>
            <span data-db="-10">-10</span>
            <span data-db="+5">+5</span>
          </div>
        `;
  }

  // Numeric labels helper
  function setGaugeNumericLabels(group, start, mid, high, end) {
    if (!group) return;

    group.start.textContent = start;
    group.mid.textContent = mid;
    group.high.textContent = high;
    group.end.textContent = end;

    group.start.style.display =
    group.mid.style.display =
    group.high.style.display =
    group.end.style.display = "";
  }

  // ───────────────
  // VISUAL STATES
  // ───────────────
  function applyVisualState() {
    if (!STATE.dom) return;

    const gaugeLabelLeft  = STATE.dom.gaugeLabelLeft;
    const gaugeLabelRight = STATE.dom.gaugeLabelRight;
    const gaugeLabelQ     = STATE.dom.gaugeLabelQ;
    const gaugeLabelA     = STATE.dom.gaugeLabelA;

    const layout = CONFIG.display.layoutMode;
    const render =
      layout === "equalizer" || layout === "vuHybrid" || layout === "oscilloscope"
        ? "bars"
        : CONFIG.display.renderMode;

    const useMirrored =
      render === "mirrored" &&
      MIRRORED_LAYOUTS.includes(layout);

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
    } else if (render === "analogVu") {
      setCanvasActive("analogVu");
    } else if (useMirrored) {
      setCanvasActive("mirrored");
    } else {
      setCanvasActive("normal");
    }

    // HARD RESET — ALWAYS FIRST (NO STATE LEAKS)

    // canvas position
    if (STATE.dom.canvasNormal && STATE._canvasNormalBaseTop != null) {
      STATE.dom.canvasNormal.style.top = STATE._canvasNormalBaseTop;
      STATE.dom.canvasNormal.style.left = STATE._canvasNormalBaseLeft;
      STATE.dom.canvasNormal.style.width = STATE._canvasNormalBaseWidth;
    }

    if (STATE.dom.canvasGauges) {
      STATE.dom.canvasGauges.style.top = "5px";
      STATE.dom.canvasGauges.style.left = "5px";
      STATE.dom.canvasGauges.style.width = "calc(100% - 10px)";
    }

    // wrapper height
    if (STATE.dom.contentWrapper) {
      STATE.dom.contentWrapper.style.height = "";
      STATE.dom.contentWrapper.style.minHeight = `${WRAPPER_HEIGHT}px`;
    }

    // hide gauge overlay by default
    if (STATE.dom.gaugeOverlay) {
      STATE.dom.gaugeOverlay.style.display = "none";
    }

    // reset labels
    if (STATE.dom.labels.left) {
      STATE.dom.labels.left.style.display = "";
      setTextIfChanged(STATE.dom.labels.left, "L");
    }

    if (STATE.dom.labels.right) {
      STATE.dom.labels.right.style.display = "";
      setTextIfChanged(STATE.dom.labels.right, "R");
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
    if (STATE.dom.mirrorLabel)        STATE.dom.mirrorLabel.style.display        = "none";
    if (STATE.dom.mirrorLabelTop)     STATE.dom.mirrorLabelTop.style.display     = "none";
    if (STATE.dom.mirrorLabelBottom)  STATE.dom.mirrorLabelBottom.style.display  = "none";
    if (STATE.dom.mirrorScaleWrapTop) STATE.dom.mirrorScaleWrapTop.style.display = "none";
    if (STATE.dom.mirrorScaleWrap)    STATE.dom.mirrorScaleWrap.style.display    = "none";

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

    // OSCILLOSCOPE — stereo Float32 waveform using the native LR overlay.
    if (layout === "oscilloscope") {
      // Reuse the real Bar-mode L/R labels. Same DOM, font, coordinates.
      if (STATE.dom.labels.left) {
        STATE.dom.labels.left.style.display = "";
        setTextIfChanged(STATE.dom.labels.left, "L");
      }
      if (STATE.dom.labels.right) {
        STATE.dom.labels.right.style.display = "";
        setTextIfChanged(STATE.dom.labels.right, "R");
      }

      if (STATE.dom.labels.q) STATE.dom.labels.q.style.display = "none";
      if (STATE.dom.labels.a) STATE.dom.labels.a.style.display = "none";

      // Numeric dB scales are not meaningful on a raw waveform.
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      // Scope uses the full wrapper height. The normal Bars canvas normally
      // starts ~20px lower; keeping that top offset with a 100px scope canvas
      // caused the bottom overflow seen on mobile/desktop.
      if (STATE.dom.canvasNormal) {
        STATE.dom.canvasNormal.style.top = "-2px";
        STATE.dom.canvasNormal.style.left = STATE._canvasNormalBaseLeft;
        STATE.dom.canvasNormal.style.width = STATE._canvasNormalBaseWidth;
        STATE.dom.canvasNormal.style.transform = "";
      }

      if (STATE.dom.contentWrapper) {
        STATE.dom.contentWrapper.style.height = WRAPPER_HEIGHT + "px";
        STATE.dom.contentWrapper.style.minHeight = WRAPPER_HEIGHT + "px";
      }

      // Native L/R labels, centered on the real 94px scope waveform lanes.
      const scopeHeight = 94;
      const laneGap = 6;
      const laneH = (scopeHeight - laneGap) / 2;
      const labelTopCenter = laneH * 0.58 - 2;
      const labelBottomCenter =
        laneH + laneGap + laneH * 0.58 - 2;

      if (STATE.dom.labels.left) {
        STATE.dom.labels.left.style.left = "7px";
        STATE.dom.labels.left.style.top =
          (labelTopCenter - 12) + "px";
      }

      if (STATE.dom.labels.right) {
        STATE.dom.labels.right.style.left = "7px";
        STATE.dom.labels.right.style.top =
          (labelBottomCenter - 12) + "px";
      }

      // Respect the existing Show Real Time Values setting.
      positionReadouts("oscilloscope", "bars");

      setTitleText("STEREO OSCILLOSCOPE");
      return;
    }

    // EQUALIZER — isolated vertical-bars layout
    if (layout === "equalizer") {
      if (STATE.dom.labels.left)  STATE.dom.labels.left.style.display  = "none";
      if (STATE.dom.labels.right) STATE.dom.labels.right.style.display = "none";
      if (STATE.dom.labels.q)     STATE.dom.labels.q.style.display     = "none";
      if (STATE.dom.labels.a)     STATE.dom.labels.a.style.display     = "none";
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      if (STATE.dom.readouts) {
        Object.values(STATE.dom.readouts).forEach(el => {
          if (el) el.style.display = "none";
        });
      }

      if (STATE.dom.canvasNormal) {
        STATE.dom.canvasNormal.style.top = "-2px";
        STATE.dom.canvasNormal.style.left = "5px";
        STATE.dom.canvasNormal.style.width = "calc(100% - 10px)";
      }

      setTitleText(
        CONFIG.display.equalizerRenderMode === "spectrum"
          ? "16-BAND SPECTRUM"
          : "16-BAND EQ"
      );
      return;
    }

    // VU HYBRID — isolated vertical meters + spectrum layout
    if (layout === "vuHybrid") {
      if (STATE.dom.labels.left)  STATE.dom.labels.left.style.display  = "none";
      if (STATE.dom.labels.right) STATE.dom.labels.right.style.display = "none";
      if (STATE.dom.labels.q)     STATE.dom.labels.q.style.display     = "none";
      if (STATE.dom.labels.a)     STATE.dom.labels.a.style.display     = "none";
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      if (STATE.dom.readouts) {
        Object.values(STATE.dom.readouts).forEach(el => {
          if (el) el.style.display = "none";
        });
      }

      if (STATE.dom.canvasNormal) {
        STATE.dom.canvasNormal.style.top = "-2px";
        STATE.dom.canvasNormal.style.left = "5px";
        STATE.dom.canvasNormal.style.width = "calc(100% - 10px)";
      }

      setTitleText(
        CONFIG.display.hybridMode === "audio10"
          ? "AUDIO LEVELS & 10B EQ"
          : "STEREO LEVELS & 12B EQ"
      );
      return;
    }

    // ANALOG VU — all labels, scales and values are painted inside the glass.
    if (render === "analogVu") {
      if (STATE.dom.labels.left)  STATE.dom.labels.left.style.display  = "none";
      if (STATE.dom.labels.right) STATE.dom.labels.right.style.display = "none";
      if (STATE.dom.labels.q)     STATE.dom.labels.q.style.display     = "none";
      if (STATE.dom.labels.a)     STATE.dom.labels.a.style.display     = "none";
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      if (STATE.dom.readouts) {
        Object.values(STATE.dom.readouts).forEach(el => {
          if (el) el.style.display = "none";
        });
      }

      if (STATE.dom.gaugeOverlay) {
        STATE.dom.gaugeOverlay.style.display = "none";
      }

      if (STATE.dom.canvasGauges) {
        STATE.dom.canvasGauges.style.top = "0px";
        STATE.dom.canvasGauges.style.left = "5px";
        STATE.dom.canvasGauges.style.width = "calc(100% - 10px)";
      }

      setTitleText(getTileTitle(layout, render, useMirrored));
      return;
    }

    // GAUGES MODE
    if (render === "gauges") {

      // Full 4-gauge layout needs every available horizontal pixel at the
      // mobile landscape floor. Keep normal gauge margins elsewhere.
      if (STATE.dom.canvasGauges) {
        {
          const inset = getGaugeHorizontalInset(layout);
          STATE.dom.canvasGauges.style.left = inset + "px";
          STATE.dom.canvasGauges.style.width = `calc(100% - ${inset * 2}px)`;
          syncGaugeOverlayGeometry(layout);
        }
      }

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
        if (el.textContent !== "") {
          el.textContent = "";
        }
        if (el.style.display !== "none") {
          el.style.display = "none";
        }
      });

      // hide bar UI
      if (STATE.dom.labels.left)  STATE.dom.labels.left.style.display  = "none";
      if (STATE.dom.labels.right) STATE.dom.labels.right.style.display = "none";
      if (STATE.dom.scales.left)  STATE.dom.scales.left.style.display  = "none";
      if (STATE.dom.scales.right) STATE.dom.scales.right.style.display = "none";

      // show gauge overlay and keep its coordinate system identical
      // to the active gauges canvas.
      if (STATE.dom.gaugeOverlay) {
        syncGaugeOverlayGeometry(layout);
        STATE.dom.gaugeOverlay.style.display = "";
      }
      positionReadouts(layout, render);

      // CENTER LABELS (DOM OVERLAY — POSITIONS DECIDED HERE)
      if (layout === "full") {

        // FULL MODE — 4 gauges in ONE ROW
        const TOP = "50%";
        const TRANSFORM = "translate(-50%, 30%)";

        if (gaugeLabelLeft) {
          setTextIfChanged(gaugeLabelLeft, "L");
          gaugeLabelLeft.style.left = `${getGaugeCenterFractions(layout)[0] * 100}%`;
          gaugeLabelLeft.style.top = TOP;
          gaugeLabelLeft.style.transform = TRANSFORM;
          gaugeLabelLeft.style.display = "";
        }

        if (gaugeLabelRight) {
          setTextIfChanged(gaugeLabelRight, "R");
          gaugeLabelRight.style.left = `${getGaugeCenterFractions(layout)[1] * 100}%`;
          gaugeLabelRight.style.top = TOP;
          gaugeLabelRight.style.transform = TRANSFORM;
          gaugeLabelRight.style.display = "";
        }

        if (gaugeLabelQ) {
          setTextIfChanged(gaugeLabelQ, "Q");
          gaugeLabelQ.style.left = `${getGaugeCenterFractions(layout)[2] * 100}%`;
          gaugeLabelQ.style.top = TOP;
          gaugeLabelQ.style.transform = TRANSFORM;
          gaugeLabelQ.style.display = "";
        }

        if (gaugeLabelA) {
          setTextIfChanged(gaugeLabelA, "A");
          gaugeLabelA.style.left = `${getGaugeCenterFractions(layout)[3] * 100}%`;
          gaugeLabelA.style.top = TOP;
          gaugeLabelA.style.transform = TRANSFORM;
          gaugeLabelA.style.display = "";
        }

        setTitleText(getTileTitle(layout, render, useMirrored));

      } else {

        // STEREO / SA — 2 gauges (restore baseline)
        const TOP = "60%";
        const TRANSFORM = "translate(-50%, 60%)";

        // hide FULL-only labels
        if (gaugeLabelQ) gaugeLabelQ.style.display = "none";
        if (gaugeLabelA) gaugeLabelA.style.display = "none";

        // restore correct 2-gauge positions
        if (gaugeLabelLeft) {
          gaugeLabelLeft.style.left = `${getGaugeCenterFractions(layout)[0] * 100}%`;
          gaugeLabelLeft.style.top = TOP;
          gaugeLabelLeft.style.transform = TRANSFORM;
          gaugeLabelLeft.style.display = "";
        }

        if (gaugeLabelRight) {
          gaugeLabelRight.style.left = `${getGaugeCenterFractions(layout)[1] * 100}%`;
          gaugeLabelRight.style.top = TOP;
          gaugeLabelRight.style.transform = TRANSFORM;
          gaugeLabelRight.style.display = "";
        }

        if (layout === "sa") {
          setTextIfChanged(gaugeLabelLeft, "Q");
          setTextIfChanged(gaugeLabelRight, "A");

          setTitleText(getTileTitle(layout, render, useMirrored));

        } else {
          setTextIfChanged(gaugeLabelLeft, "L");
          setTextIfChanged(gaugeLabelRight, "R");

          setTitleText(getTileTitle(layout, render, useMirrored));
        }
      }

      // NUMERIC LABELS — same geometry source as gauges, centre labels and outputs
      syncGaugeOverlayGeometry(layout);
      applyGaugeNumericGeometry(layout);

      if (layout === "lr") {
        ["Left", "Right"].forEach(side => {
          const g = STATE.dom["gaugeNums" + side];
          setGaugeNumericLabels(g, "-35", "-25", "-15", "+5");
        });
      }

      if (layout === "sa") {
        const gLeft  = STATE.dom.gaugeNumsLeft;
        const gRight = STATE.dom.gaugeNumsRight;
        // Stereo Quality
        setGaugeNumericLabels(gLeft, "0", "50", "90", "120%");
        // RMS+Peak
        setGaugeNumericLabels(gRight, "0", "30", "70", "120%");
      }
      return;
    }

    // FULL MODE — BARS (LAYOUT ONLY)
    if (layout === "full" && render === "bars") {

      setTitleText(getTileTitle(layout, render, useMirrored));

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
        setTextIfChanged(STATE.dom.labels.q, "Q");
        STATE.dom.labels.q.style.top =
          (baseY + 2 * (barH + FULL_GAP) + barH / 2 - 12) + "px";
      }

      if (STATE.dom.labels.a) {
        STATE.dom.labels.a.style.display = "";
        setTextIfChanged(STATE.dom.labels.a, "A");
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

      if (layout === "full") {
        const metrics = getFullMirroredMetrics();

        if (STATE.dom.mirrorLabel) {
          STATE.dom.mirrorLabel.style.display = "none";
        }

        if (STATE.dom.mirrorLabelTop) {
          if (STATE.dom.mirrorLabelTop.style.display !== "block") {
            STATE.dom.mirrorLabelTop.style.display = "block";
          }
          if (STATE.dom.mirrorLabelTop.textContent !== "L | R") {
            STATE.dom.mirrorLabelTop.textContent = "L | R";
          }
          if (STATE.dom.mirrorLabelTop.style.top !== metrics.topCenterY + "px") {
            STATE.dom.mirrorLabelTop.style.top = metrics.topCenterY + "px";
          }
        }

        if (STATE.dom.mirrorLabelBottom) {
          if (STATE.dom.mirrorLabelBottom.style.display !== "block") {
            STATE.dom.mirrorLabelBottom.style.display = "block";
          }
          if (STATE.dom.mirrorLabelBottom.textContent !== "Q | A") {
            STATE.dom.mirrorLabelBottom.textContent = "Q | A";
          }
          if (STATE.dom.mirrorLabelBottom.style.top !== metrics.bottomCenterY + "px") {
            STATE.dom.mirrorLabelBottom.style.top = metrics.bottomCenterY + "px";
          }
        }
      } else {
        if (STATE.dom.mirrorLabelTop) {
          STATE.dom.mirrorLabelTop.style.display = "none";
        }
        if (STATE.dom.mirrorLabelBottom) {
          STATE.dom.mirrorLabelBottom.style.display = "none";
        }

        if (STATE.dom.mirrorLabel) {
          const nextMirrorLabel = layout === "sa" ? "Q | A" : "L | R";

          if (STATE.dom.mirrorLabel.style.display !== "block") {
            STATE.dom.mirrorLabel.style.display = "block";
          }
          if (STATE.dom.mirrorLabel.textContent !== nextMirrorLabel) {
            STATE.dom.mirrorLabel.textContent = nextMirrorLabel;
          }
        }
      }

      if (STATE.dom.mirrorScaleWrapTop) {
        STATE.dom.mirrorScaleWrapTop.style.display = "block";
      }

      if (STATE.dom.mirrorScaleWrap) {
        STATE.dom.mirrorScaleWrap.style.display = "block";
      }

      const nextTopLeftHTML =
        layout === "full"
          ? getMirroredScaleHTML("lr", "left")
          : getMirroredScaleHTML(layout, "left");

      const nextTopRightHTML =
        layout === "full"
          ? getMirroredScaleHTML("lr", "right")
          : getMirroredScaleHTML(layout, "right");

      const nextBottomLeftHTML =
        layout === "full"
          ? getMirroredScaleHTML("sa", "left")
          : getMirroredScaleHTML(layout, "left");

      const nextBottomRightHTML =
        layout === "full"
          ? getMirroredScaleHTML("sa", "right")
          : getMirroredScaleHTML(layout, "right");

      if (STATE.dom.mirrorScaleTopLeft) {
        if (STATE.dom.mirrorScaleTopLeft.innerHTML !== nextTopLeftHTML) {
          STATE.dom.mirrorScaleTopLeft.innerHTML = nextTopLeftHTML;
        }
      }

      if (STATE.dom.mirrorScaleTopRight) {
        if (STATE.dom.mirrorScaleTopRight.innerHTML !== nextTopRightHTML) {
          STATE.dom.mirrorScaleTopRight.innerHTML = nextTopRightHTML;
        }
      }

      if (STATE.dom.mirrorScaleLeft) {
        if (STATE.dom.mirrorScaleLeft.innerHTML !== nextBottomLeftHTML) {
          STATE.dom.mirrorScaleLeft.innerHTML = nextBottomLeftHTML;
        }
      }

      if (STATE.dom.mirrorScaleRight) {
        if (STATE.dom.mirrorScaleRight.innerHTML !== nextBottomRightHTML) {
          STATE.dom.mirrorScaleRight.innerHTML = nextBottomRightHTML;
        }
      }

      setTitleText(getTileTitle(layout, render, useMirrored));

      positionReadouts(layout, render);
      return;
    }

    // SA / NORMAL MODES
    if (layout === "sa") {

      setTextIfChanged(STATE.dom.labels.left, "Q");
      setTextIfChanged(STATE.dom.labels.right, "A");

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

      setTitleText(getTileTitle(layout, render, useMirrored));

      positionReadouts(layout, render);

    } else {
      if (STATE.dom.scales.left) {
        renderNumericScale(STATE.dom.scales.left, {
          type: "db",
          min: -35,
          max: 5,
          values: [-35, -30, -25, -20, -15, -10, -5, 0, 5]
        });
      }

      if (STATE.dom.scales.right) {
        renderNumericScale(STATE.dom.scales.right, {
          type: "db",
          min: -35,
          max: 5,
          values: [-35, -30, -25, -20, -15, -10, -5, 0, 5]
        });
      }

      setTitleText(getTileTitle(layout, render, useMirrored));

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

      if (window.location.pathname === "/setup") return;
      if (!isStereoEnabled()) return;

      // CONTAINER TILE
      // RESPONSIVE TILE SIZING
      // Normal desktop: 32.9% flexible width with a comfortable 350px floor.
      // Narrow desktop: allow the floor to drop to 335px.
      // Touch/mobile landscape: 32.9% with a 305px floor for Full Gauges clearance.
      // Mobile portrait: occupy the full row.
      if (!document.getElementById("amx-responsive-tile-css")) {
        const responsiveCss = document.createElement("style");
        responsiveCss.id = "amx-responsive-tile-css";
        responsiveCss.textContent = `
          #audiometrix-container {
            width: 32.9% !important;
            min-width: 350px !important;
            max-width: none !important;
            flex: 0 1 32.9% !important;
            box-sizing: border-box !important;
          }

          /* Smaller desktop / laptop resolution. */
          @media (min-width: 768px) and (max-width: 1199px) and (hover: hover) and (pointer: fine) {
            #audiometrix-container {
              min-width: 335px !important;
            }
          }

          /* Keep the already-good mobile/tablet landscape behaviour unchanged. */
          @media (orientation: landscape) and (hover: none) and (pointer: coarse) {
            #audiometrix-container {
              width: 32.9% !important;
              min-width: 305px !important;
              max-width: none !important;
              flex: 0 1 32.9% !important;
            }
          }

          @media (max-width: 767px) and (orientation: portrait) {
            #audiometrix-container {
              width: 100% !important;
              min-width: 0 !important;
              max-width: 100% !important;
              flex: 0 0 100% !important;
            }
          }
        `;
        document.head.appendChild(responsiveCss);
      }

      STATE.dom.container = document.createElement("div");
      STATE.dom.container.className = "panel-33 hover-brighten tooltip";
      STATE.dom.container.id = "audiometrix-container";
      STATE.dom.container.style.width = CONFIG.display.dimensions.tileWidthPercent + "%";
      STATE.dom.container.style.minWidth = CONFIG.display.dimensions.minTileWidth + "px";
      STATE.dom.container.style.maxWidth = "none";
      STATE.dom.container.style.flex = `0 1 ${CONFIG.display.dimensions.tileWidthPercent}%`;
      STATE.dom.container.style.boxSizing = "border-box";
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
      STATE._canvasNormalBaseLeft = STATE.dom.canvasNormal.style.left;
      STATE._canvasNormalBaseWidth = STATE.dom.canvasNormal.style.width;

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
        left:5px;
        width:calc(100% - 10px);
        display:none;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.canvasGauges);

      // INITIAL CANVAS INTRINSIC SIZE SYNC (CRITICAL)
      // Default active canvas
      STATE.dom.canvas = STATE.dom.canvasNormal;

      readLayoutOnce();
      STATE.layout.dpr = getAMXRenderDpr();

      const w = STATE.layout.width;
      const barH = CONFIG.display.dimensions.barHeight;
      const gap = CONFIG.display.dimensions.spacing;

      const safeWidth = w && w > 40 ? w : 300;
      const trackWidth = Math.max(1, safeWidth - CONFIG.display.dimensions.canvasLeft - 5);
      const gaugesWidth = Math.max(1, safeWidth - 10);
      const mirrorWidth = Math.max(
        1,
        safeWidth
          - Math.max(4, CONFIG.display.dimensions.canvasLeft - 20)
          - Math.max(8, CONFIG.display.dimensions.canvasLeft - 15)
      );
      const normalHeight = barH * 2 + gap;


      // NORMAL canvas always gets size
      resizeCanvasIfNeeded(
        STATE.dom.canvasNormal,
        trackWidth,
        normalHeight
      );

      // MIRRORED canvas uses its own wider left/right offsets.
      resizeCanvasIfNeeded(
        STATE.dom.canvasMirror,
        mirrorWidth,
        getMirroredLayoutMetrics().singlePanelHeight
      );
      requestRender();

      // GAUGES canvas
      if (STATE.dom.canvasGauges) {
        const gaugesHeight = WRAPPER_HEIGHT - 20;

        resizeCanvasIfNeeded(
          STATE.dom.canvasGauges,
          gaugesWidth,
          gaugesHeight
        );
      }

      // FLOATING PANEL REPOSITION ON RESIZE
      const handleAMXWindowResize = () => {
        const panel = document.getElementById("amx-floating-panel");
        const container = STATE.dom.container;

        refreshLayoutAndCanvas();

        if (panel && panel.style.display !== "none") {
          positionAMXFloatingPanel(panel, container);
        }
      };

      window.addEventListener("resize", handleAMXWindowResize);
      window.addEventListener("orientationchange", refreshLayoutAndCanvas);
      AMX_RUNTIME.windowHandlers.push(
        ["resize", handleAMXWindowResize, undefined],
        ["orientationchange", refreshLayoutAndCanvas, undefined]
      );

      if (typeof ResizeObserver === "function" && STATE.dom.contentWrapper) {
        let lastObservedW = -1;
        let lastObservedH = -1;

        const ro = new ResizeObserver((entries) => {
          const entry = entries && entries[0];
          const rect = entry?.contentRect;
          const nextW = Math.round(rect?.width || 0);
          const nextH = Math.round(rect?.height || 0);

          refreshLayoutAndCanvas();

          // Bars numeric scales are DOM-positioned from their measured width.
          // On page refresh the FM-DX flex layout may settle AFTER the first
          // applyVisualState(), so the numbers can retain positions calculated
          // for the provisional width. Settings changes happened to fix this
          // because they call applyVisualState() again.
          //
          // Re-run the visual layout once the observed size has actually
          // changed. RAF coalescing prevents ResizeObserver feedback loops.
          if (nextW !== lastObservedW || nextH !== lastObservedH) {
            lastObservedW = nextW;
            lastObservedH = nextH;

            if (AMX_RUNTIME.barsResizeRaf !== null) {
              cancelAnimationFrame(AMX_RUNTIME.barsResizeRaf);
            }

            AMX_RUNTIME.barsResizeRaf = requestAnimationFrame(() => {
              AMX_RUNTIME.barsResizeRaf = null;

              const layout = CONFIG.display.layoutMode;
              const render =
                layout === "equalizer" || layout === "vuHybrid"
                  ? "bars"
                  : CONFIG.display.renderMode;

              // Only the normal bar layouts need DOM numeric-scale
              // remeasurement. Other modes already resize correctly.
              if (
                render === "bars" &&
                (layout === "lr" || layout === "sa" || layout === "full")
              ) {
                applyVisualState();
                requestRender();
              }
            });
          }
        });

        ro.observe(STATE.dom.contentWrapper);
        AMX_RUNTIME.contentResizeObserver = ro;
      }

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

      // SCALE ROWS — containers for numeric scales
      function createScale(top) {
        const el = document.createElement("div");
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

      STATE.dom.scales.left = createScale(INNER_BASE_TOP - 24);
      STATE.dom.scales.right = createScale(
        INNER_BASE_TOP + CONFIG.display.dimensions.barHeight * 2 + CONFIG.display.dimensions.spacing
      );

      // MIRRORED MODE — CLEAN, FINAL DOM ELEMENTS
      // SINGLE CENTRAL LABEL FOR LR / SA
      STATE.dom.mirrorLabel = document.createElement("div");
      STATE.dom.mirrorLabel.style.cssText = `
        position:absolute;
        left:50%;
        top:56%;
        transform:translate(-50%, -100%);
        white-space:nowrap;
        pointer-events:none;
        user-select:none;
        z-index:10;
        display:none;
        font-size:16px;
        line-height:1.2;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.mirrorLabel);

      // FULL MIRRORED — TOP CENTER LABEL
      STATE.dom.mirrorLabelTop = document.createElement("div");
      STATE.dom.mirrorLabelTop.style.cssText = `
        position:absolute;
        left:50%;
        top:0;
        transform:translate(-50%, -50%);
        white-space:nowrap;
        pointer-events:none;
        user-select:none;
        z-index:10;
        display:none;
        font-size:16px;
        line-height:1.2;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.mirrorLabelTop);

      // FULL MIRRORED — BOTTOM CENTER LABEL
      STATE.dom.mirrorLabelBottom = document.createElement("div");
      STATE.dom.mirrorLabelBottom.style.cssText = `
        position:absolute;
        left:50%;
        top:0;
        transform:translate(-50%, -50%);
        white-space:nowrap;
        pointer-events:none;
        user-select:none;
        z-index:10;
        display:none;
        font-size:16px;
        line-height:1.2;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.mirrorLabelBottom);

      // MIRRORED TOP SCALES WRAPPER
      STATE.dom.mirrorScaleWrapTop = document.createElement("div");
      STATE.dom.mirrorScaleWrapTop.style.cssText = `
        position:absolute;
        left:0;
        right:0;
        top:-5px;
        height:18px;
        pointer-events:none;
        user-select:none;
        z-index:9;
        display:none;
      `;
      STATE.dom.contentWrapper.appendChild(STATE.dom.mirrorScaleWrapTop);

      // TOP LEFT MIRRORED SCALE
      STATE.dom.mirrorScaleTopLeft = document.createElement("div");
      STATE.dom.mirrorScaleTopLeft.style.cssText = `
        position:absolute;
        left:6px;
        top:0;
        width:42%;
        text-align:left;
        user-select:none;
        white-space:nowrap;
        pointer-events:none;
        font-size:12px;
        line-height:1.2;
      `;
      STATE.dom.mirrorScaleWrapTop.appendChild(STATE.dom.mirrorScaleTopLeft);

      // TOP RIGHT MIRRORED SCALE
      STATE.dom.mirrorScaleTopRight = document.createElement("div");
      STATE.dom.mirrorScaleTopRight.style.cssText = `
        position:absolute;
        right:6px;
        top:0;
        width:42%;
        text-align:right;
        user-select:none;
        white-space:nowrap;
        pointer-events:none;
        font-size:12px;
        line-height:1.2;
      `;
      STATE.dom.mirrorScaleWrapTop.appendChild(STATE.dom.mirrorScaleTopRight);

      // MIRRORED BOTTOM SCALES WRAPPER (STATIC, TILE-ANCHORED)
      STATE.dom.mirrorScaleWrap = document.createElement("div");
      STATE.dom.mirrorScaleWrap.style.cssText = `
        position:absolute;
        left:0;
        right:0;
        bottom:5px;
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
        bottom:0;
        width:42%;
        text-align:left;
        user-select:none;
        white-space:nowrap;
        pointer-events:none;
        font-size:12px;
        line-height:1.2;
      `;
      STATE.dom.mirrorScaleWrap.appendChild(STATE.dom.mirrorScaleLeft);

      // RIGHT MIRRORED SCALE
      STATE.dom.mirrorScaleRight = document.createElement("div");
      STATE.dom.mirrorScaleRight.style.cssText = `
        position:absolute;
        right:6px;
        bottom:0;
        width:42%;
        text-align:right;
        user-select:none;
        white-space:nowrap;
        pointer-events:none;
        font-size:12px;
        line-height:1.2;
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
          opacity:0.95;
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

      // Overlay anchoring follows the same shared inset as the gauges canvas.
      STATE.dom.gaugeOverlay.style.left  = getGaugeHorizontalInset("lr") + "px";
      STATE.dom.gaugeOverlay.style.right = getGaugeHorizontalInset("lr") + "px";

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

      // Positions are assigned dynamically by applyGaugeNumericGeometry()
      // from the same geometry model used by the canvas, centre labels and outputs.

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
          opacity:0.95;
          display:none;
          z-index:40;
        `;

        return el;
      }

      // Insert tile after freq panel
      const path = window.location.pathname;
      const isExcludedPage =
        path.startsWith("/setup") || path.startsWith("/wizard");
      if (isExcludedPage) return;
      
      const freq = document.querySelector("#freq-container");
      const next = freq?.nextElementSibling;
      if (next?.parentNode) {
        next.parentNode.insertBefore(STATE.dom.container, next.nextSibling);
      } else if (freq?.parentNode) {
        freq.parentNode.appendChild(STATE.dom.container);
      } else {
        return;
      }

      // Resolve Automatic only after the tile is connected and inherits the
      // live FM-DX CSS palette. The first canvas paint must never use the
      // pre-DOM fallback.
      refreshFmDxCssPalette(true);
      refreshAutomaticTheme(true);

      // FINAL INITIAL VISUAL SYNC (AFTER ALL DOM EXISTS AND THEME IS LIVE)
      applyVisualState();
      renderMeters();

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
          const labelScaleTargets = [
            STATE.dom.labels.left,
            STATE.dom.labels.right,
            STATE.dom.labels.q,
            STATE.dom.labels.a,
            STATE.dom.scales.left,
            STATE.dom.scales.right,
            STATE.dom.gaugeLabelLeft,
            STATE.dom.gaugeLabelRight,
            STATE.dom.gaugeLabelQ,
            STATE.dom.gaugeLabelA,
            STATE.dom.mirrorLabel,
            STATE.dom.mirrorLabelTop,
            STATE.dom.mirrorLabelBottom,
            STATE.dom.mirrorScaleTopLeft,
            STATE.dom.mirrorScaleTopRight,
            STATE.dom.mirrorScaleLeft,
            STATE.dom.mirrorScaleRight
          ].filter(Boolean);

          labelScaleTargets.forEach((el) => {
            const base = parseFloat(cs.fontSize);

            el.style.fontFamily = cs.fontFamily;
            el.style.fontWeight = cs.fontWeight;
            el.style.letterSpacing = cs.letterSpacing;
            el.style.textTransform = cs.textTransform;
            el.style.lineHeight = cs.lineHeight;
            el.style.color = "#fff";

            if (
              el === STATE.dom.labels.left  ||
              el === STATE.dom.labels.right ||
              el === STATE.dom.labels.q     ||
              el === STATE.dom.labels.a     ||
              el === STATE.dom.gaugeLabelLeft   ||
              el === STATE.dom.gaugeLabelRight  ||
              el === STATE.dom.gaugeLabelQ      ||
              el === STATE.dom.gaugeLabelA      ||
              el === STATE.dom.mirrorLabel      ||
              el === STATE.dom.mirrorLabelTop   ||
              el === STATE.dom.mirrorLabelBottom
            ) {
              el.style.fontSize = base + 2 + "px";
            } else {
              el.style.fontSize = cs.fontSize;
            }
          });

          if (STATE.dom.mirrorScaleTopLeft)  STATE.dom.mirrorScaleTopLeft.style.opacity  = 0.7;
          if (STATE.dom.mirrorScaleTopRight) STATE.dom.mirrorScaleTopRight.style.opacity = 0.7;
          if (STATE.dom.mirrorScaleLeft)     STATE.dom.mirrorScaleLeft.style.opacity     = 0.7;
          if (STATE.dom.mirrorScaleRight)    STATE.dom.mirrorScaleRight.style.opacity    = 0.7;

          [
            ...Array.from(STATE.dom.mirrorScaleTopLeft?.querySelectorAll("span") || []),
            ...Array.from(STATE.dom.mirrorScaleTopRight?.querySelectorAll("span") || []),
            ...Array.from(STATE.dom.mirrorScaleLeft?.querySelectorAll("span") || []),
            ...Array.from(STATE.dom.mirrorScaleRight?.querySelectorAll("span") || [])
          ].forEach((el) => {
            el.style.color = "#fff";
          });

          // READOUTS
          Object.values(STATE.dom.readouts || {}).filter(Boolean).forEach((el) => {
            el.style.fontFamily = cs.fontFamily;
            el.style.fontWeight = "600";
            el.style.letterSpacing = cs.letterSpacing;
            el.style.textTransform = cs.textTransform;
            el.style.lineHeight = cs.lineHeight;
            el.style.color = "#fff";
            el.style.fontSize = (parseFloat(cs.fontSize) + 1) + "px";
            el.style.opacity = 0.95;
          });

          // GAUGES — NUMERIC LABELS
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
            el.style.color = "#fff";
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
          if (!STATE.dom.title) return;

          STATE.dom.title.style.margin = "0 0 0 12px";
          STATE.dom.title.style.position = "relative";
          STATE.dom.title.style.top = "8px";
          STATE.dom.title.style.left = "0";
          STATE.dom.title.style.transform = "none";
        } catch (e) {
          console.error("[AudioMetrix] alignTitle failed:", e);
        }
      }

      const applySkin = () => {
        inheritTextStyles();
        alignTitle();
      };

      // Apply skin after DOM builds
      [50, 300].forEach(delay => {
        const timer = setTimeout(() => {
          AMX_RUNTIME.pendingTimeouts.delete(timer);
          if (!AMX_RUNTIME.destroyed) applySkin();
        }, delay);
        AMX_RUNTIME.pendingTimeouts.add(timer);
      });

      // Skin observer — visual sync only (fonts / alignment)
      AMX_RUNTIME.skinObserver = new MutationObserver(() => {
        if (AMX_RUNTIME.skinObserverRaf) return;
        AMX_RUNTIME.skinObserverRaf = requestAnimationFrame(() => {
          AMX_RUNTIME.skinObserverRaf = 0;
          if (!AMX_RUNTIME.destroyed) applySkin();
        });
      });
      AMX_RUNTIME.skinObserver.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class", "style"]
      });

      // ──────────────
      // AUDIO ENGINE
      // ──────────────
      function safeDisconnect(node) {
        try {
          if (node && typeof node.disconnect === "function") {
            node.disconnect();
          }
        } catch (e) {}
      }

      function cleanupAudioGraph() {
        const a = STATE.audio || {};

        // Remove only AudioMetrix's own source connection. This leaves any
        // unrelated FM-DX / plugin routes from the same source untouched.
        try {
          if (a.source && a.splitter && typeof a.source.disconnect === "function") {
            a.source.disconnect(a.splitter);
          }
        } catch (e) {}

        try {
          if (a.splitter && a.analyserEqualizerLeft) {
            a.splitter.disconnect(a.analyserEqualizerLeft);
          }
          if (a.splitter && a.analyserEqualizerRight) {
            a.splitter.disconnect(a.analyserEqualizerRight);
          }
        } catch (e) {}

        [
          a.splitter,
          a.analyserLeft,
          a.analyserRight,
          a.analyserEqualizerLeft,
          a.analyserEqualizerRight,
          a.analyserMid,
          a.analyserSide,
          a.midSideGainLToM,
          a.midSideGainRToM,
          a.midSideGainLToS,
          a.midSideGainRToS,
          a.analyserPeak,
          a.bassFilter,
          a.highPassFilter,
          a.lowPassFilter,
          a.mergerMS
        ].forEach(safeDisconnect);

        ["left", "right", "audio", "quality"].forEach(k => {
          STATE.peakHoldUntil[k] = 0;
        });
      }

      function stopRenderingLoop() {
        if (RENDER_GATE.rafId != null) {
          cancelAnimationFrame(RENDER_GATE.rafId);
          RENDER_GATE.rafId = null;
        }

        RENDER_GATE.dirty = false;
      }

      function resetAudioState() {
        cleanupAudioGraph();
        STATE.hasStreamObject = false;
        clearTransientRenderState();
        resetSamplePeakMemory();

        STATE.audioCadence.frame = 0;
        STATE.audioCadence.interval = 1;
        STATE.audioCadence.lastEnergy = 0;
        STATE.spectrumCadence.frame = 0;

        if (STATE.oscilloscope) {
          STATE.oscilloscope.peakHistoryLeft.length = 0;
          STATE.oscilloscope.peakHistoryRight.length = 0;
          STATE.oscilloscope.peakDisplayLeft = 0;
          STATE.oscilloscope.peakDisplayRight = 0;
          STATE.oscilloscope.peakHoldUntilLeft = 0;
          STATE.oscilloscope.peakHoldUntilRight = 0;
          STATE.oscilloscope.persistenceLeft.length = 0;
          STATE.oscilloscope.persistenceRight.length = 0;
          STATE.oscilloscope.persistenceFrame = 0;
          STATE.oscilloscope.lastTs = 0;
        }

        if (STATE.levels && STATE.levels.equalizer) {
          STATE.levels.equalizer.values.fill(0);
          STATE.levels.equalizer.targetValues.fill(0);
          STATE.levels.equalizer.peaks.fill(0);
          STATE.levels.equalizer.dbValues.fill(-100);
          STATE.levels.equalizer.peakHoldUntil.fill(0);
          STATE.levels.equalizer.lastUpdateTs = 0;
        }
        [
          STATE.levels?.hybridStereo12,
          STATE.levels?.hybridAudio10
        ].filter(Boolean).forEach(spectrum => {
          spectrum.values.fill(0);
          spectrum.targetValues.fill(0);
          spectrum.peaks.fill(0);
          spectrum.dbValues.fill(-100);
          spectrum.peakHoldUntil.fill(0);
          spectrum.lastUpdateTs = 0;
        });

        STATE.audio = {
          context: null,
          splitter: null,
          analyserLeft: null,
          analyserRight: null,
          analyserEqualizerLeft: null,
          analyserEqualizerRight: null,
          dataLeft: null,
          dataRight: null,
          dataEqualizerLeft: null,
          dataEqualizerRight: null,
          timeLeft: null,
          timeRight: null,
          mergerMS: null,
          analyserMid: null,
          analyserSide: null,
          midSideGainLToM: null,
          midSideGainRToM: null,
          midSideGainLToS: null,
          midSideGainRToS: null,
          dataMid: null,
          dataSide: null,
          analyserPeak: null,
          bassFilter: null,
          highPassFilter: null,
          lowPassFilter: null,
          dataPeak: null,
          source: null,
          sourceMode: null,
          sourceLabel: null,
          sourceSignature: null
        };
      }

      function linearToDb(x) {
        if (x <= 0) return -120;
        return 20 * Math.log10(x);
      }

      function resetSamplePeakMemory() {
        const m = STATE.monitoring;
        if (!m) return;

        m.maxSamplePeak.left = 0;
        m.maxSamplePeak.right = 0;
        m.maxSamplePeakDb.left = -120;
        m.maxSamplePeakDb.right = -120;
        m.clipUntil.left = 0;
        m.clipUntil.right = 0;
        m.clipped.left = false;
        m.clipped.right = false;
        m.clipCount.left = 0;
        m.clipCount.right = 0;
        m.lastResetTs = Date.now();

        updateDiagnosticsOverlay();
      }

      function updateSamplePeakMemory(channel, samplePeak, now) {
        const m = STATE.monitoring;
        if (!m || (channel !== "left" && channel !== "right")) return;

        const peak = Math.max(0, Math.min(1, Number(samplePeak) || 0));

        if (peak > m.maxSamplePeak[channel]) {
          m.maxSamplePeak[channel] = peak;
          m.maxSamplePeakDb[channel] = linearToDb(peak);
        }

        if (peak >= SAMPLE_CLIP_THRESHOLD) {
          m.clipUntil[channel] = now + SAMPLE_CLIP_HOLD_MS;

          // Count only a new clip event, not every analysis frame while the
          // signal remains continuously clipped.
          if (!m.clipped[channel]) {
            m.clipCount[channel]++;
          }
          m.clipped[channel] = true;
        } else if (now >= m.clipUntil[channel]) {
          m.clipped[channel] = false;
        }
      }

      // Admin/debug convenience. Monitoring also resets automatically whenever
      // AudioMetrix rebuilds its audio source/graph.
      window.AudioMetrixResetMax = resetSamplePeakMemory;

      function processChannel(timeData, prevSmoothDb) {
        // RMS + raw sample peak from the same Float32 time-domain pass.
        // Samples are already normalized to -1..+1, so MAX/CLIP avoids
        // the quantization of the former 8-bit analyser path.
        let sumSq = 0;
        let samplePeak = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i];
          const absV = Math.abs(v);
          sumSq += v * v;
          if (absV > samplePeak) samplePeak = absV;
        }

        const rms = Math.sqrt(sumSq / timeData.length);

        if (rms < CONFIG.audio.minThreshold) {
          return {
            instantDb: -120,
            smoothDb: -120,
            samplePeak
          };
        }

        // RMS → dBFS + user gain + calibration
        let instantDb =
          linearToDb(rms) +
          CONFIG.audio.dbGain +
          (CONFIG.audio.calibrationDb || 0);

        let smoothDb;

        // smoothing
        if (!isFinite(prevSmoothDb) || prevSmoothDb === -999) {
          smoothDb = instantDb;
        } else if (instantDb > prevSmoothDb) {
          smoothDb = prevSmoothDb + (instantDb - prevSmoothDb) * CONFIG.audio.attackSpeed;
        } else {
          smoothDb = prevSmoothDb + (instantDb - prevSmoothDb) * CONFIG.audio.releaseSpeed;
        }

        return {
          instantDb,
          smoothDb,
          samplePeak
        };
      }

      const spectrumCalibrationCache = new Map();

      function getSpectrumCalibration(frequency) {
        const cached = spectrumCalibrationCache.get(frequency);
        if (cached) return cached;

        let nearestIndex = 0;
        let nearestDistance = Infinity;
        for (let i = 0; i < EQ_CENTER_FREQUENCIES.length; i++) {
          const distance = Math.abs(
            Math.log2(frequency / EQ_CENTER_FREQUENCIES[i])
          );
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
          }
        }
        const calibration = {
          gain: EQ_PREAMP_GAINS[nearestIndex],
          floor: EQ_FLOOR_LEVELS[nearestIndex]
        };
        spectrumCalibrationCache.set(frequency, calibration);
        return calibration;
      }

      function updateEqualizerLevels(
        now,
        spectrumState = STATE.levels.equalizer,
        frequencies = EQ_CENTER_FREQUENCIES,
        readSpectrum = true
      ) {
        const a = STATE.audio;
        const eq = spectrumState;
        const analyserLeft = a.analyserEqualizerLeft;
        const analyserRight = a.analyserEqualizerRight;
        const spectrumLeft = a.dataEqualizerLeft;
        const spectrumRight = a.dataEqualizerRight;
        if (!analyserLeft || !analyserRight || !spectrumLeft || !spectrumRight) return;

        const sampleRate = (a.context && a.context.sampleRate) || 48000;
        const nyquist = sampleRate / 2;
        const binCount = Math.min(spectrumLeft.length, spectrumRight.length);
        const deltaSeconds = eq.lastUpdateTs > 0
          ? Math.min(0.1, Math.max(0, (now - eq.lastUpdateTs) / 1000))
          : 1 / 60;
        eq.lastUpdateTs = now;

        // The expensive 4096-point spectrum data copy runs at ~30Hz.
        // Targets are retained and interpolated below at the 60Hz visual cadence.
        if (readSpectrum) {
          analyserLeft.getByteFrequencyData(spectrumLeft);
          analyserRight.getByteFrequencyData(spectrumRight);

          for (let band = 0; band < frequencies.length; band++) {
            const targetBin = Math.min(
              binCount - 1,
              Math.max(
                0,
                Math.floor((frequencies[band] / nyquist) * binCount)
              )
            );
            const startBin = Math.max(0, targetBin - 2);
            const endBin = Math.min(binCount - 1, targetBin + 2);

            let peakValue = 0;
            for (let bin = startBin; bin <= endBin; bin++) {
              const combined = (spectrumLeft[bin] + spectrumRight[bin]) / 2;
              if (combined > peakValue) peakValue = combined;
            }

            const analyserMinDb = analyserLeft.minDecibels;
            const analyserMaxDb = analyserLeft.maxDecibels;
            const rawDb =
              analyserMinDb +
              (peakValue / 255) * (analyserMaxDb - analyserMinDb);
            const gainedDb = clamp(
              rawDb + CONFIG.audio.dbGain,
              analyserMinDb,
              analyserMaxDb
            );
            const visualCeilingDb = -30;
            const visualDb = clamp(
              gainedDb,
              analyserMinDb,
              visualCeilingDb
            );
            const gainedByte =
              ((visualDb - analyserMinDb) /
                (visualCeilingDb - analyserMinDb)) *
              255;
            const calibration = getSpectrumCalibration(
              frequencies[band]
            );
            const balancedPeak = gainedByte * calibration.gain;
            const floor = calibration.floor;
            eq.dbValues[band] =
              balancedPeak > floor ? gainedDb : -100;
            const normalized =
              balancedPeak > floor
                ? (balancedPeak - floor) / (255 - floor)
                : 0;

            let target = clamp(
              Math.pow(normalized, 1 / EQ_SENSITIVITY),
              0,
              1
            );

            const previousTarget = eq.targetValues[band] || 0;
            if (Math.abs(target - previousTarget) < EQ_HYSTERESIS) {
              target = previousTarget;
            }
            eq.targetValues[band] = target;
          }
        }

        // 60Hz visual interpolation toward the most recent FFT targets.
        // Time-corrected alpha keeps the same response if frame timing varies.
        for (let band = 0; band < frequencies.length; band++) {
          const target = eq.targetValues[band] || 0;
          const previous = eq.values[band] || 0;

          const attackBase =
            0.08 + CONFIG.audio.attackSpeed * 0.42;
          const releaseBase =
            0.015 + CONFIG.audio.releaseSpeed * 0.12;
          const frameScale = Math.max(0.01, deltaSeconds * 60);
          const attackAlpha =
            1 - Math.pow(1 - attackBase, frameScale);
          const releaseAlpha =
            1 - Math.pow(1 - releaseBase, frameScale);

          const next =
            target > previous
              ? previous + (target - previous) * attackAlpha
              : previous + (target - previous) * releaseAlpha;

          eq.values[band] = next < 0.008 ? 0 : next;

          if (next >= (eq.peaks[band] || 0)) {
            eq.peaks[band] = next;
            eq.peakHoldUntil[band] = now + CONFIG.audio.peakHoldMs;
          } else if (now >= (eq.peakHoldUntil[band] || 0)) {
            eq.peaks[band] = Math.max(
              next,
              (eq.peaks[band] || 0) -
                (0.15 + CONFIG.audio.releaseSpeed * 0.55) *
                  deltaSeconds
            );
          }
        }
      }

      function updatePeak(instDb, peakDb, side, now) {
        const minDb = CONFIG.audio.minDb;

        if (!isFinite(peakDb) || peakDb === -999) {
          peakDb = minDb;
        }

        if (instDb > peakDb) {
          STATE.peakHoldUntil[side] = now + CONFIG.audio.peakHoldMs;
          return instDb;
        }

        if ((STATE.peakHoldUntil[side] || 0) > now) {
          return peakDb;
        }

        return Math.max(minDb, peakDb - CONFIG.audio.peakDecayDbPerFrame);
      }

      function resolveAudioSource() {
        // AudioMetrix must not be tied to one specific FM-DX audio path.
        // Prefer an active HD Radio WebAudio tap when available, then fall back
        // to the standard FM-DX analogue stream node.
        try {
          const hdNode = window.hdRadioAnalyserNode || window.hdRadioAudioNode || null;
          const hdCtx = hdNode && hdNode.context ? hdNode.context : null;

          if (hdNode && hdCtx && hdCtx.state !== "closed") {
            return {
              mode: "hdradio",
              label: "HD Radio",
              context: hdCtx,
              source: hdNode,
              signature: `hdradio:${hdCtx.sampleRate || 0}:${hdNode.constructor?.name || "AudioNode"}`
            };
          }
        } catch (e) {}

        try {
          if (
            typeof Stream !== "undefined" &&
            Stream?.Fallback?.Player?.Amplification &&
            Stream?.Fallback?.Audio
          ) {
            const ctx = Stream.Fallback.Audio;
            const src = Stream.Fallback.Player.Amplification;

            if (ctx && src && ctx.state !== "closed") {
              return {
                mode: "analog",
                label: "FM-DX Analog",
                context: ctx,
                source: src,
                signature: `analog:${ctx.sampleRate || 0}:${src.constructor?.name || "AudioNode"}`
              };
            }
          }
        } catch (e) {}

        return null;
      }

      function isAudioTransportPlaying() {
        // FM-DX keeps its WebAudio graph/node alive after Stop. The transport
        // button is the authoritative state: fa-stop means audio is playing,
        // fa-play means it is stopped. This also changes synchronously on each
        // Play/Stop click, unlike the retained analyser source.
        const transportIcon = document.querySelector(
          ".playbutton .fa-solid"
        );
        if (transportIcon) {
          return transportIcon.classList.contains("fa-stop");
        }

        // Compatibility fallback for installations without the standard
        // FM-DX transport button.
        try {
          if (STATE.audio?.sourceMode === "analog") {
            return typeof Stream !== "undefined" && Stream !== null;
          }
        } catch (e) {}

        // Optional explicit HD Radio transport flags, when supplied by the
        // host/plugin. A boolean false is meaningful and must not be skipped.
        const hdFlags = [
          window.hdRadioIsPlaying,
          window.isHDRadioPlaying,
          window.hdRadioPlaying
        ];
        const explicitHdFlag = hdFlags.find(
          value => typeof value === "boolean"
        );
        if (typeof explicitHdFlag === "boolean") {
          return explicitHdFlag;
        }

        const hdMedia =
          window.hdRadioAudioElement ||
          window.hdRadioAudio ||
          null;
        if (hdMedia && typeof hdMedia.paused === "boolean") {
          return !hdMedia.paused && !hdMedia.ended;
        }

        // Last-resort compatibility for an HD analyser node that exists only
        // while its transport is active.
        return STATE.audio?.sourceMode === "hdradio" &&
          !!STATE.audio?.source;
      }

      function scheduleInitAudioRetry(delay) {
        if (AMX_RUNTIME.destroyed) return;

        if (AMX_RUNTIME.initRetryTimer) {
          clearTimeout(AMX_RUNTIME.initRetryTimer);
        }

        AMX_RUNTIME.initRetryTimer = setTimeout(() => {
          AMX_RUNTIME.initRetryTimer = null;
          if (!AMX_RUNTIME.destroyed) initAudioSystem();
        }, delay);
      }

      function initAudioSystem() {
        if (AMX_RUNTIME.destroyed) return;

        if (AMX_RUNTIME.initRetryTimer) {
          clearTimeout(AMX_RUNTIME.initRetryTimer);
          AMX_RUNTIME.initRetryTimer = null;
        }

        try {
          const resolved = resolveAudioSource();

          if (resolved && resolved.context && resolved.source) {
            STATE.audio.context = resolved.context;
            STATE.audio.source = resolved.source;
            STATE.audio.sourceMode = resolved.mode;
            STATE.audio.sourceLabel = resolved.label;
            STATE.audio.sourceSignature = resolved.signature;

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

            // TIME-DOMAIN BUFFERS L / R
            STATE.audio.timeLeft = new Float32Array(
              STATE.audio.analyserLeft.fftSize
            );
            STATE.audio.timeRight = new Float32Array(
              STATE.audio.analyserRight.fftSize
            );

            // AUDIO PIPELINE
            // src → splitter → L/R analyzers
            src.connect(STATE.audio.splitter);
            STATE.audio.splitter.connect(STATE.audio.analyserLeft,  0);
            STATE.audio.splitter.connect(STATE.audio.analyserRight, 1);

            // EQUALIZER — dedicated high-resolution, display-only spectrum tap.
            // It is never connected back into the playback path.
            STATE.audio.analyserEqualizerLeft = ctx.createAnalyser();
            STATE.audio.analyserEqualizerRight = ctx.createAnalyser();

            STATE.audio.analyserEqualizerLeft.fftSize = 4096;
            STATE.audio.analyserEqualizerRight.fftSize = 4096;
            STATE.audio.analyserEqualizerLeft.minDecibels = -100;
            STATE.audio.analyserEqualizerRight.minDecibels = -100;
            STATE.audio.analyserEqualizerLeft.maxDecibels = -10;
            STATE.audio.analyserEqualizerRight.maxDecibels = -10;
            STATE.audio.analyserEqualizerLeft.smoothingTimeConstant = 0.85;
            STATE.audio.analyserEqualizerRight.smoothingTimeConstant = 0.85;

            STATE.audio.dataEqualizerLeft = new Uint8Array(
              STATE.audio.analyserEqualizerLeft.frequencyBinCount
            );
            STATE.audio.dataEqualizerRight = new Uint8Array(
              STATE.audio.analyserEqualizerRight.frequencyBinCount
            );
            STATE.audio.splitter.connect(STATE.audio.analyserEqualizerLeft, 0);
            STATE.audio.splitter.connect(STATE.audio.analyserEqualizerRight, 1);

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

            // Gains for Mid / Side are kept in STATE so rebind cleanup can
            // explicitly disconnect every node created by AudioMetrix.
            STATE.audio.midSideGainLToM = ctx.createGain();
            STATE.audio.midSideGainRToM = ctx.createGain();
            STATE.audio.midSideGainLToS = ctx.createGain();
            STATE.audio.midSideGainRToS = ctx.createGain();

            STATE.audio.midSideGainLToM.gain.value = 0.5;
            STATE.audio.midSideGainRToM.gain.value = 0.5;
            STATE.audio.midSideGainLToS.gain.value = 0.5;
            STATE.audio.midSideGainRToS.gain.value = -0.5;

            // Routing from splitter
            STATE.audio.splitter.connect(STATE.audio.midSideGainLToM, 0); // L
            STATE.audio.splitter.connect(STATE.audio.midSideGainRToM, 1); // R
            STATE.audio.splitter.connect(STATE.audio.midSideGainLToS, 0); // L
            STATE.audio.splitter.connect(STATE.audio.midSideGainRToS, 1); // R inverted

            // Feed analysers directly (SAFE)
            STATE.audio.midSideGainLToM.connect(STATE.audio.analyserMid);
            STATE.audio.midSideGainRToM.connect(STATE.audio.analyserMid);
            STATE.audio.midSideGainLToS.connect(STATE.audio.analyserSide);
            STATE.audio.midSideGainRToS.connect(STATE.audio.analyserSide);

            // AUDIO RMS+PEAK (A) — independent filtered mono branch
            // source → lowshelf → highpass → lowpass → analyserPeak
            STATE.audio.analyserPeak = ctx.createAnalyser();
            STATE.audio.analyserPeak.fftSize = CONFIG.audio.peakFftSize;

            STATE.audio.dataPeak = new Float32Array(
              STATE.audio.analyserPeak.fftSize
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
                `%c[AudioMetrix INIT] Source: ${STATE.audio.sourceLabel || STATE.audio.sourceMode || "unknown"} — true stereo split engaged (L/R + safe Mid/Side).`,
                "color: cyan; font-weight: bold;"
              );
            }

            startRendering();
          } else {
            scheduleInitAudioRetry(500);
          }
        } catch (e) {
          console.error("[AudioMetrix] initAudioSystem failed:", e);
          scheduleInitAudioRetry(1000);
        }
      }

      function encodeSpectrumValues(values, multiplier, fallback) {
        let encoded = "";
        for (let i = 0; i < values.length; i++) {
          if (i > 0) encoded += ",";
          encoded += Math.round(
            (values[i] || fallback) * multiplier
          );
        }
        return encoded;
      }

      function buildSpectrumStateSignature(spectrumState) {
        if (!spectrumState) return "";

        return (
          encodeSpectrumValues(spectrumState.values, 200, 0) +
          "|" +
          encodeSpectrumValues(spectrumState.peaks, 200, 0) +
          "|" +
          encodeSpectrumValues(spectrumState.dbValues, 1, -100)
        );
      }

      // RENDER LOOP HOOK
      function startRendering() {
        if (
          AMX_RUNTIME.destroyed ||
          document.visibilityState === "hidden" ||
          !STATE.dom.contentWrapper ||
          RENDER_GATE.rafId != null
        ) return;

        // --- layout read (gated) ---
        readLayoutOnce();

        const barH = CONFIG.display.dimensions.barHeight;
        const gap  = CONFIG.display.dimensions.spacing;
        const safeHeight = barH * 2 + gap;

        // Keep existing width; only ensure the normal canvas has a valid height.
        if (STATE.dom.canvasNormal) {
          const currentWidth =
            getCanvasLogicalWidth(STATE.dom.canvasNormal) > 40
              ? getCanvasLogicalWidth(STATE.dom.canvasNormal)
              : 300;

          resizeCanvasIfNeeded(
            STATE.dom.canvasNormal,
            currentWidth,
            safeHeight
          );
        }

        // ctx is set by renderMeters()
        renderMeters();
        RENDER_GATE.rafId = requestAnimationFrame(updateMetersFrame);
      }

      // UPDATE METERS
      function updateMetersFrame() {
        if (AMX_RUNTIME.destroyed || document.visibilityState === "hidden") {
          RENDER_GATE.rafId = null;
          return;
        }

        // Also runs while the audio analysers are not ready, allowing the
        // Automatic theme to replace its startup fallback after a refresh.
        refreshAutomaticTheme();

        if (
          !STATE.audio ||
          !STATE.audio.analyserLeft ||
          !STATE.audio.analyserRight ||
          !STATE.audio.analyserPeak
        ) {
          RENDER_GATE.rafId = requestAnimationFrame(updateMetersFrame);
          return;
        }

        try {
          // Playback state, not mere WebAudio-node existence, controls every
          // peak/readout visibility transition.
          STATE.hasStreamObject = isAudioTransportPlaying();

          // Adaptive audio cadence (single decision point)
          const highCadenceVisual =
            CONFIG.display.layoutMode === "equalizer" ||
            CONFIG.display.layoutMode === "vuHybrid" ||
            CONFIG.display.layoutMode === "oscilloscope";
          const runAudio =
            highCadenceVisual ? true : shouldRunAudio();

          if (runAudio) {
            const layoutMode = CONFIG.display.layoutMode;
            const nonLRLayout =
              layoutMode !== "lr" &&
              layoutMode !== "equalizer" &&
              layoutMode !== "oscilloscope" &&
              !(
                layoutMode === "vuHybrid" &&
                CONFIG.display.hybridMode === "stereo12"
              );
            
            const audioCfg = CONFIG.audio;
            const minDb = audioCfg.minDb;
            const maxDb = audioCfg.maxDb;
            const atk = audioCfg.attackSpeed;
            const rel = audioCfg.releaseSpeed;

            // READ TIME DOMAIN FOR L / R
            STATE.audio.analyserLeft.getFloatTimeDomainData(STATE.audio.timeLeft);
            STATE.audio.analyserRight.getFloatTimeDomainData(STATE.audio.timeRight);

            // READ MID / SIDE DATA
            if (nonLRLayout) {
              if (STATE.audio.analyserMid && STATE.audio.dataMid) {
                STATE.audio.analyserMid.getByteFrequencyData(STATE.audio.dataMid);
              }

              if (STATE.audio.analyserSide && STATE.audio.dataSide) {
                STATE.audio.analyserSide.getByteFrequencyData(STATE.audio.dataSide);
              }
            }

            // PROCESS LEFT / RIGHT SEPARATELY
            const L = processChannel(
              STATE.audio.timeLeft,
              STATE.levels.left.smoothDb
            );
            const R = processChannel(
              STATE.audio.timeRight,
              STATE.levels.right.smoothDb
            );

            STATE.levels.left.smoothDb = L.smoothDb;
            STATE.levels.right.smoothDb = R.smoothDb;

            const nowTs =
              (typeof performance !== "undefined" && performance.now)
                ? performance.now()
                : Date.now();

            updateSamplePeakMemory("left", L.samplePeak, nowTs);
            updateSamplePeakMemory("right", R.samplePeak, nowTs);

            const readSpectrumSnapshot =
              (layoutMode === "equalizer" || layoutMode === "vuHybrid")
                ? shouldReadSpectrumSnapshot()
                : false;

            if (layoutMode === "equalizer") {
              updateEqualizerLevels(
                nowTs,
                STATE.levels.equalizer,
                EQ_CENTER_FREQUENCIES,
                readSpectrumSnapshot
              );
            } else if (layoutMode === "vuHybrid") {
              if (CONFIG.display.hybridMode === "audio10") {
                updateEqualizerLevels(
                  nowTs,
                  STATE.levels.hybridAudio10,
                  HYBRID_AUDIO_10_FREQUENCIES,
                  readSpectrumSnapshot
                );
              } else {
                updateEqualizerLevels(
                  nowTs,
                  STATE.levels.hybridStereo12,
                  HYBRID_STEREO_12_FREQUENCIES,
                  readSpectrumSnapshot
                );
              }
            }

            // PEAKS (hold + decay)
            STATE.levels.left.peakDb = updatePeak(
              L.instantDb,
              STATE.levels.left.peakDb,
              "left",
              nowTs
            );
            STATE.levels.right.peakDb = updatePeak(
              R.instantDb,
              STATE.levels.right.peakDb,
              "right",
              nowTs
            );

            // AUDIO PEAK (A) — RMS BAR + PPM PEAK
            // Uses ONLY existing CONFIG.audio parameters
            if (nonLRLayout && STATE.audio.analyserPeak) {

              if (!STATE.audioPeak) {
                STATE.audioPeak = {
                  lastTs: 0,
                  bar: 0,
                  ppm: 0
                };
              }

              const peakState = STATE.audioPeak;
              const audioLevels = STATE.levels.audio;
              const peakAnalyser = STATE.audio.analyserPeak;
              const now = nowTs;

              const INTERVAL_MS = 75;
              const SILENCE_EPS = 0.015;
              const SCALE = 5.5; // visual calibration (same role as before)

              if (now - peakState.lastTs >= INTERVAL_MS) {
                peakState.lastTs = now;

                // Read TIME DOMAIN samples
                const buf = STATE.audio.dataPeak;
                if (!buf) return;

                peakAnalyser.getFloatTimeDomainData(buf);

                // RMS + SAMPLE PEAK (not inter-sample True Peak).
                // Float32 samples are already normalized to -1..+1.
                let sumSq = 0;
                let instPeak = 0;

                const len = buf.length;

                for (let i = 0; i < len; i++) {
                  const n = Math.abs(buf[i]);

                  sumSq += n * n;

                  if (n > instPeak) instPeak = n;
                }

                const rms = Math.sqrt(sumSq / len);

                // RMS BAR (average energy)
                let targetBar = 0;
                if (rms > SILENCE_EPS) {
                  targetBar = Math.min(255, rms * 255 * SCALE);
                }

                // smooth bar (attack + release already agreed)
                if (targetBar > peakState.bar) {
                  peakState.bar +=
                    (targetBar - peakState.bar) * atk;
                } else {
                  peakState.bar *= rel;
                }

                audioLevels.smooth = peakState.bar;

                // A SAMPLE-PEAK LINE — use the same hold/decay logic as L/R
                const targetPeak = Math.min(255, instPeak * 255 * SCALE);

                const rangeA = maxDb - minDb;

                const instPeakDb =
                  minDb + (targetPeak / 255) * rangeA;

                const prevPeakDb =
                  isFinite(peakState.peakDb)
                    ? peakState.peakDb
                    : minDb;

                const targetPeakDb =
                  instPeakDb > prevPeakDb
                    ? prevPeakDb + (instPeakDb - prevPeakDb) * 0.5
                    : instPeakDb;

                const nextPeakDb =
                  updatePeak(targetPeakDb, prevPeakDb, "audio", now);

                peakState.peakDb = nextPeakDb;

                audioLevels.peak =
                  Math.max(
                    0,
                    Math.min(255, ((nextPeakDb - minDb) / rangeA) * 255)
                  );
              }
            }

            // STEREO QUALITY (Q) — calibrated + gated + richer debug
            if (nonLRLayout && STATE.audio.dataMid && STATE.audio.dataSide) {

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
                const mapStereoRatioToQ =
                  updateMetersFrame._mapStereoRatioToQ ||
                  (updateMetersFrame._mapStereoRatioToQ = (r) => {

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
                  });

                qInstant = mapStereoRatioToQ(stereoRatio);
              } else {
                // If gated out, we treat as no reliable stereo quality
                qInstant = 0;
              }

              // SMOOTHING
              const prev = STATE.levels.stereoQuality.smooth;
              const qSmooth =
                qInstant > prev
                  ? prev + (qInstant - prev) * atk
                  : prev + (qInstant - prev) * rel;

              STATE.levels.stereoQuality.instant = qInstant;
              STATE.levels.stereoQuality.smooth  = qSmooth;
              const qSmoothDb = mapStereoQualityToDb(
                qSmooth,
                minDb,
                maxDb - minDb
              );
              STATE.levels.stereoQuality.peakDb = updatePeak(
                qSmoothDb,
                STATE.levels.stereoQuality.peakDb,
                "quality",
                nowTs
              );

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
              const levels = STATE.levels;
              const audioLevels = levels.audio;
              const stereoLevels = levels.stereoQuality;

              // Activity proxy (no extra audio reads):
              // - stronger LR instant levels
              // - audio bar (A)
              // - stereo quality (Q)
              const lDb = (typeof L.instantDb === "number") ? L.instantDb : minDb;
              const rDb = (typeof R.instantDb === "number") ? R.instantDb : minDb;

              const lAct = Math.max(0, lDb - (minDb + 0.5)); // 0..~range
              const rAct = Math.max(0, rDb - (minDb + 0.5));

              const aRaw = (audioLevels && typeof audioLevels.smooth === "number")
                ? audioLevels.smooth
                : 0;
              const qRaw = (stereoLevels && typeof stereoLevels.smooth === "number")
                ? stereoLevels.smooth
                : 0;

              // Normalize into a single scalar
              const energy =
                (Math.min(1, Math.max(lAct, rAct) / 40) * 0.60) +
                (Math.min(1, Math.max(0, Math.min(255, aRaw)) / 255) * 0.25) +
                (Math.min(1, Math.max(0, Math.min(120, qRaw)) / 120) * 0.15);

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

          if (!runAudio && RENDER_GATE.dirty !== true) {
            RENDER_GATE.rafId = requestAnimationFrame(updateMetersFrame);
            return;
          }

          // FRAME THROTTLING
          const __now = performance.now();
          const activeFrameInterval =
            CONFIG.display.layoutMode === "equalizer" ||
            CONFIG.display.layoutMode === "vuHybrid" ||
            CONFIG.display.layoutMode === "oscilloscope"
              ? 1000 / 60
              : FRAME_INTERVAL;
          if (__now - _lastRenderTime < activeFrameInterval) {
            RENDER_GATE.rafId = requestAnimationFrame(updateMetersFrame);
            return;
          }
          _lastRenderTime = __now;

          const Ls = STATE.levels.left.smoothDb;
          const Rs = STATE.levels.right.smoothDb;
          const Qs = STATE.levels.stereoQuality.smooth;
          const As = STATE.levels.audio.smooth;
          const spectrumState =
            CONFIG.display.layoutMode === "equalizer"
              ? STATE.levels.equalizer
              : CONFIG.display.layoutMode === "vuHybrid"
                ? (
                    CONFIG.display.hybridMode === "audio10"
                      ? STATE.levels.hybridAudio10
                      : STATE.levels.hybridStereo12
                  )
                : null;
          const eqSignature =
            buildSpectrumStateSignature(spectrumState);

          const EPS_DB = 0.05;
          const EPS_PCT = 0.5;

          const streamState = STATE.hasStreamObject === true;
          const streamChanged = streamState !== _lastDrawn.Stream;
          if (
            streamChanged &&
            !streamState &&
            STATE.render?.canvasReadouts
          ) {
            STATE.render.canvasReadouts = {};
          }
          const dirtyValues =
            CONFIG.display.layoutMode === "oscilloscope" ||
            _lastDrawn.L === null ||
            Math.abs(Ls - _lastDrawn.L) > EPS_DB ||
            Math.abs(Rs - _lastDrawn.R) > EPS_DB ||
            Math.abs(Qs - _lastDrawn.Q) > EPS_PCT ||
            Math.abs(As - _lastDrawn.A) > EPS_PCT ||
            (spectrumState && eqSignature !== _lastDrawn.EQ) ||
            streamChanged;

          const manualDirty = (RENDER_GATE.dirty === true);

          if (dirtyValues) {
            _lastDrawn.L = Ls;
            _lastDrawn.R = Rs;
            _lastDrawn.Q = Qs;
            _lastDrawn.A = As;
            _lastDrawn.EQ = eqSignature;
            _lastDrawn.Stream = streamState;
          }

          // DRAW EVERYTHING (GATED)
          if (manualDirty || dirtyValues) {
            renderMeters();
            RENDER_GATE.dirty = false;
          }

          // STOP must blank DOM readouts immediately, independently of the
          // user-selected readout refresh cadence.
          if (
            STATE.hasStreamObject !== true &&
            STATE.dom.readouts
          ) {
            Object.values(STATE.dom.readouts).forEach((el) => {
              if (el && el.textContent !== "") {
                el.textContent = "";
              }
            });
          }

          // READOUTS — REAL-TIME UPDATE (THROTTLED)
          _readoutFrame++;
          if (_readoutFrame >= READOUT_FRAME_SKIP) {
            _readoutFrame = 0;

            if (CONFIG.display.showReadouts && STATE.dom.readouts) {

              const setReadoutText =
                updateMetersFrame._setReadoutText ||
                (updateMetersFrame._setReadoutText = (el, text) => {
                  if (!el) return;
                  const next = text == null ? "" : String(text);
                  if (el.textContent !== next) {
                    el.textContent = next;
                  }
                });

              const layout = CONFIG.display.layoutMode;
              const minDb  = CONFIG.audio.minDb;

              let lNow = null;
              let rNow = null;

              const aRaw = (STATE.levels?.audio && typeof STATE.levels.audio.smooth === "number")
                ? STATE.levels.audio.smooth
                : 0;

              const qRaw = (STATE.levels?.stereoQuality && typeof STATE.levels.stereoQuality.smooth === "number")
                ? STATE.levels.stereoQuality.smooth
                : 0;

              // Compatible transport state (analogue Stream or HD Radio tap).
              const hasStreamObject =
                STATE.hasStreamObject === true;

              // Helper for dB formatting on minDb
              const formatDb =
                updateMetersFrame._formatDb ||
                (updateMetersFrame._formatDb = (val, floorDb) => {
                  if (val === null) return "";
                  const v = (val < floorDb ? floorDb : val);
                  return `${v.toFixed(1)} dB`;
                });

              // ─────────────────────────
              // LR — Stereo Levels layout
              // ─────────────────────────
              if (layout === "lr" || layout === "oscilloscope") {

                if (!hasStreamObject) {
                  setReadoutText(STATE.dom.readouts.L, "");
                  setReadoutText(STATE.dom.readouts.R, "");
                } else {
                  lNow = getCurrentReadout("L");
                  rNow = getCurrentReadout("R");

                  setReadoutText(STATE.dom.readouts.L, formatDb(lNow, minDb));
                  setReadoutText(STATE.dom.readouts.R, formatDb(rNow, minDb));
                }
              }

              // ───────────────────────────────
              // SA / FULL — Q / A (and L/R on FULL)
              // ───────────────────────────────
              else if (layout === "sa" || layout === "full") {

                if (!hasStreamObject) {
                  // STOP → hide Q/A
                  setReadoutText(STATE.dom.readouts.Q, "");
                  setReadoutText(STATE.dom.readouts.A, "");

                  // On FULL hide L/R
                  if (layout === "full") {
                    setReadoutText(STATE.dom.readouts.L, "");
                    setReadoutText(STATE.dom.readouts.R, "");
                  }
                } else {
                  // PLAYING
                  const q = clamp(qRaw, 0, 120);
                  setReadoutText(
                    STATE.dom.readouts.Q,
                    (q !== null && q > 0.5) ? `${q.toFixed(0)} %` : "0%"
                  );

                  const aClamped = Math.max(0, Math.min(255, aRaw));
                  const aPct = (aClamped / 255) * 100;
                  setReadoutText(
                    STATE.dom.readouts.A,
                    (aRaw > 1) ? `${Math.round(aPct)} %` : "0%"
                  );

                  // FULL layout
                  if (layout === "full") {
                    lNow = getCurrentReadout("L");
                    rNow = getCurrentReadout("R");

                    setReadoutText(STATE.dom.readouts.L, formatDb(lNow, minDb));
                    setReadoutText(STATE.dom.readouts.R, formatDb(rNow, minDb));
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("[AudioMetrix] updateMetersFrame failed:", e);
        }
        if (!AMX_RUNTIME.destroyed && document.visibilityState !== "hidden") {
          RENDER_GATE.rafId = requestAnimationFrame(updateMetersFrame);
        } else {
          RENDER_GATE.rafId = null;
        }
      }

      // AUTO REBIND WHEN FM-DX OR COMPATIBLE PLUGINS RECREATE AUDIO NODES
      // Adaptive scheduler: fast while recovering, relaxed while stable,
      // very light while the page is hidden.
      const AUTO_REBIND_FAST_MS   = 1000;
      const AUTO_REBIND_STABLE_MS = 5000;
      const AUTO_REBIND_HIDDEN_MS = 15000;
      let lastSourceSignature = null;
      let lastSourceNode = null;

      function scheduleAutoRebind(delay) {
        if (AMX_RUNTIME.destroyed) return;
        if (AMX_RUNTIME.autoRebindTimer) {
          clearTimeout(AMX_RUNTIME.autoRebindTimer);
        }
        AMX_RUNTIME.autoRebindTimer = setTimeout(runAutoRebindCheck, delay);
      }

      function runAutoRebindCheck() {
        if (AMX_RUNTIME.destroyed) return;

        AMX_RUNTIME.autoRebindLastCheck = Date.now();

        if (document.visibilityState === "hidden") {
          AMX_RUNTIME.autoRebindState = "hidden";
          scheduleAutoRebind(AUTO_REBIND_HIDDEN_MS);
          return;
        }

        let nextDelay = AUTO_REBIND_STABLE_MS;

        try {
          const resolved = resolveAudioSource();

          if (!resolved || !resolved.context || !resolved.source) {
            lastSourceSignature = null;
            lastSourceNode = null;
            AMX_RUNTIME.autoRebindState = "waiting-source";
            nextDelay = AUTO_REBIND_FAST_MS;
          } else {
            if (!lastSourceNode && !lastSourceSignature) {
              lastSourceNode = resolved.source;
              lastSourceSignature = resolved.signature;
            }

            const changed =
              resolved.source !== lastSourceNode ||
              resolved.signature !== lastSourceSignature ||
              !STATE.audio ||
              STATE.audio.source !== resolved.source ||
              STATE.audio.context !== resolved.context ||
              STATE.audio.sourceMode !== resolved.mode;

            const incomplete =
              !STATE.audio ||
              !STATE.audio.context ||
              !STATE.audio.source ||
              !STATE.audio.analyserLeft ||
              !STATE.audio.analyserRight ||
              !STATE.audio.analyserEqualizerLeft ||
              !STATE.audio.analyserEqualizerRight;

            if (changed || incomplete) {
              lastSourceNode = resolved.source;
              lastSourceSignature = resolved.signature;
              AMX_RUNTIME.autoRebindState = changed ? "rebind" : "repair";
              stopRenderingLoop();
              resetAudioState();
              initAudioSystem();
              nextDelay = AUTO_REBIND_FAST_MS;
            } else {
              AMX_RUNTIME.autoRebindState = "stable";
              nextDelay = AUTO_REBIND_STABLE_MS;
            }
          }
        } catch (e) {
          AMX_RUNTIME.autoRebindState = "error";
          nextDelay = AUTO_REBIND_FAST_MS;
          if (AMX_DEBUG) {
            console.warn("[AudioMetrix] auto-rebind check failed:", e);
          }
        }

        scheduleAutoRebind(nextDelay);
      }

      function handleAMXVisibilityChange() {
        AMX_RUNTIME.pageVisible = document.visibilityState !== "hidden";

        if (!AMX_RUNTIME.pageVisible) {
          stopRenderingLoop();
          AMX_RUNTIME.autoRebindState = "hidden";
          scheduleAutoRebind(AUTO_REBIND_HIDDEN_MS);
          return;
        }

        // Resume immediately with the current graph, then verify the source.
        startRendering();
        scheduleAutoRebind(0);
        requestRender();
      }

      AMX_RUNTIME.visibilityHandler = handleAMXVisibilityChange;
      document.addEventListener("visibilitychange", AMX_RUNTIME.visibilityHandler);

      function destroyAudioMetrix() {
        if (AMX_RUNTIME.destroyed) return;
        AMX_RUNTIME.destroyed = true;

        stopRenderingLoop();

        if (AMX_RUNTIME.autoRebindTimer) {
          clearTimeout(AMX_RUNTIME.autoRebindTimer);
          AMX_RUNTIME.autoRebindTimer = null;
        }

        if (AMX_RUNTIME.initRetryTimer) {
          clearTimeout(AMX_RUNTIME.initRetryTimer);
          AMX_RUNTIME.initRetryTimer = null;
        }

        if (AMX_RUNTIME.diagnosticsTimer) {
          clearInterval(AMX_RUNTIME.diagnosticsTimer);
          AMX_RUNTIME.diagnosticsTimer = null;
        }

        if (AMX_RUNTIME.visibilityHandler) {
          document.removeEventListener("visibilitychange", AMX_RUNTIME.visibilityHandler);
          AMX_RUNTIME.visibilityHandler = null;
        }

        if (AMX_RUNTIME.themeObserver) {
          AMX_RUNTIME.themeObserver.disconnect();
          AMX_RUNTIME.themeObserver = null;
        }

        if (AMX_RUNTIME.skinObserver) {
          AMX_RUNTIME.skinObserver.disconnect();
          AMX_RUNTIME.skinObserver = null;
        }

        if (AMX_RUNTIME.skinObserverRaf) {
          cancelAnimationFrame(AMX_RUNTIME.skinObserverRaf);
          AMX_RUNTIME.skinObserverRaf = 0;
        }

        if (AMX_RUNTIME.contentResizeObserver) {
          AMX_RUNTIME.contentResizeObserver.disconnect();
          AMX_RUNTIME.contentResizeObserver = null;
        }

        if (AMX_RUNTIME.barsResizeRaf !== null) {
          cancelAnimationFrame(AMX_RUNTIME.barsResizeRaf);
          AMX_RUNTIME.barsResizeRaf = null;
        }

        if (
          STATE.dom &&
          STATE.dom.settingsPanel &&
          STATE.dom.settingsPanel._amxOverflowObserver
        ) {
          STATE.dom.settingsPanel._amxOverflowObserver.disconnect();
          STATE.dom.settingsPanel._amxOverflowObserver = null;
        }

        for (const [type, handler, options] of AMX_RUNTIME.windowHandlers) {
          window.removeEventListener(type, handler, options);
        }
        AMX_RUNTIME.windowHandlers.length = 0;

        for (const timer of AMX_RUNTIME.pendingTimeouts) {
          clearTimeout(timer);
        }
        AMX_RUNTIME.pendingTimeouts.clear();

        cleanupAudioGraph();

        try {
          if (window.AudioMetrixResetMax === resetSamplePeakMemory) {
            delete window.AudioMetrixResetMax;
          }
        } catch (_) {}

        if (AMX_RUNTIME.diagnosticsEl) {
          AMX_RUNTIME.diagnosticsEl.remove();
          AMX_RUNTIME.diagnosticsEl = null;
        }
      }

      // Useful for admin/debug reloads and future plugin lifecycle integration.
      window.AudioMetrixDestroy = destroyAudioMetrix;

      scheduleAutoRebind(AUTO_REBIND_FAST_MS);
      startDiagnosticsLoop();

      // Log + internal update check (panel + console)
      console.log(`[AudioMetrix] Loaded v${AMX_VERSION}`);
      runAMXSetupUpdateCheck();

      // Start system
      initAudioSystem();

      // Keep floating settings panel inside viewport on window resize
      const handleAMXPanelViewportClamp = () => {
        if (
          STATE.dom &&
          STATE.dom.settingsPanel &&
          STATE.dom.settingsPanel.style.display !== "none"
        ) {
          clampAMXPanelToViewport(STATE.dom.settingsPanel);
        }
      };
      window.addEventListener("resize", handleAMXPanelViewportClamp);
      AMX_RUNTIME.windowHandlers.push(
        ["resize", handleAMXPanelViewportClamp, undefined]
      );

    } catch (e) {
      console.error("[AudioMetrix] DOMContentLoaded init failed:", e);
    }
  });
})(); //END
