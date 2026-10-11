#!/bin/bash
# Packs the Frosted Glass Sites extension into a signed .crx.
#
# Usage: packaging/pack-extension.sh <key.pem> <chrome binary> <output.crx>
#
# The key fixes the extension's ID (manifest.json carries its public half), so
# only packages signed with the same key update an installed copy.
set -euo pipefail

key="${1:?usage: $0 <key.pem> <chrome binary> <output.crx>}"
chrome="${2:?usage: $0 <key.pem> <chrome binary> <output.crx>}"
output="${3:?usage: $0 <key.pem> <chrome binary> <output.crx>}"
here="$(cd "$(dirname "$0")/.." && pwd)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# The development tools stay out of the package.
cp -r "$here/extension" "$work/frosted-glass-sites"
rm -rf "$work/frosted-glass-sites/tools"

"$chrome" --headless --ozone-platform=headless --no-message-box \
  --user-data-dir="$work/profile" \
  --pack-extension="$work/frosted-glass-sites" \
  --pack-extension-key="$key" > /dev/null 2>&1 || true
[ -s "$work/frosted-glass-sites.crx" ] || { echo "packing failed" >&2; exit 1; }
cp "$work/frosted-glass-sites.crx" "$output"
echo "$output"
