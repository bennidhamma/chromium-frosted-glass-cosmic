#!/bin/bash
# Builds the chromium-frosted-glass .deb from a Chromium checkout.
#
# Usage: packaging/build-deb.sh <path to chromium/src>
#
# The checkout must be at the revision in patches/BASE_REVISION (or close to
# it), with depot_tools on PATH. See README.md for how to get one.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:?usage: $0 <path to chromium/src>}"
out="out/Release"

cd "$src"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: $src has uncommitted changes" >&2
  exit 1
fi

base="$(head -1 "$here/patches/BASE_REVISION")"
if ! git merge-base --is-ancestor "$base" HEAD 2>/dev/null; then
  echo "warning: $src does not contain $base; patches may not apply" >&2
fi

git checkout -B frosted-glass
git am --3way "$here"/patches/0*.patch
gclient sync -D --no-history

mkdir -p "$out"
cp "$here/packaging/args.gn" "$out/args.gn"
gn gen "$out"
autoninja -C "$out" chrome/installer/linux:stable_deb

ls -l "$out"/chromium-frosted-glass*.deb
