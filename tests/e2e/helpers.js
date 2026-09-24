// Lectura del index.html tal como lo describe CLAUDE.md: DATA es JSON válido,
// CARS no (keys sin comillas), así que se lee por regex.
const fs = require('fs');
const path = require('path');

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');
const INDEX = path.join(RAIZ, 'index.html');

function leerIndex() {
  const html = fs.readFileSync(INDEX, 'utf8');

  const ini = html.indexOf('const DATA = [');
  const fin = html.indexOf('];', ini);
  const DATA = JSON.parse(html.slice(ini + 'const DATA = '.length, fin + 1));

  const bloqueCars = /const CARS = \[([\s\S]*?)\];/.exec(html)[1];
  const CARS = [...bloqueCars.matchAll(/\{name:"([^"]+)"[^}]*\}/g)].map(m => {
    const campo = k => (new RegExp(k + ':"([^"]*)"').exec(m[0]) || [])[1];
    return {
      name: m[1], short: campo('short'), type: campo('type'), size: campo('size'),
      brand: campo('brand'), body: campo('body'), status: campo('status'),
    };
  });

  const bloquePctl = /const PCTL_DIR = (\{[\s\S]*?\});/.exec(html)[1];
  const PCTL_DIR = JSON.parse(bloquePctl);

  return { html, DATA, CARS, PCTL_DIR, filas: DATA.flatMap(([, filas]) => filas) };
}

// Errores de consola y excepciones no atrapadas. Se juntan desde antes de navegar
// porque un script roto falla en la carga, no después.
function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // El navegador pide /favicon.ico por su cuenta y la página no declara ninguno:
    // ese 404 no es un error de la página.
    if (/\/favicon\.ico$/.test(m.location().url)) return;
    errores.push(`console: ${m.text()} (${m.location().url})`);
  });
  return errores;
}

// Filas visibles de la tabla (sin las de categoría).
const FILAS_DATOS = '#mainTable tbody tr:not(.cat-row):not(.hidden)';
const FILAS_CAT = '#mainTable tbody tr.cat-row:not(.hidden)';

module.exports = { leerIndex, vigilarErrores, FILAS_DATOS, FILAS_CAT };
