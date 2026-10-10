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
  await page.goto('/index.html' + (query || '?tabla'));
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
}

test('ayudame a elegir: la franja de precio es piso y techo, y con enchufe en casa van los que se enchufan', async ({ page }) => {
  // Pedido del 2026-10-09: "35.001 a 45.000" no trae autos de 30.000, y con enchufe en casa
  // no sugiere híbridos comunes.
  await abrir(page);
  await page.locator('#vistaElegir').click();
  await page.locator('label:has(input[name="el-presu"][value="35501-38500"])').click();
  await page.locator('label:has(input[name="el-enchufe"][value="si"])').click();
  const res = page.locator('.elegir-res > li');
  // 5 en escritorio y 4 en el celular (pedido del 2026-10-09).
  const N = page.viewportSize().width >= 900 ? 5 : 4;
  await expect(res).toHaveCount(N);
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
  await expect(res).toHaveCount(N);
  await page.locator('[data-elegir-comparar="top"]').click();
  await expect(page).toHaveURL(/\?autos=/);
  expect(new URL(page.url()).searchParams.get('autos').split(',')).toHaveLength(N);
});

test('ayudame a elegir: comparar todos los que cumplen, y sumando los que no publican precio', async ({ page }) => {
  // Pedido del 2026-10-09: además de los 4 sugeridos, comparar los N que cumplen y los N + los
  // que cumplen todo menos el precio (no lo publican en dólares).
  await abrir(page);
  await page.locator('#vistaElegir').click();
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
  await page.locator('#vistaElegir').click();
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

test('la portada empieza en "Ayudame a elegir"; un link con parámetros o ?tabla va directo', async ({ page }) => {
  // Pedido del 2026-10-09.
  // Desde el 2026-10-09 es una vista de la página (pestaña junto a Tabla y Ranking), no un panel:
  // nada oscurecido detrás, y las pestañas siguen a mano.
  await page.goto('/index.html');
  await expect(page.locator('#elegirHoja')).toBeVisible();
  await expect(page.locator('#vistaElegir')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.ficha-overlay:visible')).toHaveCount(0);
  await expect(page.locator('#tbodyWrap')).toBeHidden();
  await page.locator('#vistaTabla').click();
  await expect(page.locator('#elegirHoja')).toBeHidden();
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  await page.locator('#vistaElegir').click();
  await page.locator('#elegirTabla').click();
  await expect(page.locator('#tbodyWrap')).toBeVisible();
  await page.goto('/index.html?autos=byd-shark,maxus-t60');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  await expect(page.locator('#elegirHoja')).toBeHidden();
});

test('el visor agranda la foto y recorre las demás, desde Ayudame a elegir y desde la página del auto', async ({ page }) => {
  // Pedido del 2026-10-09: en escritorio y en el celular.
  await page.goto('/index.html');
  await page.locator('.elegir-foto').first().click();
  const visor = page.locator('#visorFotos');
  await expect(visor).toBeVisible();
  await expect(visor.locator('.visor-nombre')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(visor).toBeHidden();
  await page.goto('/index.html?auto=tank-300');
  await page.locator('#fichaImg').click();
  await expect(visor).toBeVisible();
  await expect(visor.locator('.visor-nombre')).toContainText('Tank 300');
  const pie = visor.locator('.visor-pie');
  const antes = await pie.textContent();
  await visor.locator('.visor-nav.sig').click();
  await expect(pie).not.toHaveText(antes);
  await expect(visor.locator('.visor-puntos i.on')).toHaveCount(1);
  await visor.locator('.visor-cerrar').click();
  await expect(visor).toBeHidden();
  await expect(page.locator('#fichaAuto')).toBeVisible();   // cerrar el visor no cierra la página del auto
});

test('las flechitas de las miniaturas cambian la foto en el lugar, y al agrandarla arranca en esa', async ({ page }) => {
  // Pedido del 2026-10-09: en todos los lugares con fotos, sin abrir nada al tocar la flecha.
  const segunda = /tank-300-2\.jpg$/;
  await page.goto('/index.html?autos=tank-300,byd-shark');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const caja = page.locator('#theadTable .minicar[data-mini-slug="tank-300"]');
  await caja.locator('.mini-nav.sig').click();
  await expect(caja.locator('img')).toHaveAttribute('src', segunda);
  await expect(page.locator('#fotoZoom')).toBeHidden();
  await expect(page.locator('#fichaAuto')).toBeHidden();
  await caja.locator('img').click();
  await expect(page.locator('#fotoZoom .puntos i').nth(1)).toHaveClass(/on/);
  await caja.locator('.mini-nav.ant').click();
  await expect(caja.locator('img')).not.toHaveAttribute('src', segunda);

  // En el selector, la flecha no tilda ni destilda el auto.
  await page.click('#openModalBtn');
  await page.click('#modelDropdownBtn');
  await page.fill('#modelBuscar', 'tank 300');
  const tarjeta = page.locator('#modelList .mcard').filter({ has: page.locator('[data-mini-slug="tank-300"]') });
  const tildado = await tarjeta.locator('input').isChecked();
  await tarjeta.locator('.mini-nav.sig').click();
  await expect(tarjeta.locator('img')).toHaveAttribute('src', segunda);
  expect(await tarjeta.locator('input').isChecked()).toBe(tildado);

  // En la página del auto, la flecha de un parecido no abre su página.
  if (page.viewportSize().width >= 768){
    await page.goto('/index.html?auto=tank-300');
    const parecido = page.locator('.ficha-sim .minicar:has(.mini-nav)').first();
    await parecido.hover();
    await parecido.locator('.mini-nav.sig').click();
    await expect(parecido.locator('img')).toHaveAttribute('src', /-2\.jpg$/);
    expect(page.url()).toContain('auto=tank-300');
  }

  // En Ayudame a elegir, el visor arranca en la foto que muestra la miniatura.
  await page.goto('/index.html');
  const sugerido = page.locator('.elegir-res .minicar:has(.mini-nav)').first();
  await sugerido.locator('.mini-nav.sig').click();
  await expect(page.locator('#visorFotos')).toBeHidden();
  await sugerido.locator('.elegir-foto').click();
  await expect(page.locator('#visorFotos .visor-puntos i').nth(1)).toHaveClass(/on/);
});

test('cada lugar con fotos de autos trae sus flechitas', async ({ page }) => {
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  await expect(page.locator('#theadTable .minicar[data-mini-slug="tank-300"] .mini-nav')).toHaveCount(2);
  await page.click('#vistaRanking');
  const rk = page.locator('#rkLista .rk-item .minicar:has(.mini-nav)').first();
  if (!page.viewportSize() || page.viewportSize().width < 768){
    // En el celular las fotos chicas no llevan flechas: tapaban la foto.
    await expect(rk.locator('.mini-nav').first()).toBeHidden();
    return;
  }
  // En escritorio, las de las fotos chicas aparecen solo al pasar el mouse.
  await expect(rk.locator('.mini-nav.sig')).toHaveCSS('opacity', '0');
  await rk.hover();
  await expect(rk.locator('.mini-nav.sig')).toHaveCSS('opacity', '1');
  // Una flecha del ranking no abre la página del auto.
  await rk.locator('.mini-nav.sig').click();
  await expect(page.locator('#fichaAuto')).toBeHidden();
});

test('en el celular los nombres de fila no se parten en cualquier sílaba ni hay textos cortados con "…"', async ({ page }) => {
  // Pedido del 2026-10-10: con la letra al 130%, lo que no entra se resume (ETIQUETA_CEL), no se corta.
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const huerfanas = await page.evaluate(() => { const n = new Set(DATA.flatMap(([, f]) => f.map(r => r[0]))); return Object.keys(ETIQUETA_CEL).filter(k => !n.has(k)); });
  expect(huerfanas).toEqual([]);
  if (page.viewportSize().width > 600) return;
  await expect(page.locator('#theadTable th.feat-col')).toHaveText('Dato');
  const partidas = await page.evaluate(() => {
    const malas = [];
    document.querySelectorAll('#mainTable span.feat-label').forEach(sp => {
      const t = sp.firstChild; const re = /\S+/g; let m;
      while ((m = re.exec(t.textContent))) {
        if (m[0].includes('­')) continue;   // corte elegido a mano
        const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
        if (new Set([...r.getClientRects()].filter(x => x.width).map(x => Math.round(x.top))).size > 1) malas.push(m[0]);
      }
    });
    return malas;
  });
  expect(partidas).toEqual([]);
  await page.click('#vistaRanking');
  const cortados = await page.locator('#rkLista .rk-nombre span, #rkLista .rk-orig').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  expect(cortados).toEqual([]);
});
