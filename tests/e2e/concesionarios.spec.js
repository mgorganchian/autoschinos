// Red de concesionarios (2026-10-05): concesionarios.json va aparte, como las fotos,
// y la página lo baja recién al abrir la vista o la página de un auto. Lo que más
// importa: que cada marca de la tabla tenga su red o un aviso de por qué no la hay,
// que cada local lleve su fuente, y que un local con varios números no termine en
// un único link tel: con todos los dígitos pegados.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, N_FILAS } = require('./helpers');

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');
const RED = JSON.parse(fs.readFileSync(path.join(RAIZ, 'concesionarios.json'), 'utf8'));
const { CARS } = leerIndex();
const MARCAS = [...new Set(CARS.map(c => c.brand))];
const PROVINCIAS = ['Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad Autónoma de Buenos Aires', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
  'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán'];
const deMarca = m => RED.concesionarios.filter(c => c.marcas.includes(m));

test.describe('concesionarios.json', () => {
  test('cada marca de la tabla tiene su red, o un aviso de por qué no la hay', () => {
    expect(Object.keys(RED.marcas).sort()).toEqual([...MARCAS].sort());
    for (const [m, info] of Object.entries(RED.marcas)) {
      expect(info.total, m).toBe(deMarca(m).length);
      if (!info.total) expect(info.aviso, m).toBeTruthy();
      // Stelato no se vende: no hay página de red que citar.
      if (info.total) expect(info.fuente_red.length, m).toBeGreaterThan(0);
      for (const u of info.fuente_red) expect(u, m).toMatch(/^https:\/\/\S+$/);
    }
  });

  test('cada local: marca de la tabla, provincia normalizada, servicios y fuente https', () => {
    expect(RED.concesionarios.length).toBeGreaterThan(300);
    for (const c of RED.concesionarios) {
      expect(c.nombre).toBeTruthy();
      expect(c.marcas.length).toBeGreaterThan(0);
      for (const m of c.marcas) expect(MARCAS, c.nombre).toContain(m);
      expect(PROVINCIAS, c.nombre).toContain(c.provincia);
      expect(c.servicios.length).toBeGreaterThan(0);
      for (const s of c.servicios) expect(['venta', 'posventa']).toContain(s);
      expect(Array.isArray(c.fuente) && c.fuente.length > 0, c.nombre).toBe(true);
      for (const u of c.fuente) expect(u, c.nombre).toMatch(/^https:\/\/\S+$/);
    }
  });

  test('ubicaciones: dentro de la Argentina y con su precisión; zonas de Georef para elegir', () => {
    const conGeo = RED.concesionarios.filter(c => c.lat != null);
    expect(conGeo.length).toBeGreaterThan(450);
    for (const c of conGeo){
      expect(c.lat, c.nombre).toBeGreaterThan(-56); expect(c.lat, c.nombre).toBeLessThan(-21);
      expect(c.lon, c.nombre).toBeGreaterThan(-74); expect(c.lon, c.nombre).toBeLessThan(-53);
      expect(['red', 'direccion', 'localidad'], c.nombre).toContain(c.geo);
    }
    expect(RED.localidades.length).toBeGreaterThan(500);
    for (const l of RED.localidades) expect(PROVINCIAS, l.localidad).toContain(l.provincia);
  });

  test('promociones: de un auto de la tabla, con fuente https y no vencidas al consultarlas', () => {
    // Pedido del 2026-10-08: precios y promos que publican la marca o el propio concesionario.
    // Nunca un monto sin moneda, nunca una promo sin fuente.
    const slugs = new Set(leerIndex().SLUGS || []);
    const todas = [...Object.entries(RED.marcas).flatMap(([m, x]) => (x.promos || []).map(p => [m, p])),
                   ...RED.concesionarios.flatMap(c => (c.promos || []).map(p => [c.nombre, p]))];
    expect(todas.length).toBeGreaterThan(50);
    for (const [quien, p] of todas){
      expect(['precio', 'bonificacion', 'financiacion', 'entrega', 'otro'], quien).toContain(p.tipo);
      expect(p.autos.length, quien).toBeGreaterThan(0);
      if (slugs.size) for (const a of p.autos) if (a !== '*') expect(slugs.has(a), quien + ' ' + a).toBe(true);
      expect(p.fuente.length, quien).toBeGreaterThan(0);
      for (const u of p.fuente) expect(u, quien).toMatch(/^https:\/\/\S+$/);
      expect(p.consultado, quien).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.vigencia) expect(p.vigencia >= p.consultado, quien + ': vencida al consultarla').toBe(true);
      for (const f of ['precio', 'descuento']) if (p[f]){ expect(['USD', 'ARS'], quien).toContain(p[f].moneda); expect(typeof p[f].monto).toBe('number'); }
    }
  });

  test('ningún local repetido (mismo nombre, dirección y ciudad)', () => {
    const clave = c => [c.nombre, c.direccion, c.ciudad].join('|').toLowerCase();
    const vistas = new Set();
    for (const c of RED.concesionarios) {
      expect(vistas.has(clave(c)), c.nombre).toBe(false);
      vistas.add(clave(c));
    }
  });
});

let errores;
test.beforeEach(async ({ page }) => { errores = vigilarErrores(page); });
test.afterEach(() => expect(errores).toEqual([]));

async function abrir(page, query = ''){
  await page.goto('/index.html' + (query || '?tabla'));
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
}
const tarjetas = page => page.locator('#concesVista .cc');

test.describe('vista Concesionarios', () => {
  test('muestra toda la red y filtra por provincia, marca y búsqueda', async ({ page }) => {
    await abrir(page);
    await page.locator('#concesBtn').click();
    await expect(page.locator('#concesVista')).toBeVisible();
    await expect(tarjetas(page)).toHaveCount(RED.concesionarios.length);

    await page.locator('#ccMarca').selectOption('BYD');
    await expect(tarjetas(page)).toHaveCount(deMarca('BYD').length);
    for (const t of await page.locator('#concesVista .cc .cc-marcas').allTextContents()) expect(t).toContain('BYD');

    await page.locator('#ccMarca').selectOption('');
    await page.locator('#ccProv').selectOption('Tierra del Fuego');
    const tdf = RED.concesionarios.filter(c => c.provincia === 'Tierra del Fuego');
    await expect(tarjetas(page)).toHaveCount(tdf.length);

    await page.locator('#ccProv').selectOption('');
    await page.locator('#ccQ').fill('ushuaia');
    const n = await tarjetas(page).count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(tdf.length + 1);

    await page.keyboard.press('Escape');
    await expect(page.locator('#concesVista')).toBeHidden();
  });

  test('un local con varios teléfonos tiene un link por número, no uno pegado', async ({ page }) => {
    const c = RED.concesionarios.find(x => /Ventas:.*\/.*Postventa:/.test(x.telefono));
    expect(c).toBeTruthy();
    await abrir(page);
    await page.locator('#concesBtn').click();
    await page.locator('#ccQ').fill(c.nombre);
    const tel = page.locator('#concesVista .cc').filter({ hasText: c.nombre }).first().locator('a[href^="tel:"]');
    expect(await tel.count()).toBeGreaterThan(1);
    for (const h of await tel.evaluateAll(as => as.map(a => a.getAttribute('href')))) expect(h.length).toBeLessThan(20);
  });
});

const venden = m => deMarca(m).filter(c => c.servicios.includes('venta'));
test.describe('"Dónde comprarlo" en la página de cada auto', () => {
  test('lista los concesionarios que venden la marca y filtra por provincia', async ({ page }) => {
    await abrir(page, '?auto=byd-shark');
    const donde = page.locator('#fichaDonde');
    await expect(donde).toContainText(`${venden('BYD').length} concesionarios que venden BYD`);
    await donde.locator('#dondeProv').selectOption('Ciudad Autónoma de Buenos Aires');
    const caba = venden('BYD').filter(c => c.provincia === 'Ciudad Autónoma de Buenos Aires');
    await expect(donde.locator(':scope > .cc-lista .cc')).toHaveCount(caba.length);
  });

  test('con la ubicación del GPS, ordena por cercanía y muestra la zona de cada local', async ({ page, context }) => {
    // El GPS se pide solo al tocar el botón. Obelisco, CABA.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -34.6037, longitude: -58.3816 });
    await abrir(page, '?auto=byd-shark');
    await page.locator('#dondeGps').click();
    const donde = page.locator('#fichaDonde');
    await expect(donde).toContainText('Ordenado por cercanía a tu ubicación');
    const km = await donde.locator(':scope > .cc-lista .cc-dist').allTextContents();
    const n = km.map(t => parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.')));
    expect(n.length).toBeGreaterThan(5);
    for (let k = 1; k < n.length; k++) expect(n[k]).toBeGreaterThanOrEqual(n[k - 1]);
    await expect(donde.locator('.cc-zona').first()).not.toBeEmpty();
  });

  test('la mejor oferta publicada va arriba, con el local más cercano que la tiene', async ({ page }) => {
    const marca = Object.keys(RED.marcas).find(m => (RED.marcas[m].promos || []).some(p => p.precio && p.autos.length === 1 && (!p.vigencia || p.vigencia >= new Date().toISOString().slice(0, 10))));
    const p = RED.marcas[marca].promos.find(p => p.precio && p.autos.length === 1);
    await abrir(page, '?auto=' + p.autos[0]);
    const mejor = page.locator('#fichaDonde .donde-mejor');
    await expect(mejor).toContainText(/Mejor precio publicado/);
    await expect(mejor.locator('.cc-destacado')).toHaveCount(1);
  });

  test('"abrí la lista completa" lleva a la vista filtrada por la marca', async ({ page }) => {
    await abrir(page, '?auto=byd-shark');
    await page.locator('.ficha-ver-conces').click();
    await expect(page.locator('#fichaAuto')).toBeHidden();
    await expect(page.locator('#ccMarca')).toHaveValue('BYD');
    await expect(tarjetas(page)).toHaveCount(deMarca('BYD').length);
  });

  test('una marca sin red publicada muestra el porqué', async ({ page }) => {
    const sinRed = Object.keys(RED.marcas).find(m => !RED.marcas[m].total);
    const i = CARS.findIndex(c => c.brand === sinRed);
    await abrir(page);
    await page.locator(`#theadTable th[data-idx="${i}"] .th-nombre`).click();
    await expect(page.locator('#fichaDonde')).toContainText(RED.marcas[sinRed].aviso);
  });
});
