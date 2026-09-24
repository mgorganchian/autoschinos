// Interacciones de la página: búsqueda, categorías, solo diferencias,
// referencias, selector de autos, tooltips y zoom de fotos.
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, FILAS_CAT } = require('./helpers');

const { DATA, CARS } = leerIndex();
const N = CARS.length;
const columnasVisibles = page => page.locator('#theadTable thead th:not(.feat-col):not(.col-hidden)');

let errores;
test.beforeEach(async ({ page }) => {
  errores = vigilarErrores(page);
  await page.goto('/index.html');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
});
test.afterEach(() => expect(errores).toEqual([]));

test.describe('filtros de la tabla', () => {
  test('la búsqueda filtra filas por nombre de característica', async ({ page }) => {
    await page.fill('#search', 'airbag');
    const nombres = await page.locator(`${FILAS_DATOS} .feat-label`).allTextContents();
    expect(nombres.length).toBeGreaterThan(0);
    for (const n of nombres) expect(n.toLowerCase()).toContain('airbag');
    await expect(page.locator('#noResults')).toBeHidden();
  });

  test('una búsqueda sin resultados muestra el aviso y esconde las categorías', async ({ page }) => {
    await page.fill('#search', 'zzz-no-existe');
    await expect(page.locator(FILAS_DATOS)).toHaveCount(0);
    await expect(page.locator(FILAS_CAT)).toHaveCount(0);
    await expect(page.locator('#noResults')).toBeVisible();
    await page.fill('#search', '');
    await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
  });

  test('los botones de categoría muestran solo esa categoría y "Todas" vuelve', async ({ page }) => {
    const botones = page.locator('#catScroll .cat-btn');
    await expect(botones).toHaveCount(DATA.length + 1);
    const [nombre, filas] = DATA[1];
    await botones.filter({ hasText: nombre }).first().click();
    await expect(page.locator(FILAS_DATOS)).toHaveCount(filas.length);
    await expect(page.locator(FILAS_CAT)).toHaveCount(1);
    await expect(botones.filter({ hasText: nombre }).first()).toHaveClass(/active/);
    await botones.filter({ hasText: 'Todas' }).click();
    await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
  });

  test('"Solo diferencias" esconde las filas iguales entre los autos elegidos', async ({ page }) => {
    // Con todos los autos casi toda fila difiere; con uno solo no se filtra nada.
    await page.check('#diffOnly');
    const conTodos = await page.locator(FILAS_DATOS).count();
    expect(conTodos).toBeGreaterThan(0);
    expect(conTodos).toBeLessThanOrEqual(92);
    await page.uncheck('#diffOnly');
    await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
  });

  test('las referencias se abren y se cierran', async ({ page }) => {
    await expect(page.locator('#legendBox')).toBeHidden();
    await page.click('#legendToggleBtn');
    await expect(page.locator('#legendBox')).toBeVisible();
    await expect(page.locator('#legendToggleBtn')).toContainText('Ocultar');
    await page.click('#legendToggleBtn');
    await expect(page.locator('#legendBox')).toBeHidden();
  });
});

test.describe('selector de autos', () => {
  test('el modal se abre y se cierra con la ✕ y tocando el fondo', async ({ page }) => {
    await page.click('#openModalBtn');
    await expect(page.locator('#modalOverlay')).toBeVisible();
    await page.click('#closeModalBtn');
    await expect(page.locator('#modalOverlay')).toBeHidden();
    await page.click('#openModalBtn');
    await page.locator('#modalOverlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#modalOverlay')).toBeHidden();
  });

  test('arranca con todos los autos y el botón cuenta N', async ({ page }) => {
    await page.click('#openModalBtn');
    await expect(page.locator('#compareCount')).toHaveText(String(N));
    await expect(page.locator('#brandDropdownBtn')).toContainText('Todas las marcas');
  });

  test('sin marcas elegidas no se puede comparar', async ({ page }) => {
    await page.click('#openModalBtn');
    await page.click('#brandDropdownBtn');
    await page.click('#brandNoneBtn');
    await expect(page.locator('#compareCount')).toHaveText('0');
    await expect(page.locator('#compareBtn')).toBeDisabled();
    await expect(page.locator('#brandDropdownBtn')).toContainText('Ninguna marca');
  });

  test('elegir una marca compara solo sus modelos y esconde el título grande', async ({ page }) => {
    const marca = 'DFSK';
    const esperados = CARS.filter(c => c.brand === marca);
    await page.click('#openModalBtn');
    await page.click('#brandDropdownBtn');
    await page.click('#brandNoneBtn');
    await page.locator('#brandList input[data-val="DFSK"]').check();
    await expect(page.locator('#compareCount')).toHaveText(String(esperados.length));
    await page.click('#compareBtn');

    await expect(page.locator('#modalOverlay')).toBeHidden();
    await expect(columnasVisibles(page)).toHaveCount(esperados.length);
    await expect(columnasVisibles(page).first()).toContainText(esperados[0].name);
    await expect(page.locator('#summaryText')).toHaveText(`🚗 Comparando ${esperados.length} auto${esperados.length === 1 ? '' : 's'}`);
    await expect(page.locator('#mainTitle')).toBeHidden();
    // Las celdas del cuerpo acompañan al header.
    const celdas = await page.locator(FILAS_DATOS).first().locator('td[data-col]:not(.col-hidden)').count();
    expect(celdas).toBe(esperados.length);
  });

  test('destildar un modelo lo saca de la comparación', async ({ page }) => {
    await page.click('#openModalBtn');
    await page.click('#modelDropdownBtn');
    await page.locator('#modelList input[data-idx="0"]').uncheck();
    await expect(page.locator('#compareCount')).toHaveText(String(N - 1));
    await expect(page.locator('#modelDropdownBtn')).toContainText(`${N - 1} de ${N} modelos`);
    await page.click('#compareBtn');
    await expect(columnasVisibles(page)).toHaveCount(N - 1);
    await expect(page.locator('#theadTable thead th').nth(1)).toBeHidden();
  });

  test('el filtro de Disponibilidad deja solo los autos con ese status', async ({ page }) => {
    const noLanzados = CARS.filter(c => c.status === 'nolanzado').length;
    await page.click('#openModalBtn');
    await page.click('#advancedToggleBtn');
    await expect(page.locator('#advancedFilters')).toBeVisible();
    await page.click('#statusNoneBtn');
    await expect(page.locator('#compareCount')).toHaveText('0');
    await page.locator('#statusRow input[data-val="nolanzado"]').check();
    await expect(page.locator('#compareCount')).toHaveText(String(noLanzados));
  });

  test('con un solo auto elegido, "Solo diferencias" no esconde filas', async ({ page }) => {
    await page.click('#openModalBtn');
    await page.click('#modelDropdownBtn');
    await page.click('#modelNoneBtn');
    await page.locator('#modelList input[data-idx="0"]').check();
    await page.click('#compareBtn');
    await page.check('#diffOnly');
    await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
  });
});

test.describe('tooltips y fotos', () => {
  test('una celda sin dato muestra su explicación en el tooltip', async ({ page }) => {
    const celda = page.locator('#mainTable .val-nd[data-tip]').first();
    const tip = await celda.getAttribute('data-tip');
    await celda.scrollIntoViewIfNeeded();
    await celda.click();
    await expect(page.locator('#tooltipBox')).toHaveClass(/visible/);
    await expect(page.locator('#tooltipBox')).toHaveText(tip);
    await page.locator('#mainTitle').click();
    await expect(page.locator('#tooltipBox')).not.toHaveClass(/visible/);
  });

  test('el zoom de la foto abre, pasa de foto con su crédito y cierra con Escape', async ({ page }, info) => {
    test.skip(info.project.name === 'celular', 'el teclado solo aplica en escritorio');
    const slug = 'byd-sealion-7';   // 6 fotos, créditos distintos por foto
    const creditos = await page.evaluate(s => window.CREDITOS_POR_FOTO[s], slug);
    const foto = page.locator(`img.car-photo[data-slug="${slug}"]`);
    await foto.scrollIntoViewIfNeeded();
    await foto.click();

    const zoom = page.locator('#fotoZoom');
    await expect(zoom).toBeVisible();
    await expect(zoom.locator('.puntos i')).toHaveCount(await page.evaluate(s => window.FOTOS_POR_AUTO[s], slug));
    await expect(zoom.locator('.credito')).toHaveText(await foto.getAttribute('data-credito'));

    await zoom.locator('.sig').click();
    await expect(zoom.locator('.puntos i').nth(1)).toHaveClass(/on/);
    await expect(zoom.locator('.credito')).toHaveText(creditos[1]);
    await expect(zoom.locator('img')).toHaveAttribute('src', `fotos/${slug}-2.jpg`);

    await page.keyboard.press('Escape');
    await expect(zoom).toBeHidden();
  });

  test('todas las fotos que declara FOTOS_POR_AUTO existen', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'escritorio', 'no depende del viewport');
    const porAuto = await page.evaluate(() => window.FOTOS_POR_AUTO);
    const urls = Object.entries(porAuto).flatMap(([slug, n]) => Array.from({ length: n }, (_, k) => `/fotos/${slug}-${k + 1}.jpg`));
    const faltantes = [];
    for (const u of urls) if (!(await request.head(u)).ok()) faltantes.push(u);
    expect(faltantes).toEqual([]);
  });
});
