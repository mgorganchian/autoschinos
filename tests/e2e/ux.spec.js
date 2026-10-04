// Herramientas de la tabla agregadas el 2026-10-03: link compartible, presupuesto,
// auto de referencia, orden de columnas, categorías plegables, modo oscuro e
// impresión. Lo que más importa: que el link reproduzca la misma comparación, que
// la referencia compare solo lo comparable, y que reordenar columnas no desalinee
// ninguna celda respecto de su auto.
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS } = require('./helpers');

const { CARS } = leerIndex();
const indice = nombre => CARS.findIndex(c => c.name === nombre);
const columnas = page => page.locator('#theadTable thead th:not(.feat-col):not(.col-hidden)');
const idxVisibles = page => columnas(page).evaluateAll(ths => ths.map(th => +th.dataset.idx));
const filaPrecio = page => page.locator('#mainTable tbody tr[data-search^="precio de lista"]');

let errores;
test.beforeEach(async ({ page }) => {
  errores = vigilarErrores(page);
});
test.afterEach(() => expect(errores).toEqual([]));

async function abrir(page, query = ''){
  await page.goto('/index.html' + query);
  await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
}

test.describe('link compartible', () => {
  test('comparar deja los autos en la URL, y esa URL los vuelve a mostrar', async ({ page }) => {
    await abrir(page);
    const elegidos = ['BYD Shark', 'Maxus T60', 'JAC T8'].map(indice);
    await page.click('#openModalBtn');
    await page.click('#modelDropdownBtn');
    await page.click('#modelNoneBtn');
    for (const i of elegidos) await page.locator(`#modelList input[data-idx="${i}"]`).check();
    await page.click('#compareBtn');
    await expect(page).toHaveURL(/\?autos=byd-shark,/);
    const url = page.url();

    await page.goto(url);
    await expect(page.locator(FILAS_DATOS)).toHaveCount(92);
    expect((await idxVisibles(page)).sort((a, b) => a - b)).toEqual(elegidos.sort((a, b) => a - b));
    await expect(page.locator('#summaryText')).toHaveText('🚗 Comparando 3 autos');
    await expect(page.locator('#mainTitle')).toBeHidden();       // como después de "Comparar"
    await expect(page.locator('#shareBtn')).toBeVisible();
  });

  test('referencia y orden también viajan; un auto que no existe se ignora', async ({ page }) => {
    await abrir(page, '?autos=byd-shark,maxus-t60,jac-t8,no-existe&ref=jac-t8&orden=precio-de-lista');
    const vis = await idxVisibles(page);
    expect(vis).toHaveLength(3);
    expect(vis[0]).toBe(indice('JAC T8'));                        // la referencia va primera
    await expect(page.locator('#ordenSel')).toHaveValue('precio-de-lista');
    await expect(page.locator('#refInfo')).toBeVisible();
  });

  test('sin selección no hay nada en la URL ni botón de compartir', async ({ page }) => {
    await abrir(page);
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('#shareBtn')).toBeHidden();
  });
});

test.describe('presupuesto', () => {
  test('el tope deja solo los autos que entran, y los sin precio según el tilde', async ({ page }) => {
    await abrir(page);
    const precios = await page.evaluate(() => SIM_PRECIO);
    await page.click('#openModalBtn');
    await page.locator('#precioMaxIn').fill('30000');
    const entran = precios.filter(p => p != null && p <= 30000).length;
    const sinPrecio = precios.filter(p => p == null).length;
    await expect(page.locator('#compareCount')).toHaveText(String(entran + sinPrecio));
    await page.locator('#precioSinDato').uncheck();
    await expect(page.locator('#compareCount')).toHaveText(String(entran));
    await page.click('#compareBtn');
    for (const i of await idxVisibles(page)) expect(precios[i]).toBeLessThanOrEqual(30000);
  });

  test('"Sin límite" vuelve a incluir todo', async ({ page }) => {
    await abrir(page);
    await page.click('#openModalBtn');
    await page.locator('#precioMaxIn').fill('25000');
    await page.click('#precioResetBtn');
    await expect(page.locator('#compareCount')).toHaveText(String(CARS.length));
  });
});

test.describe('auto de referencia', () => {
  test('queda primero, resaltado, y marca mejor/peor solo con cifras comparables', async ({ page }) => {
    await abrir(page, '?autos=byd-shark,maxus-t60,jac-t8,foton-tunland-v7');
    const shark = indice('BYD Shark');
    await page.locator(`#theadTable th[data-idx="${shark}"] .ref-btn`).click();
    expect((await idxVisibles(page))[0]).toBe(shark);
    await expect(page.locator(`#theadTable th[data-idx="${shark}"]`)).toHaveClass(/col-ref/);
    await expect(page).toHaveURL(/ref=byd-shark/);

    // Precio: más barato que el Shark es mejor (▲). La V7 no tiene precio en USD: sin marca.
    const precios = await page.evaluate(() => SIM_PRECIO);
    for (const nombre of ['Maxus T60', 'JAC T8']){
      const celda = filaPrecio(page).locator(`td[data-col="${indice(nombre)}"] .ref-cmp`);
      await expect(celda).toHaveClass(precios[indice(nombre)] < precios[shark] ? /mejor/ : /peor/);
    }
    await expect(filaPrecio(page).locator(`td[data-col="${indice('Foton Tunland V7')}"] .ref-cmp`)).toHaveCount(0);
    // Las dimensiones no tienen "mejor": ninguna marca.
    await expect(page.locator('#mainTable tr[data-search="longitud (mm)"] .ref-cmp')).toHaveCount(0);
  });

  test('en consumo, un enchufable no se compara contra la referencia', async ({ page }) => {
    await abrir(page, '?autos=byd-shark,jac-t8&ref=jac-t8');
    const fila = page.locator('#mainTable tr[data-search^="consumo combustible"]');
    await expect(fila.locator(`td[data-col="${indice('BYD Shark')}"] .ref-cmp`)).toHaveCount(0);
  });

  test('tocar de nuevo el pin o "quitar" saca la referencia', async ({ page }) => {
    await abrir(page, '?autos=byd-shark,maxus-t60&ref=maxus-t60');
    await page.click('#refQuitarBtn');
    await expect(page.locator('#mainTable .ref-cmp')).toHaveCount(0);
    await expect(page.locator('#refInfo')).toBeHidden();
    expect(page.url()).not.toContain('ref=');
  });
});

test.describe('orden de columnas', () => {
  test('por precio: de menor a mayor y los que no tienen precio al final', async ({ page }) => {
    await abrir(page, '?autos=byd-shark,maxus-t60,jac-t8,foton-tunland-v7,mg-3');
    await page.selectOption('#ordenSel', 'precio-de-lista');
    const precios = await page.evaluate(() => SIM_PRECIO);
    const orden = (await idxVisibles(page)).map(i => precios[i]);
    const conPrecio = orden.filter(p => p != null);
    expect(conPrecio).toEqual([...conPrecio].sort((a, b) => a - b));
    expect(orden.slice(conPrecio.length).every(p => p == null)).toBe(true);
  });

  test('por defecto, por dimensiones: largo, después ancho, después alto, y sin largo al final', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#ordenSel')).toHaveValue('');
    await expect(page.locator('#ordenSel option:checked')).toHaveText(/Dimensiones/);
    const dims = await page.evaluate(() => DIMS);
    const orden = (await idxVisibles(page)).map(i => dims[i]);
    const conLargo = orden.filter(d => d[0] != null);
    for (let k = 1; k < conLargo.length; k++){
      const [a, b] = [conLargo[k - 1], conLargo[k]];
      const j = a.findIndex((x, n) => x !== b[n]);
      if (j >= 0 && a[j] != null && b[j] != null) expect(a[j], `${a} antes que ${b}`).toBeGreaterThan(b[j]);
    }
    expect(orden.slice(conLargo.length).every(d => d[0] == null)).toBe(true);
  });

  test('reordenar no desalinea: cada celda sigue debajo de su auto', async ({ page }) => {
    await abrir(page, '?autos=byd-shark,maxus-t60,jac-t8,mg-3&orden=precio-de-lista');
    const enc = await idxVisibles(page);
    const celdas = await filaPrecio(page).locator('td[data-col]:not(.col-hidden)').evaluateAll(tds => tds.map(td => +td.dataset.col));
    expect(celdas).toEqual(enc);
  });
});

test.describe('categorías plegables', () => {
  test('tocar la categoría esconde sus filas y la deja visible para reabrirla', async ({ page }) => {
    await abrir(page);
    const cat = page.locator('#mainTable tr.cat-row[data-cat="0"] td');
    const filas = page.locator('#mainTable tbody tr[data-cat="0"]:not(.cat-row)');
    await cat.click();
    await expect(cat).toHaveAttribute('aria-expanded', 'false');
    await expect(filas.first()).toBeHidden();
    await expect(cat).toBeVisible();
    await cat.click();
    await expect(filas.first()).toBeVisible();
  });

  // La celda de la categoría abarca todas las columnas (10.000 px con todos los
  // autos): centrado, el nombre quedaba fuera de la pantalla y plegado no se veía
  // ninguno (2026-10-03). Tiene que estar a la vista, también scrolleando al costado.
  test('los nombres de categoría se ven en pantalla, aunque se scrollee al costado', async ({ page }) => {
    await abrir(page);
    await page.click('#plegarTodoBtn');
    // Se mide el texto de cada celda, no un elemento en particular: vale para
    // cualquier forma de armar la fila.
    const enPantalla = () => page.locator('#mainTable tr.cat-row td').evaluateAll(tds => tds.length === 14 &&
      tds.every(td => { const rg = document.createRange(); rg.selectNodeContents(td); const r = rg.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.width > 20; }));
    expect(await enPantalla()).toBe(true);
    await page.evaluate(() => { document.getElementById('tbodyWrap').scrollLeft = 4000; });
    expect(await enPantalla()).toBe(true);
  });

  test('"Plegar todo" deja solo los títulos de categoría', async ({ page }) => {
    await abrir(page);
    await page.click('#plegarTodoBtn');
    await expect(page.locator('#mainTable tbody tr:not(.cat-row):visible')).toHaveCount(0);
    await expect(page.locator('#mainTable tbody tr.cat-row:visible')).toHaveCount(14);
    await expect(page.locator('#noResults')).toBeHidden();
    await expect(page.locator('#plegarTodoBtn')).toHaveText('⊞ Desplegar todo');
  });
});

test.describe('modo oscuro', () => {
  test('sigue al sistema, y el botón lo cambia y lo recuerda', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await abrir(page);
    const fondo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const oscuro = await fondo();
    expect(oscuro).not.toBe('rgb(246, 247, 249)');
    await page.click('#temaBtn');
    await expect.poll(fondo).toBe('rgb(246, 247, 249)');
    await page.reload();
    await expect.poll(fondo).toBe('rgb(246, 247, 249)');           // quedó guardado
  });
});

test.describe('impresión', () => {
  test('imprime en claro, sin controles y con el encabezado de autos en la tabla', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await abrir(page, '?autos=byd-shark,maxus-t60,jac-t8');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(page.locator('#mainTable #theadImpresion th:not(.feat-col):not(.col-hidden)')).toHaveCount(3);
    await expect(page.locator('.toolbar-row').first()).toBeHidden();
    await expect(page.locator('#theadWrap')).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('#theadImpresion')).toHaveCount(0);
  });
});
