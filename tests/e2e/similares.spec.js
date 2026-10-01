// Autos similares: en el selector (con un solo auto elegido) y en el botón
// "Similares" de cada auto de la tabla. Lo que más importa: que sumar un auto
// sume ESE auto y no otros, y que los criterios hagan lo que dicen.
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS } = require('./helpers');

const { CARS } = leerIndex();
const N = CARS.length;
const indice = nombre => CARS.findIndex(c => c.name === nombre);
const columnasVisibles = page => page.locator('#theadTable thead th:not(.feat-col):not(.col-hidden)');
const nombresVisibles = async page => (await columnasVisibles(page).evaluateAll(ths =>
  ths.map(th => th.querySelector('.sim-btn').getAttribute('aria-label').replace('Autos similares a ', ''))));

let errores;
test.beforeEach(async ({ page }) => {
  errores = vigilarErrores(page);
  await page.goto('/index.html');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
});
test.afterEach(() => expect(errores).toEqual([]));

async function elegirSolo(page, nombre, { abrir = true } = {}) {
  if (abrir) await page.click('#openModalBtn');
  await page.click('#modelDropdownBtn');
  await page.click('#modelNoneBtn');
  await page.locator(`#modelList input[data-idx="${indice(nombre)}"]`).check();
  await expect(page.locator('#compareCount')).toHaveText('1');
}
const sugeridos = box => box.locator('.sim-lista li').evaluateAll(ls => ls.map(l => l.dataset.auto));

test.describe('similares en el selector', () => {
  test('con un solo auto aparecen 3 sugerencias y se pueden sumar', async ({ page }) => {
    const box = page.locator('#simModal');
    await page.click('#openModalBtn');
    await expect(box).toBeHidden();                       // con los 46 elegidos no aparece
    await elegirSolo(page, 'Lynk & Co 06', { abrir: false });
    await expect(box).toBeVisible();
    await expect(box.locator('.sim-titulo')).toContainText('Lynk & Co 06');
    await expect(box.locator('[data-crit]')).toHaveCount(5);
    const tres = await sugeridos(box);
    expect(tres).toHaveLength(3);
    expect(tres).not.toContain('Lynk & Co 06');

    await box.locator('.sim-sumar').first().click();
    await expect(page.locator('#compareCount')).toHaveText('2');
    await expect(box.locator('.sim-sumar').first()).toHaveText('✓ Sumado');
    await expect(box).toBeVisible();                      // sigue, para sumar más

    await box.locator('.sim-todos').click();
    await expect(page.locator('#compareCount')).toHaveText('4');
    await page.click('#compareBtn');
    expect((await nombresVisibles(page)).sort()).toEqual(['Lynk & Co 06', ...tres].sort());
  });

  test('sumar un auto de otra marca no suma a sus hermanos de marca', async ({ page }) => {
    // Con la marca filtrada en Lynk & Co y solo el 06 tildado, se suma una
    // sugerencia de una marca con varios modelos. Habilitar esa marca no tiene que
    // tildar al resto de sus modelos, que arrancan tildados.
    const base = 'Lynk & Co 06';
    await page.click('#openModalBtn');
    await page.click('#brandDropdownBtn');
    await page.click('#brandNoneBtn');
    await page.locator('#brandList input[data-val="Lynk & Co"]').check();
    await page.click('#modelDropdownBtn');
    for (const c of CARS.filter(c => c.brand === 'Lynk & Co' && c.name !== base))
      await page.locator(`#modelList input[data-idx="${indice(c.name)}"]`).uncheck();
    await expect(page.locator('#compareCount')).toHaveText('1');
    const box = page.locator('#simModal');
    await expect(box).toBeVisible();
    const deMarca = m => CARS.filter(c => c.brand === m).length;
    const otro = (await sugeridos(box)).find(n => CARS[indice(n)].brand !== 'Lynk & Co' && deMarca(CARS[indice(n)].brand) > 1);
    expect(otro, 'hay una sugerencia de otra marca con varios modelos').toBeTruthy();
    await box.locator(`.sim-lista li[data-auto="${otro}"] .sim-sumar`).click();
    await expect(page.locator('#compareCount')).toHaveText('2');
    await page.click('#compareBtn');
    expect((await nombresVisibles(page)).sort()).toEqual([base, otro].sort());
  });

  test('solo "Tipo de auto": las 3 sugerencias tienen la misma carrocería', async ({ page }) => {
    const base = 'Lynk & Co 06';
    await elegirSolo(page, base);
    const box = page.locator('#simModal');
    for (const k of ['precio', 'tamano', 'propulsion', 'asientos']) await box.locator(`[data-crit="${k}"]`).click();
    await expect(box.locator('[aria-pressed="true"]')).toHaveCount(1);
    const tres = await sugeridos(box);
    expect(tres).toHaveLength(3);
    for (const n of tres) expect(CARS[indice(n)].body, n).toBe(CARS[indice(base)].body);
  });

  test('sin criterios no sugiere nada y lo dice', async ({ page }) => {
    await elegirSolo(page, 'Lynk & Co 06');
    const box = page.locator('#simModal');
    for (const k of ['precio', 'tipo', 'tamano', 'propulsion', 'asientos']) await box.locator(`[data-crit="${k}"]`).click();
    await expect(box.locator('.sim-lista li')).toHaveCount(0);
    await expect(box.locator('.sim-vacio')).toBeVisible();
  });

  test('si el auto no tiene precio, el criterio Precio se apaga', async ({ page }) => {
    await elegirSolo(page, 'BYD Sealion 7');                  // precio "aún no confirmado"
    const precio = page.locator('#simModal [data-crit="precio"]');
    await expect(precio).toBeDisabled();
    await expect(precio).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#simModal .sim-lista li')).toHaveCount(3);
  });
});

test.describe('similares en la tabla', () => {
  test('desde la tabla completa, "Comparar con los 3" deja el auto y sus 3 parecidos', async ({ page }) => {
    const base = 'Haval H6 HEV';
    await page.locator(`#theadTable .sim-btn[data-idx="${indice(base)}"]`).click();
    const panel = page.locator('#simPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.sim-sumar').first()).toHaveText('Comparar');   // todavía no hay comparación
    const tres = await sugeridos(panel);
    await panel.locator('.sim-todos').click();
    await expect(columnasVisibles(page)).toHaveCount(4);
    expect((await nombresVisibles(page)).sort()).toEqual([base, ...tres].sort());
    await expect(page.locator('#summaryText')).toHaveText('🚗 Comparando 4 autos');

    // El selector quedó igual: al abrirlo están tildados esos 4 y nada más.
    await page.click('#openModalBtn');
    await expect(panel).toBeHidden();
    await expect(page.locator('#compareCount')).toHaveText('4');
  });

  test('con una comparación armada, "Sumar" agrega el auto sin sacar los otros', async ({ page }) => {
    await page.click('#openModalBtn');
    await page.click('#modelDropdownBtn');
    await page.click('#modelNoneBtn');
    for (const n of ['Haval H6 HEV', 'MG ZS HEV']) await page.locator(`#modelList input[data-idx="${indice(n)}"]`).check();
    await page.click('#compareBtn');
    await expect(columnasVisibles(page)).toHaveCount(2);

    await page.locator(`#theadTable .sim-btn[data-idx="${indice('Haval H6 HEV')}"]`).click();
    const panel = page.locator('#simPanel');
    const libre = panel.locator('.sim-sumar:not([disabled])').first();
    const nombre = await libre.evaluate(b => b.closest('li').dataset.auto);
    await libre.click();
    await expect(columnasVisibles(page)).toHaveCount(3);
    expect(await nombresVisibles(page)).toEqual(expect.arrayContaining(['Haval H6 HEV', 'MG ZS HEV', nombre]));
    await expect(panel.locator(`.sim-lista li[data-auto="${nombre}"] .sim-sumar`)).toHaveText('✓ En la tabla');
  });

  test('el panel se cierra con Escape, con la ✕ y tocando afuera', async ({ page }) => {
    const panel = page.locator('#simPanel');
    const abrir = () => page.locator('#theadTable .sim-btn').first().click();
    await abrir(); await expect(panel).toBeVisible();
    await page.keyboard.press('Escape'); await expect(panel).toBeHidden();
    await abrir(); await panel.locator('.sim-cerrar').click(); await expect(panel).toBeHidden();
    await abrir(); await page.locator('#mainTitle').click(); await expect(panel).toBeHidden();
  });

  test('en el celular el panel entra en la pantalla', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'solo aplica al ancho de celular');
    await page.locator('#theadTable .sim-btn').first().click();
    const b = await page.locator('#simPanel').boundingBox();
    const w = page.viewportSize().width;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
