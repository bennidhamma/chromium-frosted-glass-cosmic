#!/bin/bash
# Turns the .deb that Chromium's build produces into the published package:
# recompresses it with xz (unofficial builds produce an uncompressed ~450 MB
# package), gives the package root the usual 755 permissions and, given a
# signing key, preinstalls the Frosted Glass Sites extension.
#
# Usage: packaging/finish-deb.sh <chromium .deb> <output dir> [extension key.pem]
#
# The extension is packed into /opt/chromium-frosted-glass/extensions with a
# <extension id>.json next to it, which makes the browser install it for every
# profile, enabled. Its sites stay off until the user turns them on.
set -euo pipefail

deb="${1:?usage: $0 <chromium .deb> <output dir> [extension key.pem]}"
out="${2:?usage: $0 <chromium .deb> <output dir> [extension key.pem]}"
key="${3:-}"
here="$(cd "$(dirname "$0")/.." && pwd)"
installdir=opt/chromium-frosted-glass

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fakeroot dpkg-deb -R "$deb" "$work/tree"
chmod 755 "$work/tree"

if [ -n "$key" ]; then
  version="$(sed -n 's/^ *"version": *"\(.*\)",$/\1/p' "$here/extension/manifest.json")"
  id="$(openssl pkey -in "$key" -pubout -outform DER 2> /dev/null |
        sha256sum | cut -c1-32 | tr '0-9a-f' 'a-p')"
  mkdir -p "$work/tree/$installdir/extensions"
  "$here/packaging/pack-extension.sh" "$key" "$work/tree/$installdir/chrome" \
    "$work/tree/$installdir/extensions/frosted-glass-sites.crx" > /dev/null
  printf '{\n  "external_crx": "/%s/extensions/frosted-glass-sites.crx",\n  "external_version": "%s"\n}\n' \
    "$installdir" "$version" > "$work/tree/$installdir/extensions/$id.json"
  chmod 755 "$work/tree/$installdir/extensions"
  chmod 644 "$work/tree/$installdir/extensions/"*
  echo "bundled Frosted Glass Sites $version ($id)"
fi

mkdir -p "$out"
fakeroot dpkg-deb -Zxz -b "$work/tree" "$out/$(basename "$deb")" > /dev/null
echo "$out/$(basename "$deb")"
