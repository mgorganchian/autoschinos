# autoschinos — reglas del proyecto

Comparativo de **108 autos** chinos/electrificados vendidos (o por llegar) en Argentina.
Todo vive en un único `index.html` autocontenido: sin CSS, JS ni imágenes externas.
Ese principio es deliberado — **no agregar dependencias externas ni partir el
archivo.** Las únicas excepciones, servidas junto a la página y bajadas cuando hacen
falta: `fotos/`, `og.jpg`, `fichas-fuentes.tsv` y `concesionarios.json`.

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
4. **Cada una de las 98 filas de `DATA`**, en la posición correcta.
5. **`colspan="N+1"`** de las filas de categoría — está hardcodeado.

Además hay 3 conteos en texto: `#headerSubtitle`, `#summaryText` y el comentario arriba
de `CARS`.

### Valores de los campos

| campo | valores |
|---|---|
| `type` | `ice` `hev` `mhev` `phev` `ev` `tbd` |
| `size` | `xl` `big` `mid` `compact` `mini` `nd` |
| `body` | `SUV` `Crossover` `Sedán` `Hatchback` `Minivan` `Pickup` `Convertible` |
| `status` | `venta` `preventa` `nolanzado` `discontinuado` |

**`size` (segmento) se asigna por el largo**, con los umbrales anotados arriba de `CARS`
(chico < 4150 mm ≤ compacto < 4515 ≤ mediano < 4714 ≤ grande; **muy grande** = 4825 mm o
más **y además 6+ asientos o pickup**, pedido del usuario del 2026-10-04: un sedán largo
de 5 plazas es "grande"). Al
agregar un auto con largo cargado, su segmento sale de ahí, no "a ojo". `nd` solo si
no hay largo. Sumar ancho y distancia entre ejes se probó y clasificaba peor (13 de 27
contra 24 de 27). Dos autos clasificados antes no siguen la regla (los dos BJ30) y están
listados como excepción en `tests/e2e/invariantes.spec.js`.

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

**Verificación cruzada:** renderizar de verdad y contar 98 filas en 14 categorías, con
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
- **En portrait se muestran 3 columnas** (característica + 2 autos): `col-feat 20vw`,
  `col-data 38vw`. Fue un pedido explícito. **No "arreglarlo" a 4 columnas.** La de
  características es angosta para que la foto se vea grande (2026-10-05); en tablet y
  escritorio (≥768 px) las columnas son de 144 px por lo mismo. La miniatura embebida
  mide 300 px: más ancha se ve borrosa. En celulares de alta densidad se cambia por la
  portada de `fotos/` cuando entra en pantalla.
- **Nombres cortos de características** (`ETIQUETA_CORTA`): la columna muestra el corto y
  el tooltip, el nombre completo más la explicación de `GLOSSARY`. **El nombre de `DATA`
  sigue siendo la clave de todo**: el código busca filas por `tr.dataset.nombre`, nunca
  por el texto visible ni por `data-search` (que suma el corto para la búsqueda). El
  filtro de asientos dejó de andar en silencio cuando se buscaba por `data-search`.
- **La barra resumen NO es sticky** — decisión explícita del usuario.
- **El header grande se oculta** tras el primer "Comparar" (`hasComparedOnce`).
- **Dropdown de Marca/Modelo en `position:static`**, no `absolute` (quedaba recortado).
- El **indicador de percentiles** (4 cuadraditos verdes) va **solo en las 15 filas
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
- La **vista Ranking** (botón Tabla/Ranking) ordena del mejor al peor **solo las 15
  filas de `PCTL_DIR`**, y lee los números con el **mismo `pctlValor()`** que los
  cuadraditos: no tiene parser propio, así que hereda los vetos. Lo que no se puede
  rankear va al final en **tres grupos distintos que no hay que fusionar**: "Sin dato"
  (no se sabe), "No aplica" (consumo de nafta en un eléctrico) y "No comparable" (hay
  cifra pero en otra unidad o medida distinto). Las cifras NOTE/EXT entran marcadas con
  su explicación. Respeta los autos elegidos en el comparador. `tests/e2e/ranking.spec.js`
  falla si un eléctrico se rankea en consumo o una pickup en baúl.
  En **Consumo, los enchufables (`type:"phev"`) van aparte y sin puesto** (`RK_APARTE`):
  rankeados salían primeros con 0,9–1,2 L/100km, y tampoco se ordenan entre ellos
  porque cada ficha mide distinto (el Lynk & Co 01 da 0,9 con batería llena y 6,4 con
  batería vacía; los BYD DM-i no aclaran). Los cuadraditos de la tabla todavía los
  incluyen.
- **Autos similares** (bloque "Autos similares a X por:" en el selector con un solo
  auto elegido, y botón "Similares" en cada auto de la tabla): sugiere los 3 más
  parecidos según los criterios tildados, que se combinan (precio, tipo de auto,
  tamaño, propulsión, asientos, y autonomía solo si el auto elegido es eléctrico:
  `SIM_SOLO_SI`). Las autonomías mezclan ciclos NEDC/WLTP/CLTC, y el criterio lo
  aclara en su tooltip. Con **Propulsión** tildada sugiere **primero los del mismo
  tipo** (`SIM_FAMILIA`: el mild-hybrid va con los híbridos, porque ninguno se
  enchufa y el BJ60 es el único mild), y si hay menos de 3 completa con otros. Es
  **preferencia, no filtro**: el usuario pidió explícitamente que no fuera estricta.
  El **tamaño se mide por el largo** (está en 106 de 108 autos; el segmento falta en 2)
  y **pesa el doble** (`SIM_PESO`), también pedido explícito. Con el triple el largo
  pisaba al tipo de auto: no subirlo sin mirar qué sugiere. La distancia de cada criterio está explicada arriba
  de `SIM_CRITERIOS`. Si el auto elegido no tiene un dato, ese criterio se apaga; si
  no lo tiene el candidato, cuenta como lo más distinto. **Para sumar un auto se usa
  `simHabilitar()`**, nunca tildarlo a mano: un auto se ve si pasa los filtros Y está
  tildado, y habilitar su marca tildaba de rebote a sus hermanos de marca (8 autos en
  vez de 2). `tests/e2e/similares.spec.js` lo cubre.
- **Las columnas se pueden mover** (2026-10-03): el auto de referencia (📌) va primero
  y "Ordenar autos" reordena el resto. **El orden por defecto es "Dimensiones"**: largo,
  a igual largo ancho, a igual ancho alto, más grande primero (`compararDims`); así el
  orden de `CARS` ya no importa y los autos nuevos se pueden agregar al final. Se mueven los `<th>` y `<td>` en el DOM, sin
  tocar `DATA` ni `CARS`. Por eso **nunca buscar el `<th>` de un auto por posición**:
  se usa `TH_AUTO[i]` (tomado al cargar) o `th[data-idx]`, y las celdas por
  `td[data-col]`. `tests/e2e/ux.spec.js` falla si una celda queda debajo de otro auto.
  La referencia marca ▲/▼ **solo en las filas de `PCTL_DIR`** y con `pctlValor()`,
  igual que los cuadraditos; los enchufables no se comparan en consumo (`RK_APARTE`).
- **La comparación vive en la URL**: `?autos=slug,slug&ref=slug&orden=clave` (los slugs
  son los de las fotos). Si se renombra un slug, los links viejos a ese auto dejan de
  incluirlo: no renombrar slugs sin necesidad.
- **Presupuesto** en el selector: rango en USD sobre `SIM_PRECIO`. Los autos sin precio
  en dólares entran por defecto (tilde aparte): no esconder un auto porque falte el dato.
- **Modo oscuro**: todo color sale de las variables de `:root`; el oscuro solo cambia sus
  valores (por `prefers-color-scheme` y por `data-theme`, que el botón guarda en
  `localStorage`). **No volver a escribir colores fijos en el CSS** (`#fff`, `#666`…):
  quedan mal en oscuro. Las fotos mantienen fondo blanco a propósito.
- **Impresión**: imprime lo que se ve, siempre en claro. Como el encabezado vive en otra
  `<table>`, `beforeprint` lo copia como `<thead>` de la tabla principal para que se
  repita en cada hoja.
- Los **7 todoterreno** (BJ40 ×2, BJ60, BJ30 ×2, Tank 300, Jetour T2) usan la silueta
  `b-offroad` pero su campo `body` **sigue siendo `"SUV"`**: cambia el dibujo, no el filtro.

---

## Ciclos, potencia total y garantía (2026-10-04)

- **Cada cifra de autonomía y consumo dice su ciclo** en el valor visible, entre
  paréntesis y justo después del número, tal como lo dice su fuente: `(NEDC)` `(WLTP)`
  `(WLTC)` `(CLTC)` `(EPA)` `(etiqueta AR)` o `(ciclo no informado)`. El código los lee
  así (`CICLO_RE`). **Nunca deducir el ciclo** por el país, la marca o el título de la
  fila. La etiqueta argentina (IRAM/AITA 10274-2) es NEDC (Res. 85/2018).
- El ranking ordena autonomía eléctrica y consumo por un **estimado WLTP** (`WLTP_AUT`,
  `WLTP_CONS`, fuentes en `WLTP_TEXTO`), pero muestra grande la cifra de la ficha. La
  tabla nunca muestra estimados. La **autonomía combinada no se estima**: no hay factor
  defendible; se rankea por ciclo. Decisión del usuario: no cambiar sin preguntarle.
- **Potencia total del sistema (kW)**: naftero = motor; eléctrico = motor(es); híbrido =
  la combinada que declara la fuente. **Nunca sumar motores a mano**. Si la "combinada"
  declarada es la suma exacta de los motores, se carga con `, suma de los motores` en el
  valor visible: `PCTL_VETO` la deja fuera del ranking (BJ30, GAC S7, Jetour G700).
- **Garantía general / de la batería / Fabricado en** (fila de Precio). "Marca china" no
  alcanza para poner "China": hay modelos armados en Brasil o Uruguay.

## Grupos, página de cada auto y vista previa (2026-10-04)

- **Grupo automotriz**: `MARCAS_INFO` (en el script) dice, por marca, el grupo, la
  relación (marca propia, submarca, adquirida, joint venture, participación,
  independiente), el detalle, el **importador en Argentina** y las fuentes. De ahí salen
  el filtro "Grupo" del selector, la vista 🏭 Grupos y las filas "Grupo automotriz" e
  "Importador en Argentina". **Una marca nueva necesita su entrada** (con fuente): sin
  ella el test de `ux.spec.js` falla.
- **GWM**: en Argentina Haval, Ora, Tank y Poer se venden como GWM ("One GWM"), así que su
  `brand` es `"GWM"`; la submarca sale del nombre del auto (`submarcaDe`). Kaiyi NO es
  del grupo Chery (la controla Yibin; Chery tiene una parte minoritaria).
- **Página de cada auto** (`?auto=slug`): lee `fichas-fuentes.tsv` del propio sitio para
  los links a fuentes oficiales. **No renombrar ni mover ese archivo** (lo sirve Vercel).
- `og.jpg` (vista previa al compartir) se genera con fotos oficiales sin créditos de Commons.

## Concesionarios (2026-10-05)

- **`concesionarios.json`** va aparte, como las fotos: la página lo baja recién al abrir la
  vista "Concesionarios" o "Dónde verlo" en la página de un auto. **No renombrarlo ni
  moverlo** (lo sirve Vercel). Si falta, la página avisa y no rompe.
- **Solo la red oficial** que publica cada marca o su importador en su sitio (buscador,
  API o JSON que la página carga). Nada de directorios, Maps ni listados de terceros.
  Muchas redes cargan los datos por JS: la URL de esos datos va en `fuente` junto a la
  página.
- **Solo datos de empresa**: un mail con nombre de persona (`juan.perez@…`) no se carga.
  Una razón social con nombre propio ("Darío Gordo S.A.") sí.
- **Esquema**: `marcas[marca] = {fuente_red[], total, nota, aviso}` y cada local
  `{nombre, marcas[], provincia, ciudad, direccion, telefono, whatsapp, email, web,
  horarios, servicios[venta|posventa], fuente[], consultado, nota?}`. `provincia` es una
  de las 24 con nombre oficial (CABA como "Ciudad Autónoma de Buenos Aires"). `fuente`
  es **siempre una lista de URLs**. `nota` es trazabilidad (contradicciones de la fuente)
  y no se muestra. Una marca sin red lleva `aviso`, que sí se muestra.
- Un local que está en la red de varias marcas va **una sola vez** con todas. Si cada
  red publica otro teléfono o mail, el campo los lleva con la marca adelante
  ("GWM: …; Changan: …"); la tarjeta hace link de cada número por separado.
- **WhatsApp es link solo si viene en formato internacional (54…)**: pasar un número
  local a internacional sería adivinar.
- Deepal publica la red de Changan; Arcfox, la de BAIC; los talleres de Jetour son la red
  de servicio de Famly, su importador. Omoda/Jaecoo, SWM, Skywell y Stelato no publican red.
- `tests/e2e/concesionarios.spec.js` falla si una marca de la tabla no figura, si un
  total no coincide, si un local no tiene fuente https o provincia normalizada, o si hay
  locales repetidos.

## Diseño: ficha técnica oficial (2026-10-04)

Rediseño con la skill frontend-design, dirección elegida por el usuario. Para no deshacerlo:
- **Tipografía**: Barlow (texto), Barlow Semi Condensed (tabla y números, cifras
  tabulares), Barlow Condensed (títulos, nombres de autos, categorías). **Embebidas en
  base64** al principio del `<style>`: no cargar Google Fonts (el archivo es autocontenido).
- **Color**: papel frío `--paper`, tinta `--byd-blue-dark` (el nombre es histórico) y la
  escala A–E de la etiqueta de eficiencia (`--etq-a`…`--etq-e`) **solo para codificar
  información**: percentil (`.pct.n0`…`n4`) y origen del dato. Nada de colores fijos nuevos.
- **Lo memorable es la franja de origen** a la izquierda de cada celda: ámbar = otro
  mercado o prensa (EXT), gris azulado = aclaración (NOTE), rayado = sin dato (NR). Los
  emojis 🔶 ℹ️ ya no se usan; el texto para lectores de pantalla va en `.sr`, anclado a su
  celda (un `.sr` suelto estiró la página a 15.000 px en el celular: lo cubre un test).
- **Sin chrome de plantilla**: nada de emojis en botones ni títulos, etiquetas en
  mayúsculas, separadores "·" en textos de estado, ni flechas "➜". Radios por jerarquía
  (3px chips, 4px botones, 6px paneles, 2px fotos); ranking y ficha como planilla con
  reglas, no tarjetas con sombra.

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
embebida en el `<th>`) y, si hay material, hasta 6 más en un carrusel (tope 7, de las
cuales 2 interiores como mucho). `FOTOS_POR_AUTO` dice cuántas tiene cada uno; los
archivos van numerados **sin huecos** desde 1.

**Las fotos se agregan con `herramientas-fotos.py`, nunca a mano**: `buscar` baja y
procesa candidatas de Commons a `.fotos-candidatas/`, `instalar ID…` agrega las
aprobadas y escribe juntos `FOTOS_POR_AUTO`, `CREDITOS_POR_FOTO` y `fotos-fuentes.tsv`,
y `descartar ID "motivo"` anota el rechazo en `fotos-descartadas.tsv` por nombre de
archivo de Commons, para que no se vuelva a proponer. `tests/e2e/fotos.spec.js` falla
si esos tres lugares no coinciden o si una foto queda sin autor.

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
- Muchas fotos de cabina **no dicen "interior" en el nombre**, pasan por Vision y
  quedan como un volante flotando. Por eso `buscar` guarda también `ID.int.jpg`, sin
  recortar: si es una cabina entera, se instala como `ID:interior`. El 2026-09-30 así
  aparecieron 5 interiores que de otro modo se habrían descartado.
- **El modelo tiene que llamarse exactamente igual que en la tabla.** Un calificador
  de versión en el nombre (facelift, II, GT, EV, SHS, Shanhai…) se verifica contra las
  filas Tipo de propulsión y Precio; si no se puede confirmar, se descarta con ese
  motivo. EM-P y EREV sí coinciden con los PHEV/REEV de la tabla.

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

La **Fecha de consulta** del pie (`#fechaConsulta`) es la de la última verificación de
las fichas oficiales, **no la de los precios**, que siguen siendo de las listas de agosto
2026. La actualiza la rutina sola, y solo si pudo verificar todas las fichas: no
tocarla a mano.

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
commitear a `main` y pushear sin preguntar. Desde el 2026-09-30 corre **una vez por
semana, los lunes a las 09:15** (launchd), con una pasada completa: fichas, datos
faltantes y fotos. Si Claude no puede autenticarse o falla, avisa con una notificación
de macOS; el 2026-09-28 la sesión venció y la pasada no corrió sin que nadie se enterara.

La excepción es angosta y no se extiende:

- vale **solo** para la corrida no interactiva que lanza ese script
- vale **solo** para este repo
- vale **solo si las 6 invariantes pasan**. Si alguna falla, no se commitea nada.
- en una sesión interactiva la regla global sigue vigente: preguntar antes de pushear

Como cada push publica en el acto y nadie revisa, la prudencia reemplaza a la
supervisión: ante la duda sobre un dato, no cargarlo. Una corrida sin cambios es un
resultado válido.
