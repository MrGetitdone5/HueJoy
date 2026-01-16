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

// Set your first page here (must exist in your repo)
let currentPage = "pages/IMG_3813.png"; // <-- change if you want a different file

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

// Turns white background in the outline image into transparent pixels (so paint shows through)
function makeWhiteTransparent(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a === 0) continue;

    // near-white -> transparent
    if (r > 245 && g > 245 && b > 245) {
      d[i + 3] = 0;
    }
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

  // Draw outline as "CONTAIN" (no cropping), centered
  const cw = line.width, ch = line.height;
  const ir = img.width / img.height;
  const cr = cw / ch;

  let dw, dh, dx, dy;
  if (ir > cr) { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
  else { dh = ch; dw = ch * ir; dy = 0; dx = (cw - dw) / 2; }

  lctx.drawImage(img, dx, dy, dw, dh);

  // KEY FIX: remove white background so your paint is visible
  makeWhiteTransparent(lctx, line.width, line.height);

  // Clear paint layer for the new outline
  pctx.clearRect(0, 0, paint.width, paint.height);
  undoStack.length = 0;
  pushUndo();
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

function bucketFill(x, y) {
  const w = paint.width, h = paint.height;
  const paintImg = pctx.getImageData(0, 0, w, h);
  const lineImg  = lctx.getImageData(0, 0, w, h);

  const p = paintImg.data;
  const l = lineImg.data;

  const start = (y*w + x);
  const si = start * 4;

  // Don't fill on the outline
  const lr = l[si], lg = l[si+1], lb = l[si+2], la = l[si+3];
  const tappedOnLine = (la > 20 && lr < 80 && lg < 80 && lb < 80);
  if (tappedOnLine) return;

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

    // Stop at outline pixels
    const r = l[i], g = l[i+1], b = l[i+2], a = l[i+3];
    const isLine = (a > 20 && r < 80 && g < 80 && b < 80);
    if (isLine) continue;

    if (!match(p, i, target)) continue;

    setPixel(p, i, fill);
    stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
  }

  pctx.putImageData(paintImg, 0, 0);
  pushUndo();
}

// Pointer events (touch + Apple Pencil friendly)
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

// UI controls
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
  currentPage = url; // local upload preview
  await loadOutline(url);
  URL.revokeObjectURL(url);
};

(async function init() {
  resizeCanvases();
  await loadOutline(currentPage);
})();

window.addEventListener("resize", async () => {
  resizeCanvases();
  await loadOutline(currentPage);
});