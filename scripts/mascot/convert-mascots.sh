#!/usr/bin/env bash
# Converts the raw Nano Banana Pro exports in public/mascot/*.jpg to transparent
# PNGs with semantic names + correct aspect ratios.
#
# Strategy: flood-fill from corner (0,0) using a 12% fuzz so the plain white
# studio background becomes alpha=0 while the mascot's own light highlights are
# preserved. Then trim to the subject bounding box and re-extent to the target
# aspect ratio so the subject stays centered.
#
# Run:  bash scripts/mascot/convert-mascots.sh
set -euo pipefail

SRC="public/mascot"
FUZZ="12%"

# name|source jpg|target png|target WxH|subject scale (fit within)
# Hero/landscape scenes: 3:2 @ 1920x1280 (so a 960x640 display is crisp retina).
# Portraits:            1:1 @ 1024x1024 (crisp for 512 display).
# Openclaw headshot:    1:1 @ 512 (crisp for 256 display).
MAP=(
  "master|1.jpg|master.png|1024x1024|900x900"
  "hero|2.jpg|hero.png|1920x1280|1700x1150"
  "empty-state|3.jpg|empty-state.png|1024x1024|900x900"
  "thinking|4.jpg|thinking.png|1024x1024|900x900"
  "celebrate|5.jpg|celebrate.png|1024x1024|900x900"
  "lost-in-space|6.jpg|lost-in-space.png|1920x1280|1700x1150"
  "error|7.jpg|error.png|1024x1024|900x900"
  "wave|8.jpg|wave.png|1024x1024|900x900"
  "thumbs-up|9.jpg|thumbs-up.png|1024x1024|900x900"
  "key|10.jpg|key.png|1024x1024|900x900"
  "headshot|11.jpg|headshot.png|512x512|460x460"
  "listening|12.jpg|listening.png|1024x1024|900x900"
  "templates|13.jpg|templates.png|1920x1280|1700x1150"
)

for row in "${MAP[@]}"; do
  IFS="|" read -r name src dst canvas fit <<<"$row"
  in="${SRC}/${src}"
  out="${SRC}/${dst}"
  if [[ ! -f "$in" ]]; then
    echo "SKIP  ${name}: missing ${in}"
    continue
  fi
  echo "WORK  ${name}: ${src} -> ${dst}  (canvas ${canvas}, fit ${fit})"

  magick "$in" \
    -alpha set \
    -fuzz "$FUZZ" \
    -fill none \
    -draw "alpha 0,0 floodfill" \
    -draw "alpha 1,1 floodfill" \
    -trim +repage \
    -resize "${fit}" \
    -background none \
    -gravity center \
    -extent "$canvas" \
    -define png:compression-level=9 \
    -strip \
    "$out"
done

echo "Done. Outputs in ${SRC}/"
