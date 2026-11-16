// Secciones 1 a 3: ajuste, sustituto y juego humano contra IA.
"use strict";
const $ = id => document.getElementById(id);

// ---------- Esquema del caso (h = 30 mm, θ = 8°, exagerados para que se vean) ----------
$("esq").setAttribute("d", "M" + cuerpo(0.04, 10).map(([x, y]) => `${x},${(0.34 - y).toFixed(4)}`).join(" L") + " Z");

// =============================== 1. Aprender es ajustar ===============================
(function () {
  const selH = $("aj-h"), selM = $("aj-modelo"), gr = $("aj-grado"), cv = $("aj-cv");
  D.HS.forEach(h => selH.add(new Option(`${h * 1000} mm`, h)));
  selH.value = 0.02;
  let entren = {};                                     // θ -> true (entrenamiento) / false (prueba)
  const reiniciar = () => { entren = {}; D.TS.forEach(t => entren[t] = t % 4 === 0); };
  reiniciar();
  let puntos = [], Xpx, Ypx;

  function ajustePoli(xs, ys, g) {                     // mínimos cuadrados en t = θ/16, con regularización mínima
    const n = g + 1, A = Array.from({ length: n }, () => new Float64Array(n + 1));
    xs.forEach((x, k) => {
      const p = Array.from({ length: n }, (_, i) => Math.pow(x / 16, i));
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] += p[i] * p[j]; A[i][n] += p[i] * ys[k]; }
    });
    for (let i = 0; i < n; i++) A[i][i] += 1e-10;
    for (let i = 0; i < n; i++) {                      // eliminación de Gauss con pivoteo
      let mx = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[mx][i])) mx = r;
      [A[i], A[mx]] = [A[mx], A[i]];
      for (let r = 0; r < n; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c]; }
    }
    const c = A.map((f, i) => f[n] / f[i]);
    return x => [c.reduce((s, ci, i) => s + ci * Math.pow(x / 16, i), 0), 0];
  }
  function ajusteGP(xs, ys) {
    const hp = { c: D.hipCl.c, l: [D.hipCl.l[1]], w: D.hipCl.w };
    const g = gpAjustar(xs.map(x => [x / 16]), ys, hp);
    return x => gpPredecir(g, [x / 16]);
  }

  function dibujar() {
    const h = +selH.value, gp = selM.value === "gp";
    $("aj-grado-l").style.display = gp ? "none" : "";
    $("aj-grado-o").textContent = gr.value;
    puntos = D.P.map((p, i) => ({ t: p[1], cl: D.cl[i], h: p[0] })).filter(p => Math.abs(p.h - h) < 1e-9);
    const tr = puntos.filter(p => entren[p.t]), te = puntos.filter(p => !entren[p.t]);
    const f = tr.length ? (gp ? ajusteGP(tr.map(p => p.t), tr.map(p => p.cl)) : ajustePoli(tr.map(p => p.t), tr.map(p => p.cl), +gr.value)) : null;
    const [ctx, w, hg] = lienzo(cv, 320), m = { l: 52, r: 16, t: 14, b: 40 };
    const [X, Y] = ejes(ctx, w, hg, m, [-1, 26], [-0.9, 1.1], "ángulo del difusor θ [°]", "Cl");
    Xpx = X; Ypx = Y;
    ctx.fillStyle = "#fff4e5"; ctx.fillRect(X(16.5), m.t, X(26) - X(16.5), hg - m.t - m.b);
    ctx.fillStyle = "#b86a10"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
    ctx.fillText("sin datos: el modelo extrapola", (X(16.5) + X(26)) / 2, m.t + 16);
    marcas(ctx, X, Y, [0, 4, 8, 12, 16, 20, 24], [-0.8, -0.4, 0, 0.4, 0.8], w, hg, m);
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, w - m.l - m.r, hg - m.t - m.b); ctx.clip();
    if (f) {
      const xs = Array.from({ length: 271 }, (_, i) => -1 + i * 0.1), v = xs.map(f);
      if (gp) {
        ctx.fillStyle = "rgba(44,160,44,.15)"; ctx.beginPath();
        xs.forEach((x, i) => ctx.lineTo(X(x), Y(v[i][0] + 2 * v[i][1])));
        for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(X(xs[i]), Y(v[i][0] - 2 * v[i][1]));
        ctx.fill();
      }
      ctx.strokeStyle = COL.ia; ctx.lineWidth = 2.5; ctx.beginPath();
      xs.forEach((x, i) => i ? ctx.lineTo(X(x), Y(v[i][0])) : ctx.moveTo(X(x), Y(v[i][0]))); ctx.stroke();
    }
    ctx.restore();
    puntos.forEach(p => {
      ctx.beginPath(); ctx.arc(X(p.t), Y(p.cl), 7, 0, 7);
      ctx.fillStyle = entren[p.t] ? "#1d2330" : "#fff"; ctx.fill();
      ctx.strokeStyle = "#1d2330"; ctx.lineWidth = 2; ctx.stroke();
    });
    const rms = s => s.length && f ? Math.sqrt(s.reduce((a, p) => a + (f(p.t)[0] - p.cl) ** 2, 0) / s.length).toFixed(3) : "–";
    const coefs = gp ? "36 → 9 datos" : (+gr.value + 1);
    $("aj-met").innerHTML = `<div class="met"><b>${rms(tr)}</b><span>error en entrenamiento (${tr.length} puntos)</span></div>
      <div class="met"><b>${rms(te)}</b><span>error en prueba (${te.length} puntos)</span></div>
      <div class="met"><b>${gp ? "GP" : coefs}</b><span>${gp ? "proceso gaussiano" : "coeficientes ajustados"}</span></div>`;
  }
  cv.addEventListener("click", ev => {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const p = puntos.find(p => Math.hypot(Xpx(p.t) - x, Ypx(p.cl) - y) < 12);
    if (p) { entren[p.t] = !entren[p.t]; dibujar(); }
  });
  [selH, selM, gr].forEach(e => e.addEventListener("input", dibujar));
  window.addEventListener("resize", dibujar);
  dibujar();
})();

// =============================== 2. El sustituto ===============================
const SUST = (function () {
  const sh = $("su-h"), st = $("su-t"), cv = $("su-cv"), mapa = $("su-mapa");
  const MH = [5, 60], MT = [0, 24];
  let pend = false, sombra = null;

  function sombreado() {                               // incertidumbre del GP de Cl sobre el plano (h, θ)
    const nx = 56, ny = 49, s = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const h = (MH[0] + (MH[1] - MH[0]) * i / (nx - 1)) / 1000, t = MT[0] + (MT[1] - MT[0]) * j / (ny - 1);
      s.push(gpPredecir(GP_CL, norm(h, t))[1]);
    }
    return { nx, ny, s, max: Math.max(...s) };
  }
  function dibujarMapa(h, t) {
    const [ctx, w, hg] = lienzo(mapa, 300), m = { l: 46, r: 10, t: 10, b: 38 };
    const [X, Y] = ejes(ctx, w, hg, m, MH, MT, "altura al piso h [mm]", "θ [°]");
    sombra = sombra || sombreado();
    const cw = (X(MH[1]) - X(MH[0])) / (sombra.nx - 1), ch = (Y(MT[0]) - Y(MT[1])) / (sombra.ny - 1);
    for (let j = 0; j < sombra.ny; j++) for (let i = 0; i < sombra.nx; i++) {
      const a = sombra.s[j * sombra.nx + i] / sombra.max;
      ctx.fillStyle = `rgba(230,120,20,${(0.75 * a).toFixed(3)})`;
      ctx.fillRect(m.l + i * cw - cw / 2, Y(MT[0] + (MT[1] - MT[0]) * j / (sombra.ny - 1)) - ch / 2, cw + 1, ch + 1);
    }
    marcas(ctx, X, Y, [10, 20, 30, 40, 50, 60], [0, 4, 8, 12, 16, 20, 24], w, hg, m);
    ctx.strokeStyle = "#1f3c88"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.strokeRect(X(10), Y(16), X(40) - X(10), Y(0) - Y(16)); ctx.setLineDash([]);
    D.P.forEach(([ph, pt]) => { ctx.fillStyle = "#1d2330"; ctx.beginPath(); ctx.arc(X(ph * 1000), Y(pt), 3, 0, 7); ctx.fill(); });
    ctx.fillStyle = "#c0392b"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(h * 1000), Y(t), 7, 0, 7); ctx.fill(); ctx.stroke();
    mapa.onclick = ev => {
      const r = mapa.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      const hm = MH[0] + (x - m.l) / (w - m.l - m.r) * (MH[1] - MH[0]), tm = MT[1] - (y - m.t) / (hg - m.t - m.b) * (MT[1] - MT[0]);
      sh.value = Math.round(Math.min(MH[1], Math.max(MH[0], hm)));
      st.value = Math.round(2 * Math.min(MT[1], Math.max(MT[0], tm))) / 2; pedir();
    };
  }
  function actualizar() {
    pend = false;
    const h = sh.value / 1000, t = +st.value, modo = document.querySelector("input[name=su-modo]:checked").value;
    $("su-h-o").textContent = `${sh.value} mm`; $("su-t-o").textContent = `${st.value}°`;
    const iv = vecino(h, t), [mu, sd] = gpPredecir(GP_CL, norm(h, t));
    const u = modo === "ia" ? campoIA(h, t) : campoCaso(iv);
    const xy = modo === "ia" ? centros(h, t) : centros(D.P[iv][0], D.P[iv][1]);
    const [gh, gt] = modo === "ia" ? [h, t] : D.P[iv];
    dibujarCampo(cv, xy, modulo(u), gh, gt);
    barraColor($("su-barra"), "|U| [m/s]");
    dibujarMapa(h, t);
    const fuera = h < 0.01 || h > 0.04 || t > 16;
    $("su-info").innerHTML = (modo === "ia"
      ? `<div class="nota">Apuesta de la IA</div><div class="grande" style="color:${COL.ia}">Cl = ${fmt(mu, 2)} ± ${(2 * sd).toFixed(2)}</div>`
      : `<div class="nota">El vecino copia el caso</div><div class="grande" style="color:${COL.vecino}">h = ${D.P[iv][0] * 1000} mm, θ = ${D.P[iv][1]}°</div><div>Cl de ese caso = ${fmt(D.cl[iv], 2)}</div>`)
      + `<p class="nota">Caso más parecido de la biblioteca: h = ${D.P[iv][0] * 1000} mm, θ = ${D.P[iv][1]}°, Cl = ${fmt(D.cl[iv], 2)}.</p>`
      + (fuera ? `<div class="aviso"><b>Fuera de la biblioteca.</b> La IA extrapola: vuelve hacia el promedio y lo dice con una incertidumbre
        que crece, pero el campo se dibuja igual de prolijo. ${h > 0.04 ? "Además, con el piso alto la estela oscila y el caso estacionario ni siquiera converge." : ""}
        ${t > 16 ? "Con más de 16° el difusor se desprende y simpleFoam no converge." : ""}</div>` : "");
  }
  const pedir = () => { if (!pend) { pend = true; requestAnimationFrame(actualizar); } };
  [sh, st].forEach(e => e.addEventListener("input", pedir));
  document.querySelectorAll("input[name=su-modo]").forEach(e => e.addEventListener("change", pedir));
  window.addEventListener("resize", () => { sombra = null; pedir(); });
  actualizar();
  return { pedir };
})();

// =============================== 3. ¿Le ganás a la IA? ===============================
(function () {
  const caja = $("ju-pares"); let sel = 0; const resultados = {};
  D.prueba.forEach((p, i) => {
    const b = document.createElement("button");
    b.textContent = `${p.g}: ${p.h * 1000} mm, ${p.t}°`; b.onclick = () => { sel = i; mostrar(); }; caja.appendChild(b);
  });
  function mostrar() {
    const p = D.prueba[sel], x = norm(p.h, p.t);
    [...caja.children].forEach((b, i) => { b.classList.toggle("activo", i === sel); b.classList.toggle("hecho", i in resultados); });
    const cerca = D.P.map((q, i) => ({ i, d: Math.hypot(norm(...q)[0] - x[0], norm(...q)[1] - x[1]) })).sort((a, b) => a.d - b.d).slice(0, 4);
    $("ju-vecinos").innerHTML = `<b>Diseño ${p.g}: h = ${p.h * 1000} mm, θ = ${p.t}°</b><p class="nota">Los cuatro casos resueltos más parecidos:</p>
      <table><tr><th>h [mm]</th><th>θ [°]</th><th>Cl</th></tr>${cerca.map(c => `<tr><td>${D.P[c.i][0] * 1000}</td><td>${D.P[c.i][1]}</td><td>${fmt(D.cl[c.i], 3)}</td></tr>`).join("")}</table>`;
    $("ju-apuesta").value = resultados[sel] ? resultados[sel].humano : "";
    $("ju-res").innerHTML = resultados[sel] ? resultados[sel].html : "";
  }
  $("ju-ver").onclick = () => {
    const p = D.prueba[sel], v = parseFloat(String($("ju-apuesta").value).replace(",", ".").replace("−", "-"));
    if (isNaN(v)) { $("ju-res").innerHTML = `<p class="aviso">Primero apostá un número.</p>`; return; }
    const ia = gpPredecir(GP_CL, norm(p.h, p.t))[0], eh = Math.abs(v - p.cl), ei = Math.abs(ia - p.cl);
    const gana = eh < ei ? "Ganaste vos" : eh > ei ? "Ganó la IA" : "Empate";
    const html = `<table><tr><th></th><th>Cl</th><th>error</th></tr>
      <tr><td>Tu apuesta</td><td>${fmt(v, 3)}</td><td>${eh.toFixed(3)}</td></tr>
      <tr><td style="color:${COL.ia}">La IA</td><td>${fmt(ia, 3)}</td><td>${ei.toFixed(3)}</td></tr>
      <tr><td><b>OpenFOAM</b></td><td><b>${fmt(p.cl, 3)}</b></td><td></td></tr></table><p class="grande">${gana}</p>`;
    resultados[sel] = { humano: v, html, eh, ei };
    const r = Object.values(resultados), vos = r.filter(x => x.eh < x.ei).length, ia_ = r.filter(x => x.eh > x.ei).length;
    $("ju-marcador").textContent = `Marcador: vos ${vos} · IA ${ia_} (en ${r.length} diseños)`;
    mostrar();
  };
  mostrar();
})();
