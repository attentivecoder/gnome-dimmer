import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickSlider, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON_NAME = 'display-brightness-symbolic';

const DimSlider = GObject.registerClass(
class DimSlider extends QuickSlider {
    _init(settings) {
        super._init({
            iconName: ICON_NAME,
            iconReactive: true,
            iconLabel: 'Toggle screen dimming',
        });

        this._settings = settings;
        this._lastLevel = 0.5;

        this.slider.accessible_name = 'Screen dimming';

        this._sliderChangedId = this.slider.connect('notify::value', () => {
            const level = this._sliderToLevel(this.slider.value);
            if (level !== this._settings.get_double('dim-level'))
                this._settings.set_double('dim-level', level);
        });

        this._levelChangedId = this._settings.connect('changed::dim-level',
            () => this._syncSlider());
        this._invertChangedId = this._settings.connect('changed::invert-slider',
            () => this._syncSlider());
        this._syncSlider();

        // Clicking the icon toggles between "off" and the last used level.
        this.connect('icon-clicked', () => {
            const level = this._settings.get_double('dim-level');
            if (level > 0) {
                this._lastLevel = level;
                this._settings.set_double('dim-level', 0);
            } else {
                this._settings.set_double('dim-level', this._lastLevel);
            }
        });
    }

    // dim-level is always "how dark" (0 = off). The slider shows it as is,
    // or as brightness (1 - level) when the direction is inverted.
    _sliderToLevel(value) {
        return this._settings.get_boolean('invert-slider') ? 1 - value : value;
    }

    _syncSlider() {
        const value = this._sliderToLevel(this._settings.get_double('dim-level'));
        if (this.slider.value !== value) {
            this.slider.block_signal_handler(this._sliderChangedId);
            this.slider.value = value;
            this.slider.unblock_signal_handler(this._sliderChangedId);
        }
    }

    destroy() {
        if (this._sliderChangedId) {
            this.slider.disconnect(this._sliderChangedId);
            this._sliderChangedId = 0;
        }
        if (this._levelChangedId) {
            this._settings.disconnect(this._levelChangedId);
            this._levelChangedId = 0;
        }
        if (this._invertChangedId) {
            this._settings.disconnect(this._invertChangedId);
            this._invertChangedId = 0;
        }
        super.destroy();
    }
});

const DimIndicator = GObject.registerClass(
class DimIndicator extends SystemIndicator {
    _init(settings) {
        super._init();
        this.quickSettingsItems.push(new DimSlider(settings));
    }
});

export default class ScreenDimmerExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        // Full-stage black overlay. Non-reactive, so all input passes through.
        this._overlay = new St.Widget({
            name: 'screen-dimmer-overlay',
            style: 'background-color: black;',
            reactive: false,
            can_focus: false,
            track_hover: false,
            opacity: 0,
        });
        this._overlay.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));

        // Put the overlay directly on the stage, above uiGroup. Menus, OSDs and
        // dialogs restack themselves inside uiGroup, so they can never escape it.
        global.stage.add_child(this._overlay);
        this._raiseOverlay();
        this._childAddedId = global.stage.connect('child-added', (_stage, child) => {
            if (child !== this._overlay)
                this._raiseOverlay();
        });

        this._levelChangedId = this._settings.connect('changed::dim-level', () => this._update());
        this._maxChangedId = this._settings.connect('changed::max-opacity', () => this._update());
        this._update();

        this._indicator = new DimIndicator(this._settings);
        this._addToQuickSettings();

        this._addKeybinding('shortcut-darker', 1);
        this._addKeybinding('shortcut-brighter', -1);
    }

    disable() {
        Main.wm.removeKeybinding('shortcut-darker');
        Main.wm.removeKeybinding('shortcut-brighter');

        if (this._placeSourceId) {
            GLib.source_remove(this._placeSourceId);
            this._placeSourceId = 0;
        }

        this._indicator?.quickSettingsItems.forEach(item => item.destroy());
        this._indicator?.destroy();
        this._indicator = null;

        if (this._childAddedId) {
            global.stage.disconnect(this._childAddedId);
            this._childAddedId = 0;
        }

        this._overlay?.destroy();
        this._overlay = null;

        if (this._settings) {
            this._settings.disconnect(this._levelChangedId);
            this._settings.disconnect(this._maxChangedId);
            this._settings = null;
        }
    }

    // Place the slider right below the volume slider, with GNOME's own sliders.
    // At login the shell builds its indicators asynchronously, so wait for them.
    _addToQuickSettings() {
        const quickSettings = Main.panel.statusArea.quickSettings;

        if (!quickSettings._volumeOutput) {
            this._placeSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._placeSourceId = 0;
                this._addToQuickSettings();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        quickSettings.addExternalIndicator(this._indicator, 2);

        // The microphone slider follows the volume slider in the menu.
        // Fall back to the default spot at the bottom if it isn't there.
        const sibling = quickSettings._volumeInput?.quickSettingsItems?.[0];
        const grid = quickSettings.menu._grid;
        if (sibling && grid && sibling.get_parent() === grid) {
            for (const item of this._indicator.quickSettingsItems)
                grid.set_child_below_sibling(item, sibling);
        }
    }

    _addKeybinding(name, direction) {
        Main.wm.addKeybinding(name, this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => this._step(direction));
    }

    _step(direction) {
        const step = this._settings.get_double('step');
        const current = this._settings.get_double('dim-level');
        const level = Math.min(1, Math.max(0, current + direction * step));
        this._settings.set_double('dim-level', level);

        // Show the level in the same popup as the volume and brightness keys,
        // in the direction the slider uses.
        const shown = this._settings.get_boolean('invert-slider') ? 1 - level : level;
        const icon = Gio.ThemedIcon.new(ICON_NAME);
        const osd = Main.osdWindowManager;
        if (osd.showAll)
            osd.showAll(icon, 'Screen dimming', shown, 1);
        else
            osd.show(-1, icon, 'Screen dimming', shown, 1);
    }

    _raiseOverlay() {
        global.stage.set_child_above_sibling(this._overlay, null);
    }

    _update() {
        const level = this._settings.get_double('dim-level');
        const max = this._settings.get_double('max-opacity');
        const opacity = Math.round(level * max * 255);
        this._overlay.opacity = opacity;
        this._overlay.visible = opacity > 0;
    }
}
