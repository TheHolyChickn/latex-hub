// src/app/widgets/LibraryPage.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, Gdk, Pango } = imports.gi;

const { Library } = imports.core.Library;
const { NewLibraryItemDialog } = imports.app.widgets.NewLibraryItemDialog;
const { KeyResultDialog } = imports.app.widgets.KeyResultDialog;


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
// This is the button that will toggle the search mode
            this.searchModeButton = new Gtk.ToggleButton({
                icon_name: 'find-location-symbolic', // An icon suggesting a deeper search
                tooltip_text: 'Toggle between searching the library and searching key results'
            });

            this.searchBar = new Gtk.SearchEntry({
                placeholder_text: 'Search Library...', // Default placeholder
                hexpand: true,
            });

            // The search bar and toggle button are packed directly into the header
            sidebarHeader.pack_start(this.searchModeButton);
            sidebarHeader.set_title_widget(this.searchBar);

            const newButton = new Gtk.Button({ icon_name: 'list-add-symbolic' });
            sidebarHeader.pack_end(newButton);
            mainVbox.append(sidebarHeader);

            const statusBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                halign: Gtk.Align.CENTER,
                css_classes: ['pill-group'],
                margin_top: 6,
                margin_bottom: 6,
            });

            this.allButton = new Gtk.ToggleButton({ label: 'All', active: true });
            this.toReadButton = new Gtk.ToggleButton({ label: 'To Read', group: this.allButton });
            this.readingButton = new Gtk.ToggleButton({ label: 'Reading', group: this.allButton });
            this.finishedButton = new Gtk.ToggleButton({ label: 'Finished', group: this.allButton });

            statusBox.append(this.allButton);
            statusBox.append(this.toReadButton);
            statusBox.append(this.readingButton);
            statusBox.append(this.finishedButton);
            mainVbox.append(statusBox);

            this.allButton.connect('toggled', this._onStatusFilterChanged.bind(this));
            this.toReadButton.connect('toggled', this._onStatusFilterChanged.bind(this));
            this.readingButton.connect('toggled', this._onStatusFilterChanged.bind(this));
            this.finishedButton.connect('toggled', this._onStatusFilterChanged.bind(this));

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
            this.searchModeButton.connect('toggled', this._onSearchChanged.bind(this));
            newButton.connect('clicked', this._onNewEntryClicked.bind(this));

            // --- Populate List ---
            // Call the search function initially to get the full, unfiltered list.
            this._onSearchChanged();
        }


        _onStatusFilterChanged() {
            // A change in the status filter should trigger a new search
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
                    arxiv_id:       variantDict['arxiv_id'].unpack(),
                };

                this.library.addEntry(newEntryData);
                // Trigger download if the source is arXiv and the box was checked
                if (newEntryData.source === 'arxiv' && dialog.downloadPdfCheck.get_active()) {
                    this.library.downloadArxivPdf(newEntryData.id, (success) => {
                        if (success) {
                            // refresh the detail view if it's visible
                            // to show the now-active "Open PDF" button.
                            this._onSearchChanged();
                        }
                    });
                }

                this._onSearchChanged();
            });
            dialog.present();
        }


        _onSearchChanged() {
            const query = this.searchBar.get_text();

            let statusFilter = null;
            if (this.toReadButton.get_active()) {
                statusFilter = 'to-read';
            } else if (this.readingButton.get_active()) {
                statusFilter = 'reading';
            } else if (this.finishedButton.get_active()) {
                statusFilter = 'finished';
            }

            // --- NEW LOGIC FOR SEARCH MODE ---
            let searchFields = ['title', 'abstract', 'personal_notes', 'authors'];
            let searchKeyResults = false;

            if (this.searchModeButton.get_active()) {
                // Key Results Mode
                this.searchBar.set_placeholder_text('Search Key Results...');
                searchFields = []; // Don't search main fields
                searchKeyResults = true;
            } else {
                // Library Mode (Default)
                this.searchBar.set_placeholder_text('Search Library...');
                searchKeyResults = false;
            }

            const results = this.library.search({
                query: query,
                fields: searchFields,
                status: statusFilter,
                searchKeyResults: searchKeyResults,
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
                // FIX: Use the item data directly to ensure this updates
                title: item.title,
                subtitle: (item.authors || []).join(', '),
                title_lines: 1,
                subtitle_lines: 1,
            });
            row.item_data = item;
            return row;
        }

        _createDetailPage(item) {
            const mainDetailBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
            });

            const viewStack = new Gtk.Stack();

            const header = new Adw.HeaderBar({
                show_end_title_buttons: false,
                title_widget: new Adw.WindowTitle({ title: item.title, subtitle: `${item.date.year} - ${(item.authors[0] || '')}` }),
            });
            mainDetailBox.append(header);
            mainDetailBox.append(viewStack);

            const buildDisplayView = (currentItem) => {
                const displayBox = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    spacing: 12,
                    margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24,
                    vexpand: true,
                });

                // --- Button Box (Open PDF, Web Link, etc.) ---
                const buttonBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.CENTER, margin_bottom: 12 });
                if (currentItem.web_link) {
                    const webButton = new Gtk.Button();
                    const webContent = new Adw.ButtonContent({ label: currentItem.source === 'arxiv' ? 'Open arXiv Page' : 'Open Web Link', icon_name: 'web-browser-symbolic' });
                    webButton.set_child(webContent);
                    webButton.connect('clicked', () => Gtk.show_uri(this.get_root(), currentItem.web_link, Gdk.CURRENT_TIME));
                    buttonBox.append(webButton);
                }
                if (currentItem.local_path) {
                    const pdfButton = new Gtk.Button();
                    const pdfContent = new Adw.ButtonContent({ label: 'Open PDF', icon_name: 'application-pdf-symbolic' });
                    pdfButton.set_child(pdfContent);
                    pdfButton.connect('clicked', () => Gtk.show_uri(this.get_root(), `file://${currentItem.local_path}`, Gdk.CURRENT_TIME));
                    buttonBox.append(pdfButton);
                }
                if (currentItem.bibtex) {
                    const bibtexButton = new Gtk.Button();
                    const bibtexContent = new Adw.ButtonContent({ label: 'Copy BibTeX Citation', icon_name: 'edit-copy-symbolic' });
                    bibtexButton.set_child(bibtexContent);
                    bibtexButton.connect('clicked', () => {
                        const clipboard = this.get_display().get_clipboard();
                        clipboard.set(currentItem.bibtex);
                    });
                    buttonBox.append(bibtexButton);
                }
                displayBox.append(buttonBox);

                // --- Abstract & Notes Expanders ---
                if (currentItem.abstract) {
                    const abstractRow = new Adw.ExpanderRow({ title: 'Abstract' });
                    abstractRow.add_row(new Gtk.Label({ label: currentItem.abstract, wrap: true, xalign: 0, css_classes: ['dim-label'], margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 6 }));
                    displayBox.append(abstractRow);
                }
                if (currentItem.personal_notes) {
                    const notesRow = new Adw.ExpanderRow({ title: 'Personal Notes' });
                    notesRow.add_row(new Gtk.Label({ label: currentItem.personal_notes, wrap: true, xalign: 0, margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 6 }));
                    displayBox.append(notesRow);
                }

                // --- Key Results Expander ---
                if (currentItem.key_items && currentItem.key_items.length > 0) {
                    const keyItemsExpander = new Adw.ExpanderRow({ title: 'Key Results' });

                    const keyItemsListBox = new Gtk.ListBox({
                        selection_mode: Gtk.SelectionMode.NONE,
                        css_classes: ['boxed-list'],
                    });
                    keyItemsExpander.add_row(keyItemsListBox);

                    currentItem.key_items.forEach(keyItem => {
                        const resultButton = new Gtk.Button({
                            css_classes: ['flat'],
                            halign: Gtk.Align.FILL,
                        });

                        const titleString = keyItem.number ? `${keyItem.type.charAt(0).toUpperCase() + keyItem.type.slice(1)} ${keyItem.number}` : keyItem.title;
                        const subtitleString = keyItem.number ? keyItem.title : (keyItem.tags || []).join(', ');

                        // Create a vertical box to hold the title and subtitle labels
                        const labelBox = new Gtk.Box({
                            orientation: Gtk.Orientation.VERTICAL,
                            spacing: 2,
                            margin_top: 6, margin_bottom: 6, margin_start: 6, margin_end: 6,
                        });

                        const titleLabel = new Gtk.Label({
                            label: `<b>${titleString}</b>`,
                            use_markup: true,
                            xalign: 0,
                        });
                        const subtitleLabel = new Gtk.Label({
                            label: subtitleString,
                            xalign: 0,
                            css_classes: ['dim-label'],
                        });

                        labelBox.append(titleLabel);
                        labelBox.append(subtitleLabel);
                        resultButton.set_child(labelBox);

                        if (currentItem.local_path && keyItem.page > 0) {
                            resultButton.connect('clicked', () => {
                                const uri = `file://${currentItem.local_path}#page=${keyItem.page}`;
                                Gtk.show_uri(this.get_root(), uri, Gdk.CURRENT_TIME);
                            });
                        } else {
                            resultButton.set_sensitive(false);
                        }

                        keyItemsListBox.append(resultButton);
                    });                    displayBox.append(keyItemsExpander);
                }

                // --- Related Entries ---
                if (currentItem.related_entries && currentItem.related_entries.length > 0) {
                    const relatedExpander = new Adw.ExpanderRow({ title: 'Related Entries' });
                    const relatedListBox = new Gtk.ListBox({
                        selection_mode: Gtk.SelectionMode.NONE,
                        css_classes: ['boxed-list'],
                    });
                    relatedExpander.add_row(relatedListBox);

                    currentItem.related_entries.forEach(relatedId => {
                        const relatedItem = this.library.getEntryById(relatedId);
                        if (relatedItem) {
                            const row = new Adw.ActionRow({
                                title: relatedItem.title,
                                subtitle: (relatedItem.authors || []).join(', '),
                                activatable: true,
                            });
                            row.connect('activated', () => {
                                this.detailStack.set_visible_child_name(relatedItem.id);
                            });
                            relatedListBox.append(row);
                        }
                    });
                    displayBox.append(relatedExpander);
                }

                const displayScrolled = new Gtk.ScrolledWindow({
                    hscrollbar_policy: Gtk.PolicyType.NEVER,
                    child: displayBox,
                    vexpand: true,
                });
                return displayScrolled;
            };

            let displayView = buildDisplayView(item);
            viewStack.add_named(displayView, 'display');

            // --- Build the Edit View ---
            const editGroup = new Adw.PreferencesGroup({
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            });

            const entryTypeStrings = ['Paper', 'Book', 'Article', 'Lecture Notes', 'Other'];
            const entryTypeSelector = Gtk.DropDown.new_from_strings(entryTypeStrings);
            const currentTypeIndex = entryTypeStrings.findIndex(s => s.toLowerCase().replace(' ', '-') === item.entry_type);
            if (currentTypeIndex !== -1) entryTypeSelector.set_selected(currentTypeIndex);
            editGroup.add(new Adw.ActionRow({ title: 'Entry Type', child: entryTypeSelector }));

            const titleEntry = new Gtk.Entry({ text: (item.title || '').toString(), placeholder_text: 'Title' });
            editGroup.add(new Adw.ActionRow({ title: 'Title', child: titleEntry }));

            const authorsEntry = new Gtk.Entry({ text: (item.authors || []).join(', '), placeholder_text: 'Authors (separate with a comma)' });
            editGroup.add(new Adw.ActionRow({ title: 'Authors', subtitle: 'Comma-separated', child: authorsEntry }));

            const statusStrings = ['To Read', 'Reading', 'Finished'];
            const statusSelector = Gtk.DropDown.new_from_strings(statusStrings);
            const currentStatusIndex = statusStrings.findIndex(s => s.toLowerCase().replace(' ', '-') === item.status);
            if (currentStatusIndex !== -1) statusSelector.set_selected(currentStatusIndex);
            editGroup.add(new Adw.ActionRow({ title: 'Status', child: statusSelector }));

            const dateBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            const yearEntry = new Gtk.Entry({ text: (item.date.year || '').toString(), placeholder_text: 'YYYY' });
            const monthEntry = new Gtk.Entry({ text: (item.date.month || '').toString(), placeholder_text: 'MM' });
            const dayEntry = new Gtk.Entry({ text: (item.date.day || '').toString(), placeholder_text: 'DD' });
            dateBox.append(yearEntry);
            dateBox.append(monthEntry);
            dateBox.append(dayEntry);
            editGroup.add(new Adw.ActionRow({ title: 'Date', child: dateBox }));

            const pubEntry = new Gtk.Entry({ text: (item.publication_info || '').toString(), placeholder_text: 'Publication Info' });
            editGroup.add(new Adw.ActionRow({ title: 'Publication Info', child: pubEntry }));

            const webLinkEntry = new Gtk.Entry({ text: (item.web_link || '').toString(), placeholder_text: 'Web Link' });
            editGroup.add(new Adw.ActionRow({ title: 'Web Link', child: webLinkEntry }));

            // --- FIX: Replace Gtk.FileChooserButton ---
            const fileChooserBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            const fileChooserLabel = new Gtk.Label({ label: item.local_path || 'None', xalign: 0, ellipsize: Pango.EllipsizeMode.MIDDLE, hexpand: true });
            const fileChooserButton = new Gtk.Button({ icon_name: 'folder-open-symbolic' });
            fileChooserBox.append(fileChooserLabel);
            fileChooserBox.append(fileChooserButton);
            // We store the chosen file path in a temporary variable
            let chosenFilePath = item.local_path || null;
            fileChooserButton.connect('clicked', () => {
                const dialog = new Gtk.FileChooserDialog({
                    title: 'Select PDF',
                    transient_for: this.get_root(),
                    action: Gtk.FileChooserAction.OPEN,
                });
                dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
                dialog.add_button('Open', Gtk.ResponseType.ACCEPT);
                dialog.connect('response', (_source, response_id) => {
                    if (response_id === Gtk.ResponseType.ACCEPT) {
                        const file = dialog.get_file();
                        chosenFilePath = file.get_path();
                        fileChooserLabel.set_label(chosenFilePath);
                    }
                    dialog.destroy();
                });
                dialog.present();
            });
            editGroup.add(new Adw.ActionRow({ title: 'PDF File Path', child: fileChooserBox }));
            // --- END FIX ---

            const bibtexKeyEntry = new Gtk.Entry({ text: (item.bibtex_key || '').toString(), placeholder_text: 'Bibtex Key' });
            editGroup.add(new Adw.ActionRow({ title: 'BibTeX Key', subtitle: 'Leave blank to auto-generate', child: bibtexKeyEntry }));

            const tagsEntry = new Gtk.Entry({ text: (item.tags || []).join(', '), placeholder_text: 'Tags (separate with a comma)' });
            editGroup.add(new Adw.ActionRow({ title: 'Tags', subtitle: 'Comma-separated', child: tagsEntry }));

            const abstractView = new Gtk.TextView({ vexpand: true, wrap_mode: Gtk.WrapMode.WORD_CHAR });
            abstractView.get_buffer().set_text(item.abstract || '', -1);
            const abstractScrolled = new Gtk.ScrolledWindow({ child: abstractView, min_content_height: 150 });
            const abstractExpander = new Adw.ExpanderRow({ title: 'Abstract', child: abstractScrolled });
            editGroup.add(abstractExpander);

            const notesView = new Gtk.TextView({ vexpand: true, wrap_mode: Gtk.WrapMode.WORD_CHAR });
            notesView.get_buffer().set_text(item.personal_notes || '', -1);
            const notesScrolled = new Gtk.ScrolledWindow({ child: notesView, min_content_height: 150 });
            const notesExpander = new Adw.ExpanderRow({ title: 'Personal Notes', child: notesScrolled });
            editGroup.add(notesExpander);

            const keyResultsExpander = new Adw.ExpanderRow({
                title: 'Key Results'
            });
            editGroup.add(keyResultsExpander);

            const keyResultsBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
            const keyResultsList = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
                css_classes: ['boxed-list'],
            });

            const buildKeyResultsList = (parentItem) => {
                keyResultsList.remove_all();
                (parentItem.key_items || []).forEach(kr => {
                    const row = new Adw.ActionRow({
                        title: kr.title,
                        subtitle: (kr.tags || []).join(', '),
                    });

                    const editKeyButton = new Gtk.Button({ icon_name: 'document-edit-symbolic' });
                    editKeyButton.connect('clicked', () => {
                        const dialog = new KeyResultDialog(this.get_root(), kr);
                        dialog.connect('submit', (_source, variant) => {
                            const variantDict = variant.deep_unpack();
                            const data = {
                                type: variantDict['type'].unpack(),
                                title: variantDict['title'].unpack(),
                                tags: variantDict['tags'].deep_unpack(),
                                number: variantDict['number'].unpack(),
                                page: variantDict['page'].unpack(),
                            };
                            this.library.updateKeyItem(parentItem.id, kr.id, data);
                            buildKeyResultsList(this.library.getEntryById(parentItem.id));
                        });
                        dialog.present();
                    });
                    row.add_suffix(editKeyButton);

                    const removeKeyButton = new Gtk.Button({ icon_name: 'edit-delete-symbolic' });
                    removeKeyButton.connect('clicked', () => {
                        this.library.removeKeyItem(parentItem.id, kr.id);
                        buildKeyResultsList(this.library.getEntryById(parentItem.id));
                    });
                    row.add_suffix(removeKeyButton);

                    keyResultsList.append(row);
                });
            };

            const addKeyButton = new Gtk.Button({
                label: 'Add Key Result...',
                halign: Gtk.Align.START,
                margin_top: 6,
                margin_bottom: 6,
            });
            addKeyButton.connect('clicked', () => {
                const dialog = new KeyResultDialog(this.get_root());
                dialog.connect('submit', (_source, variant) => {
                    const variantDict = variant.deep_unpack();
                    const data = {
                        type: variantDict['type'].unpack(),
                        title: variantDict['title'].unpack(),
                        tags: variantDict['tags'].deep_unpack(),
                        number: variantDict['number'].unpack(),
                        page: variantDict['page'].unpack(),
                    };
                    this.library.addKeyItem(item.id, data);
                    buildKeyResultsList(this.library.getEntryById(item.id));
                });
                dialog.present();
            });

            keyResultsBox.append(addKeyButton);
            keyResultsBox.append(keyResultsList);
            keyResultsExpander.add_row(keyResultsBox);
            buildKeyResultsList(item); // Initial population

            // --- Related Entries ---
            const relatedEditExpander = new Adw.ExpanderRow({
                title: 'Manage Related Entries'
            });
            editGroup.add(relatedEditExpander);

            const relatedEditBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
            relatedEditExpander.add_row(relatedEditBox);

            // Box for the search bar and results
            const searchBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
            const searchEntry = new Gtk.SearchEntry({ placeholder_text: 'Search to link another entry...' });
            const searchResultsBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
            const searchResultsScrolled = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                min_content_height: 150,
                child: searchResultsBox
            });
            searchBox.append(searchEntry);
            searchBox.append(searchResultsScrolled);
            relatedEditBox.append(searchBox);

            // List to show currently linked items
            const linkedItemsTitle = new Gtk.Label({ label: '<b>Currently Linked</b>', use_markup: true, xalign: 0, margin_top: 12 });
            const linkedItemsList = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
                css_classes: ['boxed-list'],
            });
            relatedEditBox.append(linkedItemsTitle);
            relatedEditBox.append(linkedItemsList);

            // Function to populate the list of currently linked items
            const buildLinkedItemsList = (currentItem) => {
                linkedItemsList.remove_all();
                (currentItem.related_entries || []).forEach(relatedId => {
                    const relatedItem = this.library.getEntryById(relatedId);
                    if (relatedItem) {
                        const row = new Adw.ActionRow({
                            title: relatedItem.title,
                        });
                        const removeButton = new Gtk.Button({ icon_name: 'edit-delete-symbolic' });
                        removeButton.connect('clicked', () => {
                            this.library.removeRelatedEntry(currentItem.id, relatedItem.id);
                            // Refresh the list immediately
                            const updatedItem = this.library.getEntryById(currentItem.id);
                            buildLinkedItemsList(updatedItem);
                        });
                        row.add_suffix(removeButton);
                        linkedItemsList.append(row);
                    }
                });
            };

            // Search logic
            searchEntry.connect('search-changed', () => {
                const query = searchEntry.get_text().toLowerCase();
                let child = searchResultsBox.get_first_child();
                while (child) {
                    searchResultsBox.remove(child);
                    child = searchResultsBox.get_first_child();
                }
                if (query.length > 2) {
                    const results = this.library.search({ query, fields: ['title'] });
                    results.forEach(resultItem => {
                        // Don't show the item itself or already linked items in search results
                        if (resultItem.id !== item.id && !(item.related_entries || []).includes(resultItem.id)) {
                            const row = new Adw.ActionRow({
                                title: resultItem.title,
                                subtitle: (resultItem.authors || []).join(', ')
                            });
                            const addButton = new Gtk.Button({ icon_name: 'list-add-symbolic' });
                            addButton.connect('clicked', () => {
                                this.library.addRelatedEntry(item.id, resultItem.id);
                                searchEntry.set_text(''); // Clear search
                                const updatedItem = this.library.getEntryById(item.id);
                                buildLinkedItemsList(updatedItem); // Refresh list
                            });
                            row.add_suffix(addButton);
                            searchResultsBox.append(row);
                        }
                    });
                }
            });

            buildLinkedItemsList(item); // Initial population of the linked items list

            const editScrolled = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                child: editGroup,
            });
            viewStack.add_named(editScrolled, 'edit');

            // --- Header Bar Button Logic ---
            const editButton = new Gtk.Button({ icon_name: 'document-edit-symbolic' });
            const saveButton = new Gtk.Button({ label: 'Save', css_classes: ['suggested-action'] });
            const cancelButton = new Gtk.Button({ label: 'Cancel' });
            header.pack_end(editButton);

            const switchToDisplayMode = () => {
                header.remove(saveButton);
                header.remove(cancelButton);
                header.pack_end(editButton);
                viewStack.set_visible_child_name('display');
            };
            editButton.connect('clicked', () => {
                header.remove(editButton);
                header.pack_start(cancelButton);
                header.pack_end(saveButton);
                viewStack.set_visible_child_name('edit');
            });
            cancelButton.connect('clicked', () => {
                buildLinkedItemsList(this.library.getEntryById(item.id));
                switchToDisplayMode();
            });

            saveButton.connect('clicked', () => {
                const notesBuffer = notesView.get_buffer();
                const newNotes = notesBuffer.get_text(notesBuffer.get_start_iter(), notesBuffer.get_end_iter(), true);
                const abstractBuffer = abstractView.get_buffer();
                const newAbstract = abstractBuffer.get_text(abstractBuffer.get_start_iter(), abstractBuffer.get_end_iter(), true);
                const statusRaw = statusSelector.get_selected_item()?.get_string() || 'To Read';
                const entryTypeRaw = entryTypeSelector.get_selected_item()?.get_string() || 'Other';

                // This is the complete object that replaces the placeholder comment
                const updatedItem = this.library.updateEntry(item.id, {
                    entry_type: entryTypeRaw.toLowerCase().replace(' ', '-'),
                    title: titleEntry.get_text(),
                    authors: authorsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean),
                    status: statusRaw.toLowerCase().replace(' ', '-'),
                    date: {
                        year: parseInt(yearEntry.get_text()) || null,
                        month: parseInt(monthEntry.get_text()) || null,
                        day: parseInt(dayEntry.get_text()) || null
                    },
                    publication_info: pubEntry.get_text(),
                    web_link: webLinkEntry.get_text() || null,
                    local_path: chosenFilePath,
                    bibtex_key: bibtexKeyEntry.get_text() || null,
                    abstract: newAbstract,
                    personal_notes: newNotes,
                    tags: tagsEntry.get_text().split(',').map(s => s.trim()).filter(Boolean)
                });

                if (updatedItem) {
                    // Rebuild the display view with ALL updated data
                    const newDisplayView = buildDisplayView(updatedItem);
                    viewStack.remove(displayView);
                    viewStack.add_named(newDisplayView, 'display');
                    displayView = newDisplayView; // Update the reference
                    header.get_title_widget().set_title(updatedItem.title);
                    header.get_title_widget().set_subtitle(`${updatedItem.date.year} - ${updatedItem.authors[0] || ''}`);
                    this._onSearchChanged();
                }

                switchToDisplayMode();
            });

            return mainDetailBox;
        }
    }
);

var exports = { LibraryPage };