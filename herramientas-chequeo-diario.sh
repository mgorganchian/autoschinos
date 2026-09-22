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

set -u
REPO="/Users/mgorganchian/Projects/autoschinos"
LOG="$REPO/.chequeo-diario.log"
UA='autoschinos-comparativo/1.0 (https://github.com/mgorganchian/autoschinos)'
CLAUDE="$(command -v claude || echo /Users/mgorganchian/.nvm/versions/node/v24.14.0/bin/claude)"

log(){ print -r -- "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$REPO" || { log "FATAL: no pude entrar a $REPO"; exit 1; }
log "=== arranca el chequeo ==="

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
# Los lunes, aunque no haya cambios, se usa la corrida para completar faltantes.
DIA=$(date +%u)
if [[ -n "$CAMBIOS" ]]; then
  TAREA="Cambiaron estas fichas técnicas oficiales desde la última revisión:

$CAMBIOS
Para cada una: descargala, leela, y comparala contra lo que hoy tiene la tabla para ese auto.
Corregí SOLO los valores que la ficha nueva contradice, y actualizá su hash en fichas-hashes.tsv."
elif [[ "$DIA" == "1" ]]; then
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

Si hiciste cambios y las invariantes pasan: commiteá con un mensaje que explique qué
cambió y de qué ficha salió, y pusheá a main.

Terminá con un resumen de tres líneas de lo que hiciste."

"$CLAUDE" -p "$PROMPT" \
  --allowed-tools Bash Read Write Edit Glob Grep WebFetch WebSearch \
  >> "$LOG" 2>&1
log "Claude terminó con código $?"
log "=== fin ==="
