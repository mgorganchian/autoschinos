// Vista Ranking: ordena los autos elegidos del mejor al peor en cada fila de
// PCTL_DIR. Lo que más importa es que nunca rankee algo que no es comparable:
// un eléctrico en consumo de nafta, una pickup con el baúl en kg.
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, N_FILAS } = require('./helpers');

const { CARS, PCTL_DIR, filas } = leerIndex();
const N = CARS.length;
const FILAS_RANKING = filas.map(f => f[0]).filter(n => PCTL_DIR[n]);

let errores;
test.beforeEach(async ({ page }) => {
  errores = vigilarErrores(page);
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
});
test.afterEach(() => expect(errores).toEqual([]));

// Por defecto el ranking muestra solo los autos a la venta; { todos: true } suma
// preventa y no lanzados, para las pruebas que recorren los 108.
async function abrirRanking(page, { todos = false } = {}) {
  await page.click('#vistaRanking');
  await expect(page.locator('#rankingView')).toBeVisible();
  if (todos) await page.locator('#rkTodos').check();
}
const A_LA_VENTA = CARS.filter(c => c.status === 'venta').map(c => c.name);
const HERRAMIENTAS = ['usd-kw', 'usd-km', '__medida', '__gasto'];
async function elegirFila(page, nombre) {
  await page.locator(`#rkScroll .rk-chip[data-fila="${nombre}"]`).click();
  await expect(page.locator('#rkScroll .rk-chip.active')).toHaveAttribute('data-fila', nombre);
}
const enLista = page => page.locator('#rkLista .rk-item').evaluateAll(ls => ls.map(l => l.dataset.auto));
const enGrupo = (page, g) => page.locator(`#rkResto section[data-grupo="${g}"] li`).evaluateAll(ls => ls.map(l => l.dataset.auto));

test.describe('vista ranking', () => {
  test('muestra las 17 filas comparables y vuelve a la tabla', async ({ page }) => {
    await abrirRanking(page);
    // Las filas comparables, dos relaciones precio/valor y dos herramientas.
    await expect(page.locator('#rkScroll .rk-chip')).toHaveCount(FILAS_RANKING.length + HERRAMIENTAS.length);
    expect(FILAS_RANKING).toHaveLength(17);   // 14 + Potencia total (2026-10-04) + las dos garantías (2026-10-09)
    await expect(page.locator('#tbodyWrap')).toBeHidden();
    await expect(page.locator('#search')).toBeHidden();

    await page.click('#vistaTabla');
    await expect(page.locator('#rankingView')).toBeHidden();
    await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
    await expect(page.locator('#search')).toBeVisible();
  });

  test('cada ranking va del mejor al peor y cada auto aparece una sola vez', async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'no depende del viewport');
    await abrirRanking(page, { todos: true });
    for (const nombre of FILAS_RANKING) {
      await elegirFila(page, nombre);
      const valores = await page.locator('#rkLista .rk-item').evaluateAll(ls => ls.map(l => Number(l.dataset.valor)));
      const dir = PCTL_DIR[nombre];
      // La autonomía combinada va en una lista por ciclo: el orden se controla dentro de cada una.
      if (nombre.startsWith('Autonomía combinada')) { expect(new Set(valores).size).toBeGreaterThan(0); }
      else for (let k = 1; k < valores.length; k++) {
        expect(dir > 0 ? valores[k - 1] >= valores[k] : valores[k - 1] <= valores[k], `${nombre}: puesto ${k} y ${k + 1}`).toBe(true);
      }
      const todos = [...await enLista(page), ...await page.locator('#rkResto li').evaluateAll(ls => ls.map(l => l.dataset.auto))];
      expect(todos.length, nombre).toBe(N);
      expect(new Set(todos).size, `${nombre}: autos repetidos`).toBe(N);
    }
  });

  test('los empates comparten puesto', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, 'Número de asientos');
    const items = await page.locator('#rkLista .rk-item').evaluateAll(ls => ls.map(l => ({ v: Number(l.dataset.valor), pos: Number(l.querySelector('.rk-pos').textContent) })));
    const deSiete = items.filter(i => i.v === 7);
    expect(deSiete.length).toBeGreaterThan(1);
    expect(deSiete.every(i => i.pos === 1)).toBe(true);
    expect(items[deSiete.length].pos).toBe(deSiete.length + 1);
  });

  test('consumo: ningún eléctrico se rankea, van a "No aplica"', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, 'Consumo de combustible (L/100km)');
    const electricos = CARS.filter(c => c.type === 'ev').map(c => c.name);
    const rankeados = await enLista(page);
    expect(rankeados.filter(n => electricos.includes(n))).toEqual([]);
    const noAplica = await enGrupo(page, 'na');
    expect(noAplica.length).toBeGreaterThan(0);
    expect(noAplica.every(n => electricos.includes(n))).toBe(true);
  });

  // Rankeados junto a los demás, los enchufables salían primeros con 0,9-1,2 L/100km.
  // Tampoco se ordenan entre ellos: cada ficha mide distinto (batería llena, vacía,
  // un promedio), así que van aparte, sin puesto y con la cifra completa.
  test('consumo: los enchufables van aparte, sin puesto y con su cifra completa', async ({ page }) => {
    await abrirRanking(page, { todos: true });
    await elegirFila(page, 'Consumo de combustible (L/100km)');
    const enchufables = CARS.filter(c => c.type === 'phev').map(c => c.name);
    const rankeados = await enLista(page);
    expect(rankeados.length).toBeGreaterThan(0);
    expect(rankeados.filter(n => enchufables.includes(n))).toEqual([]);

    const aparte = await enGrupo(page, 'enchufables');
    const fila = filas.find(f => f[0] === 'Consumo de combustible (L/100km)');
    const conCifra = CARS.map((c, i) => ({ c, v: fila[i + 1] }))
      .filter(({ c, v }) => c.type === 'phev' && !/^NR:|^ND$/.test(v)).map(({ c }) => c.name);
    expect(aparte.sort()).toEqual(conCifra.sort());
    await expect(page.locator('#rkResto section[data-grupo="enchufables"] .rk-pos')).toHaveCount(0);
    await expect(page.locator('#rkResto section[data-grupo="enchufables"] li[data-auto="Lynk & Co 01"]')).toBeVisible();
    // El grupo va primero entre los que no se rankean, pegado al ranking.
    await expect(page.locator('#rkResto section').first()).toHaveAttribute('data-grupo', 'enchufables');
  });

  test('baúl: lo medido en kg, mm o con asientos rebatidos va a "No comparable"', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, 'Volumen de baúl/carga (L)');
    const pickups = CARS.filter(c => c.body === 'Pickup').map(c => c.name);
    const rankeados = await enLista(page);
    expect(rankeados.filter(n => pickups.includes(n))).toEqual([]);
    const noComparable = await enGrupo(page, 'nc');
    for (const n of ['BAIC BJ30 4x2', 'BAIC BJ30 4x4']) expect(noComparable).toContain(n);
  });

  test('las cifras de otro ciclo o mercado van marcadas, con su explicación', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, 'Autonomía eléctrica (km)');
    const marcas = page.locator('#rkLista .rk-marca');
    expect(await marcas.count()).toBeGreaterThan(0);
    const tips = await marcas.evaluateAll(ms => ms.map(m => m.dataset.tip || ''));
    expect(tips.filter(t => t.trim() === '')).toEqual([]);
  });

  test('respeta los autos elegidos en el comparador', async ({ page }) => {
    const marca = 'DFSK';
    const esperados = CARS.filter(c => c.brand === marca).map(c => c.name);
    await page.click('#openModalBtn');
    await page.click('#brandDropdownBtn');
    await page.click('#brandNoneBtn');
    await page.locator(`#brandList input[data-val="${marca}"]`).check();
    await page.click('#compareBtn');
    await abrirRanking(page);
    const todos = [...await enLista(page), ...await page.locator('#rkResto li').evaluateAll(ls => ls.map(l => l.dataset.auto))];
    expect(todos.sort()).toEqual([...esperados].sort());
    await expect(page.locator('#rkSub')).toContainText(`de ${esperados.length} auto`);
  });

  test('volver a la tabla conserva el scroll horizontal', async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'el scroll se prueba con el ancho de escritorio');
    await page.locator('#tbodyWrap').evaluate(el => { el.scrollLeft = 300; });
    const antes = await page.locator('#tbodyWrap').evaluate(el => el.scrollLeft);
    expect(antes).toBeGreaterThan(0);
    await abrirRanking(page);
    await page.click('#vistaTabla');
    await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
    expect(await page.locator('#tbodyWrap').evaluate(el => el.scrollLeft)).toBe(antes);
    expect(await page.locator('#theadWrap').evaluate(el => el.scrollLeft)).toBe(antes);
  });

  test('en el celular no desborda a lo ancho', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'solo aplica al ancho de celular');
    await abrirRanking(page);
    for (const nombre of ['Precio de lista (versión tope de gama de la tabla)', 'Autonomía eléctrica (km)', 'Volumen de baúl/carga (L)']) {
      await elegirFila(page, nombre);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(desborde, nombre).toBeLessThanOrEqual(0);
    }
  });
});

// Ranking pensado para elegir (decisiones del usuario, 2026-10-04).
test.describe('ranking para elegir', () => {
  const todosDe = async page => [...await enLista(page), ...await page.locator('#rkResto li').evaluateAll(ls => ls.map(l => l.dataset.auto))];

  test('por defecto solo autos a la venta; el tilde suma preventa y no lanzados', async ({ page }) => {
    await abrirRanking(page);
    expect((await todosDe(page)).sort()).toEqual([...A_LA_VENTA].sort());
    await page.locator('#rkTodos').check();
    expect(await todosDe(page)).toHaveLength(N);
  });

  test('con autos elegidos arranca con "Mis N autos"; sacándolo se ven resaltados entre todos', async ({ page }) => {
    await page.goto('/index.html?autos=byd-shark,maxus-t60,jac-t8');
    await abrirRanking(page);
    await expect(page.locator('#rkMios')).toHaveAttribute('aria-pressed', 'true');
    expect((await todosDe(page)).sort()).toEqual(['BYD Shark', 'JAC T8', 'Maxus T60']);
    await page.click('#rkMios');
    expect((await todosDe(page)).length).toBeGreaterThan(3);
    await expect(page.locator('#rkLista .rk-item.rk-mio')).toHaveCount(3);
  });

  test('filtro rápido de carrocería: solo compiten pickups', async ({ page }) => {
    await abrirRanking(page);
    await page.selectOption('#rkBody', 'Pickup');
    const pickups = CARS.filter(c => c.body === 'Pickup').map(c => c.name);
    for (const n of await todosDe(page)) expect(pickups).toContain(n);
  });

  test('autonomía: ordena por el estimado WLTP pero muestra la cifra de la ficha con su ciclo', async ({ page }) => {
    await abrirRanking(page, { todos: true });
    await elegirFila(page, 'Autonomía eléctrica (km)');
    const items = await page.locator('#rkLista .rk-item').evaluateAll(ls => ls.map(l => ({
      est: Number(l.dataset.valor), ciclo: l.querySelector('.rk-ciclo')?.textContent, txt: l.querySelector('.rk-valor').textContent })));
    expect(items.length).toBeGreaterThan(5);
    for (let k = 1; k < items.length; k++) expect(items[k - 1].est).toBeGreaterThanOrEqual(items[k].est);
    const FACT = { NEDC: 0.85, CLTC: 0.81, WLTP: 1, WLTC: 1, EPA: 1.15, 'etiqueta AR': 0.85 };
    for (const it of items){
      expect(Object.keys(FACT), it.txt).toContain(it.ciclo);
      const orig = Number(it.txt.match(/^[\d.]+/)[0].replace(/\./g, ''));
      expect(it.est, it.txt).toBe(Math.round(orig * FACT[it.ciclo] / 10) * 10);
    }
    // Lo que no dice su ciclo no se estima: va a su grupo, sin puesto.
    const sinCiclo = await enGrupo(page, 'ciclo');
    const fila = filas.find(f => f[0] === 'Autonomía eléctrica (km)');
    // (no tienen un ciclo con factor: ni NEDC, ni WLTP, ni CLTC…; ej. "ciclo no informado" o "LEV2")
    for (const n of sinCiclo) expect(fila[CARS.findIndex(c => c.name === n) + 1]).not.toMatch(/\((NEDC|WLTP|WLTC|CLTC|EPA|etiqueta AR)\b/);
    await expect(page.locator('#rkSub details')).toContainText('JRC');
  });

  test('autonomía combinada: una lista por ciclo, sin estimar', async ({ page }) => {
    await abrirRanking(page, { todos: true });
    await elegirFila(page, 'Autonomía combinada (km)');
    await expect(page.locator('#rkLista .rk-subtitulo').first()).toBeVisible();
    await expect(page.locator('#rkLista .rk-est')).toHaveCount(0);
  });

  test('potencia total: las "combinadas" que son suma de motores no compiten', async ({ page }) => {
    await abrirRanking(page, { todos: true });
    await elegirFila(page, 'Potencia total del sistema (kW)');
    const nc = await enGrupo(page, 'nc');
    for (const n of ['BAIC BJ30 4x2', 'BAIC BJ30 4x4', 'GAC S7', 'Jetour G700']) expect(nc).toContain(n);
  });

  test('USD por kW es el precio dividido la potencia total', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, 'usd-kw');
    const r = await page.evaluate(() => { const i = CARS.findIndex(c => c.name === 'Maxus T60');
      return { esperado: Math.round(SIM_PRECIO[i] / rkValor(i, FILA_POT).n), visto: Number(document.querySelector('#rkLista .rk-item[data-auto="Maxus T60"]').dataset.valor) }; });
    expect(r.visto).toBe(r.esperado);
  });

  test('tocar un auto abre su ficha de puestos en todas las filas', async ({ page }) => {
    await abrirRanking(page);
    await page.locator('#rkLista .rk-item').first().click();
    await expect(page.locator('#rkFicha')).toBeVisible();
    await expect(page.locator('#rkFicha .rk-f-lista li')).toHaveCount(FILAS_RANKING.length + 2);
    await page.keyboard.press('Escape');
    await expect(page.locator('#rkFicha')).toBeHidden();
  });

  test('a tu medida: puntaje de 0 a 100 y los que tienen poco dato van aparte', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, '__medida');
    const puntajes = await page.locator('#rkLista .rk-item').evaluateAll(ls => ls.map(l => Number(l.dataset.valor)));
    expect(puntajes.length).toBeGreaterThan(5);
    for (const p of puntajes){ expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(100); }
    for (let k = 1; k < puntajes.length; k++) expect(puntajes[k - 1]).toBeGreaterThanOrEqual(puntajes[k]);
    await expect(page.locator('#rkLista .rk-item .rk-orig').first()).toContainText(/con \d+ de \d+ datos/);
  });

  test('gasto mensual: con km y precios ordena del más barato al más caro', async ({ page }) => {
    await abrirRanking(page);
    await elegirFila(page, '__gasto');
    await expect(page.locator('#rkLista .rk-vacio')).toBeVisible();
    await page.fill('#gKm', '1000');
    await page.fill('#gLitro', '1500');
    await page.fill('#gKwh', '150');
    const gastos = await page.locator('#rkLista .rk-item').evaluateAll(ls => ls.map(l => Number(l.dataset.valor)));
    expect(gastos.length).toBeGreaterThan(5);
    for (let k = 1; k < gastos.length; k++) expect(gastos[k - 1]).toBeLessThanOrEqual(gastos[k]);
  });
});
