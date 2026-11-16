// Secciones 4 a 6: arranque en caliente, aprendizaje activo y keywords inventados.
"use strict";

// =============================== 4. Arranque en caliente ===============================
(function () {
  const cv = $("ca-cv"), series = [["frio", "frío"], ["vecino", "vecino"], ["ia", "IA"]];
  function estabiliza(cl) {
    const fin = cl.slice(-50).reduce((a, b) => a + b, 0) / 50;
    let k = cl.length - 1; while (k >= 0 && Math.abs(cl[k] - fin) <= 0.01) k--;
    return [k + 2, fin];                               // iteraciones numeradas desde 1
  }
  function dibujar(hasta) {
    const [ctx, w, hg] = lienzo(cv, 320), m = { l: 52, r: 16, t: 14, b: 40 };
    const [X, Y] = ejes(ctx, w, hg, m, [0, 200], [-1.15, 0.62], "iteración de simpleFoam", "Cl");
    const fin = estabiliza(D.pq.frio)[1];
    ctx.fillStyle = "#eceff3"; ctx.fillRect(m.l, Y(fin + 0.01), w - m.l - m.r, Y(fin - 0.01) - Y(fin + 0.01));
    marcas(ctx, X, Y, [0, 50, 100, 150, 200], [-1, -0.5, 0, 0.5], w, hg, m);
    series.forEach(([k, nom], j) => {
      const cl = D.pq[k], [n] = estabiliza(cl), c = COL[k];
      ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let i = 0; i < Math.min(hasta, 200); i++) i ? ctx.lineTo(X(i + 1), Y(cl[i])) : ctx.moveTo(X(1), Y(cl[0]));
      ctx.stroke();
      if (hasta >= n) {
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(n), m.t); ctx.lineTo(X(n), hg - m.b); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = c; ctx.font = "bold 14px system-ui"; ctx.textAlign = "left";
        ctx.fillText(`${nom}: ${n} iteraciones`, X(n) + 5, m.t + 18 + 20 * j);
      }
    });
    if (hasta >= 200) {
      ctx.fillStyle = "#333"; ctx.font = "14px system-ui"; ctx.textAlign = "right";
      ctx.fillText(`Los tres terminan en Cl = ${fmt(fin, 3)}: la condición inicial cambió el camino, no la solución.`, w - m.r, hg - m.b - 10);
    }
  }
  let anim = null;
  $("ca-play").onclick = () => {
    cancelAnimationFrame(anim); const t0 = performance.now();
    const paso = now => { const it = Math.floor((now - t0) / 20); dibujar(it); if (it < 200) anim = requestAnimationFrame(paso); };
    anim = requestAnimationFrame(paso);
  };
  function barras() {
    const cvb = $("ca-barras"), [ctx, w, hg] = lienzo(cvb, 260), m = { l: 52, r: 16, t: 26, b: 40 };
    const P = D.prueba, n = P.length;
    const [, Y] = ejes(ctx, w, hg, m, [0, 1], [0, 160], "par de prueba (grupo)", "iteraciones");
    marcas(ctx, () => 0, Y, [], [0, 40, 80, 120, 160], w, hg, m);
    const bw = (w - m.l - m.r) / n;
    P.forEach((p, i) => {
      ["frio", "vecino", "ia"].forEach((k, j) => {
        ctx.fillStyle = COL[k]; const x = m.l + i * bw + bw * (0.12 + 0.25 * j);
        ctx.fillRect(x, Y(p[k]), bw * 0.24, Y(0) - Y(p[k]));
      });
      ctx.fillStyle = "#444"; ctx.font = "12px system-ui"; ctx.textAlign = "center";
      ctx.fillText(p.g, m.l + (i + 0.5) * bw, hg - m.b + 14);
    });
    const prom = k => Math.round(P.reduce((a, p) => a + p[k], 0) / n);
    ctx.font = "bold 13px system-ui"; ctx.textAlign = "left";
    [["frio", "frío"], ["vecino", "vecino"], ["ia", "IA"]].forEach(([k, nom], j) => {
      ctx.fillStyle = COL[k]; ctx.fillText(`■ ${nom}: ${prom(k)} en promedio`, m.l + 10 + 190 * j, 16);
    });
  }
  window.addEventListener("resize", () => { dibujar(200); barras(); });
  dibujar(200); barras();
})();

// =============================== 5. La IA elige qué correr ===============================
(function () {
  const hp = D.hipCl, nP = D.P.length;
  const esquinas = D.P.map((p, i) => i).filter(i => [0.01, 0.04].includes(D.P[i][0]) && [0, 16].includes(D.P[i][1]));
  let eleg = esquinas.slice();
  const ajustar = idx => gpAjustar(idx.map(i => XLIB[i]), idx.map(i => D.cl[i]), hp);
  const real = ajustar([...Array(nP).keys()]);
  const imin = D.cl.indexOf(Math.min(...D.cl));

  function mapa(cv, g, puntos, titulo, proximo) {
    const [ctx, w, hg] = lienzo(cv, 300), m = { l: 46, r: 10, t: 26, b: 38 };
    const [X, Y] = ejes(ctx, w, hg, m, [10, 40], [0, 16], "altura al piso h [mm]", "θ [°]");
    const nx = 61, ny = 65, cw = (X(40) - X(10)) / (nx - 1), ch = (Y(0) - Y(16)) / (ny - 1);
    let zmin = Infinity, best = null;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const h = 0.01 + 0.03 * i / (nx - 1), t = 16 * j / (ny - 1), z = gpPredecir(g, norm(h, t))[0];
      if (z < zmin) { zmin = z; best = [h, t]; }
      ctx.fillStyle = rdbu(z); ctx.fillRect(X(h * 1000) - cw / 2, Y(t) - ch / 2, cw + 1, ch + 1);
    }
    marcas(ctx, X, Y, [10, 20, 30, 40], [0, 4, 8, 12, 16], w, hg, m);
    ctx.fillStyle = "#222"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "left"; ctx.fillText(titulo, m.l, 17);
    D.P.forEach(([h, t], i) => {
      const usado = puntos.includes(i);
      ctx.beginPath(); ctx.arc(X(h * 1000), Y(t), usado ? 6 : 2.5, 0, 7);
      ctx.fillStyle = usado ? "#fff" : "rgba(0,0,0,.45)"; ctx.fill();
      if (usado) { ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    if (proximo != null) {
      const [h, t] = D.P[proximo]; ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(X(h * 1000), Y(t), 11, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    const [bh, bt] = best; ctx.font = "22px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#f1c40f";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeText("★", X(bh * 1000), Y(bt) + 8); ctx.fillText("★", X(bh * 1000), Y(bt) + 8);
    cv.onclick = ev => {
      if (cv.id !== "do-cv") return;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      let k = -1, dm = 14;
      D.P.forEach(([h, t], i) => { const d = Math.hypot(X(h * 1000) - x, Y(t) - y); if (d < dm) { dm = d; k = i; } });
      if (k >= 0 && !eleg.includes(k)) { eleg.push(k); dibujar(); }
    };
    return { zmin, best };
  }
  function proximaIA(g) {
    let k = -1, lcb = Infinity;
    for (let i = 0; i < nP; i++) {
      if (eleg.includes(i)) continue;
      const [mu, sd] = gpPredecir(g, XLIB[i]), v = mu - 2 * sd;
      if (v < lcb) { lcb = v; k = i; }
    }
    return k;
  }
  function dibujar() {
    const g = ajustar(eleg), prox = proximaIA(g);
    const r = mapa($("do-cv"), g, eleg, `Lo que sabe la IA con ${eleg.length} corridas`, prox);
    mapa($("do-real"), real, [], "Referencia: las 36 corridas", null);
    const mejor = eleg.reduce((a, i) => D.cl[i] < D.cl[a] ? i : a, eleg[0]);
    const err = Math.sqrt(D.cl.reduce((a, c, i) => a + (gpPredecir(g, XLIB[i])[0] - c) ** 2, 0) / nP);
    const hallado = mejor === imin;
    $("do-info").innerHTML = `<div class="met"><b>${eleg.length} / 36</b><span>corridas hechas</span></div>
      <div class="met"><b>${fmt(D.cl[mejor], 3)}</b><span>mejor Cl corrido (h = ${D.P[mejor][0] * 1000} mm, θ = ${D.P[mejor][1]}°)</span></div>
      <div class="met"><b>${fmt(D.cl[imin], 3)}</b><span>mejor de la grilla (h = ${D.P[imin][0] * 1000} mm, θ = ${D.P[imin][1]}°)</span></div>
      <div class="met"><b>${err.toFixed(3)}</b><span>error del mapa en los 36 casos</span></div>
      <div class="met"><b style="color:${hallado ? COL.ia : COL.vecino}">${hallado ? "Encontrado" : "Todavía no"}</b><span>¿ya corrió el mejor diseño?</span></div>`;
  }
  $("do-ia").onclick = () => { const k = proximaIA(ajustar(eleg)); if (k >= 0) { eleg.push(k); dibujar(); } };
  $("do-azar").onclick = () => { const libres = [...Array(nP).keys()].filter(i => !eleg.includes(i)); if (libres.length) { eleg.push(libres[Math.floor(Math.random() * libres.length)]); dibujar(); } };
  $("do-reset").onclick = () => { eleg = esquinas.slice(); dibujar(); };
  window.addEventListener("resize", dibujar);
  dibujar();
})();

// =============================== 6. ¿Existe o lo inventó? ===============================
(function () {
  // Verificado contra las bibliotecas de OpenFOAM v2412 (strings de $FOAM_LIBBIN), 16/11/2026.
  const K = [
    ["nutkWallFunction", true, "Función de pared para νt. La usan casi todos los tutoriales con k-ε y k-ω."],
    ["kOmegaSSTWallFunction", false, "No existe. Para k-ω SST se usan kqRWallFunction (k) y omegaWallFunction (ω)."],
    ["pressureInletOutletVelocity", true, "Existe: velocidad para un borde de presión que puede entrar o salir."],
    ["pressureOutletVelocity", false, "No existe. Suena a Fluent; en OpenFOAM es pressureInletOutletVelocity o inletOutlet."],
    ["nutUSpaldingWallFunction", true, "Existe: ley de pared de Spalding, válida en todo y+."],
    ["nutOmegaWallFunction", false, "No existe. Hay omegaWallFunction (para ω) y nutkWallFunction (para νt)."],
    ["freestreamPressure", true, "Existe: presión de corriente libre, se usa con freestreamVelocity."],
    ["velocityOutletPressure", false, "No existe. Combinación plausible de dos palabras que sí existen."],
  ];
  const caja = $("qz"); let ok = 0, resp = 0;
  K.forEach(([kw, real, exp]) => {
    const d = document.createElement("div"); d.className = "carta";
    d.innerHTML = `<code>${kw}</code><button>Existe</button><button class="sec">Inventado</button>`;
    d.querySelectorAll("button").forEach((b, i) => b.onclick = () => {
      if (d.dataset.r) return; d.dataset.r = 1; resp++;
      const bien = (i === 0) === real; if (bien) ok++;
      d.classList.add(bien ? "ok" : "mal");
      d.insertAdjacentHTML("beforeend", `<p><b>${real ? "Existe" : "Inventado"}.</b> ${exp}</p>`);
      $("qz-res").textContent = `${ok} de ${resp} bien. ` + (resp === K.length
        ? "Un modelo de lenguaje produce los dos tipos con la misma seguridad: lo que no está en un tutorial o en el manual, no se usa."
        : "");
    });
    caja.appendChild(d);
  });
})();
