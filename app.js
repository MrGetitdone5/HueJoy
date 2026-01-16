/***********************
 * HueJoy Color-by-Number
 * Static (GitHub Pages)
 ***********************/

const PAGE = {
  id: "page1",

  // CHANGE THESE to match your filenames inside /pages
  outlineUrl: "./pages/outline.png", // e.g. "./pages/IMG_3807.png"
  idmapUrl: "./pages/idmap.png",     // e.g. "./pages/IMG_3812.png"
  paletteUrl: "./pages/palette.json"
};

// If you want to allow filling any region with any color, set to false.
let strictMode = true;

// Active selection
let ACTIVE_NUMBER = null;
let ACTIVE_COLOR = "#000000";

// Canvases
const paintCanvas = document.getElementById("paint");
const uiCanvas = document.getElementById("ui");
const paintCtx = paintCanvas.getContext("2d", { willReadFrequently: true });
const uiCtx = uiCanvas.getContext("2d", { willReadFrequently: true });

// Hidden idmap
let idmapCanvas, idmapCtx;

// Outline image
let outlineImg = null;

// Palette + region mapping
let palette = null;                 // { title, colors:[{n,hex,name}] }
let colorToNumber = new Map();      // "r,g,b" -> number

// Progress: regionKey -> filledHex
// regionKey is "r,g,b" from idmap
let filled = new Map();

// Undo stack: array of { regionKey, prevHex, nextHex }
let undoStack = [];

// Storage keys
const STORAGE_KEY = `huejoy:${PAGE.id}:filled`;

// UI elements
const loadingEl = document.getElementById("loading");
const paletteBar = document.getElementById("paletteBar");
const pageTitle = document.getElementById("pageTitle");
const pageSub = document.getElementById("pageSub");
const chkStrict = document.getElementById("chkStrict");
const btnUndo = document.getElementById("btnUndo");
const btnReset = document.getElementById("btnReset");
const btnHint = document.getElementById("btnHint");
const btnBack = document.getElementById("btnBack");

function rgbKey(r, g, b) { return `${r},${g},${b}`; }

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const v = parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(); // bust cache while developing
  });
}

async function loadPalette(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Palette load failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

function setCanvasSizeFromImage(img) {
  // Use image pixel size for correct fill accuracy
  paintCanvas.width = img.naturalWidth;
  paintCanvas.height = img.naturalHeight;
  uiCanvas.width = img.naturalWidth;
  uiCanvas.height = img.naturalHeight;
}

function buildColorToNumberMap(paletteObj) {
  colorToNumber = new Map();
  paletteObj.colors.forEach(c => {
    const { r, g, b } = hexToRgb(c.hex);
    colorToNumber.set(rgbKey(r, g, b), c.n);
  });
}

function renderPaletteChips(paletteObj) {
  paletteBar.innerHTML = "";

  paletteObj.colors.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = String(c.n);
    btn.style.background = c.hex;
    btn.dataset.hex = c.hex;
    btn.dataset.n = String(c.n);

    btn.addEventListener("click", () => {
      ACTIVE_NUMBER = c.n;
      ACTIVE_COLOR = c.hex;

      document.querySelectorAll("#paletteBar .chip").forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
    });

    paletteBar.appendChild(btn);
  });

  // select first by default
  paletteBar.querySelector(".chip")?.click();
}

function loadSavedProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);

    filled = new Map(Object.entries(obj)); // regionKey -> hex
  } catch (e) {
    console.warn("Failed to load saved progress", e);
  }
}

function saveProgress() {
  const obj = Object.fromEntries(filled.entries());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function clearProgress() {
  filled.clear();
  undoStack = [];
  localStorage.removeItem(STORAGE_KEY);
}

function drawOutline() {
  // clear UI canvas
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);

  // draw outline on UI canvas, so paint stays separate
  uiCtx.drawImage(outlineImg, 0, 0);
}

function redrawPaintLayer() {
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);

  // For each filled region, we recolor its pixels by scanning idmap
  // Note: This is simplest approach; for big images/tons of regions it can be slower.
  const w = paintCanvas.width;
  const h = paintCanvas.height;

  const idData = idmapCtx.getImageData(0, 0, w, h);
  const pData = paintCtx.getImageData(0, 0, w, h);

  const id = idData.data;
  const p = pData.data;

  // Build a quick lookup: regionKey -> rgb
  const regionRgb = new Map();
  for (const [regionKey, hex] of filled.entries()) {
    regionRgb.set(regionKey, hexToRgb(hex));
  }

  for (let i = 0; i < id.length; i += 4) {
    const a = id[i + 3];
    if (a === 0) continue; // transparent means "no region"
    const key = rgbKey(id[i], id[i + 1], id[i + 2]);
    const fillRgb = regionRgb.get(key);
    if (!fillRgb) continue;

    p[i] = fillRgb.r;
    p[i + 1] = fillRgb.g;
    p[i + 2] = fillRgb.b;
    p[i + 3] = 255;
  }

  paintCtx.putImageData(pData, 0, 0);
}

function getRegionKeyAtCanvasPoint(canvasX, canvasY) {
  // Get pixel from idmap at that coordinate
  const w = idmapCanvas.width;
  const h = idmapCanvas.height;

  const x = clamp(Math.floor(canvasX), 0, w - 1);
  const y = clamp(Math.floor(canvasY), 0, h - 1);

  const px = idmapCtx.getImageData(x, y, 1, 1).data;
  const a = px[3];
  if (a === 0) return null; // background/no region
  return rgbKey(px[0], px[1], px[2]);
}

function canvasPointFromEvent(ev) {
  const rect = uiCanvas.getBoundingClientRect();
  const x01 = (ev.clientX - rect.left) / rect.width;
  const y01 = (ev.clientY - rect.top) / rect.height;

  return {
    x: x01 * uiCanvas.width,
    y: y01 * uiCanvas.height
  };
}

function flashMessage(msg) {
  pageSub.textContent = msg;
  clearTimeout(flashMessage._t);
  flashMessage._t = setTimeout(() => {
    pageSub.textContent = strictMode
      ? "Tap a region that matches the selected number"
      : "Tap any region to fill";
  }, 1400);
}

function handleFillAt(ev) {
  if (ACTIVE_NUMBER == null) return;

  const pt = canvasPointFromEvent(ev);
  const regionKey = getRegionKeyAtCanvasPoint(pt.x, pt.y);
  if (!regionKey) return;

  // Strict mode: regionKey must be a color that exists in the palette for selected number.
  // This requires your idmap region colors to match palette colors.
  // If your idmap uses random unique colors per region (common), strict mode cannot work.
  if (strictMode) {
    const regionNumber = colorToNumber.get(regionKey);
    if (regionNumber == null) {
      flashMessage("This region isn’t mapped to a palette number.");
      return;
    }
    if (regionNumber !== ACTIVE_NUMBER) {
      flashMessage(`Wrong number. This is ${regionNumber}.`);
      return;
    }
  }

  const prevHex = filled.get(regionKey) || null;
  const nextHex = ACTIVE_COLOR;

  if (prevHex === nextHex) return;

  filled.set(regionKey, nextHex);
  undoStack.push({ regionKey, prevHex, nextHex });
  saveProgress();
  redrawPaintLayer();
}

function undo() {
  const last = undoStack.pop();
  if (!last) return;

  if (last.prevHex == null) filled.delete(last.regionKey);
  else filled.set(last.regionKey, last.prevHex);

  saveProgress();
  redrawPaintLayer();
}

function resetAll() {
  if (!confirm("Reset all coloring for this page?")) return;
  clearProgress();
  redrawPaintLayer();
}

function hint() {
  if (ACTIVE_NUMBER == null) return;

  // Simple hint: show how many regions are already filled for selected number (strict mapping only)
  if (!strictMode) {
    flashMessage("Turn on Strict to use number-based hints.");
    return;
  }

  let total = 0;
  let done = 0;

  // total regions that map to this number (based on idmap palette-color mapping)
  for (const [key, n] of colorToNumber.entries()) {
    if (n === ACTIVE_NUMBER) {
      total++;
      if (filled.has(key)) done++;
    }
  }
  flashMessage(`Number ${ACTIVE_NUMBER}: ${done}/${total} filled`);
}

async function init() {
  try {
    loadingEl.style.display = "grid";

    // Strict checkbox
    chkStrict.checked = true;
    chkStrict.addEventListener("change", () => {
      strictMode = chkStrict.checked;
      flashMessage(strictMode ? "Strict mode ON" : "Strict mode OFF");
    });

    btnUndo.addEventListener("click", undo);
    btnReset.addEventListener("click", resetAll);
    btnHint.addEventListener("click", hint);
    btnBack.addEventListener("click", () => history.back());

    // Load palette
    palette = await loadPalette(PAGE.paletteUrl);
    pageTitle.textContent = palette.title || "Color by Number";

    // IMPORTANT:
    // Strict mode only works if your IDMAP region colors exactly match palette colors.
    // If your IDMAP uses random unique colors per region (most common), then:
    // - strict mode should be OFF
    // - and you need a separate mapping (regionId -> number) to enforce correctness.
    buildColorToNumberMap(palette);
    renderPaletteChips(palette);

    // Load outline and idmap images
    outlineImg = await loadImage(PAGE.outlineUrl);
    const idmapImg = await loadImage(PAGE.idmapUrl);

    setCanvasSizeFromImage(outlineImg);

    // Build hidden idmap canvas
    idmapCanvas = document.createElement("canvas");
    idmapCanvas.width = outlineImg.naturalWidth;
    idmapCanvas.height = outlineImg.naturalHeight;
    idmapCtx = idmapCanvas.getContext("2d", { willReadFrequently: true });
    idmapCtx.imageSmoothingEnabled = false;
    idmapCtx.drawImage(idmapImg, 0, 0, idmapCanvas.width, idmapCanvas.height);

    // Draw outline
    uiCtx.imageSmoothingEnabled = true;
    paintCtx.imageSmoothingEnabled = false;
    drawOutline();

    // Load saved progress + redraw paint
    loadSavedProgress();
    redrawPaintLayer();

    // Input events
    uiCanvas.addEventListener("pointerdown", (ev) => {
      uiCanvas.setPointerCapture(ev.pointerId);
      handleFillAt(ev);
    });

    loadingEl.style.display = "none";

    // Guidance about strict mode based on your asset type
    flashMessage("Loaded. Tap a region to fill.");
  } catch (err) {
    console.error(err);
    loadingEl.textContent = "Load error. Check file paths + JSON.";
    alert(String(err.message || err));
  }
}

init();