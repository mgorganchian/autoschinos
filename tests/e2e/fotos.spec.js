// Atribución de las fotos, leída del repo (sin navegador).
//
// Existe porque la rutina semanal agrega fotos sin que nadie las revise antes de
// publicar. Una foto CC BY sin autor, o firmada por el autor de otra, es atribuir
// mal una obra ajena — y eso no rompe nada visible, así que tiene que fallar acá.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { html } = require('./helpers').leerIndex();

const RAIZ = process.env.AUTOSCHINOS_RAIZ || path.resolve(__dirname, '../..');
const leerMapa = nombre => JSON.parse(new RegExp(`const ${nombre}\\s*=\\s*(\\{[\\s\\S]*?\\});`).exec(html)[1]);
const FOTOS_POR_AUTO = leerMapa('FOTOS_POR_AUTO');
const CREDITOS_POR_FOTO = leerMapa('CREDITOS_POR_FOTO');
const VISTAS_POR_FOTO = leerMapa('VISTAS_POR_FOTO');
const VISTAS = ['tres-cuartos-delantero', 'frente', 'perfil-izquierdo', 'perfil-derecho', 'tres-cuartos-trasero', 'trasera',
  'baul-abierto', 'tablero', 'instrumentos', 'consola-central', 'asientos-delanteros', 'asientos-traseros'];

// fotos-fuentes.tsv: archivo, vista, archivo en Commons, licencia, autor, página
const manifiesto = new Map(
  fs.readFileSync(path.join(RAIZ, 'fotos-fuentes.tsv'), 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('\t'))
    .map(c => [c[0], { vista: c[1], archivo: c[2], licencia: c[3], autor: c[4], pagina: c[5] }]),
);
const enDisco = fs.readdirSync(path.join(RAIZ, 'fotos')).filter(f => f.endsWith('.jpg'));
// Las fotos 2 en adelante de cada auto: las de portada tienen su propio camino.
const extras = Object.entries(FOTOS_POR_AUTO)
  .flatMap(([slug, n]) => Array.from({ length: n - 1 }, (_, k) => ({ slug, k: k + 1, archivo: `${slug}-${k + 2}.jpg` })));

test.describe('atribución de las fotos', () => {
  test.beforeEach(({ }, info) => test.skip(info.project.name !== 'escritorio', 'no dependen del viewport'));

  test('no hay archivos en fotos/ que FOTOS_POR_AUTO no declare', () => {
    const declarados = new Set(Object.entries(FOTOS_POR_AUTO)
      .flatMap(([slug, n]) => Array.from({ length: n }, (_, k) => `${slug}-${k + 1}.jpg`)));
    expect(enDisco.filter(f => !declarados.has(f))).toEqual([]);
  });

  test('cada auto tiene su miniatura en fotos/mini (la del <th>, que antes iba embebida)', () => {
    const slugs = [...html.matchAll(/<img class="car-photo" data-slug="([^"]+)"[^>]*src="([^"]+)"/g)];
    const mal = slugs.filter(([, slug, src]) => src !== `fotos/mini/${slug}.jpg` || !fs.existsSync(path.join(RAIZ, src))).map(m => m[1]);
    expect(slugs.length).toBe(Object.keys(FOTOS_POR_AUTO).length);
    expect(mal).toEqual([]);
  });

  test('cada foto extra tiene su crédito, no el de otra', () => {
    const sinCredito = extras.filter(({ slug, k }) => !(CREDITOS_POR_FOTO[slug] || [])[k]).map(e => e.archivo);
    expect(sinCredito).toEqual([]);
  });

  test('cada foto extra tiene fila completa en fotos-fuentes.tsv', () => {
    const faltan = extras.map(e => e.archivo).filter(a => {
      const m = manifiesto.get(a);
      return !m || !m.licencia || !m.autor || !/^https:\/\/commons\.wikimedia\.org\//.test(m.pagina || '');
    });
    expect(faltan).toEqual([]);
  });

  test('el crédito de cada foto coincide con el autor y la licencia del manifiesto', () => {
    const distintos = extras.filter(({ slug, k, archivo }) => {
      const m = manifiesto.get(archivo);
      const cred = (CREDITOS_POR_FOTO[slug] || [])[k] || '';
      return m && !(cred.includes(m.autor) && cred.includes(m.licencia));
    }).map(e => e.archivo);
    expect(distintos).toEqual([]);
  });
});

// Una foto por vista (2026-10-05): dos casi iguales no suman. La vista la decide quien
// mira la foto y la escribe herramientas-fotos.py en VISTAS_POR_FOTO y en el manifiesto.
test.describe('vistas de las fotos', () => {
  test.beforeEach(({ }, info) => test.skip(info.project.name !== 'escritorio', 'no dependen del viewport'));

  test('cada foto tiene una vista conocida, sin repetir vista en el mismo auto', () => {
    const mal = [];
    for (const [slug, n] of Object.entries(FOTOS_POR_AUTO)) {
      const v = VISTAS_POR_FOTO[slug] || [];
      if (v.length !== n) mal.push(`${slug}: ${n} fotos y ${v.length} vistas`);
      if (v.some(x => !VISTAS.includes(x))) mal.push(`${slug}: vista desconocida en ${v}`);
      if (new Set(v).size !== v.length) mal.push(`${slug}: vista repetida en ${v}`);
    }
    expect(mal).toEqual([]);
  });

  test('las fotos extra van en el orden de las vistas y coinciden con el manifiesto', () => {
    const mal = [];
    for (const [slug, v] of Object.entries(VISTAS_POR_FOTO)) {
      const resto = v.slice(1).map(x => VISTAS.indexOf(x));
      if (resto.some((x, k) => k && x < resto[k - 1])) mal.push(`${slug}: fuera de orden`);
      v.slice(1).forEach((x, k) => { const m = manifiesto.get(`${slug}-${k + 2}.jpg`); if (m && m.vista !== x) mal.push(`${slug}-${k + 2}.jpg: ${m.vista} ≠ ${x}`); });
    }
    expect(mal).toEqual([]);
  });
});
