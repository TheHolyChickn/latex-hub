'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';
const { Gtk, Adw, GLib, Gdk } = imports.gi;

function getDayWithSuffix(date) {
    const j = date % 10, k = date % 100;
    if (j === 1 && k !== 11) return date + "st";
    if (j === 2 && k !== 12) return date + "nd";
    if (j === 3 && k !== 13) return date + "rd";
    return date + "th";
}

class LatexHubApp {
    constructor() {
        this.app = new Adw.Application({
            application_id: 'com.github.theholychickn.latex-hub'
        });
        this.app.connect('activate', this._onActivate.bind(this));
    }

    _onActivate() {
        this.window = new Adw.ApplicationWindow({
            application: this.app,
            default_width: 600,
            default_height: 400,
            title: 'LaTeX Hub',
            css_classes: ['main-window'],
            content: this._buildMainUI()
        });

        this.window.connect('realize', () => this._loadCSS());
        this.window.present();
    }

    _loadCSS() {
        const cssProvider = new Gtk.CssProvider();
        const cssPath = GLib.build_filenamev([
            GLib.get_current_dir(),
            'styles',
            'styles.css'
        ]);

        try {
            cssProvider.load_from_path(cssPath);
            Gtk.StyleContext.add_provider_for_display(
                this.window.get_display(),
                cssProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
        } catch (e) {
            console.error('Failed to load CSS:', e.message);
        }
    }

    _buildMainUI() {
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 20,
            margin_bottom: 20,
            margin_start: 20,
            margin_end: 20
        });

        const today = new GLib.DateTime().get_day_of_month();
        const dayLabel = new Gtk.Label({
            label: `Today is the ${getDayWithSuffix(today)}`,
            halign: Gtk.Align.CENTER,
            css_classes: ['custom-label']
        });
        mainBox.append(dayLabel);

        const closeButton = new Gtk.Button({
            label: 'Close',
            margin_top: 20,
            css_classes: ['custom-button']
        });
        closeButton.connect('clicked', () => this.window.close());
        mainBox.append(closeButton);

        return mainBox;
    }

    run(args) {
        this.app.run(args);
    }
}

const app = new LatexHubApp();
app.run(ARGV);
