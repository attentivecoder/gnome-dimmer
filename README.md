# 🌗 Screen Dimmer
*A tiny, GNOME‑native software dimmer for external monitors, right in Quick Settings.*

<p align="center">
  <img src="https://img.shields.io/badge/GNOME-48–51-blue?logo=gnome&logoColor=white" />
  <img src="https://img.shields.io/badge/Wayland-supported-brightgreen" />
  <img src="https://img.shields.io/badge/version-1-blue" />
</p>

Screen Dimmer adds a **Screen dimming** slider to GNOME's Quick Settings menu.
It's made for external monitors, where GNOME's own brightness slider doesn't show up because the backlight can't be controlled from the computer.
Instead of touching the monitor's hardware, it lays a black, click‑through layer over the whole screen and changes how see‑through that layer is.

> **Not meant for laptop screens.** A laptop's built‑in screen already has a real brightness slider in Quick Settings, so use that one.
> Screen Dimmer dims **all connected screens at once**, so with a laptop and an external monitor, the laptop screen is dimmed too.

---

## 🌤️ Features

### 🎚️ Dimming slider in Quick Settings
- Full‑width **Screen dimming** slider. Drag right to darken
- **Click the sun icon** to turn dimming off, and click it again to go back to the level you were using
- The level is saved in GSettings, so it's kept across logouts and restarts
- Slider and setting stay in sync both ways: changing the level with `gsettings` moves the slider

### 🌑 Dims everything, including menus
- The dark layer sits on the stage itself, **above all of GNOME Shell's UI**
- Windows, the top bar, menus, Quick Settings, on‑screen popups, dialogs and app pop‑ups are all dimmed

### 🖱️ Never gets in your way
- The layer **never catches the mouse or keyboard**. Every click and keystroke goes straight through
- **It never goes fully black.** At 100% the layer is 85% opaque by default, so you can always see the slider to turn it back down
- At level 0 the layer is hidden entirely, not just transparent

### ⚡ Fast & lightweight
- A single file of code, no background daemons, no dependencies
- No network access at all

---

## ⚙️ Settings

There's no preferences window. Everything is in the schema `org.gnome.shell.extensions.screen-dimmer`:

| Key           | Range     | Default | Meaning                                                    |
| ------------- | --------- | ------- | ---------------------------------------------------------- |
| `dim-level`   | 0.0–1.0   | 0.0     | The slider's position. 0 = no dimming                      |
| `max-opacity` | 0.1–0.98  | 0.85    | How opaque the black layer is with the slider all the way right |

The layer's opacity is `dim-level × max-opacity`.

Because the schema is installed with the extension rather than system‑wide, point `gsettings` at it:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/screen-dimmer@attentivecoder/schemas \
  set org.gnome.shell.extensions.screen-dimmer max-opacity 0.9
```

---

## 📦 Installation

### Prerequisites
- GNOME Shell 48–51 (Ubuntu 26.04 ships 50)
- `glib-compile-schemas` (part of `libglib2.0-bin`, installed by default on Ubuntu)

### Install

```bash
git clone https://github.com/attentivecoder/gnome-dimmer.git
cd gnome-dimmer
./install.sh
```

This copies `metadata.json`, `extension.js` and the settings schema to
`~/.local/share/gnome-shell/extensions/screen-dimmer@attentivecoder/` and compiles the schema there.

On Wayland, GNOME Shell only notices a new extension after you **log out and back in**. Then:

```bash
gnome-extensions enable screen-dimmer@attentivecoder
```

### Uninstall

```bash
gnome-extensions disable screen-dimmer@attentivecoder
rm -r ~/.local/share/gnome-shell/extensions/screen-dimmer@attentivecoder
```

## 🛠️ Development Notes

### Apply code changes

Run `./install.sh` again, then log out and back in. Enabling only has to be done once.

### Test in a nested GNOME Shell (GNOME 49+)

Runs a separate shell in a window, so you don't have to log out:

```bash
dbus-run-session gnome-shell --devkit --wayland
```

On GNOME 48 use `dbus-run-session gnome-shell --nested --wayland`.

### Manual test checklist
1. Move the slider and check that the screen darkens and lightens
2. With dimming on, open the top‑bar menus, Quick Settings, the app grid and an app's pop‑up menu. All of them should be dimmed
3. Click the sun icon twice: off, then back to the earlier level

### Debug GNOME Shell logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

### Useful commands

```bash
SCHEMAS=~/.local/share/gnome-shell/extensions/screen-dimmer@attentivecoder/schemas
gsettings --schemadir $SCHEMAS list-keys org.gnome.shell.extensions.screen-dimmer
gsettings --schemadir $SCHEMAS set org.gnome.shell.extensions.screen-dimmer dim-level 0.5
```

### How it works
- The dark layer is an `St.Widget` bound to the stage's size with a `Clutter.BindConstraint`
- It lives directly on `global.stage`, not inside `Main.uiGroup`. Menus, OSDs and dialogs move themselves to the top of `uiGroup` when they open, so a layer inside it would leave them bright. Whenever the stage gets a new child, the layer is raised back on top
- The slider is a `QuickSlider` added through a `SystemIndicator`, spanning two columns so it fills the menu's width

## 🏷️ Packaging for release

Pushing a `v*` tag builds the ZIP, runs shexli on it and attaches it to a GitHub release automatically (see
`.github/workflows/release.yml`):

```bash
git tag v1
git push origin v1
```

To build it by hand:

```bash
rm -f screen-dimmer@attentivecoder.zip
zip -r screen-dimmer@attentivecoder.zip \
  extension.js \
  metadata.json \
  schemas \
  -x "schemas/gschemas.compiled"
```

Install the ZIP locally with:

```bash
gnome-extensions install --force screen-dimmer@attentivecoder.zip
```

`media/` (the icon for extensions.gnome.org), `install.sh` and the compiled schemas are not part of the
bundle; GNOME Shell 45+ compiles the schemas on install.

## 🔍 Review checks with shexli

[shexli](https://pypi.org/project/shexli/) runs the same static checks that extensions.gnome.org (EGO)
reviewers look for: leftover signal connections, bad `metadata.json` fields, files that shouldn't be shipped, and so on.
Run it on the **ZIP**, not the project folder. The folder includes `.git/` and `.gitignore`, which shexli reports as shipped files.

```bash
python3 -m venv venv
./venv/bin/pip install shexli
./venv/bin/shexli screen-dimmer@attentivecoder.zip
```

The release workflow runs it too, and the report shows up in the Actions log.

**Known false positive:** shexli 0.2.1 flags `"51"` in `shell-version` as an "implausible future release"
(`EGO-M-004`), because it treats anything above 50 as the future. GNOME 51 is a stable release and
extensions.gnome.org accepts it, so this finding can be ignored. Everything else should come back clean before uploading.

## 🔒 Network & privacy

Screen Dimmer makes no network requests and collects no data. The only thing it stores is the dim level, in your own GSettings.

## ❤️ Credits

- Built on GNOME Shell's Quick Settings API (`QuickSlider`, `SystemIndicator`)
- Designed & developed by **@attentivecoder**
