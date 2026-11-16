// Núcleo de la página: datos, proceso gaussiano, geometría, colores y dibujo.
"use strict";
const D = window.DATOS;
const COL = { frio: "#1f77b4", vecino: "#e67814", ia: "#2ca02c", gris: "#888" };

function decodificar(b64, Tipo) {
  const bin = atob(b64), buf = new ArrayBuffer(bin.length), u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Tipo(buf);
}
const N = D.n;
const CQ = decodificar(D.C, Uint16Array);           // 36 casos × N celdas × 2
const TRI = decodificar(D.tri, Uint16Array);        // ntri × 3
const MEDIA = decodificar(D.media, Float32Array);   // 2N
const MODOS = decodificar(D.modos, Float32Array);   // R × 2N
const R = D.coef[0].length;

const norm = (h, t) => [(h - 0.01) / 0.03, t / 16];

// ---------------- Proceso gaussiano (kernel c·RBF + ruido blanco, y normalizado como sklearn) -------------
function kern(a, b, hp) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = (a[i] - b[i]) / hp.l[i]; s += d * d; }
  return hp.c * Math.exp(-0.5 * s);
}
function cholesky(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * n + j];
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
  }
  return L;
}
function resolverL(L, n, b) {           // L y = b
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  return y;
}
function resolverLt(L, n, b) {          // Lᵀ x = b
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}
function gpAjustar(X, y, hp) {
  const n = X.length;
  const m = y.reduce((a, b) => a + b, 0) / n;
  let s = Math.sqrt(y.reduce((a, b) => a + (b - m) ** 2, 0) / n); if (!(s > 1e-12)) s = 1;
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i * n + j] = kern(X[i], X[j], hp) + (i === j ? hp.w : 0);
  const L = cholesky(K, n);
  const alfa = resolverLt(L, n, resolverL(L, n, y.map(v => (v - m) / s)));
  return { X, L, alfa, m, s, hp, n };
}
function gpPredecir(g, x) {
  const k = g.X.map(xi => kern(xi, x, g.hp));
  let mu = 0; for (let i = 0; i < g.n; i++) mu += k[i] * g.alfa[i];
  const v = resolverL(g.L, g.n, k);
  let var_ = g.hp.c; for (let i = 0; i < g.n; i++) var_ -= v[i] * v[i];
  return [g.m + g.s * mu, g.s * Math.sqrt(Math.max(var_, 0))];
}

const XLIB = D.P.map(([h, t]) => norm(h, t));
const GP_MODOS = D.hip.map((hp, j) => gpAjustar(XLIB, D.coef.map(c => c[j]), hp));
const GP_CL = gpAjustar(XLIB, D.cl, D.hipCl);

// Campo (Ux, Uy) intercalado predicho por POD + GP
function campoIA(h, t) {
  const x = norm(h, t), u = Float32Array.from(MEDIA);
  for (let j = 0; j < R; j++) {
    const a = gpPredecir(GP_MODOS[j], x)[0], off = j * 2 * N;
    for (let i = 0; i < 2 * N; i++) u[i] += a * MODOS[off + i];
  }
  return u;
}
function vecino(h, t) {
  const x = norm(h, t); let best = 0, dmin = Infinity;
  XLIB.forEach((xi, i) => { const d = (xi[0] - x[0]) ** 2 + (xi[1] - x[1]) ** 2; if (d < dmin) { dmin = d; best = i; } });
  return best;
}
function campoCaso(i) {     // reconstrucción exacta con los R modos (≈ el caso resuelto)
  const u = Float32Array.from(MEDIA);
  for (let j = 0; j < R; j++) { const a = D.coef[i][j], off = j * 2 * N; for (let k = 0; k < 2 * N; k++) u[k] += a * MODOS[off + k]; }
  return u;
}
const modulo = u => { const m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = Math.hypot(u[2 * i], u[2 * i + 1]); return m; };

// ---------------- Geometría -------------------------------------------------------------------------------
function centroCaso(i, c) {
  const o = (i * N + c) * 2;
  return [CQ[o] / 65535 * 6 - 2, CQ[o + 1] / 65535 * 1.5];
}
function ubicar(v, grilla) {          // índice y fracción, con extrapolación lineal en los bordes
  let k = 0; while (k < grilla.length - 2 && v > grilla[k + 1]) k++;
  return [k, (v - grilla[k]) / (grilla[k + 1] - grilla[k])];
}
function centros(h, t) {              // interpolación bilineal de los centros de celda entre casos de la grilla
  const [ih, fh] = ubicar(h, D.HS), [it, ft] = ubicar(t, D.TS), nt = D.TS.length;
  const id = (a, b) => a * nt + b;
  const w = [[id(ih, it), (1 - fh) * (1 - ft)], [id(ih + 1, it), fh * (1 - ft)], [id(ih, it + 1), (1 - fh) * ft], [id(ih + 1, it + 1), fh * ft]];
  const xy = new Float32Array(2 * N);
  for (let c = 0; c < N; c++) {
    let x = 0, y = 0;
    for (const [i, p] of w) { const q = centroCaso(i, c); x += p * q[0]; y += p * q[1]; }
    xy[2 * c] = x; xy[2 * c + 1] = Math.max(y, 0);
  }
  return xy;
}
function cuerpo(h, th) {              // mismo polígono que generar_caso.py
  const Hb = 0.2, xd = 0.7, L = 1, rad = Math.PI / 180;
  const yr = h + (L - xd) * Math.tan(th * rad), ytr = h + Hb - (L - xd) * Math.tan(15 * rad);
  const p = [];
  for (let k = 0; k < 40; k++) { const a = -Math.PI / 2 + Math.PI * k / 39; p.push([-0.1 * Math.cos(a), h + Hb / 2 + 0.1 * Math.sin(a)]); }
  return p.concat([[0, h + Hb], [xd, h + Hb], [L, ytr], [L, yr], [xd, h], [0, h]]);
}
function adentro(pol, x, y) {
  let s = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s;
  }
  return s;
}

// ---------------- Colores ---------------------------------------------------------------------------------
function turbo(x) {
  x = Math.min(1, Math.max(0, x));
  const r = 0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
  const b = 0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
  const c = v => Math.round(255 * Math.min(1, Math.max(0, v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
const RDBU = [[103, 0, 31], [214, 96, 77], [247, 247, 247], [67, 147, 195], [5, 48, 97]];
function rdbu(v, lo = -0.5, hi = 0.65) {   // centrado en 0: negativo (carga) rojo, positivo azul
  let x = v < 0 ? 0.5 * (1 - v / lo) : 0.5 + 0.5 * v / hi;
  x = Math.min(1, Math.max(0, x)) * 4;
  const k = Math.min(3, Math.floor(x)), f = x - k, a = RDBU[k], b = RDBU[k + 1];
  return `rgb(${a.map((c, i) => Math.round(c + f * (b[i] - c))).join(",")})`;
}

// ---------------- Lienzos ---------------------------------------------------------------------------------
function lienzo(cv, alto) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth;
  cv.width = w * dpr; cv.height = alto * dpr; cv.style.height = alto + "px";
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, w, alto];
}
function dibujarCampo(cv, xy, mag, h, th, vista = { x0: -0.25, x1: 2.0, y0: 0, y1: 0.42 }) {
  const ancho = cv.clientWidth, esc = ancho / (vista.x1 - vista.x0), alto = Math.round((vista.y1 - vista.y0) * esc);
  const [ctx] = lienzo(cv, alto);
  const X = x => (x - vista.x0) * esc, Y = y => alto - (y - vista.y0) * esc;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, ancho, alto);
  const pol = cuerpo(h, th);
  ctx.lineWidth = 0.6;
  for (let k = 0; k < D.ntri; k++) {
    const a = TRI[3 * k], b = TRI[3 * k + 1], c = TRI[3 * k + 2];
    const cx = (xy[2 * a] + xy[2 * b] + xy[2 * c]) / 3, cy = (xy[2 * a + 1] + xy[2 * b + 1] + xy[2 * c + 1]) / 3;
    if (cx < vista.x0 - 0.1 || cx > vista.x1 + 0.1 || cy > vista.y1 + 0.1) continue;
    if (adentro(pol, cx, cy)) continue;
    const col = turbo((mag[a] + mag[b] + mag[c]) / 90);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(X(xy[2 * a]), Y(xy[2 * a + 1])); ctx.lineTo(X(xy[2 * b]), Y(xy[2 * b + 1])); ctx.lineTo(X(xy[2 * c]), Y(xy[2 * c + 1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = "#ddd"; ctx.strokeStyle = "#222"; ctx.lineWidth = 1.2;
  ctx.beginPath(); pol.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#555"; ctx.fillRect(0, alto - 3, ancho, 3);
}
function barraColor(cv, titulo, f = turbo, lo = 0, hi = 30) {
  const [ctx, w] = lienzo(cv, 34);
  for (let i = 0; i < w - 80; i++) { ctx.fillStyle = f(i / (w - 80)); ctx.fillRect(40 + i, 2, 1, 12); }
  ctx.fillStyle = "#333"; ctx.font = "12px system-ui"; ctx.textAlign = "center";
  ctx.fillText(lo, 40, 28); ctx.fillText(hi, w - 40, 28); ctx.fillText(titulo, w / 2, 28);
}

// Ejes simples para gráficos de línea
function ejes(ctx, w, hgt, m, xr, yr, xl, yl) {
  const X = x => m.l + (x - xr[0]) / (xr[1] - xr[0]) * (w - m.l - m.r);
  const Y = y => hgt - m.b - (y - yr[0]) / (yr[1] - yr[0]) * (hgt - m.t - m.b);
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, hgt - m.b); ctx.lineTo(w - m.r, hgt - m.b); ctx.stroke();
  ctx.fillStyle = "#444"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
  ctx.fillText(xl, (m.l + w - m.r) / 2, hgt - 6);
  ctx.save(); ctx.translate(14, (m.t + hgt - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yl, 0, 0); ctx.restore();
  return [X, Y];
}
function marcas(ctx, X, Y, xs, ys, w, hgt, m) {
  ctx.fillStyle = "#666"; ctx.font = "11px system-ui";
  ctx.textAlign = "center"; xs.forEach(x => ctx.fillText(x, X(x), hgt - m.b + 14));
  ctx.textAlign = "right"; ys.forEach(y => ctx.fillText(y, m.l - 5, Y(y) + 4));
  ctx.strokeStyle = "#eee"; ys.forEach(y => { ctx.beginPath(); ctx.moveTo(m.l + 1, Y(y)); ctx.lineTo(w - m.r, Y(y)); ctx.stroke(); });
}
const fmt = (v, d = 3) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
