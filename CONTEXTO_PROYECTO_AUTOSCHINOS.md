# Contexto completo: Comparativo de autos chinos/electrificados en Argentina

Documento para pasarle a Claude Code (corriendo local en la Mac de Mati) y que pueda seguir el proyecto sin perder las decisiones tomadas en sesiones anteriores. No es solo un resumen de qué falta — incluye el **por qué** de las decisiones de diseño, para que no se reviertan por accidente al seguir trabajando.

> **Actualizado el 2026-08-30.** Esta revisión corrige 10 puntos que habían quedado desfasados respecto del código: cantidad de autos, el campo `status` en `CARS`, la URL de Netlify, los anchos en portrait, el sistema de íconos, el filtro de disponibilidad, "Sí" en vez de "YES", el estado del research, las fichas PDF como fuente principal y una sexta invariante de validación. Cada punto corregido está marcado con **[nuevo]** o **[corregido]**.
>
> **Verificado contra el código, no contra la memoria de la sesión:** cada afirmación de este doc se chequeó ejecutando algo sobre `index.html`.

---

## 1. Qué es esto y dónde vive

- Archivo HTML autocontenido (sin dependencias externas, todo inline) que compara **49 autos** **[corregido: eran 47]** chinos/electrificados disponibles (o por llegar) en Argentina, en una tabla de **92 filas** de características agrupadas en **14 categorías**.
- **Repo**: github.com/mgorganchian/autoschinos (branch `main`, archivo `index.html` en la **raíz del repo, sin carpeta**).
- **Deploy**: **https://autoschinos.netlify.app/** **[corregido]**, conectado por GitHub → cada push a `main` dispara un redeploy.
- **Acceso de escritura**: se hace con un token fine-grained con scope **solo a este repo**, en la cuenta personal (no la organización de trabajo). Hay otro token, de solo lectura y de otro proyecto — **no tocar, no confundir, no reusar**. Los nombres concretos están en `CONTEXTO_LOCAL_PRIVADO.md`, que está en `.gitignore` porque **este repo es público**.

### Por qué el archivo está en la raíz y no en una carpeta
Decisión explícita: Netlify busca `index.html` en la raíz por default. Meterlo en una carpeta implicaría configurar el "Publish directory" en Netlify sin ganar nada, porque es un archivo único autocontenido (sin imágenes sueltas, sin CSS/JS separados). Si en el futuro se suman varias páginas HTML, imágenes como archivos separados, o se quiere separar código de documentación, ahí sí conviene reorganizar en carpetas — pero no antes.

### La URL vieja del doc anterior está muerta **[corregido]**
`stirring-fenglisu-e8fcee.netlify.app` devuelve **404** con cuerpo `text/plain` y header `server: Netlify` — es la respuesta de un subdominio sin sitio asociado. No usarla.

### Cómo verificar un deploy sin la CLI de Netlify **[nuevo]**
La CLI no está instalada y no hace falta. El sitio publicado pesa **exactamente 536 bytes más** que el `index.html` del repo, porque Netlify inyecta un comentario de marketing y dos `<meta>` (`hosting-provider` y `netlify-deploy`). Esa diferencia fija permite identificar **qué commit está publicado**:

```bash
# tamaño del index.html de un commit + 536 = tamaño esperado en vivo
expr $(git cat-file -s $(git rev-parse <commit>:index.html)) + 536
curl -s -H 'Cache-Control: no-cache' "https://autoschinos.netlify.app/?cb=$RANDOM" | wc -c
```

Mejor todavía: buscar un marcador de contenido del cambio (`grep -q 'Leapmotor C10'`). El `<meta name="netlify-deploy">` **no** trae ID de deploy, solo un link de marketing, así que desde afuera no se puede leer el estado del build.

### El deploy se puede trabar sin ningún aviso **[nuevo]**
No dar por publicado un cambio porque `git push` salió bien. El **2026-08-30**, después de cinco deploys del día que salieron en menos de un minuto cada uno, el commit que agregaba Leapmotor (`2b53f7d`) se quedó **más de una hora sin publicarse**, sirviendo la versión anterior. Verificado que no era culpa del push ni del contenido: `origin/main` tenía el commit y el raw de GitHub coincidía byte a byte con el local. Un **commit vacío para re-disparar el webhook no lo destrabó**.

Orden útil de diagnóstico si no propaga:
1. Confirmar `origin/main` y comparar el raw de GitHub contra el local.
2. Descartar caché con `Cache-Control: no-cache` y query aleatoria.
3. Mirar el panel de Netlify → Deploys: builds trabados en *Building*/*Enqueued*, alguno *Failed* con log, un cartel de **"Deploys stopped"**, o un *Published* que no es el último commit → botón **Publish deploy**.

No insistir con commits vacíos: no arregla nada y ensucia el historial.

---

## 2. Estructura técnica del archivo

- `const CARS = [...]` — array de objetos, uno por auto, en el **mismo orden** en que aparecen las columnas de la tabla.

  **[corregido] La forma real del objeto incluye `status`:**
  ```js
  {name:"BAIC BJ60", short:"BJ60", type:"mhev", size:"xl", brand:"BAIC", body:"SUV", status:"venta"}
  ```
  El doc anterior documentaba `{name, short, type, size, brand, body}` — **sin `status`**. Agregar un auto sin ese campo lo deja fuera del filtro de Disponibilidad **sin tirar ningún error**.

  | campo | valores | para qué |
  |---|---|---|
  | `type` | `ice` `hev` `mhev` `phev` `ev` `tbd` | filtro Propulsión + ícono del subtítulo |
  | `size` | `xl` `big` `mid` `compact` `mini` `nd` | filtro Segmento (`xl`/`big`→Grande, `mid`→Mediano, `compact`→Compacto, `mini`→Chico) |
  | `body` | `SUV` `Crossover` `Sedán` `Hatchback` `Minivan` `Pickup` | filtro Carrocería + silueta |
  | `status` | `venta` `preventa` `nolanzado` `discontinuado` | filtro Disponibilidad |

- `const DATA = [...]` — array de 14 categorías `[nombreCategoria, filas]`. Cada fila es `[etiqueta, valorAuto0, ..., valorAutoN]`, con índice 1:1 contra `CARS` (offset +1 porque el elemento 0 es la etiqueta).
- El `<thead>` tiene un `<th>` por auto (debe coincidir en cantidad/orden con `CARS`).
- Hay **dos** `<colgroup>` (uno en `#theadTable`, otro en `#mainTable`) que deben tener la misma cantidad de `<col class="col-data">` que autos.
- El `colspan` de las filas de categoría está **hardcodeado** como `N+1` — hoy `colspan="50"` **[corregido: era 48]**.

### ⚠️ Al agregar/quitar un auto hay que tocar 5 lugares en simultáneo
1. Insertar/quitar el objeto en `CARS`, **con los 7 campos incluido `status`**, en la posición correcta.
2. Insertar/quitar el `<th>` correspondiente en el mismo índice del `<thead>` — **con su silueta y su ícono de propulsión** (ver §6).
3. Agregar/quitar un `<col class="col-data">` en **ambos** colgroups.
4. Insertar/quitar el valor en **cada una** de las 92 filas de `DATA`, en la posición correcta.
5. Actualizar el `colspan="N+1"` de las filas de categoría.

Además, hay tres conteos hardcodeados en el texto de la página que conviene actualizar: `#headerSubtitle`, `#summaryText` y el comentario arriba de `CARS`.

### Forma recomendada de editar `DATA` (la que se viene usando)
El archivo es casi todo una sola línea gigante por el tamaño del array `DATA` (~480 KB en un solo renglón), así que `str_replace` línea por línea no sirve. En cambio, tratar `DATA` como JSON puro:

```python
import json
content = open('index.html').read()
start = content.index('const DATA = [')
idx = content.find('];', start)
data = json.loads(content[start+len('const DATA = '):idx+1])
# ... modificar `data` acá (lista de listas, 100% JSON-parseable) ...
new_data_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
content = content[:start] + "const DATA = " + new_data_str + content[idx:]
open('index.html', 'w').write(content)
```

*(Este snippet se volvió a probar contra el archivo actual y funciona: devuelve 14 categorías y 92 filas.)*

`CARS` **no** es JSON válido (tiene keys sin comillas, `type:"ice"`), así que para insertarle autos conviene regex sobre objetos `{...}` individuales completos, o reescribir el array entero.

### Las 6 invariantes a validar antes de commitear **[corregido: eran 5]**
Un desajuste de a uno rompe la tabla **en silencio** — columnas desalineadas, sin error visible. Con `N = CARS.length`:

1. `CARS.length` = celdas de datos por fila de `DATA` (cada fila tiene N+1 elementos).
2. `<th>` de auto en el `thead` = N (más exactamente 1 `<th class="feat-col">` + N `<th>`).
3. Un solo `<th class="feat-col">`.
4. Los **dos** `<colgroup>` con N `col-data` cada uno.
5. `colspan` de las filas de categoría = N+1.
6. **[nuevo]** Ninguna celda puede tener un `|` si no arranca con `NR:`, `NOTE:` o `EXT:`.

Más: `DATA` tiene que parsear con `JSON.parse` y el `<script>` no tener errores de sintaxis.

**Por qué la sexta.** El renderer solo interpreta el `|` como separador valor/explicación **después** de esos prefijos; en un valor plano se ve el texto crudo en la celda. Este bug se coló dos veces al cargar datos citando la fuente.

**Dos trampas al medir:** `grep '<th'` también matchea `<thead>`, y `grep 'col-data'` también cuenta las definiciones del `<style>` (hay 2). Contar sobre las líneas de los colgroups, no sobre todo el archivo.

**Verificación cruzada útil:** renderizar y contar filas del cuerpo (deben ser 92, en 14 categorías) y chequear que no haya errores de consola — con el script roto la tabla queda en 0 filas.

### Por qué esto importa tanto
El 2026-08-27 una versión exportada desde un chat de Claude.ai llegó con dos defectos que dejaban el sitio inutilizable: faltaba un `<th>` en el `thead` (el auto estaba en `CARS`, en `DATA`, en ambos colgroups y en el `colspan`, pero no en el encabezado) y sobraba un `]` al cierre de `DATA`, que rompía el parseo de todo el `<script>`. **Nunca commitear una versión generada afuera sin correr las 6 invariantes + un render real.**

---

## 3. Criterio de orden de columnas

**Regla principal: orden descendente por longitud del auto (mm), no por marca ni por precio.** Decisión explícita para que el comparador agrupe autos de tamaño similar cerca uno del otro.

**Excepción**: al final de la tabla hay un bloque de "marcas de alcance reducido" que se agregaron priorizando cubrir la mayor cantidad de marcas posible sin tener aún sus dimensiones confirmadas — por eso están **sin ordenar por tamaño real**, en el orden en que se fueron sumando. Reordenarlas es una tarea pendiente de prolijidad, no bloqueante.

### Orden actual completo (49 posiciones)
```
--- bloque ordenado por longitud ---
 1. BAIC BJ60 (5040)          15. BAIC X55 II Hybrid (~4620)
 2. BYD Sealion 7 (4830)      16. Honda CR-V 2010 (4575)
 3. Lynk & Co 08 (4820)       17. Lynk & Co 01 (4545)
 4. Arcfox S5 (4820)          18. Arcfox Koala S (4500)
 5. BAIC BJ40 Pro (4790)      19. BAIC BJ30 4x2 (4730)
 6. Seal 5 DM-i (4780)        20. BAIC BJ30 4x4 (4730)
 7. Seal U DM-i (4775)        21. Corolla Cross HEV (4460)
 8. BAIC X55 Plus (4745)      22. Lynk & Co 06 (4350)
 9. Song Pro (4738)           23. Arcfox T1 (4337)
10. Arcfox T5 (4690)          24. Atto 2 DM-i (4330)
11. BAIC EU5 (4650)           25. BAIC X35 (4325)
12. BAIC U5 Plus (4660)       26. Yuan Pro (4310)
13. BAIC BJ40 Plus (~4630)    27. Toyota Yaris S (4145)
14. BAIC X55 II (4620)        28. Dolphin Mini (3990)
--- "alcance reducido", SIN ordenar por tamaño ---
29. Chery Tiggo 8 Pro   34. MG ZS HEV        39. GAC S7          44. Foton Tunland V9
30. Haval H6 HEV        35. Changan CS55+    40. Kaiyi X7        45. Maxus eTerron
31. Poer 4WD            36. Geely EX5        41. Forthing U-Tour 46. Omoda C5
32. Tank 300            37. JAC T9           42. Skywell BE11    47. Jaecoo 7
33. Ora 03              38. Jetour T2        43. DFSK E5
--- agregados después ---
48. Leapmotor C10 (4739)   [nuevo]
49. Leapmotor B10 (4530)   [nuevo]
```

Los nombres en `CARS` son los de arriba: **sin prefijo de marca** en varios casos (`Yuan Pro`, no "BYD Yuan Pro"; `Corolla Cross HEV`, no "Toyota Corolla Cross HEV").

### Al insertar un auto nuevo
- Si tiene longitud confirmada y ficha completa: insertarlo por tamaño en el bloque ordenado (1-28).
- Si es de "alcance reducido" y todavía no tiene dimensiones: al final, sin ordenar.
- **[nuevo]** Los Leapmotor se agregaron **al final** aunque tenían longitud confirmada, para no permutar los 92 arrays de valores. Es una concesión consciente: se los encuentra filtrando por marca en "Elegir autos".

---

## 4. Convención de datos en las celdas

- `NR:s/d|texto explicativo` → celda gris de "sin dato", con motivo.
- `NOTE:valor|explicación` → dato con matiz (ciclo de homologación distinto NEDC/WLTP/CLTC, discrepancia entre fuentes, estimación).
- `EXT:valor|explicación` → dato que no sale de la ficha oficial argentina (otro mercado, prensa, comunicado de la marca).
- Texto plano sin prefijo → dato confirmado sin ambigüedad.

**Centinelas exactos** (el valor es *exactamente* eso, sin más texto):

| valor | renderiza |
|---|---|
| `"YES"` | ✓ verde |
| `"NO"` | – rojo |
| `"OPT"` | ○ Opcional |
| `"ND"` | s/d gris |

### **[corregido]** Los valores con texto van en castellano: "Sí" y "No", no "YES" y "NO"
Cuando el valor lleva aclaración, se escribe **`Sí (…)`** y **`No (…)`**, no `YES (…)`. Hay 792 valores que arrancan con "Sí" y 0 que arranquen con "YES". Los centinelas exactos `"YES"` / `"NO"` **sí se mantienen en inglés** porque no muestran la palabra: renderizan ✓ y –.

Escribir `YES (…)` hace que la celda muestre literalmente "YES" en la tabla.

**Regla de oro, no negociable**: nunca inventar un valor. Si hay duda real, `NR` o `NOTE` explicando — nunca completar "a ojo".

**Errores reales que costó detectar** (todos por asumir en vez de verificar):
- Potencias en CV cargadas en filas de kW (MG ZS HEV, Lynk 01, Lynk 08, Arcfox S5).
- Potencia combinada del sistema puesta en la fila del motor eléctrico.
- Tres pickups diésel etiquetadas "Naftero"; el Tiggo 8 Pro marcado híbrido siendo 100% nafta.
- Cantidad de asientos equivocada (DFSK 5→7, Forthing 5→7, Jetour 7→5).
- **En fichas con columnas por versión, leer la lista de la tapa sin mirar las marcas ●/x/–**: al Geely EX5 se le habían cargado 7 ADAS, techo panorámico y portón eléctrico que la ficha marca como **no** equipados.
- Datos tomados de la variante equivocada del mismo modelo (Foton Tunland V9 *Ultimate Mild Hybrid* en vez del *Pro Sport* naftero que es el de la tabla).

---

## 5. Decisiones de UX/CSS ya tomadas (no revertir sin querer)

Verificadas una por una contra el código actual: **todas siguen vigentes**.

- **Selector de autos en un modal/cajón** (`#modalOverlay` > `.modal-sheet`), no una sección fija. Se abre con "🔧 Elegir autos".
- **El header grande se oculta permanentemente** después del primer "Comparar" (`hasComparedOnce`).
- **La barra resumen compacta NO es sticky** — decisión explícita del usuario: prefiere scrollear para volver a verla antes que perder espacio fijo arriba.
- **Selección jerárquica Marca → Modelo**: dropdowns con conteo dinámico, más una sección plegada "Más filtros".
- **Leyenda oculta por defecto** detrás del botón "❔ Referencias", en la misma fila que "Solo Diferencias".
- **Tabla dividida en dos `<table>` separadas** (`#theadTable` con sticky real, `#mainTable` con scroll horizontal), sincronizadas por JS. Esto **no es cosmético**: es la solución a un bug real de Safari/iOS donde `position:sticky` en `<th>` no funciona si la tabla tiene scroll horizontal en la misma `<table>`. Ambas comparten `<colgroup>` idéntico con `table-layout:fixed`. Usan `border-collapse:separate; border-spacing:0` porque `collapse` rompía el sticky en Safari. **No volver a fusionar en una sola tabla** — reintroduciría el bug.
- **Header compacto en landscape** (`orientation:landscape and max-height:500px`): oculta el subtítulo del auto y reduce padding, pero **mantiene el sticky en ambas orientaciones**.
- **Dropdown de Marca/Modelo con `position:static`** (no `absolute`): estaba recortado a 260px por el modal.

### **[corregido]** Anchos en portrait: 3 columnas, no 4
```css
@media (max-width: 600px) and (orientation: portrait){
  col.col-feat{width:28vw;}   /* antes 25.5vw */
  col.col-data{width:34vw;}   /* antes 24.1vw */
}
```
Se pasó de **4 columnas visibles (característica + 3 autos)** a **3 (característica + 2 autos)**, por pedido explícito del usuario. En un teléfono de 375px la columna de cada auto pasó de 90 a 127px, que es la diferencia entre leer `Sí (ACC, más FSRA en todo el rango…)` en ocho renglones o en cuatro. Suman **96vw**: el 4% que sobra deja asomar la columna siguiente, como pista de que se scrollea al costado.

**No "arreglar" esto de vuelta a 4 columnas** creyendo que es un desajuste.

### **[nuevo]** Filas compactas
`tbody td` usa `padding:4px 3px` (antes 7px) e interlineado explícito `1.25` (`1.2` en la etiqueta); las píldoras de nota y fuente externa usan `padding:1px 4px`. Medido a 375px: el alto de fila mediano bajó de 93 a 68px (−27%) y la tabla entera de 8685 a 6489px.

El alto de cada fila lo fija **el auto con el texto más largo entre los 49**, aunque no esté a la vista. Por eso las filas que siguen altas lo están por contenido real (la lista de modos de conducción de algún auto), no por espacio desperdiciado: bajar más ya sería recortar contenido.

### **[nuevo]** Filtro de Disponibilidad
Cuarto filtro avanzado, alimentado por `CARS[i].status`:
```js
const STATUS_LABELS = {venta:"A la venta", preventa:"En preventa",
  nolanzado:"Aún no lanzado en Argentina", discontinuado:"Ya no se comercializa"};
```
Reparto actual: 44 a la venta, 3 no lanzados, 1 en preventa, 1 discontinuado.

### **[nuevo]** Botones "todos / ninguno"
Los 4 filtros avanzados (Disponibilidad, Segmento, Carrocería, Propulsión, Asientos) tienen botones para marcar/desmarcar todo. `buildFacetRow` devuelve una función `setAll(on)` que **muta el mismo Set en vez de reasignarlo**, porque el `onchange` de los checkboxes lo tiene capturado por referencia.

---

## 6. **[nuevo]** Sistema de íconos

Tres sprites SVG inline separados. Ninguno agrega archivos externos: el principio de "HTML autocontenido" se mantiene.

### Siluetas de carrocería (`.car-sprite`, 7 símbolos)
`b-suv` `b-crossover` `b-sedan` `b-hatchback` `b-minivan` `b-pickup` `b-offroad`, en viewBox `0 0 64 32`, de **relleno**, con ventanas recortadas vía `fill-rule="evenodd"`. Cada `<th>` lleva la suya, escalada con `style="--w:NN"` proporcional a la longitud del auto.

`b-offroad` (caja: techo plano y largo, parabrisas parado, culata vertical, ruedas grandes) se usa en los **7 todoterreno**: BJ40 Plus, BJ40 Pro, BJ60, BJ30 4x2, BJ30 4x4, Tank 300 y Jetour T2. **El campo `body` de esos autos sigue siendo `"SUV"`** — solo cambia el dibujo, no el filtro de Carrocería. Se descartó una variante con rueda de auxilio: a 37px queda como un bulto ambiguo e implicaría equipamiento que el BJ60 y el BJ30 no tienen.

### Propulsión (`.prop-sprite`, 4 símbolos)
Al principio del `<small>` de cada `<th>`. Altura fija de 11px con **ancho automático** (cada símbolo tiene su viewBox ajustado al contenido), para que los cuatro pesen visualmente igual.

| ícono | id | tipos | significa |
|---|---|---|---|
| gota | `p-ice` | `ice` | nafta o diésel |
| gota + rayo | `p-hev` | `hev`, `mhev` | híbrido, **no** se enchufa |
| gota + enchufe | `p-phev` | `phev` | híbrido enchufable |
| enchufe | `p-ev` | `ev` | 100% eléctrico |

**El enchufe —no el rayo— es lo que marca "se carga de la red".** Al eléctrico se le puso enchufe y no rayo justamente porque el rayo terminaba siendo el símbolo compartido entre el eléctrico y el híbrido común, que es el que **no** se enchufa. El rayo queda reservado para el híbrido autocargable. Los `tbd` no llevan ícono, en vez de uno inventado. La regla está escrita en el panel de Referencias.

### Característica (`.feat-sprite`, 92 símbolos)
Uno por fila, en viewBox `0 0 24 24`, renderizados a 15px **inline antes del texto** (no como columna aparte: la primera columna mide 104px y una columna de íconos le comería el ancho al texto). Son de **trazo** (`stroke:currentColor; fill:none`), a diferencia de los otros dos que son de relleno, porque a 15px el trazo no se empasta.

Están armados **por familias**, para que el ícono distinga dentro de su categoría: en Dimensiones la silueta dice qué se mide y la flecha por dónde; en Motorización pistón para combustión y círculo con rayo para eléctrico, más flecha de giro para el par; en Carga el mismo enchufe con `~` para AC y `=` para DC; en ADAS el mismo auto visto desde arriba con el aviso en el lugar que nombra la fila; en Suspensión el resorte sobre la rueda del eje correspondiente.

El mapa `FEAT_ICONS` se resuelve contra **la etiqueta exacta de `DATA`**. Si se cambia el texto de una fila, esa fila queda **sin** ícono en vez de mostrar uno equivocado — es a propósito.

---

## 7. Estado del research (49 autos)

**Cobertura global: 59,0%** (celdas que no son `NR`, sobre 49 × 92).

| tramo | autos |
|---|---|
| 100% | 6 — Seal U DM-i, Song Pro, Corolla Cross HEV, Atto 2 DM-i, Yuan Pro, Dolphin Mini |
| 70-79% | 7 |
| 50-69% | 21 |
| 25-49% | 10 |
| menos de 25% | 5 — Seal 5 DM-i, Honda CR-V 2010, Skywell BE11, Omoda C5, Jaecoo 7 |

### **[corregido]** El equipamiento detallado ya no está "casi todo en NR"
El doc anterior decía que ADAS, multimedia, luces y climatización quedaban en `NR` para casi todos. Hoy hay **44 de 49 autos con al menos una fila de ADAS cargada** (276 celdas de 490).

### **[corregido]** Los "pendientes" del doc anterior ya no lo están
| auto | doc anterior | real |
|---|---|---|
| Foton Tunland V9 | pendiente | 42% |
| Maxus eTerron | pendiente | 42% |
| DFSK E5 | pendiente | 39% |
| Skywell BE11 | pendiente | 13% |
| Omoda C5 / Jaecoo 7 | pendiente | 1% (no se venden en Argentina) |

### Techo honesto de lo que falta
Los huecos que quedan **no siempre son research pendiente**; en varios casos no hay fuente:
- **BYD** publica fichas de solo 4 modelos, ya al 100%. El Seal 5 (preventa) y el Sealion 7 (no lanzado) **no tienen ficha porque todavía no se venden**.
- **Omoda C5** y **Jaecoo 7** no se comercializan en Argentina.
- **Honda CR-V 2010** es un modelo discontinuado.
- Peso, cantidad de plazas, 0-100 y radio de giro **no figuran** en la mayoría de las fichas argentinas, ni siquiera en las mejores (las de Leapmotor, que están entre las más completas, no traen ninguno de los cuatro).

---

## 8. Metodología de research

### **[corregido]** Las fichas técnicas en PDF son la fuente principal, no la prensa
Un PDF oficial rinde entre **25 y 50 celdas**; una nota de prensa, 5 a 10. Las fichas traen ADAS ítem por ítem, airbags, suspensión, multimedia, luces y climatización, que es justo lo que las notas nunca publican. El Chery Tiggo 8 Pro pasó de 15% a 70% de cobertura con un solo archivo.

**Patrones de URL que funcionaron:**
- `cdn.motor1.com/pdf-files/ficha-tecnica-<modelo>.pdf` (solo existen unas pocas; adivinar nombres no sirve, 14 variantes probadas dieron 403)
- Autoblog: `autoblog.com.ar/wp-content/uploads/...`
- Arcfox: `arcfox.com.ar/.../ARCFOX-<X>-Brochure-Argentina-2026_Web.pdf`
- GWM: `gwm.com.ar/FT-<modelo>.pdf` (sin link en la página)
- Concesionarias oficiales (citydrive.com.ar, mgpilar.com.ar) cuando la marca no publica

**⚠️ Los links suelen venir JSON-escapados en el HTML** (`https:\/\/baic.com.ar\/...`), así que un `grep href` normal **no los encuentra y parece que no existieran**. Hay que des-escapar `\/` antes de buscar. Fue lo que hizo creer por un tiempo que BAIC no publicaba fichas: publica las 10. Mismo patrón en leapmotor.com.ar, donde además las páginas de modelo solo responden en `/vehiculos/<modelo>.html`, no en la ruta que declara el menú.

**Cómo leerlos:** el servidor MCP de PDF Tools solo accede a `~/Documents`, `~/Downloads` y `~/Desktop` — copiar el archivo ahí primero. `read_pdf_content` **trunca el preview de cada página a 2000 caracteres**, lo que hace perder medias páginas de specs sin avisar. Para fichas comparativas de varias versiones, la extracción de texto separa las etiquetas de los valores y **no se pueden asignar con confianza**. En ambos casos: `render_pdf_page` y leer la imagen.

**Etiquetas de eficiencia energética AR** (IRAM/AITA 10274-2): valen la pena aparte de la ficha. Traen consumo en ciclo mixto/urbano/extraurbano, emisiones de CO₂, cilindrada y potencia en kW — y a veces **contradicen** la ficha de la misma marca (en el Leapmotor B10 la ficha dice 215 cv y la etiqueta 160 kW; se cargó el de la etiqueta con `NOTE` aclarando).

### Orden de prioridad de campos
Longitud/Ancho/Alto/Distancia entre ejes → Volumen de baúl → Número de asientos → Tipo de propulsión (**verificar, no asumir**) → Motor combustión potencia/par → Motor eléctrico potencia/par → Batería y si es tecnología Blade de BYD o no → Autonomía EV/combinada, **siempre aclarando el ciclo de homologación** porque casi nunca coinciden entre marcas.

### Sitios de prensa útiles (fuente secundaria)
16valvulas.com.ar, autoblog.com.ar, parabrisas.perfil.com, noticias.autocosmos.com.ar, monkeymotor.net, megautos.com, mercadolibre.com.ar/blog, autozoom.com.ar, cuyomotor.com.ar, mdzol.com. Algunos devuelven **403 a un fetch normal**: funcionan con `curl` y un User-Agent de navegador.

---

## 9. Entorno en la máquina local

El repo de `autoschinos` tiene que tener su **propio `.git` independiente**: la carpeta padre es un repo Git de otro proyecto. Verificar con `git rev-parse --show-toplevel`, que debe devolver la carpeta de `autoschinos`. Si devuelve la carpeta padre, **avisar antes de commitear**, no asumir.

Hay otros proyectos sin relación en la misma máquina — no tocar. El detalle está en `CONTEXTO_LOCAL_PRIVADO.md` (fuera de Git).

---

## 10. Pendientes conocidos

- **Deploy trabado**: el commit `2b53f7d` (Leapmotor) está en `origin/main` y validado, pero Netlify sigue sirviendo la versión de 47 autos. Requiere mirar el panel (ver §1).
- Reordenar por tamaño el bloque de "alcance reducido" (posiciones 29-47) y ubicar los Leapmotor en su lugar por longitud. No bloqueante.
- El subtítulo del **Tank 300** dice solo "Naftero", sin el largo, aunque la fila Longitud tiene 4760 mm.
- Video promocional en Remotion: se ofreció y se pospuso para completar datos primero. Nunca se retomó.
- Separar los 7 todoterreno en el **filtro** de Carrocería (hoy solo cambia la silueta, siguen agrupados como SUV).
