'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

const { PreambleUtils } = imports.config.PreambleUtils;

var NewSnippetDialog = GObject.registerClass(
    {
        GTypeName: 'NewSnippetDialog',
        Signals: {
            'submit': { param_types: [GLib.Variant.$gtype] },
        },
    },
    class NewSnippetDialog extends Adw.Window {
        _init(parent, existingSnippet = null) {
            super._init({
                modal: true,
                transient_for: parent,
                width_request: 500,
                hide_on_close: true,
                title: existingSnippet ? 'Edit Preamble Snippet' : 'New Preamble Snippet',
            });

            this.existingSnippet = existingSnippet;

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

            this.fileNameEntry = new Gtk.Entry({
                text: existingSnippet?.file_name || '',
                placeholder_text: 'e.g., ams-math',
                sensitive: !existingSnippet,
            });
            group.add(new Adw.ActionRow({ title: 'File Name (.tex)', child: this.fileNameEntry }));

            this.descriptionEntry = new Gtk.Entry({
                text: existingSnippet?.description || '',
                placeholder_text: 'A short description of the snippet',
            });
            group.add(new Adw.ActionRow({ title: 'Description', child: this.descriptionEntry }));

            this.tagsEntry = new Gtk.Entry({
                text: (existingSnippet?.tags || []).join(', '),
                placeholder_text: 'Comma-separated tags',
            });
            group.add(new Adw.ActionRow({ title: 'Tags', child: this.tagsEntry }));

            const depsGroup = new Adw.PreferencesGroup({ title: 'Dependencies' });
            contentBox.append(depsGroup);

            const depsScrolled = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, min_content_height: 150, vexpand: true });
            this.depsListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
            depsScrolled.set_child(this.depsListBox);
            depsGroup.add(depsScrolled);

            const allSnippets = PreambleUtils.getAllPreambleSnippets();
            const currentDeps = new Set(existingSnippet?.dependencies || []);

            allSnippets.forEach(snippet => {
                if (existingSnippet && snippet.file_name === existingSnippet.file_name) return;

                const row = new Adw.ActionRow({ title: snippet.file_name });
                const check = new Gtk.CheckButton({ active: currentDeps.has(snippet.file_name) });
                row.add_prefix(check);
                row.activatable_widget = check;
                row.file_name = snippet.file_name;
                this.depsListBox.append(row);
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
            const fileName = this.fileNameEntry.get_text().trim();
            if (!fileName) return;

            const selectedDeps = [];
            let child = this.depsListBox.get_first_child();
            while(child) {
                if (child.get_activatable_widget().get_active()) {
                    selectedDeps.push(child.file_name);
                }
                child = child.get_next_sibling();
            }

            const finalData = {
                file_name: fileName,
                description: this.descriptionEntry.get_text().trim(),
                tags: this.tagsEntry.get_text().split(',').map(t => t.trim()).filter(Boolean),
                dependencies: selectedDeps,
            };

            const variantDict = {
                'file_name': new GLib.Variant('s', finalData.file_name),
                'description': new GLib.Variant('s', finalData.description),
                'tags': new GLib.Variant('as', finalData.tags),
                'dependencies': new GLib.Variant('as', finalData.dependencies),
            };

            this.emit('submit', new GLib.Variant('a{sv}', variantDict));
            this.close();
        }
    }
);

var exports = { NewSnippetDialog };