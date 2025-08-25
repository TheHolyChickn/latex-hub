'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';
const { Gtk, Adw, GLib, Gdk, Gio } = imports.gi;

imports.searchPath.unshift(GLib.build_filenamev([
    GLib.get_current_dir(),
    'src'
]));

/*
const { ConfigManager } = imports.config.ConfigManager;
const { ConfigUtils } = imports.config.ConfigUtils;
const { LogUtils } = imports.config.LogUtils;
const { PreambleUtils } = imports.config.PreambleUtils;
 */
const { DashboardPage } = imports.app.widgets.DashboardPage;
const { CoursesPage } = imports.app.widgets.CoursesPage;
const { LibraryPage } = imports.app.widgets.LibraryPage;
const { PreambleSettingsPage } = imports.app.widgets.PreambleSettingsPage;

class LatexHubApp {
    constructor() {
        this.app = new Adw.Application({
            application_id: 'com.github.theholychickn.latex-hub',
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });
        this.app.connect('activate', this._onActivate.bind(this));
        this.window = null;
    }

    _onActivate() {
        if (this.window) {
            this.window.present();
            return;
        }

        this.window = new Adw.ApplicationWindow({
            application: this.app,
            default_width: 800,
            default_height: 600,
            css_classes: ['main-window'],
        });

        const styleManager = Adw.StyleManager.get_default();
        styleManager.set_color_scheme(Adw.ColorScheme.FORCE_DARK);

        // To apply a theme, just add the class name.
        // this.window.add_css_class('root:dark');

        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });

        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({ title: 'LaTeX Hub' }), // may turn this into Countdown.js main loop cycle
        });
        mainBox.append(headerBar);

        // This is the main layout widget with a sidebar and content view
        const splitView = new Adw.NavigationSplitView({
            vexpand: true,
            max_sidebar_width: 250,
            min_sidebar_width: 200,
        });
        mainBox.append(splitView);

        // The content area that will change based on sidebar selection
        const contentStack = new Adw.ViewStack();

        // The sidebar itself
        const sidebar = this._buildSidebar(contentStack);
        splitView.set_sidebar(new Adw.NavigationPage({
            title: 'Menu',
            child: sidebar,
        }));
        splitView.set_content(new Adw.NavigationPage({
            title: 'Content',
            child: contentStack,
        }));

        const dashboard = new DashboardPage();
        contentStack.add_titled(dashboard, 'dashboard', 'Dashboard');

        const coursesPage = new CoursesPage();
        contentStack.add_titled(coursesPage, 'courses', 'Courses');

        const libraryPage = new LibraryPage();
        contentStack.add_titled(libraryPage, 'library', 'Library');

        const settingsPage = new PreambleSettingsPage();
        contentStack.add_titled(settingsPage, 'settings', 'Settings');

        // placeholder pages
        this._addPlaceholderPage(contentStack, 'projects', 'Projects', 'folder-symbolic');
        //this._addPlaceholderPage(contentStack, 'settings', 'Settings', 'emblem-system-symbolic');

        dashboard.app = this;
        this.refreshablePages = {
            'dashboard': dashboard,
            'courses': coursesPage,
        };

        // Set the initial visible page
        contentStack.set_visible_child_name('dashboard');

        this.window.set_content(mainBox);
        this.window.connect('realize', () => this._loadCSS());
        this.window.present();
    }

    _buildSidebar(contentStack) {
        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            css_classes: ['navigation-sidebar'],
        });

        // When a row is selected, change the visible page in the contentStack
        listBox.connect('row-selected', (box, row) => {
            if (row) {
                contentStack.set_visible_child_name(row.get_name());
            }
        });

        // Add rows to the sidebar
        listBox.append(this._createSidebarRow('Dashboard', 'dashboard'));
        listBox.append(this._createSidebarRow('Courses', 'courses'));
        listBox.append(this._createSidebarRow('Library', 'library'));
        listBox.append(this._createSidebarRow('Projects', 'projects'));
        listBox.append(this._createSidebarRow('Settings', 'settings'));

        return listBox;
    }

    _createSidebarRow(title, name) {
        const row = new Gtk.ListBoxRow({
            name: name,
            selectable: true,
        });
        const label = new Gtk.Label({
            label: title,
            halign: Gtk.Align.START,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
        });
        row.set_child(label);
        return row;
    }

    _addPlaceholderPage(stack, name, title, iconName) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            spacing: 12,
            css_classes: ['content-card'],
        });

        const icon = new Gtk.Image({
            icon_name: iconName,
            pixel_size: 64,
            css_classes: ['dim-label'],
        });
        box.append(icon);

        const label = new Gtk.Label({
            label: `<span size='xx-large'>${title}</span>`,
            use_markup: true,
        });
        box.append(label);

        const subLabel = new Gtk.Label({
            label: `This is the placeholder page for the ${title} view.`,
            css_classes: ['dim-label'],
        });
        box.append(subLabel);

        if (name === 'dashboard') {
            const testButton = new Gtk.Button({
                label: 'Test Custom Button',
                css_classes: ['custom-button'], // This class applies our theme!
                margin_top: 20,
            });
            testButton.connect('clicked', () => {
                console.log('Custom button clicked!');
            });
            box.append(testButton);
        }

        stack.add_titled(box, name, title);
    }

    refreshAllPages() {
        console.log("Main App: Refreshing all pages...");
        if (this.refreshablePages['dashboard']) {
            this.refreshablePages['dashboard']._refreshDataAndUI();
        }
        if (this.refreshablePages['courses']) {
            this.refreshablePages['courses']._refreshDataAndUI();
        }
    }

    _loadCSS() {
        const provider = new Gtk.CssProvider();
        //const path = GLib.build_filenamev([GLib.get_current_dir(), 'src', 'styles', 'application.css']);
        const path = GLib.build_filenamev([GLib.get_home_dir(), 'WebstormProjects', 'latex-hub', 'src', 'styles', 'application.css'])
        provider.load_from_path(path);

        Gtk.StyleContext.add_provider_for_display(
            this.window.get_display(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    run(argv) {
        return this.app.run(argv)
    }
}

const app = new LatexHubApp();
app.run(ARGV);

/*
function getDayWithSuffix(date) {
    const j = date % 10, k = date % 100;
    if (j === 1 && k !== 11) return date + "st";
    if (j === 2 && k !== 12) return date + "nd";
    if (j === 3 && k !== 13) return date + "rd";
    return date + "th";
}
 */
