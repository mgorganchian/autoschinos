// Mejoras del 2026-10-08: "Ayudame a elegir", pedir cotización, historial de precios y la
// vista de concesionarios ordenada por cercanía.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, N_FILAS } = require('./helpers');

const RAIZ = process.env.AUTOLOFY_RAIZ || path.resolve(__dirname, '../..');
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
  await page.locator('label:has(input[name="el-presu"][value="35501-39800"])').click();
  await page.locator('label:has(input[name="el-enchufe"][value="si"])').click();
  const res = page.locator('.elegir-res > li');
  // 5 en escritorio y 4 en el celular (pedido del 2026-10-09).
  const N = page.viewportSize().width >= 900 ? 5 : 4;
  await expect(res).toHaveCount(N);
  // El precio que cuenta es PRECIO_CMP: el de dólares o la lista en pesos pasada a dólares (issue #60).
  const precios = await page.evaluate(() => PRECIO_CMP);
  for (const li of await res.all()){
    const t = await li.locator('ul').textContent();
    const usd = precios[+(await li.locator('> [data-elegir-ficha]').getAttribute('data-elegir-ficha'))];
    expect(usd, t).toBeGreaterThanOrEqual(35501);
    expect(usd, t).toBeLessThanOrEqual(39800);
    expect(t).toMatch(/enchufable|eléctrico/i);
  }
  // La barra al pie cambia con cada respuesta (en el celular la lista queda fuera de la pantalla).
  const barra = page.locator('.elegir-barra');
  await page.locator('label:has(input[name="el-enchufe"][value="no"])').click();
  // La barra ya no nombra los sugeridos (2026-10-10: mucho texto): dice si cambiaron y se ilumina.
  await expect(barra).toContainText(/Nuevas sugerencias|Sin cambios/);
  await expect(barra).toHaveClass(/cambio/);
  for (const t of await res.locator("ul").allTextContents()) expect(t).not.toMatch(/necesita dónde cargar/i);
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
  const m = /\+(\d+) sin precio/.exec(await conSin.textContent());
  expect(Number(m[1])).toBeGreaterThan(0);
  await conSin.click();
  await expect(page).toHaveURL(/\?autos=/);
  const autos = new URL(page.url()).searchParams.get('autos').split(',');
  expect(autos).toHaveLength(n + Number(m[1]));
});

test('ayudame a elegir: en el celular los botones de comparar van en una fila, siempre a la vista', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await page.locator('#vistaElegir').click();
  await page.locator('label:has(input[name="el-presu"][value="32001-35500"])').click();
  const btns = page.locator('.elegir-barra-btns .ficha-btn');
  await expect(btns).toHaveCount(3);
  // El principal es más alto (2026-10-10): la misma fila es el mismo centro, no el mismo borde.
  const centros = await btns.evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return r.top + r.height / 2; }));
  expect(Math.max(...centros) - Math.min(...centros)).toBeLessThan(4);
  for (const c of centros) expect(c).toBeLessThan(844);
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
  await page.goto('/index.html?auto=gwm-tank-300');
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
  await page.goto('/index.html?autos=gwm-tank-300,byd-shark');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const caja = page.locator('#theadTable .minicar[data-mini-slug="gwm-tank-300"]');
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
  const tarjeta = page.locator('#modelList .mcard').filter({ has: page.locator('[data-mini-slug="gwm-tank-300"]') });
  const tildado = await tarjeta.locator('input').isChecked();
  await tarjeta.locator('.mini-nav.sig').click();
  await expect(tarjeta.locator('img')).toHaveAttribute('src', segunda);
  expect(await tarjeta.locator('input').isChecked()).toBe(tildado);

  // En la página del auto, la flecha de un parecido no abre su página.
  if (page.viewportSize().width >= 768){
    await page.goto('/index.html?auto=gwm-tank-300');
    const parecido = page.locator('.ficha-sim .minicar:has(.mini-nav)').first();
    await parecido.hover();
    await parecido.locator('.mini-nav.sig').click();
    await expect(parecido.locator('img')).toHaveAttribute('src', /-2\.jpg$/);
    expect(page.url()).toContain('auto=gwm-tank-300');
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
  await expect(page.locator('#theadTable .minicar[data-mini-slug="gwm-tank-300"] .mini-nav')).toHaveCount(2);
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

test('ayudame a elegir: "Ver ficha" va en el renglón del nombre y el botón de comparar destella', async ({ page }) => {
  // Pedido del 2026-10-10: tarjetas más bajas y que se note cuál es el botón a apretar.
  await page.goto('/index.html');
  const li = page.locator('.elegir-res > li').first();
  const [nombre, ver] = await Promise.all([li.locator('> b').boundingBox(), li.locator('> [data-elegir-ficha]').boundingBox()]);
  expect(Math.abs((nombre.y + nombre.height / 2) - (ver.y + ver.height / 2))).toBeLessThan(nombre.height);
  expect(ver.x).toBeGreaterThan(nombre.x + nombre.width);
  const anim = await page.locator('.elegir-barra-btns .ficha-btn.primario').evaluate(b => getComputedStyle(b).animationName);
  expect(anim).toBe('destelloComparar');
});

test('ayudame a elegir: el nombre del auto abre su ficha, y la foto la agranda', async ({ page }) => {
  // Issue #87 (2026-10-31): «Ver ficha» se veía poco y se tocaba la foto, que solo la agranda.
  await page.goto('/index.html');
  const li = page.locator('.elegir-res > li').first();
  const nombre = li.locator('.elegir-nombre');
  const auto = await nombre.textContent();
  await nombre.click();
  await expect(page.locator('#fichaHoja')).toBeVisible();
  await expect(page.locator('#fichaHoja')).toContainText(auto);
  await page.keyboard.press('Escape');
  await expect(page.locator('#fichaHoja')).toBeHidden();
  // El cartel de por qué lo sugerimos sigue al lado del nombre, fuera del botón.
  await expect(li.locator('> b > .elegir-porque')).toHaveCount(1);
  await li.locator('.elegir-foto').click();
  await expect(page.locator('#visorFotos')).toBeVisible();
});

test('respaldo de fábrica: la fábrica en el Mercosur tiene fuente, se ve en la tabla y pesa en A tu medida', async ({ page }) => {
  // Pedido del 2026-10-10: después del precio, de lo que más pesa (repuestos).
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const fabs = await page.evaluate(() => Object.entries(MARCAS_INFO).filter(([, m]) => m.fabrica_mercosur).map(([k, m]) => [k, m.fabrica_mercosur]));
  expect(fabs.map(([k]) => k).sort()).toEqual(['Audi', 'BMW', 'BYD', 'Changan', 'Chery', 'Chevrolet', 'Citroën', 'Fiat', 'Ford', 'Haval', 'Honda', 'Hyundai', 'Jeep', 'Nissan', 'Ora', 'Peugeot', 'Poer', 'RAM', 'Renault', 'Tank', 'Toyota', 'Volkswagen']);
  for (const [k, f] of fabs){
    expect(f.fuentes.length, k).toBeGreaterThan(0);
    for (const u of f.fuentes) expect(u, k).toMatch(/^https:\/\//);
    expect(f.pais && f.planta && f.desde, k).toBeTruthy();
  }
  const byd = await page.evaluate(() => CARS.findIndex(c => c.brand === 'BYD' && c.status === 'venta'));
  await expect(page.locator(`#mainTable tr[data-nombre="Importador en Argentina"] td[data-col="${byd}"] .fabrica-merc`)).toHaveText('Fábrica en Brasil');
  await page.click('#vistaRanking');
  const sel = page.locator('#rkElegirSel');
  if (await sel.isVisible()) await sel.selectOption('__medida'); else await page.locator('#rkScroll .rk-chip[data-fila="__medida"]').click();
  await expect(page.locator('select[data-peso="__respaldo"]')).toHaveValue('3');
});

test('ayudame a elegir: cada sugerido tiene a lo sumo 4 renglones y en el celular cada uno entra en una línea', async ({ page }) => {
  // Pedido del 2026-10-10: precio y propulsión, cómo es el auto y los dos motivos que más pesan.
  await page.goto('/index.html');
  const items = page.locator('.elegir-res > li');
  for (const n of await items.locator('ul').evaluateAll(us => us.map(u => u.children.length))) expect(n).toBeLessThanOrEqual(4);
  await expect(items.first().locator('ul > li').nth(1)).toHaveText(/\d,\d m/);   // el renglón de cómo es el auto
  if (page.viewportSize().width > 640) return;
  const dobles = await page.locator('.elegir-res ul > li').evaluateAll(ls => ls.filter(li => li.getBoundingClientRect().height > 1.5 * parseFloat(getComputedStyle(li).lineHeight)).map(li => li.textContent));
  expect(dobles).toEqual([]);
});

test('tema claro: el encabezado, el de la tabla y las categorías son claros, y "Elegir autos" destella en verde', async ({ page }) => {
  // Pedido del 2026-10-10: nada oscuro arriba en el tema claro, con contraste fácil de leer.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/index.html?autos=gwm-tank-300,byd-shark');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const claros = await page.evaluate(() => ['header', '#theadWrap', '#theadTable thead th', '#mainTable tr.cat-row td'].map(sel => {
    const [r, g, b] = getComputedStyle(document.querySelector(sel)).backgroundColor.match(/[\d.]+/g).map(Number);
    return [sel, (r + g + b) / 3 > 180];
  }));
  for (const [sel, ok] of claros) expect(ok, sel).toBe(true);
  const btn = page.locator('#openModalBtn');
  expect(await btn.evaluate(b => getComputedStyle(b).animationName)).toBe('destelloElegir');
  await page.emulateMedia({ colorScheme: 'dark' });
  const [r, g, b] = (await page.locator('header').evaluate(h => getComputedStyle(h).backgroundColor)).match(/[\d.]+/g).map(Number);
  expect((r + g + b) / 3).toBeLessThan(60);   // en el oscuro sigue oscuro
});

test('accesibilidad y carga: el panel "Elegir autos" se maneja con teclado y sus fotos no se bajan de entrada', async ({ page }) => {
  // Arreglos medidos el 2026-10-10: Tab se escapaba al fondo, Esc no cerraba y las 124 fotos
  // del panel cerrado se bajaban en cada visita (1,15 MB).
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const sinLazy = await page.locator('#modelList img').evaluateAll(is => is.filter(i => i.loading !== 'lazy').length);
  expect(sinLazy).toBe(0);
  await page.focus('#openModalBtn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modalOverlay')).toBeVisible();
  for (let k = 0; k < 25; k++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.modal-sheet'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalOverlay')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement.id)).toBe('openModalBtn');
  await expect(page.locator('a.saltar')).toHaveAttribute('href', '#contenido');
  await expect(page.locator('main#contenido')).toHaveCount(1);
});

test('botón Atrás: deshace el último paso (ficha, Grupos, vista, comparar) sin salir del sitio', async ({ page }) => {
  // Pedido del 2026-10-10 (Baymard: el 59% de los sitios lo rompe).
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const inicio = page.url();
  // Ficha: abrir y volver
  await page.locator('#theadTable .th-nombre').first().click();
  await expect(page.locator('#fichaAuto')).toBeVisible();
  await expect(page).toHaveURL(/[?&]auto=/);
  await page.goBack();
  await expect(page.locator('#fichaAuto')).toBeHidden();
  await expect(page).toHaveURL(inicio);
  // Cerrar con ✕ también vuelve el paso (no deja uno de más)
  await page.locator('#theadTable .th-nombre').first().click();
  await expect(page.locator('#fichaAuto')).toBeVisible();
  await page.locator('#fichaCerrar').click();
  await expect(page.locator('#fichaAuto')).toBeHidden();
  await expect(page).toHaveURL(inicio);
  // Vista: Ranking y volver a la tabla
  await page.click('#vistaRanking');
  await expect(page.locator('#rankingView')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#rankingView')).toBeHidden();
  await expect(page.locator('#tbodyWrap')).toBeVisible();
  // Grupos → un auto → Atrás vuelve a Grupos → Atrás cierra Grupos
  await page.click('#gruposBtn');
  await expect(page.locator('#gruposVista')).toBeVisible();
  await page.locator('#gruposHoja .grupo-auto').first().click();
  await expect(page.locator('#fichaAuto')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#fichaAuto')).toBeHidden();
  await expect(page.locator('#gruposVista')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#gruposVista')).toBeHidden();
  // Comparar desde una ficha y volver: la ficha reaparece y la comparación se deshace
  await page.locator('#theadTable .th-nombre').first().click();
  await expect(page.locator('#fichaAuto')).toBeVisible();
  await page.locator('#fichaHoja [data-comparar]').first().click();
  await expect(page).toHaveURL(/[?&]autos=/);
  await expect(page.locator('#fichaAuto')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#fichaAuto')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]autos=/);
  expect(await page.evaluate(() => colVisible.filter(Boolean).length)).toBe(await page.evaluate(() => CARS.length));
});

test('botón Atrás: cierra el visor de fotos y el panel "Elegir autos"', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.elegir-foto').first().click();
  await expect(page.locator('#visorFotos')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#visorFotos')).toBeHidden();
  await expect(page.locator('#elegirHoja')).toBeVisible();     // sigue en la portada
  await page.goto('/index.html?tabla');
  await page.click('#openModalBtn');
  await expect(page.locator('#modalOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#modalOverlay')).toBeHidden();
  await expect(page).toHaveURL(/\?tabla$/);
});

test('encabezado compacto: al bajar, las fotos se van y el encabezado fijo ocupa la mitad', async ({ page }) => {
  // Pedido del 2026-10-10 (NN/g: lo fijo, lo más bajo posible). Sin cambiar alturas: no salta.
  await page.goto('/index.html?autos=gwm-tank-300,byd-shark,jac-t9');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  await page.evaluate(() => window.scrollTo(0, 1500));
  const r = await page.locator('#theadWrap').evaluate(t => { const b = t.getBoundingClientRect(); return { visible: b.bottom, alto: b.height }; });
  expect(r.visible).toBeLessThan(r.alto * 0.65);
  await expect(page.locator('#theadTable th:not(.feat-col):not(.col-hidden) .th-nombre').first()).toBeInViewport();
});

test('mejoras de UX: buscador con sinónimos, precio escrito con filtro quitable y cantidades por opción', async ({ page }) => {
  // 2026-10-10 (Baymard): siglas y sinónimos en el buscador, precio con campos y filtros activos con ✕.
  await page.goto('/index.html?tabla');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  await page.fill('#search', 'maletero');
  await expect(page.locator(`${FILAS_DATOS}:not(.hidden)`)).toHaveCount(1);
  await page.fill('#search', 'autonomia');   // sin tilde
  expect(await page.locator(`${FILAS_DATOS}:not(.hidden)`).count()).toBeGreaterThan(0);
  await page.fill('#search', '');
  await page.click('#openModalBtn');
  expect(await page.locator('#propRow .faceta-n').count()).toBeGreaterThan(0);
  await expect(page.locator('#propRow .faceta-ayuda').first()).not.toBeEmpty();
  await page.fill('#precioMaxNum', '30000');
  await page.locator('#precioMaxNum').blur();
  await expect(page.locator('.filtro-activo')).toHaveCount(1);
  await page.locator('.filtro-activo').click();
  await expect(page.locator('.filtro-activo')).toHaveCount(0);
});

test('ayudame a elegir: sin presupuesto preelegido, resumen con "Cambiar" y, si no hay autos, qué aflojar', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('input[name="el-presu"][value=""]')).toBeChecked();
  await page.locator('label:has(input[name="el-presu"][value="0-28000"])').click();
  // Desde el 2026-10-29 las pickups en pesos entran en «Hasta USD 28.000» (issue #60): un SUV grande no.
  await page.locator('label:has(input[name="el-carro"][value="suv-d"])').click();
  await expect(page.locator('[data-aflojar]').first()).toBeVisible();
  await page.locator('[data-aflojar="presu"]').click();
  await expect(page.locator('.elegir-res > li').first()).toBeVisible();
  // El visor dice "3 de 9" en vez de puntitos.
  await page.locator('.elegir-res > li:has(.elegir-nfotos) .elegir-foto').first().click();   // uno con varias fotos: los sin foto muestran solo su silueta
  await expect(page.locator('#visorFotos .foto-num')).toHaveText(/^1 de \d+$/);
});

test('cuánto tarda en cargar: estimado en casa, y el tiempo de la ficha cuando lo publica', async ({ page }) => {
  // 2026-10-10: el Seal U (18,3 kWh, 6,6 kW, sin carga rápida) tiene todo en la ficha.
  await abrir(page, '?auto=byd-seal-u-dm-i');
  const s = page.locator('.ficha-carga');
  await expect(s.locator('dt')).toHaveText(['Enchufe común (10 A)', 'Cargador de pared de 7 kW', 'Carga rápida']);
  await expect(s.locator('dd')).toHaveText(['8 h 20 min', '2 h 50 min (el auto admite 6,6 kW)', 'No tiene']);
  await expect(s.locator('.ficha-nota')).toContainText('es el mínimo');
  // Con dos rangos en la celda va el que cubre más batería ("6 h de 5-100%", no "3 h de 30-80%").
  await abrir(page, '?auto=leapmotor-c10');
  await expect(page.locator('.ficha-carga dd').nth(1)).toHaveText('5 a 100% en 6 h');
  // Un naftero no tiene la sección.
  await abrir(page, '?auto=gwm-tank-300');
  await expect(page.locator('.ficha-carga')).toHaveCount(0);
});

test('¿entra en mi cochera?: entran, no entran y sin dato; la página del auto lo repite', async ({ page }) => {
  await abrir(page);
  await page.locator('#vistaRanking').click();
  // En el celular se elige en el desplegable; en escritorio, con los botones.
  const sel = page.locator('#rkElegirSel');
  if (await sel.isVisible()) await sel.selectOption('__cochera');
  else await page.locator('#rkScroll .rk-chip[data-fila="__cochera"]').click();
  await expect(page.locator('#rkLista .rk-vacio')).toContainText('Cargá el largo');
  // Metros con coma, centímetros o milímetros dan lo mismo.
  await page.locator('#cLargo').fill('4,6');
  await page.locator('#cAncho').fill('250');
  const entran = await page.locator('#rkLista .rk-item').count();
  expect(entran).toBeGreaterThan(10);
  await page.locator('#cAncho').fill('2500');
  await expect(page.locator('#rkLista .rk-item')).toHaveCount(entran);
  // Ordenados por lo que sobra en la medida más justa, de mayor a menor.
  const vals = await page.locator('#rkLista .rk-item').evaluateAll(l => l.map(li => +li.dataset.valor));
  expect(vals).toEqual([...vals].sort((a, b) => b - a));
  await expect(page.locator('#rkLista .rk-item .rk-orig').first()).toHaveText(/^Sobran \d+ cm de largo y \d+ cm de ancho\.$/);
  // El Tank 300 (4.760 mm) no entra en 4,6 m: le faltan 16 cm.
  await expect(page.locator('#rkResto [data-grupo="no"] li[data-auto="Tank 300"]')).toHaveAttribute('data-tip', 'Le faltan 16 cm de largo.');
  await abrir(page, '?auto=gwm-tank-300');
  await expect(page.locator('.ficha-cochera')).toContainText('No entra en tu cochera. Le faltan 16 cm de largo.');
  await page.locator('.ficha-cochera [data-ir-cochera]').click();
  await expect(page.locator('#rkTitulo')).toHaveText('¿Entra en mi cochera?');
  await expect(page.locator('#cLargo')).toBeFocused();
});

test('tamaño a escala y fotos lado a lado al comparar; los todoterreno se reconocen', async ({ page }) => {
  await abrir(page, '?autos=byd-song-pro,byd-sealion-7,baic-bj40-pro,gwm-tank-300');
  const esc = page.locator('#difBox details[data-dif="escala"]');
  await esc.locator('summary').click();
  await expect(esc.locator('.esc-fila')).toHaveCount(4);
  // Mismo factor de escala para todos: ancho dibujado / largo es igual en cada fila.
  const k = await esc.locator('.esc-fila').evaluateAll(fs => fs.map(f => {
    const mm = parseFloat(f.querySelector('.esc-med').textContent.replace(',', '.')) * 1000;
    return f.querySelector('svg').getBoundingClientRect().width / mm;
  }));
  k.forEach(x => expect(x).toBeCloseTo(k[0], 3));
  // Los todoterreno usan su silueta (antes esTodoterreno nunca encontraba ninguno).
  await expect(esc.locator('use[href="#b-offroad"]')).toHaveCount(2);
  // Sin scroll horizontal en el celular.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // Las fotos: una por auto en la misma vista, con su crédito; cambiar de vista no cierra nada.
  const fotos = page.locator('#difBox details[data-dif="fotos"]');
  await fotos.locator('summary').click();
  await expect(fotos.locator('figure')).toHaveCount(4);
  await page.locator('#vistaLadoSel').selectOption('tres-cuartos-delantero');
  await expect(fotos.locator('figure img').first()).toHaveAttribute('src', /fotos\/[a-z0-9-]+-\d+\.jpg$/);
  // El crédito va en cada foto que lo tiene en CREDITOS_POR_FOTO (las del tablero, todas).
  await page.locator('#vistaLadoSel').selectOption('tablero');
  expect(await fotos.locator('figure img').evaluateAll(l => l.every(im => im.closest('figure').querySelector('.lado-cred')))).toBe(true);
  await expect(esc).toHaveAttribute('open', '');
});

test('seguir un auto no avisa cambios de precio de menos del 1%, y el historial no los titula', async ({ page }) => {
  await abrir(page, '?auto=byd-song-pro');
  await page.locator('#fichaSeguir').click();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('seguidos'));
    s['byd-song-pro'].p += 100;   // USD 100 sobre unos USD 37.000: menos del 1%
    localStorage.setItem('seguidos', JSON.stringify(s));
  });
  await abrir(page);
  await expect(page.locator('#avisoSeguidos')).toBeHidden();
  // El CS55 Plus pasó de USD 32.000 a USD 31.990: la lista queda en el historial, sin titular de baja.
  await abrir(page, '?auto=changan-cs55-plus');
  const hist = page.locator('.ficha-hist');
  await expect(hist.locator('.ficha-hist-lista li')).toHaveCount(2);
  await expect(hist.locator('.ficha-hist-res')).toHaveCount(0);
});

test('las notas del pie están plegadas y la fecha de consulta queda a la vista', async ({ page }) => {
  await abrir(page);
  const notas = page.locator('footer details.pie-notas');
  await expect(notas).not.toHaveAttribute('open', '');
  await expect(notas.locator('.pie-notas-txt')).toBeHidden();
  await expect(page.locator('#fechaConsulta')).toBeVisible();
  await notas.locator('summary').click();
  await expect(notas.locator('.pie-notas-txt')).toBeVisible();
});

test('seguir un auto: se guarda, avisa al volver si cambió el precio o la disponibilidad, y compara los que sigo', async ({ page }) => {
  await abrir(page, '?auto=byd-song-pro');
  await page.locator('#fichaSeguir').click();
  await expect(page.locator('#fichaSeguir')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ficha-seguir-nota a')).toHaveAttribute('href', 'autos/byd-song-pro.xml');
  await expect(page.locator('#seguidosBtn')).toHaveText('Los que sigo (1)');
  // Como si la última vez el Song Pro costara más y el Tank 300 estuviera en preventa.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('seguidos'));
    s['byd-song-pro'].p += 1000; s['gwm-tank-300'] = { p: null, s: 'preventa' };
    localStorage.setItem('seguidos', JSON.stringify(s));
  });
  await abrir(page);
  const aviso = page.locator('#avisoSeguidos');
  await expect(aviso).toBeVisible();
  await expect(aviso.locator('li')).toHaveCount(2);
  await expect(aviso.locator('li', { hasText: 'Song Pro' })).toContainText(/bajó de USD [\d.]+ a USD [\d.]+/);
  await expect(aviso.locator('li', { hasText: 'Tank 300' })).toContainText('ahora está: a la venta');
  await page.locator('#avisoComparar').click();
  await expect(page).toHaveURL(/autos=byd-song-pro,gwm-tank-300|autos=gwm-tank-300,byd-song-pro/);
  await page.locator('#avisoListo').click();
  await expect(aviso).toBeHidden();
  // Dejar de seguir lo saca.
  await abrir(page, '?auto=byd-song-pro');
  await page.locator('#fichaSeguir').click();
  await expect(page.locator('#seguidosBtn')).toHaveText('Los que sigo (1)');
});

test('barras contra los de su tamaño: el percentil sale del segmento y se recuerda; al comparar no se ofrece', async ({ page }) => {
  await abrir(page);
  const barra = sl => page.evaluate(s => { const i = SLUG_AUTO.indexOf(s);
      const e = document.querySelector('#mainTable tr[data-nombre="Volumen de baúl/carga (L)"] td[data-col="' + i + '"] .pct'); return e && e.title; }, sl);
  expect(await barra('byd-song-pro')).toMatch(/^Mejor que el \d+% de los \d+ autos con este dato$/);
  await page.locator('#barrasSel').selectOption('seg');
  expect(await barra('byd-song-pro')).toMatch(/^Mejor que el \d+% de los \d+ autos medianos o grandes \(D\) con este dato$/);
  // Un segmento con menos de 5 autos con el dato no tiene barra (los urbanos con baúl).
  const chicos = await page.evaluate(() => CARS.filter((c, i) => c.size === 'mini' && pctlValor(FILA_POR_NOMBRE['Volumen de baúl/carga (L)'][i + 1], 'Volumen de baúl/carga (L)') !== null).length);
  if (chicos < 5) expect(await barra('fiat-mobi-trekking')).toBeNull();
  await page.reload();
  await expect(page.locator('#barrasSel')).toHaveValue('seg');
  expect(await barra('byd-song-pro')).toMatch(/autos medianos o grandes \(D\) con este dato$/);
  await abrir(page, '?autos=byd-song-pro,gwm-tank-300');
  await expect(page.locator('#barrasSelLbl')).toBeHidden();
});

test('tracción: valores normalizados, todoterreno = SUV 4x4 con reductora, y se puede filtrar', async ({ page }) => {
  await abrir(page);
  const r = await page.evaluate(() => ({
    vals: [...new Set(TRACCION)],
    todo: [...TODOTERRENO].sort(),
    esperado: SLUG_AUTO.filter((s, i) => TRACCION[i] === '4x4 con reductora' && ['SUV', 'Crossover'].includes(CARS[i].body)).sort(),
    reductora: TRACCION.filter(t => t === '4x4 con reductora').length,
  }));
  r.vals.forEach(v => expect(['Delantera', 'Trasera', '4x2', '4x4', '4x4 con reductora', 'Sin dato']).toContain(v));
  expect(r.todo).toEqual(r.esperado);
  expect(r.todo.length).toBeGreaterThan(0);
  // "Que diga 4x4 no alcanza": cada reductora tiene la marcha baja en su texto o en su explicación.
  const celdas = await page.evaluate(() => FILA_TRACCION.slice(1).filter(c => cleanVal(c) === '4x4 con reductora'));
  celdas.forEach(c => { if (c !== '4x4 con reductora') expect(c, c).toMatch(/4L|4 ?Lo|reductora|baja|LOW/i); });
  // Filtro del panel: solo "4x4 con reductora".
  await page.locator('#openModalBtn').click();
  const adv = page.locator('.advanced-toggle');
  if (await adv.count() && await adv.first().isVisible()) await adv.first().click();
  await page.locator('#tracNoneBtn').click();
  await page.locator('#tracRow input[data-val="4x4 con reductora"]').check();
  await expect(page.locator('#compareCount')).toHaveText(String(r.reductora));
});

test('sugerencias: la página del auto abre el formulario precargado con el auto, y el pie también lo linkea', async ({ page }) => {
  await abrir(page, '?auto=byd-song-pro');
  const a = page.locator('.ficha-fuentes a.sugerencias');
  await expect(a).toHaveAttribute('href', /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform\?usp=pp_url&entry\.1360569446=Song%20Pro$/);
  await expect(a).toHaveAttribute('target', '_blank');
  await expect(page.locator('footer a.sugerencias')).toHaveCount(1);
});

test('Grupos y Concesionarios son vistas de la página: sin ventana, sin desborde y con su URL', async ({ page }) => {
  await abrir(page);
  for (const [btn, sec, q, titulo] of [['#gruposBtn', '#gruposVista', 'grupos', 'Grupos automotrices'], ['#concesBtn', '#concesVista', 'concesionarios', 'Concesionarios']]){
    await page.locator(btn).click();
    await expect(page.locator(sec)).toBeVisible();
    await expect(page.locator(btn)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(sec + ' h2')).toHaveText(titulo);
    await expect(page).toHaveURL(new RegExp('vista=' + q));
    // Dentro de <main>, en el flujo de la página (no fija encima), y la página no se desborda.
    expect(await page.evaluate(s => { const el = document.querySelector(s); return !!el.closest('main') && getComputedStyle(el).position !== 'fixed'; }, sec)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.reload();
    await expect(page.locator(sec)).toBeVisible();
    await page.locator('#vistaTabla').click();
    await expect(page.locator(sec)).toBeHidden();
  }
});

test('ranking: un auto no lanzado dice "No lanzado" y el cartel no se monta sobre el precio', async ({ page }) => {
  await abrir(page);
  await page.locator('#vistaRanking').click();
  const sel = page.locator('#rkElegirSel');
  if (await sel.isVisible()) await sel.selectOption('Precio de lista (versión tope de gama de la tabla)');
  await page.locator('#rkTodos').check().catch(() => {});
  const it = page.locator('#rkLista .rk-item', { has: page.locator('.rk-estado', { hasText: 'No lanzado' }) }).first();
  await expect(it).toBeVisible();
  const r = await it.evaluate(li => { const e = li.querySelector('.rk-estado').getBoundingClientRect(), v = li.querySelector('.rk-valor').getBoundingClientRect(); return { e: e.right, v: v.left }; });
  expect(r.e).toBeLessThanOrEqual(r.v + 1);
});

test('precios en pesos: la lista en pesos entra en las franjas y los de dólares se ven también en pesos', async ({ page }) => {
  // Issue #60 (2026-10-29, decisión de Mati): dólar BNA vendedor para pasar de una moneda a la otra.
  await abrir(page);
  const d = await page.evaluate(() => {
    const i = CARS.findIndex(c => /Cronos/.test(c.name));
    // La franja de Ayudame a elegir que contiene su precio pasado a dólares.
    const op = ELEGIR_PREG.find(q => q.k === 'presu').ops.find(([v]) => { if (!v) return false; const [a, b] = v.split('-').map(x => x === '' ? Infinity : +x); return PRECIO_CMP[i] >= a && PRECIO_CMP[i] <= b; });
    const r = elegirCalcular({ presu: op[0], plazas: '5', uso: 'mixto', enchufe: 'nose', carro: 'auto' });
    return { i, usd: SIM_PRECIO[i], pesos: SIM_PESOS[i], cmp: PRECIO_CMP[i], venta: DOLAR_BNA.venta, entra: r.todos.includes(i), op: op[2] };
  });
  expect(d.usd).toBeNull();
  expect(d.pesos).toBe(45270000);
  expect(d.cmp).toBe(Math.round(45270000 / d.venta));
  expect(d.entra).toBe(true);
  expect(d.op).toMatch(/^\$ [\d,]+ M a \$ [\d,]+ M$/);
  // En la tabla, el precio en dólares lleva debajo su equivalente en pesos; el de pesos, no.
  const fila = page.locator('#mainTable tr[data-nombre="Precio de lista (versión tope de gama de la tabla)"]');
  const usdIdx = await page.evaluate(() => SIM_PRECIO.findIndex(p => p != null));
  await expect(fila.locator(`td[data-col="${usdIdx}"] .precio-pesos`)).toHaveText(/^≈ \$ [\d,]+ M$/);
  await expect(fila.locator(`td[data-col="${d.i}"] .precio-pesos`)).toHaveCount(0);
  // Los autos sin ningún precio publicado son los únicos que quedan sin cifra para filtrar.
  const sinCifra = await page.evaluate(() => PRECIO_CMP.filter(p => p == null).length);
  await page.click('#openModalBtn');
  await expect(page.locator('#precioSdN')).toHaveText(String(sinCifra));
  await expect(page.locator('#precioPesos')).toContainText('dólar BNA vendedor');
});

test('dólar al día: la página usa la cotización de /api/dolar y, si no llega, la embebida', async ({ page }) => {
  // 2026-10-30, pedido de Mati: la cotización del día la trae api/dolar.js al cargar, sin PRs diarios.
  // El servidor de la suite responde sin cotización, como cuando el BNA no contesta.
  await abrir(page);
  const sin = await page.evaluate(() => ({ usada: DOLAR_BNA, embebida: DOLAR_BNA_EMBEBIDO }));
  expect(sin.usada).toEqual(sin.embebida);
  // Con la función respondiendo, manda la cotización del día.
  await page.route('**/api/dolar', r => r.fulfill({ contentType: 'application/javascript', body: 'window.DOLAR_VIVO={"venta":1777,"fecha":"2026-10-30","fuente":"https://www.bna.com.ar/Personas"};' }));
  await abrir(page);
  expect(await page.evaluate(() => DOLAR_BNA)).toEqual({ venta: 1777, fecha: '2026-10-30', fuente: 'https://www.bna.com.ar/Personas' });
  await page.click('#openModalBtn');
  await expect(page.locator('#precioPesos')).toContainText('30/10/2026');
  // Una cifra que no es razonable no se usa.
  await page.route('**/api/dolar', r => r.fulfill({ contentType: 'application/javascript', body: 'window.DOLAR_VIVO={"venta":3,"fecha":"2026-10-30"};' }));
  await abrir(page);
  expect(await page.evaluate(() => DOLAR_BNA.venta)).toBe(sin.embebida.venta);
});

test('ayudame a elegir: las opciones de uso, enchufe, asientos y presupuesto explican qué hacen', async ({ page }) => {
  // 2026-10-30, pedido de Mati: un cartel en cada opción, con lo que hace el cálculo.
  await abrir(page);
  await page.locator('#vistaElegir').click();
  for (const k of ['uso', 'enchufe', 'plazas'])
    for (const s of await page.locator(`input[name="el-${k}"] + span`).all()) await expect(s).toHaveAttribute('data-tip', /\S/);
  await expect(page.locator('input[name="el-presu"][value="0-28000"] + span')).toHaveAttribute('data-tip', /dólar BNA vendedor/);
  await page.locator('input[name="el-uso"][value="tierra"] + span').hover();
  await expect(page.locator('#tooltipBox')).toContainText('reductora');
});

test('cada dirección empieza con la marca, y los links con un slug viejo siguen andando', async ({ page }) => {
  // Issue #73 (2026-10-30, pedido de Mati): siempre marca-modelo, por ejemplo byd-song-pro.
  await abrir(page);
  const mal = await page.evaluate(() => {
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, '').trim().replace(/\s+/g, '-');
    return CARS.map((c, i) => [norm(c.brand), SLUG_AUTO[i]]).filter(([m, s]) => !s.startsWith(m + '-')).map(x => x.join(' → '));
  });
  expect(mal).toEqual([]);
  await page.goto('/index.html?auto=song-pro');
  await expect(page.locator('#fichaNombre')).toContainText('Song Pro');
  await page.goto('/index.html?autos=song-pro,tank-300');
  await expect(page).toHaveURL(/autos=byd-song-pro,gwm-tank-300|autos=gwm-tank-300,byd-song-pro/);
});

test('ayudame a elegir: siempre N sugeridos, con los «casi» marcados, 2 por marca y el porqué de cada uno', async ({ page }) => {
  // 2026-10-30, pedido de Mati: a veces sugería uno solo; el respaldo pesaba más que el uso.
  await abrir(page);
  const r = await page.evaluate(() => {
    const N = elegirN(), casos = [];
    for (const presu of ELEGIR_PREG.find(q => q.k === 'presu').ops.map(o => o[0]))
      for (const carro of ['', 'suv-b', 'suv-c', 'suv-d', 'auto', 'pickup'])
        for (const plazas of ['4', '5', '6']){
          const o = elegirCalcular({ presu, plazas, uso: 'mixto', enchufe: 'nose', carro });
          const marcas = {}; o.top.forEach(x => { marcas[CARS[x.i].brand] = (marcas[CARS[x.i].brand] || 0) + 1; });
          casos.push({ k: presu + '/' + carro + '/' + plazas, n: o.top.length, total: o.total, casiSinTxt: o.top.filter(x => x.d && !x.casi).length,
            cumplenPrimero: o.top.every((x, j) => !x.casi || o.top.slice(j).every(y => y.casi)),
            masDe2: Object.values(marcas).some(v => v > 2) && o.total + o.casi > o.top.length + 5,
            respaldo: Math.max(...o.top.map(x => x.parte.respaldo)) });
        }
    const coupe = CARS.findIndex(c => c.body === 'Coupé' && c.status === 'venta');
    return { N, casos, coupeEntra: coupe < 0 || elegirDesvio(coupe, { presu: '', plazas: '4', carro: 'auto' }) === 0 };
  });
  for (const c of r.casos){
    expect(c.n, c.k).toBeLessThanOrEqual(r.N);
    expect(c.cumplenPrimero, c.k).toBe(true);
    expect(c.respaldo, c.k).toBeLessThanOrEqual(1);
    expect(c.masDe2, c.k).toBe(false);
  }
  // Casi siempre se llega a N: solo puede faltar si ni con los «casi» alcanza.
  expect(r.casos.filter(c => c.n === r.N).length).toBeGreaterThan(r.casos.length * .8);
  expect(r.coupeEntra).toBe(true);
  // En pantalla, el «casi» va arriba de los motivos y cada auto tiene su porqué.
  await page.locator('#vistaElegir').click();
  await page.locator('label:has(input[name="el-presu"][value="0-28000"])').click();
  await page.locator('label:has(input[name="el-carro"][value="suv-d"])').click();
  await expect(page.locator('.elegir-res > li')).toHaveCount(r.N);
  await expect(page.locator('.elegir-res > li.casi .elegir-casi').first()).toHaveText(/sobre tu franja|Otro tamaño de SUV|asientos/);
  await expect(page.locator('.elegir-res .elegir-porque').first()).toHaveAttribute('data-tip', /^Por qué lo sugerimos\. .*Total: /);
  // Los botones de una misma pregunta miden lo mismo.
  const anchos = await page.locator('fieldset:has(input[name="el-presu"]) .elegir-ops span').evaluateAll(s => s.map(e => Math.round(e.getBoundingClientRect().width)));
  expect(new Set(anchos).size).toBe(1);
});
