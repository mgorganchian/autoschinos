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
  await page.goto('/index.html' + query);
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

test.describe('"Dónde verlo" en la página de cada auto', () => {
  test('lista los concesionarios de su marca y filtra por provincia', async ({ page }) => {
    await abrir(page, '?auto=byd-shark');
    const donde = page.locator('#fichaDonde');
    await expect(donde).toContainText(`${deMarca('BYD').length} concesionarios de BYD`);
    await donde.locator('#fichaProv').selectOption('Ciudad Autónoma de Buenos Aires');
    const caba = deMarca('BYD').filter(c => c.provincia === 'Ciudad Autónoma de Buenos Aires');
    await expect(donde.locator('.cc')).toHaveCount(caba.length);
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
