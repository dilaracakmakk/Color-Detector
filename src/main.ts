const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const drop = $("#drop");
const fileInput = $("#file") as HTMLInputElement;
const stepInput = $("#step") as HTMLInputElement;
const topnInput = $("#topn") as HTMLInputElement;
const kInput = $("#k") as HTMLInputElement;
const analyzeBtn = $("#analyze") as HTMLButtonElement;
const downloadCsvBtn = $("#downloadCsv") as HTMLButtonElement;
const quantizeBtn = $("#quantize") as HTMLButtonElement;
const exportGplBtn = $("#exportGpl") as HTMLButtonElement;
const meta = $("#meta");
const grid = $("#grid");
const preview = $("#preview") as HTMLImageElement;
const cv = $("#cv") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;

// === Bölgesel analiz kontrolleri ===
const regionMode = document.getElementById("regionMode") as HTMLInputElement;
const clearRegionBtn = document.getElementById("clearRegion") as HTMLButtonElement;


const cvdSel=document.getElementById("cvd") as HTMLSelectElement;
const applyCvdBtn=document.getElementById("applyCvd") as HTMLButtonElement;
const resetCvdBtn=document.getElementById("resetCvd") as HTMLButtonElement;

 // --- Bölgesel analiz state ---
let selecting = false;
let selStart: { x: number; y: number } | null = null;
let selRect:  { x: number; y: number; w: number; h: number } | null = null;

let originalImageData: ImageData | null = null;

type Row = { hex: string; r: number; g: number; b: number; count: number; ratio: number; };

let loadedImg: HTMLImageElement | null = null;
let lastAllRows: Row[] | null = null;
let lastQuantized: Row[] | null = null;

const MAX_DIM = 1600;

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();

const roundStep = (v: number, s: number) => Math.min(255, Math.round(v / s) * s);

function setCanvasFromImage(img: HTMLImageElement) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  cv.width = w; cv.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

function render(rows: Row[]) {
  grid.innerHTML = "";
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "item";
    const sw = document.createElement("div");
    sw.className = "sw"; sw.style.background = r.hex; sw.title = "Kopyala";
    sw.addEventListener("click", () => copyHex(r.hex));
    const label = document.createElement("div");
    label.innerHTML = `<b>${r.hex}</b> <span class="muted">• ${(r.ratio*100).toFixed(2)}% • ${r.count} px</span>`;
    div.appendChild(sw); div.appendChild(label);
    grid.appendChild(div);
  }
}

async function copyHex(hex: string) {
  try { await navigator.clipboard.writeText(hex); meta.textContent = `${hex} kopyalandı`; }
  catch { meta.textContent = `Kopyalama başarısız`; }
}

function analyze(step = 1, topN = 100) {
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  const total = width * height;
  const s = Math.max(1, Number(step) || 1);
  const map = new Map<number, number>(); // key = int rgb, val = count

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 0) continue;
    if (s > 1) { r = roundStep(r, s); g = roundStep(g, s); b = roundStep(b, s); }
    const key = (r << 16) | (g << 8) | b;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const rows: Row[] = [];
  for (const [key, count] of map.entries()) {
    const r = (key >> 16) & 255, g = (key >> 8) & 255, b = key & 255;
    rows.push({ hex: toHex(r, g, b), r, g, b, count, ratio: count / total });
  }
  rows.sort((a, b) => b.count - a.count);

  lastAllRows = rows;
  render(rows.slice(0, Math.min(topN, rows.length)));
  meta.textContent = `Piksel: ${total.toLocaleString('tr-TR')} • Benzersiz: ${rows.length.toLocaleString('tr-TR')} • Hassasiyet:${s}`;
  downloadCsvBtn.disabled = rows.length === 0;
  exportGplBtn.disabled = true;
}

// === Bölgesel analiz: yardımcılar ===
function getMousePos(e: MouseEvent) {
  const r = cv.getBoundingClientRect();
  const x = Math.round((e.clientX - r.left) * (cv.width / r.width));
  const y = Math.round((e.clientY - r.top)  * (cv.height / r.height));
  return { x, y };
}

function drawSelection() {
  if (!selRect) return;
  const { x, y, w, h } = selRect;
  ctx.save();
  ctx.strokeStyle = "#2563EB";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

// === Bölgesel analiz: sadece seçili dikdörtgeni işle ===
function analyzeRegion(step = 1, topN = 100) {
  if (!selRect) { meta.textContent = "Önce bir bölge seçin."; return; }
  const { x, y, w, h } = selRect;
  if (w < 2 || h < 2) { meta.textContent = "Seçim çok küçük."; return; }

  const { data } = ctx.getImageData(x, y, w, h);
  const total = w * h;
  const s = Math.max(1, Number(step) || 1);
  const map = new Map<number, number>();

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a === 0) continue;
    if (s > 1) { r = roundStep(r, s); g = roundStep(g, s); b = roundStep(b, s); }
    const key = (r << 16) | (g << 8) | b;
    map.set(key, (map.get(key) || 0) + 1);
  }

  const rows: Row[] = [];
  for (const [key, count] of map.entries()) {
    const r = (key >> 16) & 255, g = (key >> 8) & 255, b = key & 255;
    rows.push({ hex: toHex(r, g, b), r, g, b, count, ratio: count / total });
  }
  rows.sort((a, b) => b.count - a.count);

  lastAllRows = rows;
  render(rows.slice(0, Math.min(topN, rows.length)));
  meta.textContent = `Bölge: ${w}×${h} • Benzersiz: ${rows.length.toLocaleString('tr-TR')} • Hassasiyet:${s}`;
  downloadCsvBtn.disabled = rows.length === 0;
}


const CVD_MATS: Record<"protan"|"deutan"|"tritan", number[][]> = {
  protan: [
    [0.56667, 0.43333, 0.00000],
    [0.55833, 0.44167, 0.00000],
    [0.00000, 0.24167, 0.75833],
  ],
  deutan: [
    [0.62500, 0.37500, 0.00000],
    [0.70000, 0.30000, 0.00000],
    [0.00000, 0.30000, 0.70000],
  ],
  tritan: [
    [0.95000, 0.05000, 0.00000],
    [0.00000, 0.43333, 0.56667],
    [0.00000, 0.47500, 0.52500],
  ],
};

function applyCvd(type: "protan"|"deutan"|"tritan") {
  if (!loadedImg) return;

  if (!originalImageData) originalImageData = ctx.getImageData(0, 0, cv.width, cv.height);

  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const data = img.data;
  const M = CVD_MATS[type];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const rn = M[0][0]*r + M[0][1]*g + M[0][2]*b;
    const gn = M[1][0]*r + M[1][1]*g + M[1][2]*b;
    const bn = M[2][0]*r + M[2][1]*g + M[2][2]*b;
    data[i]   = Math.max(0, Math.min(255, Math.round(rn)));
    data[i+1] = Math.max(0, Math.min(255, Math.round(gn)));
    data[i+2] = Math.max(0, Math.min(255, Math.round(bn)));
  }
  ctx.putImageData(img, 0, 0);
}

function resetCvd() {
  if (originalImageData) {
    ctx.putImageData(originalImageData, 0, 0);
    originalImageData = null;
  } else if (loadedImg) {
    ctx.drawImage(loadedImg, 0, 0, cv.width, cv.height);
  }
}




function downloadCSV(rows: Row[], filename: string) {
  const header = "hex,r,g,b,count,ratio\n";
  const body = rows.map(r => `${r.hex},${r.r},${r.g},${r.b},${r.count},${r.ratio.toFixed(6)}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportGPL(rows: Row[], name = "palette") {
  const lines = [
    "GIMP Palette",
    `Name: ${name}`,
    "Columns: 0",
    "# R G B  Name"
  ];
  rows.forEach(r => lines.push(`${r.r} ${r.g} ${r.b}\t${r.hex}`));
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${name}.gpl`; a.click();
  URL.revokeObjectURL(url);
}

function kmeansQuantize(k = 16, sampleStride = 5, iters = 8): Row[] {
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  const samples: [number, number, number][] = [];
  for (let y = 0; y < height; y += sampleStride) {
    for (let x = 0; x < width; x += sampleStride) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]; if (a === 0) continue;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!samples.length) return [];

  // init centroids
  const centroids: [number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    const s = samples[(Math.random() * samples.length) | 0];
    centroids.push([s[0], s[1], s[2]]);
  }

  const assign = new Array<number>(samples.length).fill(0);
  const dist2 = (a: [number, number, number], b: [number, number, number]) => {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  };

  for (let it = 0; it < iters; it++) {
    // assignment
    for (let i = 0; i < samples.length; i++) {
      let best = 0, bestd = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(samples[i], centroids[c]);
        if (d < bestd) { bestd = d; best = c; }
      }
      assign[i] = best;
    }
    // recompute
    const sum: [number, number, number, number][] = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const a = assign[i], s = samples[i];
      sum[a][0] += s[0]; sum[a][1] += s[1]; sum[a][2] += s[2]; sum[a][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sum[c][3] > 0) {
        centroids[c][0] = Math.round(sum[c][0] / sum[c][3]);
        centroids[c][1] = Math.round(sum[c][1] / sum[c][3]);
        centroids[c][2] = Math.round(sum[c][2] / sum[c][3]);
      } else {
        const s = samples[(Math.random() * samples.length) | 0];
        centroids[c] = [s[0], s[1], s[2]];
      }
    }
  }

  const counts = new Array<number>(k).fill(0);
  for (const a of assign) counts[a]++;

  const rows: Row[] = centroids.map((c, i) => ({
    hex: toHex(c[0], c[1], c[2]),
    r: c[0], g: c[1], b: c[2],
    count: counts[i],
    ratio: counts[i] / (samples.length || 1)
  })).sort((a, b) => b.count - a.count);

  return rows;
}

/*** UI bindings ***/
function handleFiles(files: FileList | null) {
  const f = files?.[0]; if (!f) return;
  const img = new Image();
  img.src = URL.createObjectURL(f);
  img.onload = () => {
    loadedImg = img;
    preview.src = img.src; preview.style.display = "block";
    setCanvasFromImage(img);
    meta.textContent = `Yüklendi: ${f.name} (${img.width}×${img.height})`;
    grid.innerHTML = ""; lastAllRows = null; lastQuantized = null;
    downloadCsvBtn.disabled = true; exportGplBtn.disabled = true;
  
    selRect = null;
    originalImageData = null;
  };

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", e => { e.preventDefault(); (drop as HTMLElement).style.background = "#fafafa"; });
drop.addEventListener("dragleave", () => (drop as HTMLElement).style.background = "");
drop.addEventListener("drop", e => { e.preventDefault(); (drop as HTMLElement).style.background = ""; handleFiles(e.dataTransfer?.files || null); });
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

// === Canvas event'leri: bölge seçimi ===
cv.addEventListener("mousedown", (e) => {
  if (!regionMode?.checked) return;
  selecting = true;
  selStart = getMousePos(e);
  selRect  = { x: selStart.x, y: selStart.y, w: 0, h: 0 };
});

cv.addEventListener("mousemove", (e) => {
  if (!regionMode?.checked || !selecting || !selStart || !loadedImg) return;
  const pos = getMousePos(e);
  selRect = {
    x: Math.min(selStart.x, pos.x),
    y: Math.min(selStart.y, pos.y),
    w: Math.abs(pos.x - selStart.x),
    h: Math.abs(pos.y - selStart.y),
  };
  // resmi yeniden çiz + seçim overlay
  ctx.drawImage(loadedImg, 0, 0, cv.width, cv.height);
  drawSelection();
});

cv.addEventListener("mouseup", () => {
  selecting = false;
});

clearRegionBtn?.addEventListener("click", () => {
  selRect = null;
  if (loadedImg) ctx.drawImage(loadedImg, 0, 0, cv.width, cv.height);
});

// === Analyze: bölge modu destekli ===
analyzeBtn.addEventListener("click", () => {
  if (!loadedImg) { meta.textContent = "Önce görsel seçin."; return; }
  const step = Number(stepInput.value || 1);
  const topN = Number(topnInput.value || 100);
  if (regionMode?.checked && selRect) analyzeRegion(step, topN);
  else analyze(step, topN);
});

downloadCsvBtn.addEventListener("click", () => {
  if (!lastAllRows) return;
  downloadCSV(lastAllRows, "colors_all.csv");
});
quantizeBtn.addEventListener("click", () => {
  if (!loadedImg) { meta.textContent = "Önce görsel seçin."; return; }
  const rows = kmeansQuantize(Number(kInput.value || 16), 5, 8);
  lastQuantized = rows; exportGplBtn.disabled = rows.length === 0;
  render(rows); meta.textContent = `Quantize K=${kInput.value} (örneklem)`;
});
exportGplBtn.addEventListener("click", () => {
  if (!lastQuantized) return;
  exportGPL(lastQuantized, `palette_K${kInput.value}`);
});

applyCvdBtn?.addEventListener("click", () => {
  const v = (cvdSel?.value || "none") as "none"|"protan"|"deutan"|"tritan";
  if (v === "none") resetCvd();
  else applyCvd(v);
});

resetCvdBtn?.addEventListener("click", resetCvd);}
