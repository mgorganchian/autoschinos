// Logos de marcas y grupos (2026-10-05): logos/ + logos-fuentes.tsv, como las fotos.
// Lo que más importa: que cada logo tenga su respaldo en Commons con licencia libre, que
// ningún SVG traiga scripts ni recursos externos, y que no quede ninguno roto en pantalla.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { leerIndex, vigilarErrores, FILAS_DATOS, N_FILAS } = require('./helpers');

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');
const { html } = leerIndex();
const LOGOS = JSON.parse(/const LOGOS = (\{.*?\});\n/.exec(html)[1]);
const LOGO_MARCA = JSON.parse(/const LOGO_MARCA = (\{.*?\});\n/.exec(html)[1]);
const LOGO_GRUPO = JSON.parse(/const LOGO_GRUPO = (\{.*?\});\n/.exec(html)[1]);
const tsv = fs.readFileSync(path.join(RAIZ, 'logos-fuentes.tsv'), 'utf8').trim().split('\n');
const cab = tsv[0].split('\t');
const FUENTES = tsv.slice(1).map(l => Object.fromEntries(l.split('\t').map((v, i) => [cab[i], v])));

test.describe('logos/ y logos-fuentes.tsv', () => {
  test('cada logo existe, está anotado con su fuente de Commons y tiene licencia libre', () => {
    const archivos = fs.readdirSync(path.join(RAIZ, 'logos')).map(f => 'logos/' + f).sort();
    expect(Object.values(LOGOS).map(l => l.f).sort()).toEqual(archivos);
    expect(FUENTES.map(f => f.archivo).sort()).toEqual(archivos);
    for (const f of FUENTES) {
      expect(f.licencia, f.archivo).toMatch(/^(Dominio público|CC0|CC BY)/);
      expect(f.pagina, f.archivo).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(f.archivo_commons, f.archivo).toMatch(/^File:/);
    }
  });

  test('ningún SVG trae scripts ni recursos externos', () => {
    for (const l of Object.values(LOGOS)) {
      if (!l.f.endsWith('.svg')) continue;
      const t = fs.readFileSync(path.join(RAIZ, l.f), 'utf8');
      expect(t, l.f).not.toMatch(/<script|foreignObject|<image|\son[a-z]+=|href="(?!#)/i);
      expect(/<svg[^>]*>/.exec(t)[0], l.f + ': sin viewBox no escala dentro de <img>').toContain('viewBox');
    }
  });

  test('las marcas y grupos apuntan a logos que existen', () => {
    for (const k of [...Object.values(LOGO_MARCA), ...Object.values(LOGO_GRUPO)]) expect(LOGOS[k], k).toBeTruthy();
  });
});

let errores;
test.beforeEach(async ({ page }) => { errores = vigilarErrores(page); });
test.afterEach(() => expect(errores).toEqual([]));

const rotos = page => page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.logo img')];
  imgs.forEach(i => { i.loading = 'eager'; });
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return { total: imgs.length, rotos: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')) };
});

test('la vista Grupos y el filtro de Marca muestran los logos, ninguno roto', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator(FILAS_DATOS)).toHaveCount(N_FILAS);
  const marcas = await rotos(page);
  expect(marcas.rotos).toEqual([]);
  expect(marcas.total).toBeGreaterThan(10);
  await page.locator('#gruposBtn').click();
  await expect(page.locator('#gruposHoja .grupo-cabeza .logo')).toHaveCount(Object.keys(LOGO_GRUPO).length);
  expect((await rotos(page)).rotos).toEqual([]);
});
