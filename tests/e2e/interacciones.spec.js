// Interacciones de la página: búsqueda, categorías, solo diferencias,
// referencias, selector de autos, tooltips y zoom de fotos.
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, FILAS_CAT, N_FILAS } = require('./helpers');

const { DATA, CARS } = leerIndex();
const N = CARS.length;
const columnasVisibles = page => page.locator('#theadTable thead th:not(.feat-col):not(.col-hidden)');

let errores;
test.beforeEach(async ({ page }) => {
  errores = vigilarErrores(page);
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
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
    await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
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
    await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  });

  test('"Solo diferencias" esconde las filas iguales entre los autos elegidos', async ({ page }) => {
    // Con todos los autos casi toda fila difiere; con uno solo no se filtra nada.
    await page.check('#diffOnly');
    const conTodos = await page.locator(FILAS_DATOS).count();
    expect(conTodos).toBeGreaterThan(0);
    expect(conTodos).toBeLessThanOrEqual(N_FILAS);
    await page.uncheck('#diffOnly');
    await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
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
    // Las columnas se ordenan por dimensiones, no por el orden de CARS: se compara el conjunto.
    const vistos = await columnasVisibles(page).evaluateAll(ths => ths.map(th => +th.dataset.idx));
    expect(vistos.map(i => CARS[i].name).sort()).toEqual(esperados.map(c => c.name).sort());
    await expect(page.locator('#summaryText')).toHaveText(`Comparando ${esperados.length} auto${esperados.length === 1 ? '' : 's'}`);
    await expect(page.locator('#mainTitle')).toBeHidden();
    // Las celdas del cuerpo acompañan al header.
    const celdas = await page.locator(FILAS_DATOS).first().locator('td[data-col]:not(.col-hidden)').count();
    expect(celdas).toBe(esperados.length);
  });

  // Bug real (2026-10-01): con la tabla desplazada a la derecha, elegir 2 autos los
  // dejaba fuera de la pantalla. Las columnas ocultas seguían sumando ancho (la tabla
  // medía 4336 px con 2 autos) y el scroll se quedaba donde estaba.
  test('elegir 2 autos con la tabla desplazada los muestra en pantalla', async ({ page }) => {
    await page.locator('#tbodyWrap').evaluate(el => { el.scrollLeft = 1500; });
    expect(await page.locator('#tbodyWrap').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await page.click('#openModalBtn');
    await page.click('#modelDropdownBtn');
    await page.click('#modelNoneBtn');
    await page.locator('#modelList input[data-idx="1"]').check();
    await page.locator('#modelList input[data-idx="2"]').check();
    await expect(page.locator('#compareCount')).toHaveText('2');
    await page.click('#compareBtn');

    await expect(columnasVisibles(page)).toHaveCount(2);
    const ancho = page.viewportSize().width;
    for (const th of await columnasVisibles(page).all()) {
      const b = await th.boundingBox();
      expect(b.x, 'la columna arranca dentro de la pantalla').toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, 'la columna termina dentro de la pantalla').toBeLessThanOrEqual(ancho + 1);
    }
    // Sin espacio en blanco para desplazarse: la tabla mide lo que sus columnas visibles.
    const sobra = await page.locator('#tbodyWrap').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(sobra).toBeLessThanOrEqual(1);
    // El cuerpo mide lo mismo que el header. Las filas de categoría con colspan="47"
    // le dejaban 44 columnas vacías al cuerpo, cosa que en escritorio no se veía.
    const cuerpo = (await page.locator('#mainTable').boundingBox()).width;
    const header = (await page.locator('#theadTable').boundingBox()).width;
    expect(Math.abs(cuerpo - header)).toBeLessThanOrEqual(1);
  });

  test('destildar un modelo lo saca de la comparación', async ({ page }) => {
    await page.click('#openModalBtn');
    await page.click('#modelDropdownBtn');
    await page.locator('#modelList input[data-idx="0"]').uncheck();
    await expect(page.locator('#compareCount')).toHaveText(String(N - 1));
    await expect(page.locator('#modelDropdownBtn')).toContainText(`${N - 1} de ${N} modelos`);
    await page.click('#compareBtn');
    await expect(columnasVisibles(page)).toHaveCount(N - 1);
    await expect(page.locator('#theadTable thead th[data-idx="0"]')).toBeHidden();
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
    await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  });
});

// El zoom se muestra y recién en el cuadro siguiente (requestAnimationFrame) se
// ubica junto a la miniatura. Medirlo antes da la posición de antes de ubicarlo,
// al final del documento: el test daba un "hueco" de 9622 px según quién ganara
// la carrera. Dos cuadros alcanzan para que ya esté en su lugar.
const zoomUbicado = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

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
    const slug = 'byd-sealion-7';   // varias fotos, créditos distintos por foto
    const creditos = await page.evaluate(s => window.CREDITOS_POR_FOTO[s], slug);
    const foto = page.locator(`img.car-photo[data-slug="${slug}"]`);
    await foto.scrollIntoViewIfNeeded();
    await foto.click();

    const zoom = page.locator('#fotoZoom');
    await expect(zoom).toBeVisible();
    await expect(zoom.locator('.puntos i')).toHaveCount(await page.evaluate(s => window.FOTOS_POR_AUTO[s], slug));
    // El pie dice la vista de la foto y su crédito.
    await expect(zoom.locator('.credito')).toContainText(await foto.getAttribute('data-credito'));
    await expect(zoom.locator('.credito .foto-vista')).not.toHaveText('');

    await zoom.locator('.sig').click();
    await expect(zoom.locator('.puntos i').nth(1)).toHaveClass(/on/);
    await expect(zoom.locator('.credito')).toContainText(creditos[1]);
    await expect(zoom.locator('img')).toHaveAttribute('src', `fotos/${slug}-2.jpg`);

    await page.keyboard.press('Escape');
    await expect(zoom).toBeHidden();
  });

  // La foto ampliada tiene que quedar pegada a la miniatura. Con 8 px de hueco se
  // veía una franja con los nombres de los autos a medio tapar, y el mouse, al
  // cruzarla para ir a la foto ampliada, salía de las dos y el zoom se cerraba.
  test('la foto ampliada queda pegada a la miniatura, sin hueco', async ({ page }, info) => {
    test.skip(info.project.name === 'celular', 'el zoom por hover es de escritorio');
    const foto = page.locator('img.car-photo[data-slug="byd-sealion-7"]');
    await foto.scrollIntoViewIfNeeded();
    await foto.click();
    const zoom = page.locator('#fotoZoom');
    await expect(zoom).toBeVisible();
    await zoomUbicado(page);
    const a = await foto.boundingBox();
    const b = await zoom.boundingBox();
    const hueco = b.y > a.y ? b.y - (a.y + a.height) : a.y - (b.y + b.height);
    expect(hueco).toBeLessThanOrEqual(0);
  });

  // Si el mouse sale un instante de las dos (yendo en diagonal, o por el costado de la
  // miniatura), el zoom espera antes de cerrarse: llegar a la foto ampliada lo mantiene.
  test('el zoom aguanta que el mouse salga un instante antes de llegar a la foto ampliada', async ({ page }, info) => {
    test.skip(info.project.name === 'celular', 'el cierre por hover solo aplica con mouse');
    const slug = 'byd-sealion-7';
    const foto = page.locator(`img.car-photo[data-slug="${slug}"]`);
    await foto.scrollIntoViewIfNeeded();
    await foto.click();
    const zoom = page.locator('#fotoZoom');
    await expect(zoom).toBeVisible();
    await zoomUbicado(page);

    const a = await foto.boundingBox();
    const b = await zoom.boundingBox();
    // Al costado de la miniatura, a su altura: fuera de las dos. De a ~2 px, como un
    // mouse real; con pasos largos el movimiento salta por encima y no prueba nada.
    const afuera = { x: a.x + a.width + 6, y: a.y + a.height / 2 };
    const dentro = { x: a.x + a.width / 2, y: b.y + b.height / 2 };
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.move(afuera.x, afuera.y, { steps: Math.ceil((afuera.x - a.x - a.width / 2) / 2) });
    await page.mouse.move(dentro.x, dentro.y, { steps: Math.ceil(Math.abs(dentro.y - afuera.y) / 2) });
    await expect(zoom).toBeVisible();

    await zoom.locator('.sig').click();
    await expect(zoom.locator('img')).toHaveAttribute('src', `fotos/${slug}-2.jpg`);

    // Lejos de las dos, sí se cierra.
    await page.mouse.move(5, 790, { steps: 5 });
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

test.describe('nombres de características', () => {
  test('se ven cortos, con el nombre completo y la explicación en el tooltip', async ({ page }) => {
    const completo = 'Precio de lista (versión tope de gama de la tabla)';
    const label = page.locator(`#mainTable tr[data-nombre="${completo}"] .feat-label`);
    await expect(label).toHaveText('Precio de lista');
    expect(await label.getAttribute('data-tip')).toMatch(/^Precio de lista \(versión tope de gama de la tabla\)\. \S/);
    // Toda clave de ETIQUETA_CORTA es una fila de DATA (si se renombra una fila, el corto no se pierde en silencio).
    const huerfanas = await page.evaluate(() => { const n = new Set(DATA.flatMap(([, f]) => f.map(r => r[0]))); return Object.keys(ETIQUETA_CORTA).filter(k => !n.has(k)); });
    expect(huerfanas).toEqual([]);
    // El código busca filas por su nombre completo (data-nombre), nunca por el texto visible.
    expect(await page.evaluate(() => !!seatsDataRow)).toBe(true);
  });

  test('la búsqueda encuentra una fila también por su nombre corto', async ({ page }) => {
    await page.fill('#search', 'limpialuneta');
    await expect(page.locator(`${FILAS_DATOS}`)).toHaveCount(1);
    await expect(page.locator(`${FILAS_DATOS}`)).toHaveAttribute('data-nombre', 'Limpiaparabrisas trasero');
  });
});

test.describe('fotos en celular', () => {
  test.use({ deviceScaleFactor: 3 });
  test('en pantallas de alta densidad la portada en alta reemplaza a la miniatura', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'solo en celular');
    const img = page.locator('#theadTable th:not(.feat-col):not(.col-hidden) img.car-photo').first();
    await expect(img).toHaveAttribute('src', /\/fotos\/[a-z0-9-]+-1\.jpg$/);
  });
});
