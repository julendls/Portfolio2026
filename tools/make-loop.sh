#!/usr/bin/env bash
# Crea el bucle de vídeo de una miniatura a partir de un vídeo completo.
# Uso: tools/make-loop.sh <slug> <vídeo-original> [segundo-de-inicio] [duración]
# Ejemplo: tools/make-loop.sh kolpe ~/Rodajes/kolpe.mov 42 6
# Resultado: assets/loops/<slug>.mp4 (16:10, sin audio, ligero). Luego: node tools/build.mjs
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

slug="$1"; input="$2"; start="${3:-0}"; dur="${4:-6}"
out="$(cd "$(dirname "$0")/.." && pwd)/assets/loops/${slug}.mp4"
mkdir -p "$(dirname "$out")"

ffmpeg -y -ss "$start" -t "$dur" -i "$input" \
  -an -vf "scale=960:600:force_original_aspect_ratio=increase,crop=960:600,fps=25" \
  -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart \
  "$out"

echo "Listo: $out ($(du -h "$out" | cut -f1))"
