#!/usr/bin/env bash
# Download the piano used for chord mode and add it to samples/.
#
#   scripts/fetch_piano.sh
#
# The samples are the Salamander Grand Piano by Alexander Holm (CC-BY 3.0),
# as hosted for Tone.js. Salamander has a note every minor third; the app
# pitch-shifts the nearest one for the notes in between. Each note is cut to
# 5s mono with a fade, written as piano-NNN-Note.wav, and listed in
# samples/instruments.json. Needs curl, ffmpeg and python3.

set -euo pipefail

BASE="https://tonejs.github.io/audio/salamander"
LENGTH=5  # seconds kept of each note
FADE=1    # fade-out at the end (s)

cd "$(dirname "$0")/../samples"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

notes=()
for octave in 2 3 4 5 6; do
  for name in C Ds Fs A; do
    [[ $octave == 6 && $name != C ]] && break  # C2 to C6
    notes+=("$name$octave")
  done
done

for note in "${notes[@]}"; do
  name=${note%?}
  octave=${note: -1}
  case $name in C) pc=0 ;; Ds) pc=3 ;; Fs) pc=6 ;; A) pc=9 ;; esac
  midi=$(( 12 * (octave + 1) + pc ))
  out=$(printf "piano-%03d-%s.wav" "$midi" "$note")
  echo "$note → $out"
  curl -sSf "$BASE/$note.mp3" -o "$tmp/$note.mp3"
  ffmpeg -loglevel error -y -i "$tmp/$note.mp3" -ac 1 -ar 44100 -sample_fmt s16 \
    -af "atrim=0:$LENGTH,afade=t=out:st=$((LENGTH - FADE)):d=$FADE" "$out"
done

python3 - <<'EOF'
import glob, json, re
with open("instruments.json") as f:
    manifest = json.load(f)
files = sorted(glob.glob("piano-[0-9][0-9][0-9]-*.wav"))
manifest["instruments"]["piano"] = {str(int(re.match(r"piano-(\d+)", f)[1])): f for f in files}
manifest["instruments"] = dict(sorted(manifest["instruments"].items()))
with open("instruments.json", "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
EOF
echo "Added ${#notes[@]} piano notes to samples/instruments.json"
