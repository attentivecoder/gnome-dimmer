import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
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
        this.slider.value = this._settings.get_double('dim-level');

        this._sliderChangedId = this.slider.connect('notify::value', () => {
            if (this.slider.value !== this._settings.get_double('dim-level'))
                this._settings.set_double('dim-level', this.slider.value);
        });

        this._settingsChangedId = this._settings.connect('changed::dim-level', () => {
            const level = this._settings.get_double('dim-level');
            if (this.slider.value !== level) {
                this.slider.block_signal_handler(this._sliderChangedId);
                this.slider.value = level;
                this.slider.unblock_signal_handler(this._sliderChangedId);
            }
        });

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

    destroy() {
        if (this._sliderChangedId) {
            this.slider.disconnect(this._sliderChangedId);
            this._sliderChangedId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
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
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator, 2);
    }

    disable() {
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
