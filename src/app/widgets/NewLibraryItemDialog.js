'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

const { generateBibtex } = imports.core.BibtexUtils;

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
                width_request: 600,
                default_height: 700, // FIX 1: Set a default height to prevent squishing
                hide_on_close: true,
                title: 'Add New Library Entry',
            });

            this.library = library;
            this.fetchedData = null;

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
            });
            this.set_content(mainBox);

            const scrolledWindow = new Gtk.ScrolledWindow({ vexpand: true, hscrollbar_policy: Gtk.PolicyType.NEVER });
            mainBox.append(scrolledWindow);

            const contentBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            });
            scrolledWindow.set_child(contentBox);

            // --- arXiv Fetch ---
            const arxivBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            this.arxivEntry = new Gtk.Entry({ placeholder_text: 'e.g., hep-th/9403075', hexpand: true });
            const arxivButton = new Gtk.Button({ label: 'Fetch from arXiv' });
            arxivBox.append(this.arxivEntry);
            arxivBox.append(arxivButton);
            this.downloadPdfCheck = new Gtk.CheckButton({ label: 'Download PDF', active: true });
            arxivBox.append(this.downloadPdfCheck);
            contentBox.append(new Adw.PreferencesGroup({
                title: 'Auto-fill from arXiv',
                header_suffix: arxivBox,
            }));

            // --- Primary Details ---
            const detailsGroup = new Adw.PreferencesGroup({ title: 'Primary Details' });
            contentBox.append(detailsGroup);

            this.entryTypeSelector = Gtk.DropDown.new_from_strings(['Paper', 'Book', 'Article', 'Lecture Notes', 'Other']);
            detailsGroup.add(new Adw.ActionRow({ title: 'Entry Type', child: this.entryTypeSelector }));
            this.titleEntry = new Gtk.Entry({ placeholder_text: 'Title' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Title', child: this.titleEntry }));
            this.authorsEntry = new Gtk.Entry({ placeholder_text: 'Authors (separate with a comma)' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Authors', child: this.authorsEntry }));
            this.yearEntry = new Gtk.Entry({ input_purpose: Gtk.InputPurpose.DIGITS, placeholder_text: 'Year' });
            detailsGroup.add(new Adw.ActionRow({ title: 'Year', child: this.yearEntry }));

            // --- Optional Details in Expander ---
            // FIX 2: Create a single expander row to hold all optional fields
            const expander = new Adw.ExpanderRow({
                title: 'Show More Details'
            });
            contentBox.append(expander);

            // Create rows for each optional widget and add them TO THE EXPANDER
            this.pubEntry = new Gtk.Entry({ placeholder_text: 'How published' });
            expander.add_row(new Adw.ActionRow({ title: 'Publication Info', child: this.pubEntry }));
            this.tagsEntry = new Gtk.Entry({ placeholder_text: 'Tags (separate with a comma)' });
            expander.add_row(new Adw.ActionRow({ title: 'Tags', child: this.tagsEntry }));

            // FIX 3: Add labels for text views and put them in their own rows
            const abstractLabel = new Gtk.Label({ label: '<b>Abstract</b>', use_markup: true, xalign: 0, margin_bottom: 6 });
            this.abstractView = new Gtk.TextView({ vexpand: true, wrap_mode: Gtk.WrapMode.WORD_CHAR });
            const abstractScrolled = new Gtk.ScrolledWindow({ child: this.abstractView, min_content_height: 100 });
            const abstractBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            abstractBox.append(abstractLabel);
            abstractBox.append(abstractScrolled);
            expander.add_row(new Adw.ActionRow({ child: abstractBox }));

            const notesLabel = new Gtk.Label({ label: '<b>Personal Notes</b>', use_markup: true, xalign: 0, margin_bottom: 6 });
            this.notesView = new Gtk.TextView({ vexpand: true, wrap_mode: Gtk.WrapMode.WORD_CHAR });
            const notesScrolled = new Gtk.ScrolledWindow({ child: this.notesView, min_content_height: 100 });
            const notesBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            notesBox.append(notesLabel);
            notesBox.append(notesScrolled);
            expander.add_row(new Adw.ActionRow({ child: notesBox }));

            this.bibtexLabel = new Gtk.Label({ selectable: true, wrap: true, xalign: 0, css_classes: ['dim-label'] });
            expander.add_row(new Adw.ActionRow({ title: 'Generated BibTeX', subtitle: 'Read-only, updates automatically', child: this.bibtexLabel }));

            // --- Bottom Action Bar ---
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

        // _onFetchArxiv and _onSubmit methods remain unchanged
        _onFetchArxiv() {
            const arxivId = this.arxivEntry.get_text().trim();
            if (!arxivId) return;

            this.library.fetchArxivData(arxivId, (data) => {
                if (data) {
                    this.fetchedData = data;
                    this.titleEntry.set_text(data.title || '');
                    this.authorsEntry.set_text((data.authors || []).join(', '));
                    this.yearEntry.set_text((data.date.year || '').toString());
                    this.abstractView.get_buffer().set_text(data.abstract || '', -1);
                    this.entryTypeSelector.set_selected(0); // Set to "Paper"

                    const bibtex = generateBibtex(data);
                    this.bibtexLabel.set_text(bibtex);
                    this.fetchedData.bibtex = bibtex;
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
            const abstractBuffer = this.abstractView.get_buffer();
            const abstractText = abstractBuffer.get_text(abstractBuffer.get_start_iter(), abstractBuffer.get_end_iter(), true);

            const baseData = this.fetchedData || {
                id: `manual:${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
                source: 'manual',
                status: 'to-read',
            };

            const entryTypeRaw = this.entryTypeSelector.get_selected_item()?.get_string() || 'Other';
            const entryType = entryTypeRaw.toLowerCase().replace(' ', '-');

            const finalData = {
                ...baseData,
                entry_type: entryType,
                title: title,
                authors: this.authorsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean),
                date: { year: parseInt(this.yearEntry.get_text(), 10) || null },
                abstract: abstractText,
                publication_info: this.pubEntry.get_text().trim(),
                tags: this.tagsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean),
                personal_notes: notesText,
            };

            if (!finalData.bibtex) {
                finalData.bibtex = generateBibtex(finalData);
            }

            const variantDict = {
                id: new GLib.Variant('s', finalData.id),
                entry_type: new GLib.Variant('s', finalData.entry_type),
                source: new GLib.Variant('s', finalData.source),
                title: new GLib.Variant('s', finalData.title),
                authors: new GLib.Variant('as', finalData.authors),
                year: new GLib.Variant('i', finalData.date.year || 0),
                abstract: new GLib.Variant('s', finalData.abstract || ''),
                publication_info: new GLib.Variant('s', finalData.publication_info || ''),
                tags: new GLib.Variant('as', finalData.tags),
                personal_notes: new GLib.Variant('s', finalData.personal_notes),
                status: new GLib.Variant('s', finalData.status),
                bibtex: new GLib.Variant('s', finalData.bibtex),
                web_link: new GLib.Variant('s', finalData.web_link || ''),
            };

            this.emit('submit', new GLib.Variant('a{sv}', variantDict));
            this.close();
        }
    }
);

var exports = { NewLibraryItemDialog };