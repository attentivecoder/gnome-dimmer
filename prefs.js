import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Keys that make sense as shortcuts without a modifier: F1–F35 and
// multimedia keys (XF86*). Anything else needs Ctrl, Alt, Super or Shift.
function isStandaloneKey(keyval) {
    return (keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F35) ||
        (keyval >= 0x1008ff00 && keyval <= 0x1008ffff);
}

const ShortcutRow = GObject.registerClass(
class ShortcutRow extends Adw.ActionRow {
    _init(settings, key, title) {
        super._init({title, activatable: true});

        this._settings = settings;
        this._key = key;

        this._label = new Gtk.ShortcutLabel({
            disabled_text: 'Disabled',
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(this._label);

        const clearButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: 'Remove shortcut',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        clearButton.connect('clicked', () => this._settings.set_strv(this._key, []));
        this.add_suffix(clearButton);

        this._settings.connect(`changed::${key}`, () => this._sync());
        this._sync();

        this.connect('activated', () => this._record());
    }

    _sync() {
        this._label.accelerator = this._settings.get_strv(this._key)[0] ?? '';
    }

    _record() {
        const dialog = new Adw.Window({
            modal: true,
            transient_for: this.get_root(),
            default_width: 440,
            default_height: 320,
            resizable: false,
            title: `Shortcut: ${this.title}`,
        });

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(new Adw.HeaderBar());
        toolbarView.set_content(new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: 'Press a key combination',
            description: 'Esc cancels, Backspace removes the shortcut.',
            css_classes: ['compact'],
            vexpand: true,
        }));
        dialog.set_content(toolbarView);

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_controller, keyval, keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                this._settings.set_strv(this._key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if ((mask === 0 && !isStandaloneKey(keyval)) ||
                !Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;

            this._settings.set_strv(this._key,
                [Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask)]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);
        dialog.present();
    }
});

export default class ScreenDimmerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const page = new Adw.PreferencesPage();
        window.add(page);

        // Slider
        const sliderGroup = new Adw.PreferencesGroup({title: 'Slider'});
        page.add(sliderGroup);

        const invertRow = new Adw.SwitchRow({
            title: 'Invert slider direction',
            subtitle: 'Drag right for a brighter screen, like GNOME’s brightness slider',
        });
        settings.bind('invert-slider', invertRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        sliderGroup.add(invertRow);

        const maxRow = new Adw.SpinRow({
            title: 'Maximum darkness',
            subtitle: 'How dark the screen gets at full dimming, in percent',
            adjustment: new Gtk.Adjustment({
                lower: 10, upper: 98, step_increment: 1, page_increment: 10,
            }),
        });
        maxRow.value = Math.round(settings.get_double('max-opacity') * 100);
        maxRow.connect('notify::value', () =>
            settings.set_double('max-opacity', maxRow.value / 100));
        sliderGroup.add(maxRow);

        // Keyboard shortcuts
        const shortcutGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcuts',
            description: 'Click a row and press the keys. Each press shows the level on screen.',
        });
        page.add(shortcutGroup);

        shortcutGroup.add(new ShortcutRow(settings, 'shortcut-darker', 'Darker'));
        shortcutGroup.add(new ShortcutRow(settings, 'shortcut-brighter', 'Brighter'));

        const stepRow = new Adw.SpinRow({
            title: 'Step size',
            subtitle: 'How much one key press changes the dimming, in percent',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 50, step_increment: 1, page_increment: 5,
            }),
        });
        stepRow.value = Math.round(settings.get_double('step') * 100);
        stepRow.connect('notify::value', () =>
            settings.set_double('step', stepRow.value / 100));
        shortcutGroup.add(stepRow);
    }
}
