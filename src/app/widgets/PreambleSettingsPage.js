'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw } = imports.gi;

const { PreambleUtils } = imports.config.PreambleUtils;
const { NewSnippetDialog } = imports.app.widgets.NewSnippetDialog;
const { NewTemplateDialog } = imports.app.widgets.NewTemplateDialog;

var PreambleSettingsPage = GObject.registerClass(
    {
        GTypeName: 'PreambleSettingsPage',
    },
    class PreambleSettingsPage extends Gtk.Box {
        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            });

            const grid = new Gtk.Grid({
                column_spacing: 20,
                row_spacing: 20,
                column_homogeneous: true,
            });
            this.append(grid);

            const snippetsFrame = this._createSnippetsPanel();
            grid.attach(snippetsFrame, 0, 0, 1, 1);

            const templatesFrame = this._createTemplatesPanel();
            grid.attach(templatesFrame, 1, 0, 1, 1);
        }

        _createSnippetsPanel() {
            const frame = new Gtk.Frame({
                label: 'Preamble Snippets',
                css_classes: ['dashboard-card'],
                hexpand: true, vexpand: true,
            });
            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10, margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10 });
            frame.set_child(box);

            const newButton = new Gtk.Button({ label: 'New Snippet...', halign: Gtk.Align.END });
            newButton.connect('clicked', this._onNewSnippetClicked.bind(this));
            box.append(newButton);

            const scrolledWindow = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, vexpand: true });
            box.append(scrolledWindow);

            this.snippetsListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
            scrolledWindow.set_child(this.snippetsListBox);

            this._populateSnippetsList();
            return frame;
        }

        _createTemplatesPanel() {
            const frame = new Gtk.Frame({
                label: 'Preamble Templates',
                css_classes: ['dashboard-card'],
                hexpand: true, vexpand: true,
            });
            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10, margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10 });
            frame.set_child(box);

            const newButton = new Gtk.Button({ label: 'New Template...', halign: Gtk.Align.END });
            newButton.connect('clicked', this._onNewTemplateClicked.bind(this));
            box.append(newButton);

            const scrolledWindow = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, vexpand: true });
            box.append(scrolledWindow);

            this.templatesListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
            scrolledWindow.set_child(this.templatesListBox);

            this._populateTemplatesList();
            return frame;
        }

        _populateSnippetsList() {
            this.snippetsListBox.remove_all();
            const snippets = PreambleUtils.getAllPreambleSnippets();
            snippets.forEach(snippet => {
                const row = new Adw.ActionRow({ title: snippet.file_name, subtitle: snippet.description || '' });
                const editButton = new Gtk.Button({ icon_name: 'document-edit-symbolic' });
                editButton.connect('clicked', () => this._onEditSnippetClicked(snippet));
                row.add_suffix(editButton);
                row.set_activatable(true);
                this.snippetsListBox.append(row);
            });
        }

        _populateTemplatesList() {
            this.templatesListBox.remove_all();
            const templates = PreambleUtils.getAllTemplates();
            for (const name in templates) {
                const row = new Adw.ActionRow({ title: name, subtitle: (templates[name] || []).join(', ') });
                const editButton = new Gtk.Button({ icon_name: 'document-edit-symbolic' });
                editButton.connect('clicked', () => this._onEditTemplateClicked({ name: name, snippets: templates[name] }));
                row.add_suffix(editButton);
                row.set_activatable(true);
                this.templatesListBox.append(row);
            }
        }

        _onNewSnippetClicked() {
            const dialog = new NewSnippetDialog(this.get_root());
            dialog.connect('submit', (_source, variant) => {
                const variantDict = variant.deep_unpack();
                const data = {};
                for (const key in variantDict) {
                    data[key] = variantDict[key].deep_unpack();
                }

                if (PreambleUtils.addPreambleSnippet(data)) {
                    this._populateSnippetsList();
                } else {
                    console.error("Failed to add new snippet.");
                }
            });
            dialog.present();
        }

        _onEditSnippetClicked(snippet) {
            const dialog = new NewSnippetDialog(this.get_root(), snippet);
            dialog.connect('submit', (_source, variant) => {
                const variantDict = variant.deep_unpack();
                const data = {};
                for (const key in variantDict) {
                    data[key] = variantDict[key].deep_unpack();
                }

                if (PreambleUtils.updatePreambleSnippet(snippet.file_name, data)) {
                    this._populateSnippetsList();
                    this._populateTemplatesList();
                } else {
                    console.error("Failed to update snippet.");
                }
            });
            dialog.present();
        }

        _onNewTemplateClicked() {
            const dialog = new NewTemplateDialog(this.get_root());
            dialog.connect('submit', (_source, variant) => {
                const variantDict = variant.deep_unpack();
                const data = {};
                for (const key in variantDict) {
                    data[key] = variantDict[key].deep_unpack();
                }

                if (PreambleUtils.createTemplate(data.name, data.snippets)) {
                    this._populateTemplatesList();
                } else {
                    console.error("Failed to create new template.");
                }
            });
            dialog.present();
        }

        _onEditTemplateClicked(template) {
            const dialog = new NewTemplateDialog(this.get_root(), template);
            dialog.connect('submit', (_source, variant) => {
                const variantDict = variant.deep_unpack();
                const data = {};
                for (const key in variantDict) {
                    data[key] = variantDict[key].deep_unpack();
                }

                if (PreambleUtils.updateTemplate(template.name, data.snippets)) {
                    this._populateTemplatesList();
                } else {
                    console.error("Failed to update template.");
                }
            });
            dialog.present();
        }
    }
);

var exports = { PreambleSettingsPage };