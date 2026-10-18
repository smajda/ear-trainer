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
# The code is uploaded from a staged copy in which every script, stylesheet
# and module import gets a ?v=<hash of the code> suffix, so browsers (Safari
# especially) fetch the new files after a deploy instead of using cached ones.
# The files in the repo are left unchanged.
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

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

mkdir -p "$stage/js" "$stage/vendor"
cp index.html style.css "$stage/"
cp js/*.js "$stage/js/"
cp vendor/* "$stage/vendor/"

version="$(cat index.html style.css js/*.js vendor/* | shasum | cut -c1-10)"
echo "version $version"

# index.html: href="style.css", src="vendor/…", src="js/app.js", …
perl -pi -e 's{((?:href|src)="(?:style\.css|vendor/[^"]+|js/[^"]+))"}{$1?v='"$version"'"}g' \
  "$stage/index.html"
# js/*.js: from "./theory.js"
perl -pi -e 's{(from\s+"\./[^"]+\.js)"}{$1?v='"$version"'"}g' "$stage"/js/*.js

# --checksum because the staged copies always have new modification times.
rsync -rtpvz --checksum --delete "$@" \
  --include='/index.html' \
  --include='/style.css' \
  --include='/js/' \
  --include='/js/*.js' \
  --include='/vendor/' \
  --include='/vendor/*' \
  --exclude='*' \
  "$stage/" "$dest"

rsync -rtpvz --delete "$@" \
  --include='/samples/' \
  --include='/samples/instruments.json' \
  --include='/samples/*-[0-9][0-9][0-9]-*.wav' \
  --exclude='*' \
  ./ "$dest"
