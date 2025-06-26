'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';
const { Gtk, Adw, GLib, Gdk, Gio } = imports.gi;

imports.searchPath.unshift(GLib.build_filenamev([
    GLib.get_current_dir(),
    'src'
]));

const { ConfigManager } = imports.config.ConfigManager;
const { ConfigUtils } = imports.config.ConfigUtils;
const { LogUtils } = imports.config.LogUtils;
const { PreambleUtils } = imports.config.PreambleUtils;

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
            title_widget: new Adw.WindowTitle({ title: 'LaTeX Hub' }),
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

        // Add placeholder pages to the content stack
        this._addPlaceholderPage(contentStack, 'dashboard', 'Dashboard', 'emblem-default-symbolic');
        this._addPlaceholderPage(contentStack, 'courses', 'Courses', 'notebook-symbolic');
        this._addPlaceholderPage(contentStack, 'projects', 'Projects', 'folder-symbolic');
        this._addPlaceholderPage(contentStack, 'settings', 'Settings', 'emblem-system-symbolic');

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

    _loadCSS() {
        const provider = new Gtk.CssProvider();
        const path = GLib.build_filenamev([GLib.get_current_dir(), 'src', 'styles', 'application.css']);
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
function testConfigSystem() {
    let config = ConfigManager.loadConfig();
    console.log('Initial Config:', JSON.stringify(config, null, 2));

    ConfigUtils.set('root_dir', '~/Pictures/University/');
    console.log('After setting root_dir:', ConfigUtils.get('root_dir'));

    ConfigUtils.set('github_user', 'latex_pro');
    console.log('Github user:', ConfigUtils.get('github_user'));

    ConfigUtils.set('projects_dir', '~/Pictures/University/Projects/');
    console.log('Updated projects_dir:', ConfigUtils.get('projects_dir'));

    ConfigUtils.set('current_semester', '2');
    console.log('Updated current_semester:', ConfigUtils.get('current_semester'));

    const newConfig = ConfigManager.loadConfig();
    console.log('New Config:', JSON.stringify(newConfig, null, 2));

    console.log('Nonexistant key:', ConfigUtils.get('nonexistant.key'));
}

/**
 * A method for testing the config backent's various methods
 */
function testConfigSystems() {
    console.log('====== Comprehensive Test of Config Systems ======');

    // ConfigManager and ConfigUtils
    console.log("\n--- Config Manager ---");

    let initialConfig = ConfigManager.loadConfig();
    console.log('Initial Config:', JSON.stringify(initialConfig, null, 2));

    ConfigUtils.set('root_dir', '~/TestUniversity/');
    console.log('Set root dir: ', ConfigUtils.get('root_dir'));

    ConfigUtils.set('github_user', 'latex_pro');
    console.log('Set github_user:', ConfigUtils.get('github_user'));

    ConfigUtils.addCourse('Algebraic-Topology');
    ConfigUtils.addCourse('QFT');
    console.log('Current courses after adding:', ConfigUtils.get('current_courses'));

    ConfigUtils.addProject('LatexHub-Development');
    console.log('Current projects after adding:', ConfigUtils.get('current_projects'));

    ConfigUtils.archiveCourse('QFT');
    console.log('Archived courses:', ConfigUtils.get('archived_courses'));

    ConfigUtils.archiveProject('Nonexistant-Project');
    ConfigUtils.archiveProject('LatexHub-Development');
    console.log('Current projects after archiving LatexHub-Development:', ConfigUtils.get('current_projects'));
    console.log('Archived projects:', ConfigUtils.get('archived_projects'));

    let finalConfig = ConfigManager.loadConfig();
    console.log('Final config state:', JSON.stringify(finalConfig, null, 2));

    // LogUtils
    console.log("\n--- Log Manager ---");
    let initialLogs = ConfigManager.loadLogs();
    console.log('Initial logs:', JSON.stringify(initialLogs, null, 2));

    const now = GLib.DateTime.new_now_utc();
    const oneHourAgo = now.add_hours(-1);

    // ensure alg top still exists
    if (!ConfigUtils.get('current_courses').includes('Algebraic-Topology')) {
        ConfigUtils.addCourse('Algebraic-Topology');
        console.log('Had to re-add alg top');
    }

    LogUtils.addWorkSession({
        start_time: oneHourAgo.format_iso8601(),
        end_time: now.format_iso8601(),
        context: "course",
        workspace: "Algebraic-Topology"
    });

    let currentLogs = ConfigManager.loadLogs();
    console.log('Logs after adding session::', JSON.stringify(currentLogs, null, 2));

    console.log('Total time for alg top:', LogUtils.getWorkspaceTotalTime('Algebraic-Topology') + 'ms');
    console.log('All workspace times:', JSON.stringify(LogUtils.getAllWorkspaceTimes(), null, 2));
    console.log('Retrieved sessions for alg top:', JSON.stringify(LogUtils.getWorkSessions({ workspace: "Algebraic-Topology" }), null, 2));

    let finalLogs = ConfigManager.loadLogs();
    console.log('Final logs:', JSON.stringify(finalLogs, null, 2));

    // PreambleUtils
    console.log("\n--- Preamble Manager ---");
    let initialPreambles = ConfigManager.loadPreambles();
    console.log('Initial preambles:', JSON.stringify(initialPreambles, null, 2));

    PreambleUtils.addPreambleSnippet({ // this will indeed work which is good
        file_name: "macros",
        description: "common macros",
        tags: [ "math", "utility" ]
    });
    PreambleUtils.addPreambleSnippet({
        file_name: "TikZ",
        description: "tikz setup",
        tags: [ "diagrams" ],
        dependencies: [ "macros" ]
    });
    PreambleUtils.addPreambleSnippet({
        file_name: "ams",
        description: "AMS packages",
        tags: [ "math" ]
    });
    console.log('Preamble snippets after adding:', JSON.stringify(ConfigManager.loadPreambles(), null, 2));

    PreambleUtils.updatePreambleSnippet("macros", {
        description: "common latex macros"
    });
    console.log('Preamble snippet "macros" after updating:', JSON.stringify(PreambleUtils.getPreambleSnippetMetadata("macros"), null, 2));

    PreambleUtils.createTemplate("math_default", ["ams", "macros"]);
    PreambleUtils.createTemplate("diagram_heavy", [ "TikZ", "ams", "macros"]);
    console.log('Templates after creating:', JSON.stringify(PreambleUtils.getAllTemplates(), null, 2));

    console.log('Preamble file names for math_default:', PreambleUtils.getTemplatePreambleFileNames("math_default"));

    PreambleUtils.setDefaultTemplate("math_default");
    console.log('Default template name:', PreambleUtils.getDefaultTemplateName());

    console.log('Assembled preamble for "math_default":', PreambleUtils.assemblePreambleFromTemplate("math_default"));
    console.log('\nAssembled preamble for "diagram_heavy" (testing dependency order):', PreambleUtils.assemblePreambleFromTemplate("diagram_heavy"));

    let finalPreambles = ConfigManager.loadPreambles();
    console.log('Final preambles state:', JSON.stringify(finalPreambles, null, 2));

    console.log('====== end of testing ======')
}