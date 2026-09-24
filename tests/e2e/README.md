# Tests e2e

Playwright contra el `index.html` local. No es parte del sitio: la página sigue
sin dependencias externas, esto solo corre en la máquina.

```bash
cd tests/e2e
npm ci
npm test
```

Usa el Chrome instalado (`channel: 'chrome'`), así que no hace falta
`npx playwright install`. Levanta un `python3 -m http.server` en el puerto 4173
sobre la raíz del repo.

- `invariantes.spec.js`: las 6 invariantes de `CLAUDE.md`, los 7 campos de `CARS`,
  los centinelas y los tres conteos en texto. Lee el HTML crudo.
- `render.spec.js`: 92 filas en 14 categorías, cero errores de consola, nada de
  texto crudo en las celdas, percentiles solo en `PCTL_DIR`, las dos tablas
  sincronizadas y las 3 columnas en portrait.
- `interacciones.spec.js`: búsqueda, categorías, "Solo diferencias", referencias,
  selector de autos (marca, modelo, disponibilidad), tooltips y zoom de fotos.

Ojo: el sitio se publica desde la raíz del repo, así que si esta carpeta llega a
`main`, Vercel también sirve `tests/` como archivos estáticos.

Corre en dos proyectos: `escritorio` (1280×800) y `celular` (390×844, táctil).

> Antes de volver a `main`, borrá `node_modules/` y `test-results/`: `main` no
> los ignora, y la rutina diaria se niega a arrancar si ve archivos sin commitear.
