// src/app/widgets/LibraryPage.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, Gdk } = imports.gi;

const { Library } = imports.core.Library;
// 1. Import the new dialog
const { NewLibraryItemDialog } = imports.app.widgets.NewLibraryItemDialog;


var LibraryPage = GObject.registerClass(
    {
        GTypeName: 'LibraryPage',
    },
    class LibraryPage extends Gtk.Box {

        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
            });

            this.library = new Library();

            // --- Build the UI ---
            const splitView = new Adw.NavigationSplitView({
                vexpand: true,
                max_sidebar_width: 350,
                min_sidebar_width: 250,
            });
            this.append(splitView);

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

            const mainVbox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
            });

            const sidebarHeader = new Adw.HeaderBar({
                css_classes: ['flat'],
            });
            this.searchBar = new Gtk.SearchEntry({
                placeholder_text: 'Search Library...',
                hexpand: true,
            });
            sidebarHeader.set_title_widget(this.searchBar);

            const newButton = new Gtk.Button({ icon_name: 'list-add-symbolic' });
            sidebarHeader.pack_end(newButton);
            mainVbox.append(sidebarHeader);

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
            newButton.connect('clicked', this._onNewEntryClicked.bind(this));

            // --- Populate List ---
            // Call the search function initially to get the full, unfiltered list.
            this._onSearchChanged();
        }


        _onNewEntryClicked() {
            const dialog = new NewLibraryItemDialog(this.get_root(), this.library);
            dialog.connect('submit', (_source, variant) => {
                const variantDict = variant.deep_unpack();

                const newEntryData = {
                    id:             variantDict['id'].unpack(),
                    entry_type:     variantDict['entry_type'].unpack(),
                    source:         variantDict['source'].unpack(),
                    title:          variantDict['title'].unpack(),
                    authors:        variantDict['authors'].deep_unpack(),
                    date:           { year: variantDict['year'].unpack() },
                    abstract:       variantDict['abstract'].unpack(),
                    publication_info: variantDict['publication_info'].unpack(),
                    tags:           variantDict['tags'].deep_unpack(),
                    personal_notes: variantDict['personal_notes'].unpack(),
                    status:         variantDict['status'].unpack(),
                    bibtex:         variantDict['bibtex'].unpack(),
                    web_link:       variantDict['web_link'].unpack(),
                };

                this.library.addEntry(newEntryData);
                this._onSearchChanged();
            });
            dialog.present();
        }

        // ... _onSearchChanged, _onRowSelected, and other methods remain the same ...
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

            // Add a check to ensure entries is a valid array before proceeding
            if (!entries || entries.length === 0) {
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

            if (item.web_link) {
                const webButton = new Gtk.Button();
                const webContent = new Adw.ButtonContent({
                    label: item.source === 'arxiv' ? 'Open arXiv Page' : 'Open Web Link',
                    icon_name: 'web-browser-symbolic'
                });
                webButton.set_child(webContent);
                webButton.connect('clicked', () => Gtk.show_uri(this.get_root(), item.web_link, Gdk.CURRENT_TIME));
                buttonBox.append(webButton);
            }
            if (item.local_path) {
                const pdfButton = new Gtk.Button();
                const pdfContent = new Adw.ButtonContent({
                    label: 'Open PDF',
                    icon_name: 'application-pdf-symbolic'
                });
                pdfButton.set_child(pdfContent);
                pdfButton.connect('clicked', () => Gtk.show_uri(this.get_root(), `file://${item.local_path}`, Gdk.CURRENT_TIME));
                buttonBox.append(pdfButton);
            }
            if (item.bibtex) {
                const bibtexButton = new Gtk.Button();
                const bibtexContent = new Adw.ButtonContent({
                    label: 'Copy BibTeX Citation',
                    icon_name: 'edit-copy-symbolic'
                });
                bibtexButton.set_child(bibtexContent);
                bibtexButton.connect('clicked', () => {
                    const clipboard = this.get_display().get_clipboard();
                    clipboard.set(item.bibtex);
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