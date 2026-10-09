// Mejoras del 2026-10-08: "Ayudame a elegir", pedir cotización, historial de precios y la
// vista de concesionarios ordenada por cercanía.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, N_FILAS } = require('./helpers');

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');
const { html } = leerIndex();
const HIST = JSON.parse(/const HISTORIAL_PRECIOS = (\{.*?\});\n/.exec(html)[1]);

let errores;
test.beforeEach(async ({ page }) => { errores = vigilarErrores(page); });
test.afterEach(() => expect(errores).toEqual([]));
async function abrir(page, query = ''){
  await page.goto('/index.html' + query);
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
}

test('ayudame a elegir: la franja de precio es piso y techo, y con enchufe en casa van los que se enchufan', async ({ page }) => {
  // Pedido del 2026-10-09: "35.001 a 45.000" no trae autos de 30.000, y con enchufe en casa
  // no sugiere híbridos comunes.
  await abrir(page);
  await page.locator('#elegirBtn').click();
  await page.locator('label:has(input[name="el-presu"][value="35501-38500"])').click();
  await page.locator('label:has(input[name="el-enchufe"][value="si"])').click();
  const res = page.locator('.elegir-res > li');
  await expect(res).toHaveCount(4);   // al menos 4 (pedido del 2026-10-09)
  for (const t of await res.locator('ul').allTextContents()){
    const m = /USD ([\d.]+)/.exec(t);
    expect(m, t).toBeTruthy();
    const usd = Number(m[1].replace(/\./g, ''));
    expect(usd).toBeGreaterThanOrEqual(35501);
    expect(usd).toBeLessThanOrEqual(38500);
    expect(t).toMatch(/enchufable|eléctrico/i);
  }
  // La barra al pie cambia con cada respuesta (en el celular la lista queda fuera de la pantalla).
  const barra = page.locator('.elegir-barra');
  const antes = await barra.textContent();
  await page.locator('label:has(input[name="el-enchufe"][value="no"])').click();
  await expect(barra).not.toHaveText(antes);
  await expect(barra).toHaveClass(/cambio/);
  for (const t of await res.locator("ul").allTextContents()) expect(t).not.toMatch(/necesita dónde cargar/);
  await page.locator('label:has(input[name="el-presu"][value=""])').click();
  await expect(res).toHaveCount(4);
  await page.locator('[data-elegir-comparar="top"]').click();
  await expect(page).toHaveURL(/\?autos=[^,]+,[^,]+,[^,]+,[^,&]+/);
});

test('ayudame a elegir: comparar todos los que cumplen, y sumando los que no publican precio', async ({ page }) => {
  // Pedido del 2026-10-09: además de los 4 sugeridos, comparar los N que cumplen y los N + los
  // que cumplen todo menos el precio (no lo publican en dólares).
  await abrir(page);
  await page.locator('#elegirBtn').click();
  await page.locator('label:has(input[name="el-presu"][value="32001-35500"])').click();
  const todos = page.locator('[data-elegir-comparar="todos"]');
  const n = Number(/Los (\d+)/.exec(await todos.textContent())[1]);
  expect(n).toBeGreaterThan(4);
  const conSin = page.locator('[data-elegir-comparar="sinprecio"]');
  const m = /Los (\d+) \(\+(\d+) sin precio\)/.exec(await conSin.textContent());
  expect(Number(m[1])).toBe(n + Number(m[2]));
  await conSin.click();
  await expect(page).toHaveURL(/\?autos=/);
  const autos = new URL(page.url()).searchParams.get('autos').split(',');
  expect(autos).toHaveLength(Number(m[1]));
});

test('ayudame a elegir: en el celular los botones de comparar van en una fila, siempre a la vista', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await page.locator('#elegirBtn').click();
  await page.locator('label:has(input[name="el-presu"][value="32001-35500"])').click();
  const btns = page.locator('.elegir-barra-btns .ficha-btn');
  await expect(btns).toHaveCount(3);
  const tops = await btns.evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  for (const t of tops) expect(t).toBeLessThan(844);
});

test('pedir cotización: WhatsApp solo con número internacional y el auto en el mensaje', async ({ page }) => {
  const RED = JSON.parse(fs.readFileSync(path.join(RAIZ, 'concesionarios.json'), 'utf8'));
  const { CARS, SLUGS } = leerIndex();
  const local = RED.concesionarios.find(c => c.servicios.includes('venta') && /\+?54\s*9?[\d\s-]{10,}/.test(c.whatsapp || ''));
  const i = CARS.findIndex(c => local.marcas.includes(c.brand));
  await abrir(page, '?auto=' + SLUGS[i]);
  await page.locator('#dondeProv').selectOption(local.provincia);
  const links = page.locator('#fichaDonde .cc-cotizar a');
  await expect(links.first()).toBeVisible();
  for (const h of await links.evaluateAll(as => as.map(a => a.href))){
    expect(h).toMatch(/^(https:\/\/wa\.me\/54\d{10,}\?text=|mailto:)/);
    expect(decodeURIComponent(h)).toContain(CARS[i].name);
  }
  expect((await links.evaluateAll(as => as.map(a => a.href))).some(h => h.startsWith('https://wa.me/'))).toBe(true);
});

test('historial de precios: cada entrada con fecha, monto y fuente https; se ve en la página del auto', async ({ page }) => {
  for (const [slug, h] of Object.entries(HIST)) for (const x of h){
    expect(x[0], slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof x[1], slug).toBe('number');
    expect(x[3], slug).toMatch(/^https:\/\//);
  }
  const conCambio = Object.entries(HIST).find(([, h]) => h.length > 1 && h[h.length - 1][2] === h[h.length - 2][2]);
  expect(conCambio).toBeTruthy();
  await abrir(page, '?auto=' + conCambio[0]);
  await expect(page.locator('.ficha-hist-res')).toContainText(/(Bajó|Subió) USD/);
});

test('la vista Concesionarios ordena por cercanía con la ubicación del GPS', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -31.4135, longitude: -64.1811 });   // Córdoba capital
  await abrir(page);
  await page.locator('#concesBtn').click();
  await page.locator('#dondeGps').click();
  await expect(page.locator('#concesVista')).toContainText('Ordenado por cercanía a tu ubicación');
  const km = await page.locator('#concesVista .cc-dist').allTextContents();
  const n = km.map(t => parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.')));
  expect(n.length).toBeGreaterThan(100);
  for (let k = 1; k < n.length; k++) expect(n[k]).toBeGreaterThanOrEqual(n[k - 1]);
  expect(n[0]).toBeLessThan(20);
});

test('novedades: la página y el RSS existen y el RSS es XML válido', () => {
  const rss = fs.readFileSync(path.join(RAIZ, 'novedades.xml'), 'utf8');
  expect(rss).toMatch(/^<\?xml/);
  expect((rss.match(/<item>/g) || []).length).toBeGreaterThan(5);
  expect(fs.readFileSync(path.join(RAIZ, 'novedades.html'), 'utf8')).toContain('<h1>Novedades</h1>');
});
