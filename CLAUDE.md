# autoschinos — reglas del proyecto

Comparativo de **124 autos** chinos/electrificados vendidos (o por llegar) en Argentina.
Todo vive en un único `index.html` autocontenido: sin CSS, JS ni imágenes externas.
Ese principio es deliberado — **no agregar dependencias externas ni partir el
archivo.** Las únicas excepciones, servidas junto a la página y bajadas cuando hacen
falta: `fotos/` (con `fotos/mini/`, las miniaturas del encabezado), `logos/`, `og.jpg`,
`fichas-fuentes.tsv`, `logos-fuentes.tsv` y `concesionarios.json`. Aparte, `autos/*.html`,
`sitemap.xml` y `robots.txt` son páginas generadas para Google (ver "Páginas por auto").

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
4. **Cada una de las 100 filas de `DATA`**, en la posición correcta.
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
6. **Ninguna celda con `|` que no arranque con `NR:`, `NOTE:`, `EXT:` o `DET:`.**

Más: `DATA` tiene que parsear con `JSON.parse` y el `<script>` no tener errores.

**Por qué la 6:** el renderer solo interpreta el `|` como separador valor/explicación
*después* de esos prefijos. En un valor plano se ve el texto crudo en la celda. Este bug
se coló dos veces.

**Trampas al medir:** `grep '<th'` también matchea `<thead>`; `grep 'col-data'` también
cuenta las 2 definiciones del `<style>`.

**Verificación cruzada:** renderizar de verdad y contar 100 filas en 14 categorías, con
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

**Lo igual se escribe igual** (pedido del usuario, 2026-10-07): el filtro "Solo diferencias"
compara el texto visible (lo que va antes del `|`). Dos celdas que dicen lo mismo tienen que
decirlo con el mismo texto ("Independiente McPherson", no "MacPherson" en una y "McPherson
independiente" en otra), y el detalle que no hace falta ver de entrada va a `DET:` (o a la
explicación, si ya era `NOTE:`/`EXT:`). En las filas con ranking, lo que el lector necesita
queda visible: el ciclo, "suma de los motores", "rebatidos", unidades distintas y "No aplica".
Un `Sí`/`No` con aclaración (`DET:Sí|…`, `NOTE:Sí|…`) se dibuja con el mismo ✓/– que
`YES`/`NO` (`simbVal`), y "Solo diferencias" toma `YES` = `Sí` (`CLEAN_SENT`). La primera
pasada (2026-10-07) unificó 2.917 celdas: los valores visibles distintos bajaron de 3.324 a
1.843, sin cambiar el ranking.

| forma | significa |
|---|---|
| texto plano | dato confirmado |
| `NR:s/d\|explicación` | sin dato, con motivo |
| `NOTE:valor\|explicación` | dato con matiz (ciclo de homologación, discrepancia, estimación) |
| `EXT:valor\|explicación` | no sale de la ficha oficial argentina (otro mercado, prensa) |
| `DET:valor\|detalle` | dato confirmado con un detalle que no hace falta ver de entrada (la versión del precio, "con barra estabilizadora"): se ve como un dato común, sin franja, y el detalle sale al pasar el mouse |

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
  características es angosta para que la foto se vea grande (2026-10-05). En tablet y
  escritorio (≥768 px) entran **como máximo 6 autos por pantalla** (pedido del usuario):
  cada columna mide un sexto del ancho, y nunca menos de 144 px. La miniatura embebida
  mide 300 px; cuando la foto se dibuja con más píxeles, el script la cambia por la
  portada de `fotos/` (900 px) al entrar en pantalla.
- **Nombres cortos de características** (`ETIQUETA_CORTA`): la columna muestra el corto y
  el tooltip, el nombre completo más la explicación de `GLOSSARY`. **El nombre de `DATA`
  sigue siendo la clave de todo**: el código busca filas por `tr.dataset.nombre`, nunca
  por el texto visible ni por `data-search` (que suma el corto para la búsqueda). El
  filtro de asientos dejó de andar en silencio cuando se buscaba por `data-search`.
- **La barra resumen NO es sticky** — decisión explícita del usuario.
- **El header grande se oculta** tras el primer "Comparar" (`hasComparedOnce`).
- **Dropdown de Marca/Modelo en `position:static`**, no `absolute` (quedaba recortado).
- El **indicador de percentiles** (una barra rojo → amarillo → verde al pie de la celda, cuyo
  largo es el percentil; reemplazó a los 4 cuadraditos el 2026-10-07, pedido del usuario). Con 2
  o más autos elegidos, **la misma barra se recalibra** (`recalibrarBarras`, 2026-10-09): arranca
  en su valor general y se desliza a su lugar entre los elegidos (el mejor la llena; el resto,
  valor/mejor). Al volver a todos, regresa a `data-g`. La barra se marca en un tramo de un
  cuarto de la escala que termina en el puntaje, con la opacidad subiendo de izquierda a derecha
  hasta el 100% en la punta, y lo de atrás queda al 20% (`barraZona`, máscara
  `--z`): los tramos miden igual y cambian de lugar y color. Pedido del 2026-10-09. Va **solo en las 17 filas
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
- La **vista Ranking** (botón Tabla/Ranking) ordena del mejor al peor **solo las 17
  filas de `PCTL_DIR`**, y lee los números con el **mismo `pctlValor()`** que los
  barras de percentil: no tiene parser propio, así que hereda los vetos. Lo que no se puede
  rankear va al final en **tres grupos distintos que no hay que fusionar**: "Sin dato"
  (no se sabe), "No aplica" (consumo de nafta en un eléctrico) y "No comparable" (hay
  cifra pero en otra unidad o medida distinto). Las cifras NOTE/EXT entran marcadas con
  su explicación. Respeta los autos elegidos en el comparador. `tests/e2e/ranking.spec.js`
  falla si un eléctrico se rankea en consumo o una pickup en baúl.
  En **Consumo, los enchufables (`type:"phev"`) van aparte y sin puesto** (`RK_APARTE`):
  rankeados salían primeros con 0,9–1,2 L/100km, y tampoco se ordenan entre ellos
  porque cada ficha mide distinto (el Lynk & Co 01 da 0,9 con batería llena y 6,4 con
  batería vacía; los BYD DM-i no aclaran). Las barras de percentil de la tabla todavía los
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
  El **tamaño se mide por el largo** (está en 120 de 124 autos; el segmento falta en 4)
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
  igual que las barras de percentil; los enchufables no se comparan en consumo (`RK_APARTE`).
- **La comparación vive en la URL**: `?autos=slug,slug&ref=slug&orden=clave` (los slugs
  son los de las fotos). Si se renombra un slug, los links viejos a ese auto dejan de
  incluirlo: no renombrar slugs sin necesidad.
- **Presupuesto** en el selector: rango en USD sobre `SIM_PRECIO`. Los autos sin precio
  en dólares entran por defecto (tilde aparte): no esconder un auto porque falte el dato.
- **Letra en el celular** (2026-10-10, pedido del usuario: con presbicia no se leía): hasta
  640 px de ancho la base es `html{font-size:130%}` (con 115% los datos quedaban en 15 px y no
  alcanzó; con 130% van en 17 px y casi nada baja de 15). El título grande del encabezado no sube.
  Las páginas de `autos/` y `novedades` (las arma `herramientas-paginas.py`) usan 115% con el
  cuerpo en `1rem` (18 px; su texto es más grande de base). Solo en pantalla: al imprimir no cambia. Todos los tamaños de letra van en `rem`
  para que suban juntos: **no escribir tamaños de letra en px**. El ancho de las columnas va
  en `vw` y no cambia.
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

## Patentamientos, choques, historial y novedades (2026-10-08)

- **Patentamientos 2026 (unidades)** (fila de Precio): inscripciones iniciales del registro
  oficial (DNRPA, datos.jus.gob.ar), contrastadas con ACARA en el detalle. Si el registro junta
  dos autos de la tabla, los dos llevan la misma cifra en NOTE; nunca se reparte. No es ranking.
- **Seguridad en choques (NCAP)** (primera de Seguridad pasiva): Latin NCAP va en texto plano;
  Euro NCAP, ANCAP, C-NCAP o ASEAN como EXT con año. Solo si el ensayo es del mismo modelo,
  generación y versión vendida acá (o se aclara la variante): ensayos de una versión anterior o
  de otro modelo (Pro Max, protocolo viejo) van NR con lo que existe en la explicación. No es
  ranking: las estrellas de programas distintos no se comparan.
- **Historial del precio** (`HISTORIAL_PRECIOS`, por slug): solo cambios de una lista oficial de
  la misma versión; una corrección reemplaza la última entrada. Lo escribe la rutina (tarea D).
- **Novedades** (`/novedades` y `/novedades.xml`): las arma `herramientas-paginas.py` con el
  historial, las promos vigentes y `novedades.json` (solo hitos del sitio). No editar a mano.
- **La portada abre "Ayudame a elegir"** (2026-10-09), que es una **vista de la página** como Tabla
  y Ranking (pestaña `#vistaElegir`, sección `#elegirHoja`, `mostrarVista('elegir')`), no un panel
  encima de la tabla: el panel modal confundía (título repetido, tabla oscurecida e inaccesible).
  Sin parámetros en la URL abre esa vista; con `?autos=`, `?auto=` o `?tabla` va directo. **Los tests cargan `/index.html?tabla`**:
  si un test nuevo carga la página sin parámetros, el panel tapa la tabla.
- **Visor de fotos** (2026-10-09): tocar la foto de un auto en Ayudame a elegir
  (`data-visor-slug`) o en su página (`#fichaImg`) la abre a pantalla completa (`abrirVisor`),
  con las demás fotos (flechas, teclado o deslizar), su vista y su crédito por foto. Ayudame a
  elegir sugiere 5 autos en escritorio y 4 en el celular (`elegirN()`).
- **Ayudame a elegir** (franjas de precio y tipos de auto elegidos para que cada opción tenga
  una cantidad pareja de autos: SUV partidos por tamaño; sugiere 5 o 4, `elegirN()`; la barra al pie muestra las sugerencias y se ilumina
  con cada respuesta, porque en el celular la lista queda fuera de la pantalla): filtros duros (franja de precio, plazas, tipo) y puntos por propulsión,
  percentiles y respaldo. El presupuesto es una **franja** ("35.001 a 45.000"), no un tope:
  elegir una más alta dice que querés gastar más, y dentro de la franja el precio no suma. Con
  enchufe en casa, los enchufables van primero (`ELEGIR_ENCHUFE`). Un enchufable nunca se
  presenta como de bajo consumo (`RK_APARTE`).
- **Respaldo** (2026-10-09, pedido del usuario): las dos garantías están en `PCTL_DIR` (años y,
  a igual plazo, kilómetros: vale años + km/250.000, sin pasar nunca un año; 2026-10-09): tienen barra, ★ y ranking. Quién lo importa
  (`IMPORTA_FABRICA`: BYD, Omoda, Jaecoo y Leapmotor los trae la casa matriz, según
  `MARCAS_INFO`) cuenta como una fila más en "Gana en más filas" cuando los elegidos difieren,
  y en Ayudame a elegir suma puntos y aparece como motivo.
- **Pedir cotización**: WhatsApp solo con número internacional; elige el contacto de la marca.

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
  de servicio de Famly, su importador; smart, la de su buscador (concesionarios Mercedes-Benz
  que la venden). Omoda/Jaecoo, SWM, Skywell, Stelato y Rely no publican red.
- `tests/e2e/concesionarios.spec.js` falla si una marca de la tabla no figura, si un
  total no coincide, si un local no tiene fuente https o provincia normalizada, o si hay
  locales repetidos.
- **Dónde comprarlo** (2026-10-08, pedido del usuario): en la página de cada auto, los locales
  que VENDEN la marca, con su zona, la distancia y los precios y promos publicados; arriba la
  mejor oferta publicada y el local más cercano que la tiene.
  - Ubicación de cada local: `lat`, `lon`, `geo` (`red` = pin de la red oficial, `direccion` =
    Georef, `localidad` = centroide de Georef) y `partido`/`localidad` de Georef para la zona.
    Nunca una coordenada a mano. 13 locales sin coordenadas (solo provincia).
  - Ubicación de quien mira: el GPS **solo al tocar "Usar mi ubicación"**, no sale del navegador
    ni se guarda; o el partido/departamento que elige (`localidades`: los 529 centroides de
    Georef), que sí se guarda en su navegador. Distancia en línea recta.
  - Promos: `marcas[m].promos` (lo que publica la marca para toda la red) y
    `concesionarios[i].promos` (lo que publica el sitio del propio local). Cada una
    `{autos:[slug|"*"], tipo, texto, precio?|descuento? {moneda, monto}, version?, vigencia,
    fuente[], consultado}`. Solo el sitio de la marca o del propio concesionario: nada de
    clasificados, comparadores, prensa ni redes. **Un monto sin moneda clara no lleva
    `precio`** (queda en el texto); nunca convertir monedas. Una promo de la marca no se copia
    a cada local. Las vencidas no se muestran; la rutina (tarea G) las saca y busca nuevas.
  - "Mejor oferta" = el precio final más bajo publicado en la moneda del precio de lista (USD si
    hay), o si no hay precios, el mayor descuento. Sin datos, la página dice que nadie publica.

## Colores (2026-10-06)

- Sección "Colores en Argentina" en la página de cada auto, desde `COLORES_AR` (por slug):
  `{c: [nombres] | null, f: url, d: tipo de fuente, n: nota}`. Los nombres van **tal como
  los escribe la marca** (sin traducir ni inventar el tono), y solo de fuentes oficiales
  argentinas: ficha AR, sitio o configurador de la marca. Nada de otros mercados.
- Si la ficha y la web oficial no coinciden, va **la más reciente** (casi siempre la web) y
  `n` dice en qué difiere la otra. Si se contradicen sin forma de saber cuál vale (Kaiyi
  X3/X3 Pro/X7), `c` queda en null con el motivo.
- 81 de 124 autos tienen colores; los demás no los publican con nombre (BAIC dibuja muestras
  sin nombre, MG solo tiene códigos internos, los no lanzados no tienen página).
  `tests/e2e/colores.spec.js` falla si una lista no tiene fuente https.

## Reseñas en video (2026-10-09)

- Sección "Reseñas en video" en la página de cada auto, desde `VIDEOS` (por slug):
  `[{canal, id, t, f, s}]` = canal, id de YouTube, título tal como está publicado, fecha de
  publicación (AAAA-MM-DD) y duración en segundos. Fecha y duración salen de YouTube, no se
  estiman.
- Las **pruebas** son del mismo modelo y versión que está en la tabla (motor, tracción e
  hibridación iguales a la fila de `DATA`). Desde el 2026-10-09 (pedido del usuario) también van,
  con su `tipo` y su etiqueta: `adelanto`, `presentación` (sin manejo), `informe` (varios autos,
  salones) y `otra versión` (contacto con la de otro mercado, con `n` diciendo cuál). Sin `tipo`
  es prueba. Siguen sin ir: modelos viejos o de otra generación y contenido pago de la marca.
  La prueba va primero y el botón de la tabla apunta a ella; sin prueba, al video más reciente.
- Primer canal: Matías Antico (@MatiasAnticoTV, 12 autos; revisados sus 984 videos el 2026-10-09).
  Un contacto corto al volante (Short) vale si es la misma versión: B10 y X55 Plus. Quedaron
  afuera el C10 (manejado en China con 223 CV, la tabla tiene 215) y el Dolphin Mini (manejado
  en Roma con la versión europea), además de las presentaciones sin manejo (Kaiyi, GAC, Maxus
  en Expoagro, salones). Para sumar otro periodista, mismo criterio.
- En la tabla, cada auto con video lleva un botón **"Video"** en su encabezado que abre su prueba
  **más reciente**, con canal, fecha de subida y título al pasar el mouse (2026-10-09). En la
  página del auto, los videos van del más nuevo al más viejo (`videosDe`).
- El reproductor (youtube-nocookie) se carga recién al tocar «Ver acá»: la página no baja
  nada de YouTube de entrada. Las páginas estáticas de `autos/` solo llevan el link.
  `tests/e2e/videos.spec.js` valida los datos y que no haya pedidos a YouTube antes del clic.

## Páginas por auto (2026-10-06)

- `herramientas-paginas.py` genera desde `index.html` una página estática por auto
  (`autos/<slug>.html`, servida como `/autos/<slug>` por `cleanUrls` de `vercel.json`), con
  título y descripción propios, datos estructurados schema.org `Car`, la ficha completa y
  los colores; además `sitemap.xml`, `robots.txt` y la lista de links del pie del
  comparativo (entre `<!-- autos:inicio -->` y `<!-- autos:fin -->`).
- Existen porque la página de cada auto del comparador se arma en el navegador (`?auto=`):
  Google no la indexa y al compartirla se veía siempre la misma vista previa.
- **No agregan datos ni se editan a mano.** Si cambia `index.html`, se regeneran:
  `tests/e2e/paginas.spec.js` falla si quedaron desactualizadas (corre el script con
  `--check`). La rutina semanal lo hace sola (tarea F).

## Logos (2026-10-05)

- En la vista Grupos (grupo y cada marca) y en el filtro de Marca. Archivos en `logos/`,
  el respaldo de cada uno (archivo de Commons, licencia, autor, página) en
  `logos-fuentes.tsv`, y en el script `LOGOS`, `LOGO_MARCA` y `LOGO_GRUPO`.
- **Solo Wikimedia Commons, con licencia libre y el logo vigente.** Nada de sitios de
  logos ni de fair use de en.wikipedia. Una marca sin logo así va solo con el nombre:
  **nunca armar, recortar ni redibujar un logo** (el de BAIC marca saldría de recortar el
  del grupo: no). Quedaron afuera por licencia endeble Arcfox, GAC y Shineray (subidos
  como "obra propia"), el de Geely Holding por fecha dudosa y el de JMC porque no se pudo
  confirmar que sea el vigente. Changan y Maxus solo tienen en Commons el logo anterior.
- Un grupo usa el logo de su marca solo si es el mismo logo. Los logos van sobre placa
  blanca en los dos temas (`--logo-fondo`); los blancos (Soueast), sobre `--logo-fondo-osc`.
- Un SVG sin `viewBox` no escala dentro de `<img>`: se le agrega con su ancho y alto.
  `tests/e2e/logos.spec.js` falla si un logo no está anotado, si un SVG trae scripts o
  recursos externos, o si alguno queda roto en pantalla.

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

- **Flechitas en las miniaturas** (2026-10-09, pedido del usuario): toda miniatura de un auto
  (encabezado de la tabla, selector, Similares, Ranking, Parecidos y Ayudame a elegir) va en
  un `.minicar` con `‹ ›` que cambian la foto en el lugar (`miniFoto`, `miniFlechas`). Si
  después se agranda, el zoom y el visor arrancan en esa foto (`miniK`). Las flechas nunca van
  dentro de otro botón y su clic se toma en la captura de `window`: no abre la página del auto,
  no tilda el selector ni abre el zoom. Para copiar la portada de un `<th>` se usa
  `portadaDe(img)`, no `img.src` (puede estar mostrando otra foto). En las fotos chicas
  (`.minicar.chica`: Similares, Ranking, Parecidos) las flechas aparecen solo al pasar el mouse
  y en pantallas táctiles no van, porque tapaban la foto (pedido del 2026-10-09).

Cada auto tiene una foto de portada (`fotos/<slug>-1.jpg`, más una miniatura de 300×190 en
`fotos/mini/<slug>.jpg` para el `<th>`; hasta el 2026-10-06 iba embebida en base64 y pesaba
1,3 MB de los 2,7 del archivo) y, si hay material, más fotos en un carrusel: **a lo sumo una por
vista** (12 vistas: tres cuartos delantero, frente, perfiles izquierdo y derecho, tres
cuartos trasero, atrás, baúl abierto, tablero, instrumentos, consola central, asientos
delanteros y plazas traseras; pedido del usuario del 2026-10-05: dos fotos casi iguales no
suman). `FOTOS_POR_AUTO` dice cuántas tiene cada uno, `VISTAS_POR_FOTO` la vista de cada
una (se muestra en el pie de foto); los archivos van numerados **sin huecos** desde 1, la
portada primero y el resto en el orden de las vistas.

- **La vista se decide mirando la foto**, no por el nombre del archivo. Lado del perfil =
  lado del AUTO: si la trompa apunta a la izquierda de la imagen, es el perfil izquierdo.
- `reorganizar PLAN.tsv` cambia vistas, quita repetidas y reordena lo instalado. El
  2026-10-05 se pasó de 259 a 154 fotos: 51 casi repetidas y el resto de otra versión o
  generación (Yuan Pro 2021, Song Pro pre-restyling, T2 i-DM…), con volante a la derecha,
  taxis o ploteo, o con otro auto pegado. Todas quedaron en `fotos-descartadas.tsv`.
  Ese mismo día una búsqueda completa (727 candidatas) sumó 60 vistas nuevas y llevó el
  total a 214. Commons casi no tiene interiores ni perfiles de la versión argentina: el
  hueco grande sigue siendo cabina, baúl y plazas traseras.
- **Volante a la derecha = otro mercado**: no va, aunque sea el mismo modelo.
- **Fotos oficiales de la marca** (autorizado por el usuario el 2026-10-06): las galerías de
  los sitios oficiales argentinos de la marca o del importador también valen, con la marca
  como crédito ("Foto: Chery Argentina · material oficial de la marca · sitio oficial").
  Se instalan con `instalar-oficial LISTA.tsv` (slug, vista, archivo, URL de la imagen,
  página donde aparece, marca), sin recorte, y en `fotos-fuentes.tsv` llevan la URL de la
  imagen y la página del sitio en vez de las de Commons. Así entraron 180 fotos de cabina y
  baúl el 2026-10-06. Solo de la versión de la tabla, con volante a la izquierda y sin
  renders armados (se descartó un baúl con un telescopio sobre un cielo estrellado).
- **La portada tiene que ser la versión que vende el importador argentino** (frente,
  rótulos, generación): se compara con la tapa de la ficha AR o el sitio oficial AR. Se
  cambia con `herramientas-fotos.py portada SLUG …`, que reescribe juntos la foto 1, la
  miniatura de `fotos/mini/`, su `data-credito`, `VISTAS_POR_FOTO` y la fila de la
  portada en `fichas-fuentes.tsv`. El 2026-10-06 se cambiaron 7 (Jetour T2, Omoda 5,
  Lynk & Co 06 y 01, Tiggo 8 Pro, BAIC X35 y Jolion Pro HEV), y después Jaecoo 7 (una
  "SHS-P" de Commons: la anterior era el naftero) y SWM G03F (en Commons es "SWM Tiger";
  la "Tiger EDi" es la electrificada y no va).

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

**Circuito de PR (pedido del usuario, 2026-10-09): de ahora en más, todo cambio va por pull
request.** Rama nueva desde `main`, se pushea la rama y se abre el PR en GitHub
(`gh pr create`, en borrador mientras está en curso); los commits siguientes van a esa rama.
Cuando la suite pasa, se marca listo y se activa **auto-merge when ready** (pedido del
2026-10-09: el repo tiene "Allow auto-merge" en GitHub); si no hay nada que esperar, se
mergea directo con `gh pr merge`. Después se verifica el sitio y se borra la rama (local y en
GitHub).
Nunca push directo a `main`. Vercel arma una vista previa de cada PR. La rutina semanal
también va por PR (ver abajo).
`main` está protegida (2026-10-09): para mergear exige que salgan bien dos controles, sin pedir
aprobaciones: "Vercel" (la vista previa) y "e2e" (la suite de Playwright en GitHub Actions,
`.github/workflows/tests.yml`, unos 5 a 7 minutos). **Se aplica también a administradores**
(`enforce_admins`, desde el 2026-10-09): ni el dueño ni la rutina pueden pushear directo a
`main`; todo pasa por PR. Por eso el auto-merge se puede activar apenas el PR está listo:
espera a los dos y mergea solo. Un arreglo urgente sin PR exige desactivarla antes en GitHub
(Settings → Branches) y volver a activarla después.

Los commits de este repo van con la identidad personal, no con la de kamiPay. El detalle
(mail y config de git) está en `CONTEXTO_LOCAL_PRIVADO.md`.

**Nunca dar por publicado un cambio porque `git push` salió bien** — verificar contra la
URL con un `grep` de algún marcador del cambio, no por tamaño. Vercel sirve el archivo
tal cual (a diferencia de Netlify, que inyectaba 536 bytes), así que lo servido y el repo
difieren a lo sumo en el salto de línea final.

---

## La rutina semanal también va por PR

Desde el 2026-10-09 la rutina (`herramientas-chequeo-diario.sh`, los lunes a las 09:15 por
launchd) ya no commitea a `main`: crea la rama `rutina-AAAA-MM-DD`, Claude commitea ahí, y el
script pushea la rama, abre el PR con auto-merge y espera a que se mergee (hasta 20 minutos)
antes de verificar el sitio. Si los controles de GitHub fallan, el PR queda abierto y la
rutina avisa con una notificación de macOS. Si Claude no puede autenticarse o falla, también
avisa; el 2026-09-28 la sesión venció y la pasada no corrió sin que nadie se enterara.

Como nadie revisa el PR antes de que se mergee, la prudencia reemplaza a la supervisión:
ante la duda sobre un dato, no cargarlo. Una corrida sin cambios es un resultado válido.
