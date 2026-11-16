// Guion del agente: arma el caso, lo corre, lo verifica y después atiende pedidos del alumno.
"use strict";
const CASO = "piso_h20_t4";
const PEDIDO = "Armá un caso 2D de OpenFOAM v2412 del piso de un auto con difusor en efecto suelo: altura al piso 20 mm, difusor de 4°, 20 m/s, k-ω SST. Quiero el Cl.";
const IREF = D.P.findIndex(([h, t]) => Math.abs(h - 0.02) < 1e-9 && t === 4);
const conParam = (txt, h, t) => txt.replace(/^h(\s+)[\d.]+;/m, `h$1${h};`).replace(/^theta(\s+)[\d.]+;/m, `theta$1${t};`);
let ocupado = true, listo = false;

function estabiliza(cl) {
  const fin = cl.slice(-50).reduce((a, b) => a + b, 0) / 50;
  let k = cl.length - 1; while (k >= 0 && Math.abs(cl[k] - fin) <= 0.01) k--;
  return k + 2;
}
function indiceBiblioteca(h, t) { return D.P.findIndex(([ph, pt]) => Math.abs(ph - h) < 1e-9 && Math.abs(pt - t) < 1e-9); }
function mostrarDiseno(h, t) {
  const i = indiceBiblioteca(h, t), fuera = h < 0.01 || h > 0.04 || t > 16;
  $("ed-h").value = h.toFixed(3); $("ed-t").value = t;
  if (i >= 0) {
    UI.visor({ h, t, campo: campoCaso(i), real: true });
    UI.estado(`h = ${h * 1000} mm · θ = ${t}° &nbsp; <b>Cl = ${fmt(D.cl[i], 3)}</b> &nbsp;(corrida real de OpenFOAM, está en la biblioteca)`);
    return { cl: D.cl[i], real: true };
  }
  const [mu, sd] = gpPredecir(GP_CL, norm(h, t));
  UI.visor({ h, t, campo: campoIA(h, t), real: false });
  UI.estado(`h = ${(h * 1000).toFixed(1)} mm · θ = ${t}° &nbsp; <b>Cl ≈ ${fmt(mu, 2)} ± ${(2 * sd).toFixed(2)}</b> &nbsp;(predicción de la IA, sin correr)`
    + (fuera ? `<br><span class="aviso">Fuera de la biblioteca (h de 10 a 40 mm, θ de 0 a 16°): la IA extrapola y este número no es confiable.</span>` : ""));
  return { cl: mu, sd, real: false, fuera };
}

async function guionInicial() {
  UI.usuario(PEDIDO);
  await UI.agente("Antes de escribir nada, busco cómo se configura un caso parecido en los tutoriales de OpenFOAM v2412.");
  await UI.tool("Bash", "ls $FOAM_TUTORIALS/incompressible/simpleFoam", ["airFoil2D  motorBike  pitzDaily  pipeCyclic  turbineSiting  windAroundBuildings  …"]);
  await UI.tool("Read", "motorBike/0.orig/{U,k,omega,nut}", ["kOmegaSST · piso (lowerWall) con fixedValue a la velocidad del aire", "paredes: kqRWallFunction · omegaWallFunction · nutkWallFunction"]);
  await UI.agente("Propongo este plan. Cada decisión tiene su fuente para que la revises antes de que escriba un archivo:");
  UI.tabla(["Decisión", "Valor", "Por qué", "Fuente"], [
    ["Solver", "simpleFoam", "incompresible y estacionario (Re = UL/ν ≈ 1,3·10⁶)", "tutorial motorBike"],
    ["Turbulencia", "k-ω SST", "gradiente de presión adverso en el difusor", "motorBike, turbulenceProperties"],
    ["Piso", "fixedValue (20 0 0)", "el piso se mueve con el aire, como un túnel con cinta", "motorBike, lowerWall"],
    ["Paredes", "kqRWall · omegaWall · nutkWallFunction", "funciones de pared: malla gruesa junto a la pared", "motorBike, 0.orig"],
    ["Malla", "blockMesh con h y θ como parámetros (#eval)", "cambiar el diseño sin rehacer la malla", "User Guide, blockMesh"],
    ["Resultado", "forceCoeffs, A = 0,1 m²", "Cl con el área en planta (1 m × 0,1 m)", "User Guide, forceCoeffs"],
  ]);
  await UI.agente("¿Lo armo?");
  while (!(await UI.aprobar("Sí, armalo", "Todavía no"))) await UI.agente("Dale. Revisá la tabla y avisame. ¿Lo armo?");

  await UI.tool("Bash", `mkdir -p ${CASO}/{0,constant,system}`);
  ["0", "constant", "system"].forEach(d => UI.carpeta(`${CASO}/${d}`));
  const orden = ["system/blockMeshDict", "system/controlDict", "system/fvSchemes", "system/fvSolution",
    "constant/transportProperties", "constant/turbulenceProperties", "0/U", "0/p", "0/k", "0/omega", "0/nut"];
  for (const r of orden) {
    const txt = r === "system/blockMeshDict" ? conParam(AG.archivos[r], 0.02, 4) : AG.archivos[r];
    await UI.tool("Write", `${CASO}/${r}`, [`+ ${txt.split("\n").length} líneas`]);
    UI.crear(`${CASO}/${r}`, txt);
    if (r === "system/blockMeshDict") {
      UI.abrir(`${CASO}/${r}`);
      await UI.agente("Dejo h y θ como parámetros arriba del archivo: los vértices se calculan solos con <code>#eval</code>.");
      await UI.esperar(900);
    }
  }
  const lb = AG.logBlockMesh.filter(l => !/patch \d|Patches|^-+$|defaultFaces/.test(l.trim()));
  await UI.tool("Bash", `cd ${CASO} && blockMesh`, lb);
  UI.pestana("vista"); UI.visor({ listo: true }); UI.modo("malla");
  await UI.tool("Bash", "checkMesh", AG.logCheckMesh.map(l => l.includes("Mesh OK") ? `<span class="ok">${l}</span>` : l.includes("severely") ? `<span class="mal">${l}</span>` : l));
  UI.check("checkMesh: Mesh OK, 6090 celdas");
  UI.check("94 caras no ortogonales > 70°", "av");
  await UI.agente("checkMesh da <b>Mesh OK</b>. Aviso: hay 94 caras con no ortogonalidad mayor a 70° (máximo 84°). No frena la corrida, pero lo dejo anotado para revisarlo.");
  await UI.tool("Bash", "simpleFoam > log.simpleFoam", AG.logT1.split("\n").concat(["…  300 iteraciones"]));
  await UI.curvaCl(D.hist[IREF], D.cl[IREF]);
  UI.visor({ campo: campoCaso(IREF), real: true }); UI.modo("campo");
  await UI.agente("Antes de darte el número, verifico:");
  const n = estabiliza(D.hist[IREF]);
  UI.check(`Cl estable (±0,01) desde la iteración ${n}`);
  UI.check("ν = 1,5·10⁻⁵ m²/s: aire, unidades correctas");
  UI.check("tipos de borde: todos en tutoriales v2412");
  await UI.tool("Read", "checklist", [`<span class="ok">✓</span> malla: Mesh OK (con 94 caras a revisar)`, `<span class="ok">✓</span> Cl estable desde la iteración ${n} de 300`,
    `<span class="ok">✓</span> ν del aire en m²/s`, `<span class="ok">✓</span> cada keyword está en un tutorial`]);
  await UI.agente(`Listo: <b>Cl = ${fmt(D.cl[IREF], 3)}</b>, carga hacia abajo. Ahora te toca a vos: cambiá h y θ en el editor del visor, o pedime algo abajo.`);
  mostrarDiseno(0.02, 4);
}

// ---------------- Pedidos del alumno ----------------
function leerPedido(t) {
  const num = s => parseFloat(s.replace(",", "."));
  let h = null, th = null, m;
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*mm/i))) h = num(m[1]) / 1000;
  else if ((m = t.match(/\bh\s*=?\s*(\d+(?:[.,]\d+)?)/i))) { h = num(m[1]); if (h > 1) h /= 1000; }
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(°|grados)/i)) || (m = t.match(/(?:θ|theta|ángulo|angulo)\s*=?\s*(\d+(?:[.,]\d+)?)/i))) th = num(m[1]);
  return { h, th };
}
async function cambio(h, t) {
  const V = UI.V, ruta = `${CASO}/system/blockMeshDict`, viejo = ARCH[ruta];
  if (h < 0.003 || h > 0.08 || t < 0 || t > 25) {
    await UI.agente(`No lo hago: con h = ${(h * 1000).toFixed(1)} mm y θ = ${t}° la geometría se sale de lo que puede armar esta malla (h de 3 a 80 mm, θ de 0 a 25°).`);
    return;
  }
  const dif = [];
  if (Math.abs(h - V.h) > 1e-12) dif.push(`<span class="del">- h       ${V.h};</span>`, `<span class="add">+ h       ${h};</span>`);
  if (t !== V.t) dif.push(`<span class="del">- theta   ${V.t};</span>`, `<span class="add">+ theta   ${t};</span>`);
  await UI.tool("Edit", ruta, dif.length ? dif : ["(sin cambios)"]);
  UI.crear(ruta, conParam(viejo, h, t));
  await UI.tool("Bash", "blockMesh", ["… misma topología: 6090 celdas, cambian las posiciones de los vértices", "End"]);
  const r = mostrarDiseno(h, t);
  UI.pestana("vista"); UI.modo("campo");
  if (r.real) return UI.agente(`Este diseño ya está corrido en la biblioteca: <b>Cl = ${fmt(r.cl, 3)}</b>. Es un resultado de OpenFOAM, no una predicción.`);
  if (r.fuera) {
    const porque = t > 16 ? "Con más de 16° el difusor se desprende y simpleFoam no converge en estacionario."
      : h > 0.04 ? "Con el piso alto la estela oscila: puede que no haya solución estacionaria." : "Con el piso tan bajo no tengo ningún caso parecido.";
    return UI.agente(`Cuidado: está fuera de lo que vio la IA (h de 10 a 40 mm, θ de 0 a 16°). Me animo a decir Cl ≈ ${fmt(r.cl, 2)} ± ${(2 * r.sd).toFixed(2)}, pero no le creas. ${porque} Hay que correrlo de verdad.`);
  }
  await UI.agente(`Para no esperar la corrida uso la IA (36 corridas, POD + proceso gaussiano): <b>Cl ≈ ${fmt(r.cl, 2)} ± ${(2 * r.sd).toFixed(2)}</b>. El número que vale es el de simpleFoam: correlo en tu máquina (3 s) y comparalo.`);
}
async function inventado() {
  const ruta = `${CASO}/0/k`, orig = ARCH[ruta];
  await UI.agente("Cambio la condición de pared de k en el cuerpo.");
  await UI.tool("Edit", ruta, [`<span class="del">- type            kqRWallFunction;</span>`, `<span class="add">+ type            kOmegaSSTWallFunction;</span>`]);
  UI.crear(ruta, orig.replace(/(body\s*\{\s*type\s+)kqRWallFunction/, "$1kOmegaSSTWallFunction"));
  await UI.tool("Bash", "simpleFoam > log.simpleFoam", [`<span class="mal">--> FOAM FATAL IO ERROR: (openfoam-2412)</span>`,
    `<span class="mal">Unknown patchField type kOmegaSSTWallFunction for patch body</span>`, "", "Valid patchField types :", "…"], "error");
  await UI.agente("Error mío: <code>kOmegaSSTWallFunction</code> no existe. Lo escribí porque suena bien al lado de kOmegaSST, no porque esté en un tutorial. Vuelvo a <code>kqRWallFunction</code>.");
  await UI.tool("Edit", ruta, [`<span class="del">- type            kOmegaSSTWallFunction;</span>`, `<span class="add">+ type            kqRWallFunction;</span>`]);
  UI.crear(ruta, orig);
  UI.check("kOmegaSSTWallFunction: inventado, revertido", "av");
}
async function mejor() {
  await UI.agente("Antes de proponer corridas nuevas, miro los 36 casos que ya están corridos.");
  const o = D.cl.map((c, i) => i).sort((a, b) => D.cl[a] - D.cl[b]).slice(0, 4);
  await UI.tool("Bash", "tail -n1 casos/*/postProcessing/coeficientes/0/coefficient.dat | sort -k Cl", o.map(i => `h = ${D.P[i][0] * 1000} mm  θ = ${String(D.P[i][1]).padStart(2)}°  Cl = ${fmt(D.cl[i], 3)}`));
  mostrarDiseno(D.P[o[0]][0], D.P[o[0]][1]); UI.pestana("vista"); UI.modo("campo");
  await UI.agente(`El de más carga es h = ${D.P[o[0]][0] * 1000} mm, θ = ${D.P[o[0]][1]}° (Cl = ${fmt(D.cl[o[0]], 3)}). El máximo está entre 4° y 6°; con más ángulo el difusor se desprende y pierde carga.`);
}
async function atender(txt) {
  if (ocupado || !txt.trim()) return;
  ocupado = true; UI.usuario(txt); $("txt").value = "";
  try {
    if (/wall ?function|kOmegaSST\w*Wall/i.test(txt)) await inventado();
    else if (/mejor|más carga|mas carga|óptimo|optimo|máxima carga/i.test(txt)) await mejor();
    else {
      const { h, th } = leerPedido(txt);
      if (h === null && th === null) await UI.agente("En esta demo entiendo pocos pedidos: cambiar la altura (\"bajá el piso a 15 mm\"), el ángulo (\"probá 8°\"), buscar el diseño de más carga o cambiar la función de pared. Probá uno de los botones.");
      else await cambio(h ?? UI.V.h, th ?? UI.V.t);
    }
  } finally { ocupado = false; }
}

const CHIPS = ["Bajá el piso a 12 mm", "Probá el difusor a 8°", "Probá θ = 22°", "Subí el piso a 60 mm", "¿Qué diseño da más carga?", "Usá kOmegaSSTWallFunction para k en el cuerpo"];
function chips() {
  $("chips").innerHTML = "";
  CHIPS.forEach(c => { const b = document.createElement("button"); b.textContent = c; b.onclick = () => atender(c); $("chips").appendChild(b); });
}
$("enviar").onclick = () => listo ? atender($("txt").value) : arrancar();
$("txt").addEventListener("keydown", e => { if (e.key === "Enter") $("enviar").click(); });
$("aplicar").onclick = () => {
  if (!listo) return;
  const h = parseFloat($("ed-h").value), t = parseFloat($("ed-t").value);
  if (!(h >= 0.003 && h <= 0.08 && t >= 0 && t <= 25)) return UI.estado(`<span class="aviso">Valores fuera de lo que puede armar la malla (h de 0,003 a 0,08 m, θ de 0 a 25°).</span>`);
  UI.crear(`${CASO}/system/blockMeshDict`, conParam(ARCH[`${CASO}/system/blockMeshDict`], h, t));
  mostrarDiseno(h, t); UI.modo("campo");
};
async function arrancar() {
  if (!ocupado || listo) return;
  $("txt").value = ""; $("txt").placeholder = "El agente está trabajando…";
  await guionInicial();
  saltando = false; listo = true; ocupado = false;
  $("txt").placeholder = "Pedile un cambio al agente…"; chips();
}
$("txt").value = PEDIDO;
UI.estado("Apretá <b>Enviar</b> para que el agente arme el caso.");
