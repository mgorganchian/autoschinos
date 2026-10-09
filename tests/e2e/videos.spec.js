// Reseñas en video (2026-10-09): VIDEOS, por slug. Solo pruebas del mismo modelo y versión
// que está en la tabla. La página no carga nada de YouTube hasta que se toca «Ver acá».
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, N_FILAS } = require('./helpers');

const { html } = leerIndex();
const VIDEOS = JSON.parse(/const VIDEOS = (\{.*?\});\n/.exec(html)[1]);
const SLUGS = [...html.matchAll(/<img class="car-photo" data-slug="([^"]+)"/g)].map(m => m[1]);

test('cada video es de un auto de la tabla y trae id, título, canal, fecha y duración', () => {
  expect(Object.keys(VIDEOS).length).toBeGreaterThan(0);
  const ids = new Set();
  for (const [slug, vs] of Object.entries(VIDEOS)) {
    expect(SLUGS, slug).toContain(slug);
    for (const v of vs) {
      expect(v.id, slug).toMatch(/^[\w-]{11}$/);
      expect(ids.has(v.id), `${v.id} repetido`).toBe(false);
      ids.add(v.id);
      expect(v.t.trim().length, slug).toBeGreaterThan(5);
      expect(v.canal.trim().length, slug).toBeGreaterThan(2);
      expect(v.f, slug).toMatch(/^20\d\d-\d\d-\d\d$/);
      expect(Number.isInteger(v.s) && v.s > 60, slug).toBe(true);
    }
  }
});

let errores;
test.beforeEach(async ({ page }) => { errores = vigilarErrores(page); });
test.afterEach(() => expect(errores).toEqual([]));

test('la página del auto lista sus videos y carga el reproductor recién al tocar «Ver acá»', async ({ page }) => {
  const slug = Object.keys(VIDEOS)[0];
  const v = VIDEOS[slug][0];
  let pedidos = 0;
  await page.route(/youtube(-nocookie)?\.com/, r => { pedidos++; r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }); });
  await page.goto('/index.html?auto=' + slug);
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const seccion = page.locator('.ficha-videos');
  await expect(seccion.locator('li')).toHaveCount(VIDEOS[slug].length);
  await expect(seccion).toContainText(v.t);
  await expect(seccion.locator('a').first()).toHaveAttribute('href', 'https://www.youtube.com/watch?v=' + v.id);
  await expect(seccion.locator('iframe')).toHaveCount(0);
  expect(pedidos).toBe(0);
  await seccion.locator('.video-ver').first().click();
  await expect(seccion.locator('iframe')).toHaveAttribute('src', new RegExp('^https://www\\.youtube-nocookie\\.com/embed/' + v.id));
});

test('un auto sin reseñas no muestra la sección', async ({ page }) => {
  const sin = SLUGS.find(s => !VIDEOS[s]);
  await page.goto('/index.html?auto=' + sin);
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  await expect(page.locator('.ficha-videos')).toHaveCount(0);
});
