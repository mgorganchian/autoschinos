// Páginas estáticas por auto (2026-10-06): autos/<slug>.html, sitemap.xml, robots.txt y la
// lista de links del pie salen de index.html con herramientas-paginas.py. Si alguien cambia
// un dato y no las regenera, Google muestra el viejo: este test lo frena.
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');

test('las páginas por auto están al día con index.html', ({ }, info) => {
  test.skip(info.project.name !== 'escritorio', 'no depende del viewport');
  const out = execFileSync('python3', [path.join(RAIZ, 'herramientas-paginas.py'), '--check'], { encoding: 'utf8' });
  expect(out).toContain('al día');
});

test('la página de un auto tiene título, descripción, foto, datos estructurados y su ficha', async ({ page }) => {
  await page.goto('/autos/chery-tiggo-7-pro-phev.html');
  await expect(page).toHaveTitle(/^Chery Tiggo 7 Pro PHEV: precio, ficha técnica/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /híbrido enchufable/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://autoschinos-ar.vercel.app/autos/chery-tiggo-7-pro-phev');
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(ld['@type']).toBe('Car');
  expect(ld.brand.name).toBe('Chery');
  await expect(page.locator('main table tr')).toHaveCount(98);
  await expect(page.locator('main tr', { hasText: 'Longitud (mm)' })).toContainText('4553');
  await expect(page.locator('a.cta')).toHaveAttribute('href', '/?auto=chery-tiggo-7-pro-phev');
  expect(await page.locator('figure img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
});
