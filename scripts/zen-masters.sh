#!/usr/bin/env bash
# Makes the Zen frequency masters in assets/zen from the source MP3s.
#
#   scripts/zen-masters.sh <ffmpeg> <source.mp3> <out.mp3>
#
# Each master is a seamless loop: the last 8 s are crossfaded (equal power)
# into the start, so when the player wraps from the end to the beginning the
# music carries straight on, with no gap and no click. Then the loudness is
# levelled to -20 LUFS so the six frequencies sit at one volume, 12 ms edge
# fades guarantee no click where a player ignores MP3 gapless tags, and the
# result is 128 kbps stereo (about 5 MB for five minutes).
#
# Sources (all Megis, CC BY 3.0, from Jamendo via archive.org; credited in
# src/data/sleep.js and the Zen credits sheet):
#   frequency-1  jamendo-621224  Deep Healing 432Hz (1)
#   frequency-2  jamendo-638406  Binaural Healing Sleep
#   frequency-3  jamendo-638091  432Hz Quantum Healing Meditation
#   frequency-4  jamendo-639480  432Hz Zen Meditation
#   frequency-5  jamendo-621045  Zen Harmony
#   frequency-6  jamendo-638405  Theta Binaural Meditation
set -euo pipefail
FF="$1"; SRC="$2"; OUT="$3"; XF=8
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
DUR=$("$FF" -hide_banner -i "$SRC" 2>&1 | sed -n 's/.*Duration: \([0-9]*\):\([0-9]*\):\([0-9.]*\).*/\1 \2 \3/p' | awk '{print $1*3600+$2*60+$3}')
CUT=$(awk -v d="$DUR" -v x="$XF" 'BEGIN{printf "%.3f", d-0.05-x}')
FADE_OUT=$(awk -v d="$DUR" -v x="$XF" 'BEGIN{printf "%.3f", d-x-0.012-0.06}')
"$FF" -y -loglevel error -i "$SRC" -ar 44100 -ac 2 "$TMP/all.wav"
"$FF" -y -loglevel error -i "$TMP/all.wav" -ss "$CUT" "$TMP/tail.wav"
"$FF" -y -loglevel error -i "$TMP/all.wav" -t "$CUT" "$TMP/body.wav"
"$FF" -y -loglevel error -i "$TMP/tail.wav" -i "$TMP/body.wav" \
  -filter_complex "[0][1]acrossfade=d=$XF:c1=qsin:c2=qsin,loudnorm=I=-20:TP=-2:LRA=11,afade=t=in:st=0:d=0.012,afade=t=out:st=$FADE_OUT:d=0.012" \
  -ar 44100 -ac 2 -c:a libmp3lame -b:a 128k -map_metadata -1 "$OUT"
