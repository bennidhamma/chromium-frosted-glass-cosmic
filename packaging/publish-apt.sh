#!/bin/bash
# Publishes .deb packages as a signed, flat apt repository hosted on a GitHub
# release, so no server is needed. apt follows GitHub's download redirects.
#
# Usage: packaging/publish-apt.sh <package.deb>...
#
# Environment:
#   REPO       GitHub repository (default: bennidhamma/chromium-frosted-glass-cosmic)
#   TAG        Release that holds the repository (default: apt)
#   GNUPGHOME  GnuPG home with the signing key
#   KEY        Signing key fingerprint (default: $GNUPGHOME/FINGERPRINT)
#
# Users add the repository with:
#   deb [signed-by=/usr/share/keyrings/chromium-frosted-glass-cosmic.asc] \
#     https://github.com/$REPO/releases/download/$TAG ./
set -euo pipefail

REPO="${REPO:-bennidhamma/chromium-frosted-glass-cosmic}"
TAG="${TAG:-apt}"
: "${GNUPGHOME:?set GNUPGHOME to the GnuPG home with the signing key}"
export GNUPGHOME
KEY="${KEY:-$(cat "$GNUPGHOME/FINGERPRINT")}"
here="$(cd "$(dirname "$0")" && pwd)"

[ $# -gt 0 ] || { echo "usage: $0 <package.deb>..." >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$@" "$work/"
cp "$here/chromium-frosted-glass-cosmic.asc" "$work/"
cd "$work"

dpkg-scanpackages --multiversion . /dev/null > Packages
gzip -9kn Packages
apt-ftparchive \
  -o APT::FTPArchive::Release::Origin="chromium-frosted-glass-cosmic" \
  -o APT::FTPArchive::Release::Label="chromium-frosted-glass-cosmic" \
  -o APT::FTPArchive::Release::Architectures="amd64" \
  -o APT::FTPArchive::Release::Description="Chromium with a frosted glass frame for COSMIC" \
  release . > Release
gpg --batch --yes --local-user "$KEY" --clearsign -o InRelease Release
gpg --batch --yes --local-user "$KEY" --armor --detach-sign -o Release.gpg Release

if ! gh release view "$TAG" -R "$REPO" > /dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "apt repository" \
    --notes "Signed apt repository. See the README for how to add it."
fi
gh release upload "$TAG" -R "$REPO" --clobber \
  ./*.deb Packages Packages.gz Release InRelease Release.gpg \
  chromium-frosted-glass-cosmic.asc

echo "Published to https://github.com/$REPO/releases/tag/$TAG"
