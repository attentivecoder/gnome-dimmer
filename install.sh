#!/usr/bin/env bash
# Installs the extension for the current user.
set -euo pipefail
UUID="screen-dimmer@attentivecoder"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$DEST/schemas"
cp "$SRC/metadata.json" "$SRC/extension.js" "$DEST/"
cp "$SRC/schemas/"*.gschema.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas/"

echo "Installed to $DEST"
echo "On Wayland, log out and back in, then run:"
echo "  gnome-extensions enable $UUID"
