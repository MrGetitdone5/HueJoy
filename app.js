/***********************
 * HueJoy — Color by Number (GitHub Pages)
 * Uses:
 *  - ./pages/palette.json  (your 25-color palette)
 *  - ./pages/IMG_3813.png  (your outline line-art)
 *  - ./pages/idmap.png     (YOU MUST UPLOAD this; flat unique colors per region)
 ***********************/

// ====== CONFIG (change only this block if you rename files) ======
const PAGE = {
  id: "page1",
  outlineUrl: "./pages/IMG_3813.png",   // outline you showed
  idmapUrl: "./pages/idmap.png",        // create/upload this
  paletteUrl: "./pages/palette.json"
};

// If you want to allow filling any region with any number, set strictModeDefault to false.
const strictModeDefault = false; // IMPORTANT: keep false until you have a real number mapping

// ====== STATE ======
let strictMode = strictModeDefault;
let ACTIVE_NUMBER = null;
let ACTIVE_COLOR = "#000000";

let palette = null; // { title, colors:[{n,hex,name}] }

const paintCanvas = document.getElementById("paint");
const uiCanvas = document.getElementById("ui");
const paintCtx = paintCanvas.getContext("2d", { willReadFrequently: true });
const uiCtx = uiCanvas.getContext("2d", { willReadFrequently: true });

let idmapCanvas = null;
let idmapCtx = null;
let outlineImg = null;

// regionKey ("r,g,b") -> filled hex
let filled = new Map();
// undo stack entries: { regionKey, prevHex, nextHex }
let undoStack = [];

// OPTIONAL strict mapping: regionKey ("r,g,b") -> number
// If you later add ./pages/map.json, we’ll load it. For now it stays null.
let regionToNumber = null;

const STORAGE_KEY = `huejoy:${PAGE.id}:filled`;

// ====== UI ======
const loadingEl = document.getElementById("loading");
const paletteBar = document.getElementById("paletteBar");
const pageTitle = document.getElementById("pageTitle");
const pageSub = document.getElementById("pageSub");

const chkStrict = document.getElementById("chkStrict");
const btnUndo = document.getElementById("btnUndo");
const btnReset = document.getElementById("btnReset");
const btnHint = document.getElementById("btnHint");
const btnBack = document.getElementById("btnBack");

// ====== HELPERS ======
function rgbKey(r, g, b) { return `${r},${g},${b}`; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const v = parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

async function loadPalette(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Palette load failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

async function loadJsonIfExists(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return await res.json();
}

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(); // dev cache-bust
  });
}

function setCanvasSizeFromImage(img) {
  paintCanvas.width = img.naturalWidth;
  paintCanvas.height = img.naturalHeight;
  uiCanvas.width = img.naturalWidth;
  uiCanvas.height = img.naturalHeight;

  paintCtx.imageSmoothingEnabled = false;
  uiCtx.imageSmoothingEnabled = true;
}

function flashMessage(msg) {
  pageSub.textContent = msg;
  clearTimeout(flashMessage._t);
  flashMessage._t = setTimeout(() => {
    pageSub.textContent = strictMode
      ? "Strict: tap only regions that match the selected number"
      : "Tap any region to fill";
  }, 1600);
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

// ====== DRAWING ======
function drawOutline() {
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  uiCtx.drawImage(outlineImg, 0, 0);
}

function redrawPaintLayer() {
  const w = paintCanvas.width;
  const h = paintCanvas.height;

  paintCtx.clearRect(0, 0, w, h);

  const idData = idmapCtx.getImageData(0, 0, w, h);
  const out = paintCtx.getImageData(0, 0, w, h);

  const id = idData.data;
  const p = out.data;

  // regionKey -> rgb for fast paint
  const regionRgb = new Map();
  for (const [regionKey, hex] of filled.entries()) {
    regionRgb.set(regionKey, hexToRgb(hex));
  }

  for (let i = 0; i < id.length; i += 4) {
    if (id[i + 3] === 0) continue; // transparent background in idmap
    const key = rgbKey(id[i], id[i + 1], id[i + 2]);
    const fillRgb = regionRgb.get(key);
    if (!fillRgb) continue;

    p[i] = fillRgb.r;
    p[i + 1] = fillRgb.g;
    p[i + 2] = fillRgb.b;
    p[i + 3] = 255;
  }

  paintCtx.putImageData(out, 0, 0);
}

function getRegionKeyAtCanvasPoint(canvasX, canvasY) {
  const w = idmapCanvas.width;
  const h = idmapCanvas.height;

  const x = clamp(Math.floor(canvasX), 0, w - 1);
  const y = clamp(Math.floor(canvasY), 0, h - 1);

  const px = idmapCtx.getImageData(x, y, 1, 1).data;
  if (px[3] === 0) return null;
  return rgbKey(px[0], px[1], px[2]);
}

function canvasPointFromEvent(ev) {
  const rect = uiCanvas.getBoundingClientRect();
  const x01 = (ev.clientX - rect.left) / rect.width;
  const y01 = (ev.clientY - rect.top) / rect.height;
  return { x: x01 * uiCanvas.width, y: y01 * uiCanvas.height };
}

// ====== INTERACTION ======
function handleFillAt(ev) {
  if (ACTIVE_NUMBER == null) {
    flashMessage("Select a number color first.");
    return;
  }

  const pt = canvasPointFromEvent(ev);
  const regionKey = getRegionKeyAtCanvasPoint(pt.x, pt.y);
  if (!regionKey) return;

  // Strict mode only works if we have a region->number mapping.
  if (strictMode) {
    if (!regionToNumber) {
      flashMessage("Strict needs a map.json (region → number). Turn Strict off for now.");
      return;
    }
    const regionNumber = regionToNumber[regionKey];
    if (regionNumber == null) {
      flashMessage("This region has no number mapping.");
      return;
    }
    if (Number(regionNumber) !== Number(ACTIVE_NUMBER)) {
      flashMessage(`Wrong. This region is ${regionNumber}.`);
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
  if (!strictMode) {
    flashMessage("Hint works best in Strict mode (with map.json).");
    return;
  }
  if (!regionToNumber) {
    flashMessage("Add pages/map.json to enable hints + strict checking.");
    return;
  }
  flashMessage(`Selected: ${ACTIVE_NUMBER}`);
}

// ====== PALETTE UI ======
function renderPaletteChips(paletteObj) {
  paletteBar.innerHTML = "";

  paletteObj.colors.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = String(c.n);
    btn.style.background = c.hex;

    btn.addEventListener("click", () => {
      ACTIVE_NUMBER = c.n;
      ACTIVE_COLOR = c.hex;

      document.querySelectorAll("#paletteBar .chip").forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
    });

    paletteBar.appendChild(btn);
  });

  paletteBar.querySelector(".chip")?.click();
}

// ====== INIT ======
async function init() {
  try {
    loadingEl.style.display = "grid";

    // Wire UI
    chkStrict.checked = strictModeDefault;
    strictMode = chkStrict.checked;

    chkStrict.addEventListener("change", () => {
      strictMode = chkStrict.checked;
      flashMessage(strictMode ? "Strict ON" : "Strict OFF");
    });

    btnUndo.addEventListener("click", undo);
    btnReset.addEventListener("click", resetAll);
    btnHint.addEventListener("click", hint);
    btnBack.addEventListener("click", () => history.back());

    // Load palette
    palette = await loadPalette(PAGE.paletteUrl);
    pageTitle.textContent = palette.title || "HueJoy";

    renderPaletteChips(palette);

    // OPTIONAL: if you later add ./pages/map.json, strict mode will start working.
    regionToNumber = await loadJsonIfExists("./pages/map.json");

    // Load images
    outlineImg = await loadImage(PAGE.outlineUrl);
    const idmapImg = await loadImage(PAGE.idmapUrl);

    setCanvasSizeFromImage(outlineImg);

    // Hidden idmap canvas
    idmapCanvas = document.createElement("canvas");
    idmapCanvas.width = outlineImg.naturalWidth;
    idmapCanvas.height = outlineImg.naturalHeight;
    idmapCtx = idmapCanvas.getContext("2d", { willReadFrequently: true });
    idmapCtx.imageSmoothingEnabled = false;
    idmapCtx.drawImage(idmapImg, 0, 0, idmapCanvas.width, idmapCanvas.height);

    // Draw outline
    drawOutline();

    // Load saved progress and render
    loadSavedProgress();
    redrawPaintLayer();

    // Input
    uiCanvas.addEventListener("pointerdown", (ev) => {
      uiCanvas.setPointerCapture(ev.pointerId);
      handleFillAt(ev);
    });

    loadingEl.style.display = "none";
    flashMessage(strictMode ? "Strict: tap correct-number regions" : "Tap any region to fill");
  } catch (err) {
    console.error(err);
    loadingEl.textContent = "Load error. Check paths.";
    alert(String(err.message || err));
  }
}

init();