'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

const { PreambleUtils } = imports.config.PreambleUtils;

var NewTemplateDialog = GObject.registerClass(
    {
        GTypeName: 'NewTemplateDialog',
        Signals: {
            'submit': { param_types: [GLib.Variant.$gtype] },
        },
    },
    class NewTemplateDialog extends Adw.Window {
        _init(parent, existingTemplate = null) {
            super._init({
                modal: true,
                transient_for: parent,
                width_request: 500,
                default_height: 550,
                hide_on_close: true,
                title: existingTemplate ? 'Edit Preamble Template' : 'New Preamble Template',
            });

            this.existingTemplate = existingTemplate;

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
            });
            this.set_content(mainBox);

            const contentBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            });
            mainBox.append(new Gtk.ScrolledWindow({ child: contentBox, vexpand: true, hscrollbar_policy: Gtk.PolicyType.NEVER }));

            const group = new Adw.PreferencesGroup();
            contentBox.append(group);

            this.templateNameEntry = new Gtk.Entry({
                text: existingTemplate?.name || '',
                placeholder_text: 'e.g., physics-homework-template',
                sensitive: !existingTemplate,
            });
            group.add(new Adw.ActionRow({ title: 'Template Name', child: this.templateNameEntry }));

            const snippetsGroup = new Adw.PreferencesGroup({ title: 'Included Snippets' });
            contentBox.append(snippetsGroup);

            const snippetsScrolled = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, min_content_height: 200, vexpand: true });
            this.snippetsListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
            snippetsScrolled.set_child(this.snippetsListBox);
            snippetsGroup.add(snippetsScrolled);

            const allSnippets = PreambleUtils.getAllPreambleSnippets();
            const currentSnippets = new Set(existingTemplate?.snippets || []);

            allSnippets.forEach(snippet => {
                const row = new Adw.ActionRow({ title: snippet.file_name, subtitle: snippet.description });
                const check = new Gtk.CheckButton({ active: currentSnippets.has(snippet.file_name) });
                row.add_prefix(check);
                row.activatable_widget = check;
                row.file_name = snippet.file_name;
                this.snippetsListBox.append(row);
            });

            const actionBar = new Adw.HeaderBar({ show_end_title_buttons: false });
            mainBox.append(actionBar);

            const saveButton = new Gtk.Button({ label: 'Save', css_classes: ['suggested-action'] });
            actionBar.pack_end(saveButton);
            const cancelButton = new Gtk.Button({ label: 'Cancel' });
            actionBar.pack_start(cancelButton);

            saveButton.connect('clicked', this._onSubmit.bind(this));
            cancelButton.connect('clicked', () => this.close());
        }

        _onSubmit() {
            const templateName = this.templateNameEntry.get_text().trim();
            if (!templateName) return;

            const selectedSnippets = [];
            let child = this.snippetsListBox.get_first_child();
            while(child) {
                if (child.get_activatable_widget().get_active()) {
                    selectedSnippets.push(child.file_name);
                }
                child = child.get_next_sibling();
            }

            const variantDict = {
                'name': new GLib.Variant('s', templateName),
                'snippets': new GLib.Variant('as', selectedSnippets),
            };

            this.emit('submit', new GLib.Variant('a{sv}', variantDict));
            this.close();
        }
    }
);

var exports = { NewTemplateDialog };