// Render real: con el script roto la tabla queda en 0 filas y el HTML igual
// "parece" bien, así que se cuenta lo que el navegador dibuja.
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, FILAS_CAT } = require('./helpers');

const { CARS, PCTL_DIR } = leerIndex();
const N = CARS.length;

test.describe('render de la tabla', () => {
  let errores;
  test.beforeEach(async ({ page }) => {
    errores = vigilarErrores(page);
    await page.goto('/index.html');
    await expect(page.locator(FILAS_DATOS).first()).toBeVisible();
  });

  test('carga sin errores de consola ni excepciones', async ({ page }) => {
    await page.waitForLoadState('load');
    expect(errores).toEqual([]);
  });

  test('dibuja 92 filas de datos en 14 categorías, cada una con N+1 celdas', async ({ page }) => {
    await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
    await expect(page.locator(FILAS_CAT)).toHaveCount(14);
    const celdas = await page.locator(FILAS_DATOS).evaluateAll(trs => [...new Set(trs.map(tr => tr.cells.length))]);
    expect(celdas).toEqual([N + 1]);
  });

  test('el header tiene N autos con su foto y una sola columna de característica', async ({ page }) => {
    await expect(page.locator('#theadTable thead th')).toHaveCount(N + 1);
    await expect(page.locator('#theadTable thead th.feat-col')).toHaveCount(1);
    await expect(page.locator('#theadTable img.car-photo')).toHaveCount(N);
  });

  test('ninguna celda muestra texto crudo de la convención (NR:, NOTE:, EXT:, |)', async ({ page }) => {
    // Los centinelas con texto al lado ("OPT (…)") los cubre invariantes.spec.js.
    const textos = await page.locator('#mainTable tbody td[data-col]').allTextContents();
    const crudas = textos.filter(t => /\b(NR|NOTE|EXT):|\|/.test(t));
    expect(crudas).toEqual([]);
  });

  test('el indicador de percentiles aparece solo en las filas de PCTL_DIR', async ({ page }) => {
    const conIndicador = await page.locator(FILAS_DATOS).evaluateAll(trs =>
      trs.filter(tr => tr.querySelector('.pct')).map(tr => tr.querySelector('.feat-label').textContent));
    const esperadas = Object.keys(PCTL_DIR);
    // Toda fila con indicador está en PCTL_DIR (las dimensiones no, a propósito).
    for (const f of conIndicador) expect(esperadas, f).toContain(f);
    expect(conIndicador).not.toContain('Longitud (mm)');
    expect(conIndicador.length).toBeGreaterThan(0);
  });

  test('las dos tablas están sincronizadas: mismo ancho de columna en header y cuerpo', async ({ page }) => {
    const [th, td] = await Promise.all([
      page.locator('#theadTable thead th').nth(1).evaluate(e => e.getBoundingClientRect().width),
      page.locator(FILAS_DATOS).first().locator('td').nth(1).evaluate(e => e.getBoundingClientRect().width),
    ]);
    expect(Math.abs(th - td)).toBeLessThanOrEqual(1);
  });

  test('el scroll horizontal del cuerpo arrastra al header', async ({ page }) => {
    await page.locator('#tbodyWrap').evaluate(e => { e.scrollLeft = 300; e.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => page.locator('#theadWrap').evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
  });
});

test('en celular portrait se ven 3 columnas: característica + 2 autos', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'solo en portrait');
  await page.goto('/index.html');
  const anchos = await page.locator('#theadTable thead th').evaluateAll(ths => ths.slice(0, 3).map(t => t.getBoundingClientRect().width));
  const vw = page.viewportSize().width;
  expect(anchos[0] / vw).toBeCloseTo(0.28, 1);   // col-feat 28vw
  expect(anchos[1] / vw).toBeCloseTo(0.34, 1);   // col-data 34vw
});
