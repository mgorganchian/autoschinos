#!/bin/zsh
# Chequeo diario del comparativo autoschinos.
#
# Corre LOCAL (launchd), no en la nube, por tres razones concretas:
#   - necesita el llavero de macOS para poder pushear
#   - el recorte de fotos usa Vision de macOS vía Swift, que no existe en la nube
#   - el único entorno de nube disponible es el de trabajo, y este es un proyecto personal
#
# Qué hace:
#   1. Compara el hash de cada ficha oficial contra fichas-hashes.tsv
#   2. Si alguna cambió, o si toca la pasada semanal de completar datos,
#      le pasa el trabajo a Claude en modo headless
#   3. Claude valida las 6 invariantes ANTES de commitear; si fallan, no commitea
#
# Instalación:  launchctl load ~/Library/LaunchAgents/ar.autoschinos.chequeo.plist
# Prueba:       ./herramientas-chequeo-diario.sh --ahora
#               (fuerza la pasada de completar datos aunque no sea lunes; publica
#               igual que una corrida real)

set -u
AHORA=0
case "${1:-}" in
  "")      ;;
  --ahora) AHORA=1 ;;
  *)       print -u2 "uso: $0 [--ahora]"; exit 2 ;;
esac
REPO="/Users/mgorganchian/Projects/autoschinos"
LOG="$REPO/.chequeo-diario.log"
UA='autoschinos-comparativo/1.0 (https://github.com/mgorganchian/autoschinos)'
CLAUDE="$(command -v claude || echo /Users/mgorganchian/.nvm/versions/node/v24.14.0/bin/claude)"

log(){ print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

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
trap 'rmdir "$LOCK/pid" 2>/dev/null; rm -f "$LOCK/pid" 2>/dev/null; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

log "=== arranca el chequeo ==="
(( AHORA )) && log "corrida forzada con --ahora"

# Volver a main antes de empezar. Hace falta porque la propia rutina deja el repo
# parado en la rama que crea, y sin esto la corrida siguiente muere en el git pull
# (una rama sin upstream) y la rutina se autobloquea después de su primer trabajo útil.
# Solo si el árbol está limpio: si hay cambios sin commitear son de alguien más.
if [[ -n "$(git status --porcelain)" ]]; then
  log "AVISO: hay cambios sin commitear. Salgo sin tocar nada."
  exit 0
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  log "estaba en $(git branch --show-current), vuelvo a main"
  git checkout --quiet main 2>>"$LOG" || { log "FATAL: no pude volver a main"; exit 1; }
fi

# Traer lo que haya en remoto antes de tocar nada, para no divergir.
if ! git pull --ff-only --quiet 2>>"$LOG"; then
  log "AVISO: git pull no fue fast-forward. Salgo sin tocar nada para no pisar trabajo."
  exit 0
fi

# ---------- 1. ¿cambió alguna ficha? ----------
CAMBIOS=""
while IFS=$'\t' read -r auto url hash fecha; do
  [[ -z "${auto:-}" || "$auto" == \#* ]] && continue
  nuevo=$(curl -s -L -A "$UA" --max-time 45 "$url" 2>/dev/null | shasum -a 256 | cut -d' ' -f1)
  if [[ -z "$nuevo" || ${#nuevo} -ne 64 ]]; then
    log "  $auto: sin respuesta, lo salteo"
  elif [[ "$nuevo" != "$hash" ]]; then
    log "  $auto: CAMBIÓ ($url)"
    CAMBIOS+="- $auto — $url"$'\n'
  fi
done < fichas-hashes.tsv

# ---------- 2. ¿qué le pedimos a Claude? ----------
# Los lunes (o con --ahora), aunque no haya cambios, se usa la corrida para
# completar faltantes.
DIA=$(date +%u)
if [[ -n "$CAMBIOS" ]]; then
  TAREA="Cambiaron estas fichas técnicas oficiales desde la última revisión:

$CAMBIOS
Para cada una: descargala, leela, y comparala contra lo que hoy tiene la tabla para ese auto.
Corregí SOLO los valores que la ficha nueva contradice, y actualizá su hash en fichas-hashes.tsv."
elif [[ "$DIA" == "1" ]] || (( AHORA )); then
  TAREA="Ninguna ficha cambió. Usá esta corrida para completar datos faltantes:
buscá fichas o fuentes oficiales argentinas para los autos con más celdas en NR, y cargá
lo que encuentres. Si no encontrás nada confiable, no cargues nada y decilo en el resumen."
else
  log "sin cambios y no es lunes: no hay nada que hacer"
  log "=== fin ==="
  exit 0
fi

# ---------- 3. Claude hace el trabajo ----------
log "invocando a Claude…"
PROMPT="Sos el mantenimiento automático del comparativo de autos chinos. Corrés sin
supervisión, así que la prudencia vale más que la cobertura.

$TAREA

REGLAS QUE NO SE NEGOCIAN:
- Nunca inventes un valor. Si la ficha no lo dice, va NR con la explicación. La ausencia
  de un dato en una ficha NO prueba que el auto no lo tenga.
- Verificá que la ficha sea de la MISMA versión que está en la tabla. Ya pasó dos veces
  que una ficha de otra variante metiera datos equivocados.
- En fichas con columnas por versión, leé las marcas ●/x/–, no la lista de la tapa.
- Antes de commitear validá las 6 invariantes que están en CLAUDE.md. Si alguna falla,
  NO commitees: dejá el archivo como estaba y explicá qué falló.
- Si no hay nada seguro que cambiar, no commitees. Una corrida sin cambios es un
  resultado válido.

SOBRE PUSHEAR: el CLAUDE.md global dice que nunca se commitea sobre main ni se pushea.
Para ESTA rutina el usuario autorizó la excepción explícitamente el 2026-09-22, y está
documentada en el CLAUDE.md de este repo. Así que si hiciste cambios y las 6 invariantes
pasan: commiteá directo a main con un mensaje que explique qué cambió y de qué ficha
salió, y pusheá. No abras una rama y no preguntes: nadie va a estar para responder.

Si las invariantes NO pasan, no commitees ni pushees nada, y explicá qué falló.

Terminá con un resumen de tres líneas de lo que hiciste."

ANTES=$(git rev-parse HEAD)
"$CLAUDE" -p "$PROMPT" \
  --allowed-tools Bash Read Write Edit Glob Grep WebFetch WebSearch \
  >> "$LOG" 2>&1
COD=$?
log "Claude terminó con código $COD"

# ---------- 4. si publicó, comprobar que el sitio quedó bien ----------
# Ahora la rutina pushea sola, así que nadie mira el resultado. Un desajuste rompe
# la tabla EN SILENCIO —queda en 0 filas y el HTML igual "parece" bien—, así que
# comprobar contra la URL es la única red que queda.
DESPUES=$(git rev-parse HEAD)
if [[ "$ANTES" != "$DESPUES" ]]; then
  log "commiteó $ANTES -> $DESPUES; espero a que Vercel publique…"
  MARCA=$(grep -o '[0-9]\+ autos · todos incluidos' index.html | head -1)
  sleep 40
  VIVO=$(curl -s -H 'Cache-Control: no-cache' \
         "https://autoschinos-ar.vercel.app/?cb=$RANDOM" --max-time 40)
  if [[ -z "$VIVO" ]]; then
    log "  ALERTA: el sitio no respondió"
  elif [[ "$VIVO" != *"$MARCA"* ]]; then
    log "  ALERTA: lo publicado no dice \"$MARCA\". Revisar a mano."
  else
    log "  publicado y verificado: $MARCA"
  fi
else
  log "no hubo cambios que publicar"
fi
log "=== fin ==="
