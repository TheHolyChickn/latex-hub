// src/app/widgets/NewLibraryItemDialog.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

var NewLibraryItemDialog = GObject.registerClass(
    {
        GTypeName: 'NewLibraryItemDialog',
        Signals: {
            'submit': { param_types: [GLib.Variant.$gtype] },
        },
    },
    class NewLibraryItemDialog extends Adw.Window {
        _init(parent, library) {
            super._init({
                modal: true,
                transient_for: parent,
                width_request: 550,
                hide_on_close: true,
                title: 'Add New Library Entry',
            });

            this.library = library;
            this.fetchedData = null; // Variable to hold fetched data

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_end: 12, margin_start: 12
            });
            this.set_content(mainBox);

            // --- UI Setup (same as before) ---
            const arxivBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            this.arxivEntry = new Gtk.Entry({ placeholder_text: 'e.g., math/0405043', hexpand: true });
            const arxivButton = new Gtk.Button({ label: 'Fetch from arXiv' });
            arxivBox.append(this.arxivEntry);
            arxivBox.append(arxivButton);
            mainBox.append(new Adw.PreferencesGroup({
                title: 'Auto-fill from arXiv',
                description: 'Enter an arXiv ID and click fetch to populate fields automatically.',
                header_suffix: arxivBox,
            }));
            const detailsGroup = new Adw.PreferencesGroup({ title: 'Manual Entry Details' });
            mainBox.append(detailsGroup);
            this.titleEntry = new Gtk.Entry();
            detailsGroup.add(new Adw.ActionRow({ title: 'Title', activatable_widget: this.titleEntry, child: this.titleEntry }));
            this.authorsEntry = new Gtk.Entry({ placeholder_text: 'Authors (e.g., Jacob Lurie, A. Zee)' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Authors', activatable_widget: this.authorsEntry, child: this.authorsEntry }));
            this.yearEntry = new Gtk.Entry({ input_purpose: Gtk.InputPurpose.DIGITS, placeholder_text: 'Year of publication (e.g., 2009)' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Year', activatable_widget: this.yearEntry, child: this.yearEntry }));
            this.tagsEntry = new Gtk.Entry({ placeholder_text: 'Tags (e.g., math, topos-theory)' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Tags', activatable_widget: this.tagsEntry, child: this.tagsEntry }));
            this.notesView = new Gtk.TextView({ vexpand: true, wrap_mode: Gtk.WrapMode.WORD_CHAR });
            const notesScrolled = new Gtk.ScrolledWindow({ child: this.notesView, min_content_height: 100 });
            detailsGroup.add(new Adw.ExpanderRow({ title: 'Personal Notes', child: notesScrolled }));
            const actionBar = new Adw.HeaderBar({ show_end_title_buttons: false });
            mainBox.append(actionBar);
            const saveButton = new Gtk.Button({ label: 'Save Entry', css_classes: ['suggested-action'] });
            actionBar.pack_end(saveButton);
            const cancelButton = new Gtk.Button({ label: 'Cancel' });
            actionBar.pack_start(cancelButton);

            // --- Signal Handlers ---
            saveButton.connect('clicked', this._onSubmit.bind(this));
            cancelButton.connect('clicked', () => this.close());
            arxivButton.connect('clicked', this._onFetchArxiv.bind(this));
        }

        _onFetchArxiv() {
            const arxivId = this.arxivEntry.get_text().trim();
            if (!arxivId) return;

            // Use the new fetch-only method
            this.library.fetchArxivData(arxivId, (data) => {
                if (data) {
                    // Store the fetched data and populate the fields
                    this.fetchedData = data;
                    this.titleEntry.set_text(data.title);
                    this.authorsEntry.set_text(data.authors.join(', '));
                    this.yearEntry.set_text(data.date.year.toString());
                } else {
                    this.fetchedData = null;
                    console.error("Failed to fetch data from arXiv.");
                }
            });
        }

        _onSubmit() {
            const title = this.titleEntry.get_text().trim();
            if (!title) {
                console.warn("Title is a required field.");
                return;
            }

            const notesBuffer = this.notesView.get_buffer();
            const notesText = notesBuffer.get_text(notesBuffer.get_start_iter(), notesBuffer.get_end_iter(), true);

            // If we have fetched data, use it as a base. Otherwise, create a fully manual entry.
            const baseData = this.fetchedData || {
                id: `manual:${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
                entry_type: 'book',
                source: 'manual',
                status: 'to-read',
            };

            // Combine base data with the current state of the UI fields
            const finalData = {
                ...baseData,
                title: title,
                authors: this.authorsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean),
                year: parseInt(this.yearEntry.get_text(), 10) || 0,
                tags: this.tagsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean),
                personal_notes: notesText,
            };

            const variantDict = {
                id:             new GLib.Variant('s', finalData.id),
                entry_type:     new GLib.Variant('s', finalData.entry_type),
                source:         new GLib.Variant('s', finalData.source),
                title:          new GLib.Variant('s', finalData.title),
                authors:        new GLib.Variant('as', finalData.authors),
                year:           new GLib.Variant('i', finalData.year),
                tags:           new GLib.Variant('as', finalData.tags),
                personal_notes: new GLib.Variant('s', finalData.personal_notes),
                status:         new GLib.Variant('s', finalData.status),
                // Pass along other fetched data if it exists
                abstract:       new GLib.Variant('s', finalData.abstract || ''),
                web_link:       new GLib.Variant('s', finalData.web_link || ''),
            };

            this.emit('submit', new GLib.Variant('a{sv}', variantDict));
            this.close();
        }
    }
);

var exports = { NewLibraryItemDialog };