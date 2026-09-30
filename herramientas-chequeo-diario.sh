#!/bin/zsh
# Actualización SEMANAL del comparativo autoschinos (los lunes, 09:15).
#
# El nombre dice "diario" porque así nació y la excepción de push de CLAUDE.md está
# atada a este nombre de archivo. Renombrarlo sería tocar esa autorización.
#
# Corre LOCAL (launchd), no en la nube, por tres razones concretas:
#   - necesita el llavero de macOS para poder pushear
#   - el recorte de fotos usa Vision de macOS vía Swift, que no existe en la nube
#   - el único entorno de nube disponible es el de trabajo, y este es un proyecto personal
#
# Qué hace, cada corrida:
#   1. Compara el hash de cada ficha oficial contra fichas-hashes.tsv
#   2. Le pasa a Claude, en modo headless, una pasada completa: corregir lo que
#      contradigan las fichas que cambiaron, completar datos faltantes y sumar
#      fotos (interiores primero). Claude corre la suite de tests antes de commitear.
#   3. Si todas las fichas se pudieron verificar, actualiza la "Fecha de consulta"
#      del pie de la página
#   4. Si publicó algo, lo verifica contra el sitio en vivo
#   Si Claude no puede autenticarse o termina con error, avisa con una notificación
#   de macOS: corriendo una vez por semana, una falla muda son dos semanas perdidas.
#
# Instalación:  launchctl load ~/Library/LaunchAgents/ar.autoschinos.chequeo.plist
# A mano:       ./herramientas-chequeo-diario.sh --ahora
#               NO es una prueba: commitea a main y publica igual que una corrida real.

set -u
case "${1:-}" in
  ""|--ahora) ;;          # --ahora se acepta por compatibilidad: toda corrida es completa
  *)          print -u2 "uso: $0 [--ahora]"; exit 2 ;;
esac
REPO="/Users/mgorganchian/Projects/autoschinos"
LOG="$REPO/.chequeo-diario.log"
SITIO="https://autoschinos-ar.vercel.app/"
UA='autoschinos-comparativo/1.0 (https://github.com/mgorganchian/autoschinos)'
CLAUDE="$(command -v claude || echo /Users/mgorganchian/.nvm/versions/node/v24.14.0/bin/claude)"

log(){ print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }
# Notificación de macOS además del log: el log no lo mira nadie hasta que algo ya
# se rompió. Los mensajes no llevan comillas porque van dentro de un AppleScript.
avisar(){
  log "ALERTA: $1"
  osascript -e "display notification \"$1\" with title \"autoschinos\" sound name \"Basso\"" 2>/dev/null
}

cd "$REPO" || { log "FATAL: no pude entrar a $REPO"; exit 1; }

# Candado: una sola corrida a la vez. mkdir es atómico, así que sirve de lock sin
# depender de flock, que en macOS no viene. Hizo falta de verdad: en la prueba del
# 2026-09-22 dos corridas se solaparon y leyeron versiones distintas del script.
LOCK="$REPO/.chequeo.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  log "ya hay una corrida en curso ($(cat "$LOCK/pid" 2>/dev/null || echo '?')), salgo"
  exit 0
fi
print -r -- "$$" > "$LOCK/pid"
trap 'rm -f "$LOCK/pid" 2>/dev/null; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

log "=== arranca la actualización semanal ==="

# Volver a main antes de empezar. Hace falta porque la propia rutina deja el repo
# parado en la rama que crea, y sin esto la corrida siguiente muere en el git pull
# (una rama sin upstream) y la rutina se autobloquea después de su primer trabajo útil.
# Solo si el árbol está limpio: si hay cambios sin commitear son de alguien más.
if [[ -n "$(git status --porcelain)" ]]; then
  avisar "Hay cambios sin commitear en el repo: la actualización semanal no corrió."
  exit 0
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  log "estaba en $(git branch --show-current), vuelvo a main"
  git checkout --quiet main 2>>"$LOG" || { avisar "No pude volver a main: la actualización no corrió."; exit 1; }
fi

# Traer lo que haya en remoto antes de tocar nada, para no divergir.
if ! git pull --ff-only --quiet 2>>"$LOG"; then
  avisar "git pull no fue fast-forward: la actualización no corrió para no pisar trabajo."
  exit 0
fi

# ---------- 1. ¿cambió alguna ficha? ----------
# Imprime el hash de la ficha, o nada si la descarga no es confiable: falló, vino
# vacía, o llegó más corta de lo que anunció el servidor. Una descarga cortada da
# un hash distinto aunque la ficha no haya cambiado: así se generó la falsa alarma
# del Jetour T2 del 2026-09-30.
hash_de(){
  local tmp hdr anunciado recibido
  tmp=$(mktemp); hdr=$(mktemp)
  if curl -sfL -A "$UA" --max-time 90 -D "$hdr" -o "$tmp" "$1" 2>/dev/null; then
    anunciado=$(grep -i '^content-length:' "$hdr" | tail -1 | tr -dc '0-9')
    recibido=$(stat -f %z "$tmp")
    if (( recibido > 0 )) && [[ -z "$anunciado" || "$anunciado" == "$recibido" ]]; then
      shasum -a 256 "$tmp" | cut -d' ' -f1
    fi
  fi
  rm -f "$tmp" "$hdr"
}

CAMBIOS=""; NUEVOS=()
TODAS_VERIFICADAS=1
while IFS=$'\t' read -r auto url hash fecha; do
  [[ -z "${auto:-}" || "$auto" == \#* ]] && continue
  nuevo=$(hash_de "$url")
  if [[ -z "$nuevo" ]]; then
    log "  $auto: descarga fallida o incompleta, la salteo"
    TODAS_VERIFICADAS=0
  elif [[ "$nuevo" != "$hash" ]]; then
    # Solo es un cambio si una segunda descarga completa da el mismo hash nuevo.
    if [[ "$(hash_de "$url")" == "$nuevo" ]]; then
      log "  $auto: CAMBIÓ ($url)"
      CAMBIOS+="- $auto — $url (hash nuevo: $nuevo)"$'\n'
      NUEVOS+=("$nuevo")
    else
      log "  $auto: dos descargas dieron hashes distintos, la salteo"
      TODAS_VERIFICADAS=0
    fi
  fi
done < fichas-hashes.tsv

# ---------- 2. la pasada completa, a cargo de Claude ----------
TAREA=""
if [[ -n "$CAMBIOS" ]]; then
  TAREA+="A) FICHAS QUE CAMBIARON desde la última revisión (confirmado con dos descargas
completas que dieron el mismo hash nuevo):

$CAMBIOS
Para cada una: descargala, leela y comparala contra lo que hoy tiene la tabla para ese
auto. Corregí SOLO los valores que la ficha nueva contradice, y actualizá su hash en
fichas-hashes.tsv al hash nuevo que figura arriba (aunque no haya valores que corregir).

"
fi
TAREA+="B) DATOS FALTANTES: buscá fichas o fuentes oficiales argentinas para los autos con
más celdas en NR y cargá lo que encuentres. Si no encontrás nada confiable, no cargues
nada y decilo en el resumen.

C) FOTOS, INTERIORES PRIMERO:
1. Corré: python3 herramientas-fotos.py buscar
   Deja candidatas en .fotos-candidatas/. Cada una tiene ID.jpg (recortada con Vision)
   y, si el nombre del archivo no decía interior, también ID.int.jpg (sin recortar).
2. MIRÁ CADA CANDIDATA con Read antes de decidir. Sin excepción: el tamaño y el nombre
   del archivo no delatan los casos malos. Si ID.jpg es un volante o una pantalla
   flotando en blanco, mirá ID.int.jpg: suele ser una cabina entera que sí sirve.
3. Instalá las que sirven: python3 herramientas-fotos.py instalar ID [ID...]
   Usá ID:interior cuando la que sirve sea la versión sin recortar de una cabina.
4. Descartá las demás, con el motivo: python3 herramientas-fotos.py descartar ID \"motivo\"
   Se descartan: volantes o pantallas sueltos, recortes que dejan algo cortado flotando,
   autos con ploteo (alquiler, concesionaria, exposición), prototipos camuflados, fotos
   con más de un modelo, fotos de noche o ilegibles, detalles sueltos (una consola, un
   logo), y la misma foto que ya es la portada del auto.
   El modelo tiene que llamarse EXACTAMENTE igual que en la tabla. Si el nombre trae un
   calificador de versión (facelift, II, GT, EV, SHS, Shanhai, EM-P, EREV…), fijate en las
   filas Tipo de propulsión y Precio si es la misma versión que la de la tabla. Si no se
   puede confirmar, descartala con ese motivo.
5. Nunca edites a mano FOTOS_POR_AUTO, CREDITOS_POR_FOTO, fotos-fuentes.tsv ni
   fotos-descartadas.tsv: los escribe la herramienta, y los tests verifican que coincidan.
Si una candidata sirve pero es casi igual a una que ya instalaste, dejala sin instalar ni
descartar: puede entrar otra semana."

log "invocando a Claude…"
PROMPT="Sos el mantenimiento automático semanal del comparativo de autos chinos. Corrés sin
supervisión, así que la prudencia vale más que la cobertura.

Hacé las tareas en este orden:

$TAREA

REGLAS QUE NO SE NEGOCIAN:
- Nunca inventes un valor. Si la ficha no lo dice, va NR con la explicación. La ausencia
  de un dato en una ficha NO prueba que el auto no lo tenga.
- Verificá que la ficha sea de la MISMA versión que está en la tabla. Ya pasó dos veces
  que una ficha de otra variante metiera datos equivocados.
- En fichas con columnas por versión, leé las marcas ●/x/–, no la lista de la tapa.
- No toques la Fecha de consulta del pie (#fechaConsulta): la actualiza este script.
- Antes de cada commit corré la suite: cd tests/e2e && npm ci && npm test
  Cubre las 6 invariantes de CLAUDE.md, el render y la atribución de cada foto. Si falla
  algo, NO commitees: dejá los archivos como estaban (git checkout -- . y borrá las fotos
  nuevas sin trackear) y explicá qué falló.
- Hacé un commit para los datos y otro para las fotos, cada uno con un mensaje que diga
  qué cambió y de qué fuente salió.
- Si no hay nada seguro que cambiar, no commitees. Una corrida sin cambios es un
  resultado válido.

SOBRE PUSHEAR: el CLAUDE.md global dice que nunca se commitea sobre main ni se pushea.
Para ESTA rutina el usuario autorizó la excepción explícitamente el 2026-09-22, y está
documentada en el CLAUDE.md de este repo. Así que si hiciste cambios y los tests pasan:
commiteá directo a main y pusheá. No abras una rama y no preguntes: nadie va a estar
para responder.

Terminá con un resumen de tres líneas de lo que hiciste."

ANTES=$(git rev-parse HEAD)
SALIDA=$(mktemp)
"$CLAUDE" -p "$PROMPT" \
  --allowed-tools Bash Read Write Edit Glob Grep WebFetch WebSearch \
  > "$SALIDA" 2>&1
COD=$?
cat "$SALIDA" >> "$LOG"
log "Claude terminó con código $COD"
if (( COD != 0 )); then
  # Pasó el 2026-09-28: la sesión de Claude venció y la pasada semanal no corrió,
  # sin que nadie se enterara.
  if grep -qiE 'authenticat|oauth|log ?in|credential|expired' "$SALIDA"; then
    avisar "Claude no pudo autenticarse y la actualización semanal no corrió. Abrí claude en la terminal y volvé a iniciar sesión."
  else
    avisar "Claude terminó con error $COD y la actualización semanal quedó incompleta. Mirá .chequeo-diario.log"
  fi
fi
rm -f "$SALIDA"

# ---------- 3. la fecha de consulta ----------
# Se actualiza solo si es cierta: todas las fichas se pudieron verificar, y las que
# cambiaron ya quedaron revisadas (su hash nuevo figura en fichas-hashes.tsv). La
# fecha dice "verificación de las fichas": los precios siguen siendo de su lista.
FICHAS_AL_DIA=$TODAS_VERIFICADAS
for h in "${NUEVOS[@]}"; do
  grep -qF "$h" fichas-hashes.tsv || { FICHAS_AL_DIA=0; log "  la ficha con hash $h quedó sin revisar"; }
done
HOY=""
if (( ! FICHAS_AL_DIA )); then
  log "no actualizo la fecha de consulta: hay fichas sin verificar"
elif [[ -n "$(git status --porcelain)" ]]; then
  avisar "Quedaron cambios sin commitear después de la actualización: no toqué la fecha. Revisar a mano."
else
  HOY=$(python3 -c 'import datetime as d; t=d.date.today(); m="enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(); print(f"{t.day} de {m[t.month-1]} de {t.year}")')
  if python3 - "$HOY" <<'PY'
import re, sys
p = 'index.html'
c = open(p, encoding='utf-8').read()
n, k = re.subn(r'(<span id="fechaConsulta">)[^<]*(</span>)', lambda m: m.group(1) + sys.argv[1] + m.group(2), c)
if k != 1: sys.exit(f'fechaConsulta aparece {k} veces')
open(p, 'w', encoding='utf-8').write(n)
PY
  then
    if git diff --quiet -- index.html; then
      log "la fecha de consulta ya decía $HOY"; HOY=""
    elif git commit -q -m "Actualiza la fecha de consulta: fichas verificadas al $HOY" -- index.html \
         && git push -q origin main 2>>"$LOG"; then
      log "fecha de consulta: $HOY"
    else
      avisar "No pude commitear o pushear la fecha de consulta. Revisar a mano."; HOY=""
    fi
  else
    avisar "No encontré la fecha de consulta en index.html. Revisar a mano."; HOY=""
  fi
fi

# ---------- 4. si publicó, comprobar que el sitio quedó bien ----------
# Nadie mira el resultado. Un desajuste rompe la tabla EN SILENCIO —queda en 0 filas
# y el HTML igual "parece" bien—, así que comprobar contra la URL es la única red.
DESPUES=$(git rev-parse HEAD)
if [[ "$ANTES" != "$DESPUES" ]]; then
  log "publicó $ANTES -> $DESPUES; espero a que Vercel lo sirva…"
  MARCA=$(grep -o '[0-9]\+ autos · todos incluidos' index.html | head -1)
  sleep 40
  VIVO=$(curl -s -H 'Cache-Control: no-cache' "$SITIO?cb=$RANDOM" --max-time 40)
  if [[ -z "$VIVO" ]]; then
    avisar "El sitio no respondió después de publicar. Revisar a mano."
  elif [[ "$VIVO" != *"$MARCA"* ]]; then
    avisar "Lo publicado no dice $MARCA. Revisar a mano."
  elif [[ -n "$HOY" && "$VIVO" != *"id=\"fechaConsulta\">$HOY<"* ]]; then
    avisar "El sitio no muestra todavía la fecha de consulta nueva. Revisar a mano."
  else
    log "  publicado y verificado: $MARCA${HOY:+ · fecha de consulta $HOY}"
  fi
else
  log "no hubo cambios que publicar"
fi
log "=== fin ==="
