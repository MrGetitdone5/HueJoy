/***********************
 * DATA (9 categories)
 ***********************/
const CATEGORIES = [
  { id: "disney",   name: "Disney" },
  { id: "mandala",  name: "Mandalas" },
  { id: "cars",     name: "Cars" },
  { id: "pets",     name: "Pets" },
  { id: "fashion",  name: "Fashion" },
  { id: "fantasy",  name: "Fantasy" },
  { id: "sport",    name: "Sport" },
  { id: "love",     name: "Love" },
  { id: "flowers",  name: "Flowers" },
];

// Start with a few pages. Add more by duplicating objects.
const PAGES = [
  // Use your real repo paths inside /pages/
  { id: "p1", title: "Page 1", category: "disney",  file: "pages/IMG_3813.png", isNew: true, tag: "Blend" },
  { id: "p2", title: "Page 2", category: "mandala", file: "pages/IMG_3805.png", isNew: true, tag: "Rare"  },

  // If you uploaded more into pages/, add them here:
  // { id:"p3", title:"Page 3", category:"cars", file:"pages/IMG_3807.png", isNew:false, tag:"" },
];

const LS_INTERESTS = "huejoy_interests_v1";

/***********************
 * NAV / SCREENS
 ***********************/
const screenInterests = document.getElementById("screenInterests");
const screenGallery = document.getElementById("screenGallery");
const screenColor = document.getElementById("screenColor");

function showScreen(name) {
  screenInterests.classList.add("hidden");
  screenGallery.classList.add("hidden");
  screenColor.classList.add("hidden");

  if (name === "interests") screenInterests.classList.remove("hidden");
  if (name === "gallery") screenGallery.classList.remove("hidden");
  if (name === "color") screenColor.classList.remove("hidden");
}

/***********************
 * INTERESTS UI
 ***********************/
const interestGrid = document.getElementById("interestGrid");
const continueBtn = document.getElementById("continueBtn");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");

let selectedInterests = new Set();

function loadInterests() {
  try {
    const raw = localStorage.getItem(LS_INTERESTS);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Set(arr);
  } catch {
    return null;
  }
}

function saveInterests() {
  localStorage.setItem(LS_INTERESTS, JSON.stringify([...selectedInterests]));
}

function updateContinueState() {
  continueBtn.disabled = selectedInterests.size < 3;
}

function renderInterests() {
  interestGrid.innerHTML = "";

  for (const c of CATEGORIES) {
    const card = document.createElement("button");
    card.className = "interestCard" + (selectedInterests.has(c.id) ? " selected" : "");
    card.type = "button";

    const thumb = document.createElement("div");
    thumb.className = "interestThumb";

    const name = document.createElement("div");
    name.className = "interestName";
    name.textContent = c.name;

    card.appendChild(thumb);
    card.appendChild(name);

    card.onclick = () => {
      if (selectedInterests.has(c.id)) selectedInterests.delete(c.id);
      else selectedInterests.add(c.id);
      renderInterests();
      updateContinueState();
    };

    interestGrid.appendChild(card);
  }
}

/***********************
 * GALLERY UI
 ***********************/
const tabsRow = document.getElementById("tabsRow");
const galleryGrid = document.getElementById("galleryGrid");

let activeTab = "all"; // "all" or a category id

function tabsForUser() {
  const base = [{ id: "all", name: "All" }];
  const chosen = CATEGORIES.filter(c => selectedInterests.has(c.id));
  return base.concat(chosen.length ? chosen : CATEGORIES);
}

function renderTabs() {
  tabsRow.innerHTML = "";
  for (const t of tabsForUser()) {
    const btn = document.createElement("button");
    btn.className = "tab" + (activeTab === t.id ? " active" : "");
    btn.type = "button";
    btn.textContent = t.name;
    btn.onclick = () => {
      activeTab = t.id;
      renderTabs();
      renderGallery();
    };
    tabsRow.appendChild(btn);
  }
}

function pagesForTab() {
  if (activeTab === "all") {
    // If user picked interests, show those first; otherwise show all
    if (selectedInterests.size) {
      return PAGES.filter(p => selectedInterests.has(p.category));
    }
    return PAGES;
  }
  return PAGES.filter(p => p.category === activeTab);
}

function renderGallery() {
  galleryGrid.innerHTML = "";
  const list = pagesForTab();

  if (!list.length) {
    galleryGrid.innerHTML = `<p style="grid-column:1/-1;color:#6b6b6b">No pages yet. Upload more PNGs into <b>pages/</b> and add them to the PAGES list in app.js.</p>`;
    return;
  }

  for (const p of list) {
    const card = document.createElement("button");
    card.className = "pageCard";
    card.type = "button";

    const img = document.createElement("img");
    img.className = "pageThumb";
    img.alt = p.title;
    img.src = p.file;

    card.appendChild(img);

    if (p.isNew) {
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = "NEW";
      card.appendChild(b);
    }

    if (p.tag) {
      const t = document.createElement("div");
      t.className = "tag";
      t.textContent = p.tag;
      card.appendChild(t);
    }

    card.onclick = async () => {
      document.getElementById("pageTitle").textContent = p.title;
      await openColorPage(p.file);
    };

    galleryGrid.appendChild(card);
  }
}

/***********************
 * COLORING ENGINE (your existing app, improved)
 ***********************/
const stage = document.getElementById("stage");
const paint = document.getElementById("paint");
const line  = document.getElementById("line");

const pctx = paint.getContext("2d", { willReadFrequently: true });
const lctx = line.getContext("2d",  { willReadFrequently: true });

let tool = "brush";
let color = "#ff0000";
let size = 12;
let drawing = false;

const undoStack = [];
const MAX_UNDO = 20;

let currentPage = null;

function resizeCanvases() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  paint.width = Math.floor(r.width * dpr);
  paint.height = Math.floor(r.height * dpr);
  line.width = paint.width;
  line.height = paint.height;
}

function getPos(e) {
  const r = paint.getBoundingClientRect();
  const sx = paint.width / r.width;
  const sy = paint.height / r.height;
  return {
    x: Math.round((e.clientX - r.left) * sx),
    y: Math.round((e.clientY - r.top) * sy),
  };
}

function pushUndo() {
  const img = pctx.getImageData(0, 0, paint.width, paint.height);
  undoStack.push(img);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  if (undoStack.length < 2) return;
  undoStack.pop();
  pctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
}

function makeWhiteTransparent(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a === 0) continue;
    if (r > 245 && g > 245 && b > 245) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

async function loadOutline(url) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });

  lctx.clearRect(0, 0, line.width, line.height);

  // CONTAIN (no crop), centered
  const cw = line.width, ch = line.height;
  const ir = img.width / img.height;
  const cr = cw / ch;

  let dw, dh, dx, dy;
  if (ir > cr) { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
  else { dh = ch; dw = ch * ir; dy = 0; dx = (cw - dw) / 2; }

  lctx.drawImage(img, dx, dy, dw, dh);
  makeWhiteTransparent(lctx, line.width, line.height);

  pctx.clearRect(0, 0, paint.width, paint.height);
  undoStack.length = 0;
  pushUndo();
}

async function openColorPage(file) {
  currentPage = file;
  showScreen("color");
  resizeCanvases();
  await loadOutline(file);
}

function startDraw(e) {
  drawing = true;
  pctx.beginPath();
  const { x, y } = getPos(e);
  pctx.moveTo(x, y);
}

function moveDraw(e) {
  if (!drawing) return;
  const { x, y } = getPos(e);

  pctx.lineCap = "round";
  pctx.lineJoin = "round";
  pctx.lineWidth = size;

  if (tool === "eraser") {
    pctx.globalCompositeOperation = "destination-out";
    pctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    pctx.globalCompositeOperation = "source-over";
    pctx.strokeStyle = color;
  }

  pctx.lineTo(x, y);
  pctx.stroke();
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  pctx.closePath();
  pushUndo();
}

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
function match(data, i, target) {
  return data[i] === target[0] && data[i+1] === target[1] && data[i+2] === target[2] && data[i+3] === target[3];
}
function setPixel(data, i, rgba) {
  data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3];
}

function isOutlinePixel(l, i) {
  const r = l[i], g = l[i+1], b = l[i+2], a = l[i+3];
  // dark-ish pixel counts as outline wall
  return (a > 10 && (r + g + b) / 3 < 170);
}

function bucketFill(x, y) {
  const w = paint.width, h = paint.height;
  const paintImg = pctx.getImageData(0, 0, w, h);
  const lineImg  = lctx.getImageData(0, 0, w, h);

  const p = paintImg.data;
  const l = lineImg.data;

  const start = (y*w + x);
  const si = start * 4;

  if (isOutlinePixel(l, si)) return;

  const target = [p[si], p[si+1], p[si+2], p[si+3]];
  const fill = hexToRgba(color);
  if (target[0]===fill[0] && target[1]===fill[1] && target[2]===fill[2] && target[3]===fill[3]) return;

  const stack = [[x, y]];
  const seen = new Uint8Array(w*h);

  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx<0 || cy<0 || cx>=w || cy>=h) continue;
    const idx = cy*w + cx;
    if (seen[idx]) continue;
    seen[idx] = 1;

    const i = idx * 4;

    if (isOutlinePixel(l, i)) continue;
    if (!match(p, i, target)) continue;

    setPixel(p, i, fill);
    stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
  }

  pctx.putImageData(paintImg, 0, 0);
  pushUndo();
}

/***********************
 * EVENT WIRING
 ***********************/
paint.addEventListener("pointerdown", (e) => {
  paint.setPointerCapture(e.pointerId);
  if (tool === "bucket") {
    const { x, y } = getPos(e);
    bucketFill(x, y);
  } else {
    startDraw(e);
  }
});
paint.addEventListener("pointermove", moveDraw);
paint.addEventListener("pointerup", endDraw);
paint.addEventListener("pointercancel", endDraw);

document.getElementById("color").oninput = (e) => color = e.target.value;
document.getElementById("size").oninput  = (e) => size = +e.target.value;
document.getElementById("brushBtn").onclick  = () => tool = "brush";
document.getElementById("bucketBtn").onclick = () => tool = "bucket";
document.getElementById("eraserBtn").onclick = () => tool = "eraser";
document.getElementById("undoBtn").onclick = undo;

document.getElementById("saveBtn").onclick = () => {
  const out = document.createElement("canvas");
  out.width = paint.width; out.height = paint.height;
  const o = out.getContext("2d");
  o.drawImage(paint, 0, 0);
  o.drawImage(line, 0, 0);

  const a = document.createElement("a");
  a.href = out.toDataURL("image/png");
  a.download = "HueJoy.png";
  a.click();
};

document.getElementById("upload").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById("pageTitle").textContent = "Uploaded";
  await openColorPage(url);
  URL.revokeObjectURL(url);
};

document.getElementById("backToGalleryBtn").onclick = () => {
  showScreen("gallery");
};

continueBtn.onclick = () => {
  saveInterests();
  activeTab = "all";
  renderTabs();
  renderGallery();
  showScreen("gallery");
};

skipBtn.onclick = () => {
  selectedInterests = new Set(CATEGORIES.map(c => c.id)); // treat as all
  saveInterests();
  activeTab = "all";
  renderTabs();
  renderGallery();
  showScreen("gallery");
};

resetBtn.onclick = () => {
  localStorage.removeItem(LS_INTERESTS);
  selectedInterests = new Set();
  activeTab = "all";
  renderInterests();
  updateContinueState();
  showScreen("interests");
};

/***********************
 * Bottom nav (simple)
 * For now all buttons just go to Gallery except Feed (Gallery) and More (Interests)
 ***********************/
function setActiveNav(id) {
  for (const b of document.querySelectorAll(".navItem")) b.classList.remove("active");
  document.getElementById(id).classList.add("active");
}
document.getElementById("navFeed").onclick = () => { setActiveNav("navFeed"); showScreen("gallery"); };
document.getElementById("navDaily").onclick = () => { setActiveNav("navDaily"); showScreen("gallery"); };
document.getElementById("navLibrary").onclick = () => { setActiveNav("navLibrary"); showScreen("gallery"); };
document.getElementById("navSearch").onclick = () => { setActiveNav("navSearch"); showScreen("gallery"); };
document.getElementById("navMore").onclick = () => { setActiveNav("navMore"); showScreen("interests"); };

/***********************
 * INIT
 ***********************/
(function init() {
  // Load interests or show onboarding
  const saved = loadInterests();
  if (saved && saved.size) {
    selectedInterests = saved;
    activeTab = "all";
    renderTabs();
    renderGallery();
    showScreen("gallery");
  } else {
    renderInterests();
    updateContinueState();
    showScreen("interests");
  }

  // Keep canvas correct on rotation/resizes
  window.addEventListener("resize", async () => {
    if (currentPage) {
      resizeCanvases();
      await loadOutline(currentPage);
    }
  });

  // If you want: auto-open first page after gallery loads
  // (leave off for now)
})();