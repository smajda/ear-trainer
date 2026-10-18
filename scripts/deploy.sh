#!/usr/bin/env bash
# Copy the app's public files to a server with rsync.
#
#   scripts/deploy.sh user@host:/var/www/ear-trainer            # deploy
#   scripts/deploy.sh user@host:/var/www/ear-trainer --dry-run  # list what would change
#
# Only the app is uploaded: index.html, style.css, js/*.js, vendor/ (daisyUI
# and Tailwind),
# samples/instruments.json and the sliced samples (name-NNN-note.wav).
# Source recordings (e.g. samples/oboe.wav), docs, scripts and tests stay local.
#
# --delete removes server files that look like app files but no longer exist
# locally (e.g. renamed samples). Anything else in the destination, such as
# an .htaccess, is left alone. Try --dry-run first to check the path.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 user@host:/path/to/site [--dry-run]" >&2
  exit 1
fi
dest="${1%/}/"
shift

cd "$(dirname "$0")/.."

rsync -rtpvz --delete "$@" \
  --include='/index.html' \
  --include='/style.css' \
  --include='/js/' \
  --include='/js/*.js' \
  --include='/vendor/' \
  --include='/vendor/*' \
  --include='/samples/' \
  --include='/samples/instruments.json' \
  --include='/samples/*-[0-9][0-9][0-9]-*.wav' \
  --exclude='*' \
  ./ "$dest"
