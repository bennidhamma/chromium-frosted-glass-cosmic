#!/bin/bash
# Builds the chromium-frosted-glass .deb from a Chromium checkout.
#
# Usage: packaging/build-deb.sh <path to chromium/src>
#
# The checkout must be at the revision in patches/BASE_REVISION (or close to
# it), with depot_tools on PATH. See README.md for how to get one. Needs
# fakeroot and dpkg-dev; devscripts is optional.
#
# The package ends up in <chromium/src>/out/Release/dist/.
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

# The installer only uses debchange (from devscripts) to add a "Release
# Notes" line to the package changelog, so a no-op stands in for it.
tools="$(mktemp -d)"
trap 'rm -rf "$tools"' EXIT
if ! command -v debchange > /dev/null; then
  printf '#!/bin/sh\nexit 0\n' > "$tools/debchange"
  chmod +x "$tools/debchange"
  PATH="$tools:$PATH"
fi

mkdir -p "$out"
cp "$here/packaging/args.gn" "$out/args.gn"
gn gen "$out"
autoninja -C "$out" chrome/installer/linux:stable_deb

# Unofficial builds produce an uncompressed package (~450 MB). Recompress it
# with xz, and give the package root the usual 755 permissions.
mkdir -p "$out/dist"
for deb in "$out"/chromium-frosted-glass-stable_*.deb; do
  rm -rf "$tools/tree"
  fakeroot sh -c "dpkg-deb -R '$deb' '$tools/tree' &&
    chmod 755 '$tools/tree' &&
    dpkg-deb -Zxz -b '$tools/tree' '$out/dist/$(basename "$deb")'"
done
rm -rf "$tools/tree"

ls -l "$out"/dist/*.deb
