// src/app/widgets/LibraryPage.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
// 1. Add Gdk to the imports for clipboard access
const { GObject, Gtk, Adw, Gdk } = imports.gi;

const { Library } = imports.core.Library;

var LibraryPage = GObject.registerClass(
    {
        GTypeName: 'LibraryPage',
    },
    class LibraryPage extends Gtk.Box {
        // ... _init, _onSearchChanged, _onRowSelected, _populateList, and _createListRow methods are all unchanged ...
        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
            });

            this.library = new Library();

            const splitView = new Adw.NavigationSplitView({
                vexpand: true,
                max_sidebar_width: 350,
                min_sidebar_width: 250,
            });
            this.append(splitView);

            // --- Detail View ---
            this.detailStack = new Adw.ViewStack();
            const placeholder = new Adw.StatusPage({
                icon_name: 'books-symbolic',
                title: 'Select an Item',
                description: 'Choose an item from the list to see its details.',
            });
            this.detailStack.add_named(placeholder, 'placeholder');
            this.detailStack.set_visible_child_name('placeholder');

            splitView.set_content(new Adw.NavigationPage({
                title: 'Details',
                child: this.detailStack,
            }));

            // --- Sidebar / Master View ---
            const mainVbox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
            });

            this.searchBar = new Gtk.SearchEntry({
                placeholder_text: 'Search Library...',
                margin_top: 12, margin_start: 12, margin_end: 12,
            });
            mainVbox.append(this.searchBar);

            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vexpand: true,
            });
            mainVbox.append(scrolledWindow);

            this.listBox = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.SINGLE,
                css_classes: ['boxed-list'],
            });
            scrolledWindow.set_child(this.listBox);

            splitView.set_sidebar(new Adw.NavigationPage({
                title: 'Library',
                child: mainVbox,
            }));

            // --- Connect Signals ---
            this.searchBar.connect('search-changed', this._onSearchChanged.bind(this));
            this.listBox.connect('row-selected', this._onRowSelected.bind(this));

            // Initial population of the list
            this._populateList(this.library.entries);
        }

        _onSearchChanged() {
            const query = this.searchBar.get_text();
            const results = this.library.search({
                query: query,
                fields: ['title', 'abstract', 'personal_notes', 'authors']
            });
            this._populateList(results);
        }

        _onRowSelected(_box, row) {
            if (!row) return;

            const item = row.item_data;
            let detailPage = this.detailStack.get_child_by_name(item.id);

            if (!detailPage) {
                detailPage = this._createDetailPage(item);
                this.detailStack.add_named(detailPage, item.id);
            }
            this.detailStack.set_visible_child_name(item.id);
        }

        _populateList(entries) {
            this.listBox.remove_all();

            if (entries.length === 0) {
                const placeholder = new Gtk.Label({
                    label: "No matching entries found.",
                    halign: Gtk.Align.CENTER, css_classes: ['dim-label'], margin_top: 20,
                });
                this.listBox.append(placeholder);
            } else {
                entries.forEach(item => {
                    const row = this._createListRow(item);
                    this.listBox.append(row);
                });
            }
        }

        _createListRow(item) {
            const row = new Adw.ActionRow({
                title: item.title,
                subtitle: item.authors.join(', '),
                title_lines: 1,
                subtitle_lines: 1,
            });
            row.item_data = item;
            return row;
        }

        _createDetailPage(item) {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24,
            });

            const header = new Adw.HeaderBar({
                title_widget: new Adw.WindowTitle({ title: item.title, subtitle: `${item.date.year} - ${item.authors[0]}` }),
                show_end_title_buttons: false,
            });
            box.append(header);

            const buttonBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.CENTER, margin_bottom: 12 });

            // 2. Add signal handlers to the buttons
            if (item.web_link) {
                const webButton = new Gtk.Button({ label: 'Web Link', icon_name: 'web-browser-symbolic' });
                webButton.connect('clicked', () => Gtk.show_uri(this.get_root().get_surface(), item.web_link, Gdk.CURRENT_TIME));
                buttonBox.append(webButton);
            }
            if (item.local_path) {
                const pdfButton = new Gtk.Button({ label: 'Open PDF', icon_name: 'application-pdf-symbolic' });
                pdfButton.connect('clicked', () => Gtk.show_uri(this.get_root().get_surface(), `file://${item.local_path}`, Gdk.CURRENT_TIME));
                buttonBox.append(pdfButton);
            }
            if (item.bibtex) {
                const bibtexButton = new Gtk.Button({ label: 'Copy BibTeX', icon_name: 'edit-copy-symbolic' });
                bibtexButton.connect('clicked', () => {
                    const clipboard = this.get_display().get_clipboard();
                    clipboard.set_text(item.bibtex);
                });
                buttonBox.append(bibtexButton);
            }

            box.append(buttonBox);

            if (item.abstract) {
                const abstractRow = new Adw.ExpanderRow({ title: 'Abstract' });
                abstractRow.add_row(new Gtk.Label({
                    label: item.abstract, wrap: true, xalign: 0, css_classes: ['dim-label'],
                    margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 6,
                }));
                box.append(abstractRow);
            }
            if (item.personal_notes) {
                const notesRow = new Adw.ExpanderRow({ title: 'Personal Notes' });
                notesRow.add_row(new Gtk.Label({
                    label: item.personal_notes, wrap: true, xalign: 0,
                    margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 6,
                }));
                box.append(notesRow);
            }

            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                child: box
            });

            return scrolledWindow;
        }
    }
);

var exports = { LibraryPage };