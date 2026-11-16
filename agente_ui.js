// Interfaz del agente: árbol de archivos, hilo de mensajes, herramientas, visor de malla y campo.
"use strict";
const $ = id => document.getElementById(id);
const UI = {};
let saltando = false;
const espera = ms => saltando ? Promise.resolve() : new Promise(r => setTimeout(r, ms / +$("vel").value));
$("saltar").onclick = () => { saltando = true; };

// ---------------- Árbol de archivos ----------------
const ARCH = {};            // ruta -> contenido
function dibujarArbol(nuevo) {
  const raiz = Object.keys(ARCH).sort(), caja = $("arbol"); caja.innerHTML = "";
  const dirs = new Set();
  raiz.forEach(r => { const p = r.split("/"); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join("/")); });
  const items = [...new Set([...dirs, ...raiz])].sort();
  items.forEach(r => {
    const d = document.createElement("div"), prof = r.split("/").length - 1, esDir = dirs.has(r) && !(r in ARCH);
    d.textContent = (esDir ? "▾ " : "  ") + r.split("/").pop() + (esDir ? "/" : "");
    d.style.paddingLeft = 4 + 14 * prof + "px";
    d.className = esDir ? "dir" : ""; if (r === nuevo) d.classList.add("nuevo");
    if (!esDir) d.onclick = () => abrirArchivo(r);
    caja.appendChild(d);
  });
}
UI.crear = (ruta, txt) => { ARCH[ruta] = txt; dibujarArbol(ruta); };
UI.carpeta = ruta => { ARCH[ruta + "/.keep"] = null; delete ARCH[ruta + "/.keep"]; DIRS_VACIOS.add(ruta); dibujarCarpetas(); };
const DIRS_VACIOS = new Set();
function dibujarCarpetas() {
  dibujarArbol();
  const caja = $("arbol");
  DIRS_VACIOS.forEach(r => {
    if ([...caja.children].some(d => d.textContent.trim() === "▾ " + r.split("/").pop() + "/")) return;
    const d = document.createElement("div"); d.className = "dir nuevo";
    d.textContent = "▾ " + r.split("/").pop() + "/"; d.style.paddingLeft = 4 + 14 * (r.split("/").length - 1) + "px"; caja.appendChild(d);
  });
}
function abrirArchivo(r, marcar = /^(h|theta)\s/) {
  pestana("archivo");
  $("arch-nombre").textContent = r;
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  $("arch").innerHTML = ARCH[r].split("\n").map(l => marcar && marcar.test(l) ? `<span class="marca">${esc(l)}</span>` : esc(l)).join("\n");
  [...$("arbol").children].forEach(d => d.classList.toggle("sel", d.textContent.trim() === r.split("/").pop()));
}
UI.abrir = abrirArchivo;

// ---------------- Hilo ----------------
const hilo = $("hilo");
const abajo = () => { hilo.scrollTop = hilo.scrollHeight; };
UI.usuario = txt => { const d = document.createElement("div"); d.className = "msg usuario"; d.textContent = txt; hilo.appendChild(d); abajo(); };
UI.agente = async txt => {
  const d = document.createElement("div"); d.className = "msg agente"; hilo.appendChild(d);
  const palabras = txt.split(" ");
  for (let i = 0; i < palabras.length; i++) { d.innerHTML = palabras.slice(0, i + 1).join(" "); abajo(); await espera(28); }
  d.innerHTML = txt; abajo();
};
UI.tool = async (nombre, arg, lineas = [], clase = "") => {
  const d = document.createElement("div"); d.className = "tool " + clase;
  d.innerHTML = `<div class="cab"><b>${nombre}</b>(${arg})</div>`; hilo.appendChild(d); abajo();
  await espera(350);
  if (!lineas.length) return d;
  const pre = document.createElement("pre"); d.appendChild(pre);
  for (let i = 0; i < lineas.length; i++) { pre.innerHTML += lineas[i] + "\n"; if (i % 2 === 0) { abajo(); await espera(55); } }
  abajo(); return d;
};
UI.tabla = (cab, filas) => {
  const t = document.createElement("table"); t.className = "tabla";
  t.innerHTML = `<tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr>` + filas.map(f => `<tr>${f.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
  hilo.appendChild(t); abajo();
};
UI.aprobar = (si, no) => new Promise(res => {
  const d = document.createElement("div"); d.className = "aprobar";
  d.innerHTML = `<button class="si">${si}</button><button>${no}</button>`; hilo.appendChild(d); abajo();
  const fin = v => { d.querySelectorAll("button").forEach(b => b.disabled = true); res(v); };
  d.children[0].onclick = () => fin(true); d.children[1].onclick = () => fin(false);
  if (saltando) fin(true);
});
UI.check = (txt, clase = "ok") => { const li = document.createElement("li"); li.className = clase; li.textContent = txt; $("checks").appendChild(li); };
UI.curvaCl = async (hist, final) => {         // Cl contra iteración, animado
  const cv = document.createElement("canvas"); cv.className = "cl"; hilo.lastChild.appendChild(cv); abajo();
  for (let n = 10; n <= hist.length; n += 10) {
    const [ctx, w, hg] = lienzo(cv, 150), m = { l: 40, r: 8, t: 8, b: 26 };
    ctx.fillStyle = "#1b1e25"; ctx.fillRect(0, 0, w, hg);
    const X = i => m.l + i / hist.length * (w - m.l - m.r), Y = v => m.t + (0.7 - v) / 1.9 * (hg - m.t - m.b);
    ctx.strokeStyle = "#3a4050"; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, hg - m.b); ctx.lineTo(w - m.r, hg - m.b); ctx.stroke();
    ctx.fillStyle = "#8b93a3"; ctx.font = "11px Consolas"; ctx.fillText("Cl", 6, 14); ctx.fillText("iteración " + n, w - 100, hg - 8);
    ctx.fillText("0", 26, Y(0) + 4); ctx.strokeStyle = "#2c313c"; ctx.beginPath(); ctx.moveTo(m.l, Y(0)); ctx.lineTo(w - m.r, Y(0)); ctx.stroke();
    ctx.strokeStyle = "#d97757"; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < n; i++) i ? ctx.lineTo(X(i), Y(hist[i])) : ctx.moveTo(X(0), Y(hist[0]));
    ctx.stroke();
    if (n === hist.length) { ctx.fillStyle = "#5fb760"; ctx.font = "bold 12px Consolas"; ctx.fillText(`Cl = ${fmt(final, 3)}`, w - 110, Y(final) - 8); }
    await espera(45);
  }
};

// ---------------- Visor ----------------
const NP = AG.np, PQ = decodificar(AG.pts, Uint16Array), QD = decodificar(AG.quads, Uint16Array);
const VISTAS = { todo: { x0: -2, x1: 4, y0: 0, y1: 1.5 }, cuerpo: { x0: -0.25, x1: 2.0, y0: 0, y1: 0.42 }, difusor: { x0: 0.5, x1: 1.35, y0: 0, y1: 0.16 } };
const V = { h: 0.02, t: 4, modo: "geo", zoom: "cuerpo", campo: null, listo: false, real: null };
function puntosMalla(h, t) {
  const [ih, fh] = ubicar(h, D.HS), [it, ft] = ubicar(t, D.TS), nt = D.TS.length, id = (a, b) => a * nt + b;
  const w = [[id(ih, it), (1 - fh) * (1 - ft)], [id(ih + 1, it), fh * (1 - ft)], [id(ih, it + 1), (1 - fh) * ft], [id(ih + 1, it + 1), fh * ft]];
  const xy = new Float32Array(2 * NP);
  for (let p = 0; p < NP; p++) {
    let x = 0, y = 0;
    for (const [c, f] of w) { const o = (c * NP + p) * 2; x += f * (PQ[o] / 65535 * 6 - 2); y += f * (PQ[o + 1] / 65535 * 1.5); }
    xy[2 * p] = x; xy[2 * p + 1] = Math.max(0, y);
  }
  return xy;
}
function dibujarVisor() {
  const cv = $("cv"), vs = VISTAS[V.zoom], ancho = cv.clientWidth;
  const esc = Math.min(ancho / (vs.x1 - vs.x0), 420 / (vs.y1 - vs.y0)), alto = Math.round((vs.y1 - vs.y0) * esc);
  const [ctx] = lienzo(cv, alto), X = x => (x - vs.x0) * esc, Y = y => alto - (y - vs.y0) * esc;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, ancho, alto);
  const pol = cuerpo(V.h, V.t);
  if (V.listo && V.modo !== "geo") {
    const xy = puntosMalla(V.h, V.t), mag = V.modo === "campo" && V.campo ? modulo(V.campo) : null;
    ctx.lineWidth = V.modo === "malla" ? 0.5 : 0.6;
    for (let c = 0; c < QD.length / 4; c++) {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const p = QD[4 * c + k]; k ? ctx.lineTo(X(xy[2 * p]), Y(xy[2 * p + 1])) : ctx.moveTo(X(xy[2 * p]), Y(xy[2 * p + 1])); }
      ctx.closePath();
      if (mag) { const col = turbo(mag[c] / 30); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.fill(); ctx.stroke(); }
      else { ctx.strokeStyle = "rgba(30,50,90,.55)"; ctx.stroke(); }
    }
  }
  ctx.fillStyle = "#d9d9d9"; ctx.strokeStyle = "#111"; ctx.lineWidth = 1.3;
  ctx.beginPath(); pol.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#555"; ctx.fillRect(0, alto - 3, ancho, 3);
  ctx.fillStyle = "#b22"; ctx.strokeStyle = "#b22"; ctx.font = "13px system-ui"; ctx.lineWidth = 1.5;
  if (V.zoom !== "todo") {
    const xh = 0.35; ctx.beginPath(); ctx.moveTo(X(xh), Y(0)); ctx.lineTo(X(xh), Y(V.h)); ctx.stroke();
    ctx.fillText(`h = ${(V.h * 1000).toFixed(0)} mm`, X(xh) + 5, Y(V.h / 2) + 4);
    ctx.fillText(`θ = ${V.t}°`, X(1.0) + 6, Y(V.h + 0.3 * Math.tan(V.t * Math.PI / 180)) + 4);
  }
  if (!V.listo) { ctx.fillStyle = "#666"; ctx.font = "14px system-ui"; ctx.fillText("Todavía no hay malla: el agente no corrió blockMesh.", 12, 20); }
  $("leyenda").textContent = V.modo === "malla" ? "Malla de blockMesh: 6090 celdas, la misma topología para cualquier h y θ."
    : V.modo === "campo" ? (V.campo ? "|U| de 0 (azul) a 30 m/s (rojo). " + (V.real ? "Resultado de la corrida." : "Predicción de la IA, sin correr OpenFOAM.") : "Sin campo todavía: falta correr simpleFoam.")
    : "Geometría del blockMeshDict.";
}
UI.visor = (cambios = {}) => { Object.assign(V, cambios); dibujarVisor(); };
UI.V = V;
document.querySelectorAll("#modo button").forEach(b => b.onclick = () => { document.querySelectorAll("#modo button").forEach(x => x.classList.toggle("activa", x === b)); V.modo = b.dataset.m; dibujarVisor(); });
document.querySelectorAll("#zoom button").forEach(b => b.onclick = () => { document.querySelectorAll("#zoom button").forEach(x => x.classList.toggle("activa", x === b)); V.zoom = b.dataset.z; dibujarVisor(); });
UI.modo = m => document.querySelector(`#modo button[data-m=${m}]`).click();
function pestana(p) {
  document.querySelectorAll(".pestanas button").forEach(b => b.classList.toggle("activa", b.dataset.p === p));
  $("p-vista").classList.toggle("oculto", p !== "vista"); $("p-archivo").classList.toggle("oculto", p !== "archivo");
  if (p === "vista") dibujarVisor();
}
UI.pestana = pestana;
document.querySelectorAll(".pestanas button").forEach(b => b.onclick = () => pestana(b.dataset.p));
window.addEventListener("resize", dibujarVisor);
UI.estado = html => { $("estado").innerHTML = html; };
UI.esperar = espera;
dibujarVisor();
