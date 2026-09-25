# autoschinos — reglas del proyecto

Comparativo de **46 autos** chinos/electrificados vendidos (o por llegar) en Argentina.
Todo vive en un único `index.html` autocontenido de ~600 KB: sin CSS, JS ni imágenes
externas. Ese principio es deliberado — **no agregar dependencias externas ni partir el
archivo.**

El contexto largo (el *porqué* de cada decisión, orden de columnas, estado del research,
metodología de búsqueda de fichas) está en **`CONTEXTO_PROYECTO_AUTOSCHINOS.md`**.
Este archivo es solo lo que hay que tener presente **siempre**.

> Este repo es **público**. Nada de tokens, cuentas ni rutas personales en archivos
> commiteados. Eso va en `CONTEXTO_LOCAL_PRIVADO.md`, que está en `.gitignore`.

---

## Regla de oro, no negociable

**Nunca inventar un valor.** Si hay duda real, va `NR` o `NOTE` con la explicación —
nunca completar "a ojo", nunca por analogía con otro auto, nunca porque "es lo normal
en este segmento".

Corolario que costó caro varias veces: **la ausencia de un dato en una ficha no es
prueba de que el auto no lo tenga.** Si la ficha no lo dice, es `NR`, no `No`.

---

## Estructura: 5 lugares a tocar al agregar o quitar un auto

Con `N = CARS.length`:

1. **`CARS`** — el objeto tiene **7 campos**:
   `{name, short, type, size, brand, body, status}`.
   Omitir `status` deja al auto fuera del filtro de Disponibilidad **sin tirar error**.
2. **`<th>`** en el `<thead>`, en el mismo índice — con su silueta de carrocería y su
   ícono de propulsión.
3. **`<col class="col-data">`** en los **DOS** `<colgroup>` (`#theadTable` y `#mainTable`).
4. **Cada una de las 92 filas de `DATA`**, en la posición correcta.
5. **`colspan="N+1"`** de las filas de categoría — está hardcodeado.

Además hay 3 conteos en texto: `#headerSubtitle`, `#summaryText` y el comentario arriba
de `CARS`.

### Valores de los campos

| campo | valores |
|---|---|
| `type` | `ice` `hev` `mhev` `phev` `ev` `tbd` |
| `size` | `xl` `big` `mid` `compact` `mini` `nd` |
| `body` | `SUV` `Crossover` `Sedán` `Hatchback` `Minivan` `Pickup` |
| `status` | `venta` `preventa` `nolanzado` `discontinuado` |

---

## Las 6 invariantes — validar SIEMPRE antes de commitear

Un desajuste de a uno rompe la tabla **en silencio**: columnas desalineadas, sin error
visible.

1. `CARS.length` = celdas de datos por fila de `DATA` (cada fila tiene N+1 elementos).
2. `<th>` de auto = N (1 `<th class="feat-col">` + N `<th>`).
3. Un solo `<th class="feat-col">`.
4. Los **dos** `<colgroup>` con N `col-data` cada uno.
5. `colspan` de las filas de categoría = N+1.
6. **Ninguna celda con `|` que no arranque con `NR:`, `NOTE:` o `EXT:`.**

Más: `DATA` tiene que parsear con `JSON.parse` y el `<script>` no tener errores.

**Por qué la 6:** el renderer solo interpreta el `|` como separador valor/explicación
*después* de esos prefijos. En un valor plano se ve el texto crudo en la celda. Este bug
se coló dos veces.

**Trampas al medir:** `grep '<th'` también matchea `<thead>`; `grep 'col-data'` también
cuenta las 2 definiciones del `<style>`.

**Verificación cruzada:** renderizar de verdad y contar 92 filas en 14 categorías, con
cero errores de consola. Con el script roto la tabla queda en **0 filas** y el archivo
igual "parece" bien.

Las dos cosas las corre la suite de Playwright en `tests/e2e` (invariantes, render y
las interacciones de la página). Correrla antes de commitear:

```bash
cd tests/e2e && npm ci && npm test
```

Después borrar `tests/e2e/node_modules` y `tests/e2e/test-results` si vas a cambiar a
una rama que no los ignore: la rutina no arranca si ve archivos sin trackear.

---

## Convención de celdas

| forma | significa |
|---|---|
| texto plano | dato confirmado |
| `NR:s/d\|explicación` | sin dato, con motivo |
| `NOTE:valor\|explicación` | dato con matiz (ciclo de homologación, discrepancia, estimación) |
| `EXT:valor\|explicación` | no sale de la ficha oficial argentina (otro mercado, prensa) |

**Centinelas exactos** (el valor es *exactamente* eso): `"YES"` → ✓ · `"NO"` → – ·
`"OPT"` → ○ Opcional · `"ND"` → s/d.

**Los valores con texto van en castellano: `Sí (…)`, `No (…)`, `Opcional (…)` y
`s/d (…)`, nunca `YES (…)`, `NO (…)`, `OPT (…)` ni `ND (…)`.** Un centinela con texto al
lado hace que la celda muestre la palabra cruda ("YES", "OPT"). Los centinelas exactos
sí quedan en inglés, porque no muestran la palabra. Se coló con `YES` dos veces y con
`OPT`/`ND` una (Sealion 7 y Dolphin Mini, corregidos el 2026-09-24).

---

## No revertir sin querer

- **La tabla está partida en dos `<table>`** (`#theadTable` y `#mainTable`) sincronizadas
  por JS. **No es cosmético**: es la solución a un bug de Safari/iOS donde
  `position:sticky` en `<th>` no funciona si la misma `<table>` tiene scroll horizontal.
  Usan `border-collapse:separate` porque `collapse` rompía el sticky. **No volver a
  fusionarlas.**
- **En portrait se muestran 3 columnas** (característica + 2 autos): `col-feat 28vw`,
  `col-data 34vw`. Fue un pedido explícito. **No "arreglarlo" a 4 columnas.**
- **La barra resumen NO es sticky** — decisión explícita del usuario.
- **El header grande se oculta** tras el primer "Comparar" (`hasComparedOnce`).
- **Dropdown de Marca/Modelo en `position:static`**, no `absolute` (quedaba recortado).
- El **indicador de percentiles** (4 cuadraditos verdes) va **solo en las 14 filas
  donde "mejor" tiene una dirección objetiva** (`PCTL_DIR` en el script). Las
  dimensiones (Longitud, Ancho, Altura, Distancia entre ejes) **no lo llevan a
  propósito**: poner el indicador ahí afirmaría que un auto más largo es mejor, y
  eso no es un dato. Las filas de equipamiento Sí/No tampoco. Al agregar una fila
  nueva, el indicador **no** aparece salvo que se la sume a `PCTL_DIR`.
  Tres vetos que se ganaron a golpes, en `pctlValor()`: `No aplica (100% eléctrico)`
  traía un **100** que rankeaba a nueve eléctricos como los de peor consumo; el baúl
  de las pickups viene en **kg y mm**, no en litros; y hay celdas en **HP** dentro de
  filas en kW y una en **km/l** dentro de la fila en L/100km. Los empates se reparten
  con **rango medio**, sin eso los 37 autos de 5 asientos caían a 0 por un solo auto
  de 4.
- Los **7 todoterreno** (BJ40 ×2, BJ60, BJ30 ×2, Tank 300, Jetour T2) usan la silueta
  `b-offroad` pero su campo `body` **sigue siendo `"SUV"`**: cambia el dibujo, no el filtro.

---

## Editar `DATA`

Es una sola línea de ~480 KB, así que reemplazar por línea no sirve. Tratarlo como JSON:

```python
import json
content = open('index.html').read()
start = content.index('const DATA = [')
idx = content.find('];', start)
data = json.loads(content[start+len('const DATA = '):idx+1])
# ... modificar `data` ...
new = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
content = content[:start] + "const DATA = " + new + content[idx+1:]   # idx+1: json.dumps ya cierra el ]
open('index.html', 'w').write(content)
```

`CARS` **no** es JSON válido (keys sin comillas): editarlo con regex sobre objetos
`{...}` completos.

**Escribir el archivo al final, después de que todos los reemplazos hayan pasado.** Si
un `assert` falla a mitad, el archivo queda intacto en vez de a medio editar.

---

## Fotos

Cada auto tiene una foto de portada (`fotos/<slug>-1.jpg`, más una miniatura base64
embebida en el `<th>`) y, si hay material, hasta 4 más en un carrusel.
`FOTOS_POR_AUTO` dice cuántas tiene cada uno; los archivos van numerados **sin
huecos** desde 1.

- **El crédito es por foto, no por auto** (`CREDITOS_POR_FOTO`). El `data-credito`
  del `<th>` es solo el de la portada. Antes el crédito se fijaba al abrir el zoom
  y no cambiaba al pasar de foto: con CC BY eso atribuye la obra al autor
  equivocado. **No volver a colgarlo del `<th>`.**
- `fotos-fuentes.tsv` registra archivo, vista, archivo de Commons, licencia, autor
  y página de **cada** foto. Si se agrega una foto sin anotarla ahí, la atribución
  queda sin respaldo.
- ⚠️ **La herramienta de Vision (`herramientas-recortar-fotos.swift`) no va en
  interiores**: recorta por sujeto y deja el volante flotando en blanco, sin el
  tablero. Los interiores se escalan con `sips` y se dejan con su fondo.
- Al bajar de Commons hay que **mirar el resultado uno por uno**: de 117 procesadas
  hubo que descartar 8 (volantes sueltos, un techo de vidrio con reflejo, un
  prototipo camuflado). El tamaño del archivo no delata ninguno de esos casos.

## Fuentes de datos

**Las fichas técnicas en PDF de importadores y concesionarias argentinas rinden mucho
más que la prensa**: 25-50 celdas contra 5-10. Traen ADAS ítem por ítem, airbags,
suspensión, multimedia, luces y climatización, que las notas nunca publican.

- ⚠️ **Los links a fichas suelen venir JSON-escapados** en el HTML (`https:\/\/...`), así
  que un `grep href` normal no los encuentra **y parece que no existieran**. Des-escapar
  `\/` antes de buscar.
- ⚠️ **En fichas con columnas por versión, leer las marcas ●/x/–, no la lista de la tapa.**
  Se cargaron 7 ADAS inexistentes en un auto por leer la tapa.
- ⚠️ **Verificar que la ficha sea de la variante que está en la tabla**, no de otra del
  mismo modelo.
- `read_pdf_content` **trunca el preview a 2000 caracteres por página** y hace perder
  medias páginas sin avisar. Ante la duda, `render_pdf_page` y leer la imagen.
- PDF Tools solo accede a `~/Documents`, `~/Downloads` y `~/Desktop`.
- Las **etiquetas de eficiencia energética AR** (IRAM/AITA 10274-2) son una fuente aparte
  y a veces **contradicen** la ficha de la misma marca.

---

## Deploy

El sitio vive en **Vercel**: `https://autoschinos-ar.vercel.app/`, y publica solo con
cada push a `main`, en segundos. Netlify quedó atrás — el `netlify.toml` sigue en el
repo pero no cumple ninguna función.

**Nunca dar por publicado un cambio porque `git push` salió bien** — verificar contra la
URL con un `grep` de algún marcador del cambio, no por tamaño. Vercel sirve el archivo
tal cual (a diferencia de Netlify, que inyectaba 536 bytes), así que lo servido y el repo
difieren a lo sumo en el salto de línea final.

---

## Push automático: la excepción de la rutina

El `CLAUDE.md` global del usuario dice que en un repo con remoto **nunca** se commitea
sobre `main` ni se pushea, "ni siquiera si te pedí commitear".

**Para la rutina automática de este repo, y solo para ella, el usuario autorizó
explícitamente la excepción** (2026-09-22): `herramientas-chequeo-diario.sh` puede
commitear a `main` y pushear sin preguntar.

La excepción es angosta y no se extiende:

- vale **solo** para la corrida no interactiva que lanza ese script
- vale **solo** para este repo
- vale **solo si las 6 invariantes pasan**. Si alguna falla, no se commitea nada.
- en una sesión interactiva la regla global sigue vigente: preguntar antes de pushear

Como cada push publica en el acto y nadie revisa, la prudencia reemplaza a la
supervisión: ante la duda sobre un dato, no cargarlo. Una corrida sin cambios es un
resultado válido.
