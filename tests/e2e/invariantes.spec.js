// Las 6 invariantes de CLAUDE.md, leídas del HTML crudo (sin navegador).
// Un desajuste de a uno rompe la tabla en silencio, así que esto es lo primero
// que tiene que fallar.
const { test, expect } = require('@playwright/test');
const { leerIndex } = require('./helpers');

const { html, DATA, CARS, filas } = leerIndex();
const N = CARS.length;

test.describe('invariantes del index.html', () => {
  test.beforeEach(({ }, info) => test.skip(info.project.name !== 'escritorio', 'no dependen del viewport'));

  test('DATA parsea y tiene 92 filas en 14 categorías', () => {
    expect(DATA).toHaveLength(14);
    expect(filas).toHaveLength(92);
  });

  test('CARS: cada auto tiene los 7 campos con valores válidos', () => {
    const VALIDOS = {
      type: ['ice', 'hev', 'mhev', 'phev', 'ev', 'tbd'],
      size: ['xl', 'big', 'mid', 'compact', 'mini', 'nd'],
      body: ['SUV', 'Crossover', 'Sedán', 'Hatchback', 'Minivan', 'Pickup'],
      status: ['venta', 'preventa', 'nolanzado', 'discontinuado'],
    };
    for (const car of CARS) {
      expect(car.short, car.name).toBeTruthy();
      expect(car.brand, car.name).toBeTruthy();
      for (const [campo, ok] of Object.entries(VALIDOS)) expect(ok, `${car.name}.${campo}`).toContain(car[campo]);
    }
  });

  test('1. cada fila de DATA tiene N+1 elementos', () => {
    for (const fila of filas) expect(fila, fila[0]).toHaveLength(N + 1);
  });

  test('2 y 3. el thead tiene un solo feat-col y N <th> de auto', () => {
    const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
    const th = thead.match(/<th[\s>]/g) || [];            // no cuenta <thead>
    const feat = thead.match(/<th class="feat-col"/g) || [];
    expect(feat).toHaveLength(1);
    expect(th.length - feat.length).toBe(N);
  });

  test('4. los dos <colgroup> tienen N col-data', () => {
    const grupos = [...html.matchAll(/<colgroup>([\s\S]*?)<\/colgroup>/g)].map(m => m[1]);
    expect(grupos).toHaveLength(2);                        // #theadTable y #mainTable
    for (const g of grupos) expect(g.match(/class="col-data"/g)).toHaveLength(N);
  });

  test('5. el colspan de las filas de categoría es N+1', () => {
    const colspans = [...new Set([...html.matchAll(/colspan="(\d+)"/g)].map(m => m[1]))];
    expect(colspans).toEqual([String(N + 1)]);
  });

  test('6. ninguna celda con "|" sin prefijo NR:/NOTE:/EXT:', () => {
    const malas = filas.flatMap(f => f.slice(1).filter(v => v.includes('|') && !/^(NR|NOTE|EXT):/.test(v)).map(v => `${f[0]}: ${v}`));
    expect(malas).toEqual([]);
  });

  // Los centinelas (YES, NO, OPT, ND) solo se interpretan si la celda es EXACTAMENTE
  // eso. Con texto al lado, la celda muestra la palabra cruda: va "Sí (…)", "No (…)",
  // "Opcional (…)" o "s/d (…)".
  test('valores con texto en castellano: ningún centinela seguido de texto', () => {
    const malas = filas.flatMap(f => f.slice(1).filter(v => /^(YES|NO|OPT|ND)\b(?!$)/.test(v)).map(v => `${f[0]}: ${v}`));
    expect(malas).toEqual([]);
  });

  test('los tres conteos en texto coinciden con N', () => {
    expect(html).toContain(`<p id="headerSubtitle">${N} autos`);
    expect(html).toContain(`<span id="summaryText">${N} autos · todos incluidos`);
    expect(html).toMatch(new RegExp(`\\(${N} autos\\)\\s*\\n\\s*const CARS`));
  });
});
