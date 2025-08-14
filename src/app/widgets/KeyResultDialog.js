'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

var KeyResultDialog = GObject.registerClass(
    {
        GTypeName: 'KeyResultDialog',
        Signals: {
            'submit': { param_types: [GLib.Variant.$gtype] },
        },
    },
    class KeyResultDialog extends Adw.Window {
        _init(parent, existingData = null) {
            super._init({
                modal: true,
                transient_for: parent,
                width_request: 450,
                hide_on_close: true,
                title: existingData ? 'Edit Key Result' : 'Add Key Result',
            });

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            });
            this.set_content(mainBox);

            const detailsGroup = new Adw.PreferencesGroup();
            mainBox.append(detailsGroup);

            const resultTypeStrings = ['Definition', 'Theorem', 'Lemma', 'Remark', 'Corollary', 'Proposition', 'Other'];
            this.typeSelector = Gtk.DropDown.new_from_strings(resultTypeStrings);
            if (existingData?.type) {
                const typeIndex = resultTypeStrings.findIndex(s => s.toLowerCase() === existingData.type);
                if (typeIndex !== -1) this.typeSelector.set_selected(typeIndex);
            }
            detailsGroup.add(new Adw.ActionRow({ title: 'Result Type', child: this.typeSelector }));

            this.titleEntry = new Gtk.Entry({ text: existingData?.title || '', placeholder_text: 'Title' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Title', child: this.titleEntry }));

            this.tagsEntry = new Gtk.Entry({ text: (existingData?.tags || []).join(', '), placeholder_text: 'Tags (comma-separated)' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Tags', child: this.tagsEntry }));

            this.numberEntry = new Gtk.Entry({ text: existingData?.number || '', placeholder_text: 'Number (optional)' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Number (Optional)', child: this.numberEntry }));

            this.pageEntry = new Gtk.Entry({ text: (existingData?.page || '').toString(), placeholder_text: 'PDF Page (optional)', input_purpose: Gtk.InputPurpose.DIGITS });
            detailsGroup.add(new Adw.ActionRow({ title: 'PDF Page (Optional)', child: this.pageEntry }));


            const actionBar = new Adw.HeaderBar({ show_end_title_buttons: false });
            mainBox.append(actionBar);

            const saveButton = new Gtk.Button({ label: 'Save', css_classes: ['suggested-action'] });
            actionBar.pack_end(saveButton);

            saveButton.connect('clicked', this._onSubmit.bind(this));
        }

        _onSubmit() {
            const title = this.titleEntry.get_text().trim();
            if (!title) return;

            const typeRaw = this.typeSelector.get_selected_item()?.get_string() || 'Remark';

            const variantDict = {
                type: new GLib.Variant('s', typeRaw.toLowerCase()),
                title: new GLib.Variant('s', title),
                tags: new GLib.Variant('as', this.tagsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean)),
                number: new GLib.Variant('s', this.numberEntry.get_text().trim()),
                page: new GLib.Variant('i', parseInt(this.pageEntry.get_text()) || 0),
            };

            this.emit('submit', new GLib.Variant('a{sv}', variantDict));
            this.close();
        }
    }
);

var exports = { KeyResultDialog };