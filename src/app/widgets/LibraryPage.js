// src/app/widgets/LibraryPage.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, Gdk, Pango } = imports.gi;

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

                const displayScrolled = new Gtk.ScrolledWindow({
                    hscrollbar_policy: Gtk.PolicyType.NEVER,
                    child: displayBox,
                    vexpand: true,
                });
                return displayScrolled;
            };

            let displayView = buildDisplayView(item);
            viewStack.add_named(displayView, 'display');

            // --- Build the FINAL Edit View ---
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
            cancelButton.connect('clicked', switchToDisplayMode);

            saveButton.connect('clicked', () => {
                const notesBuffer = notesView.get_buffer();
                const newNotes = notesBuffer.get_text(notesBuffer.get_start_iter(), notesBuffer.get_end_iter(), true);
                const abstractBuffer = abstractView.get_buffer();
                const newAbstract = abstractBuffer.get_text(abstractBuffer.get_start_iter(), abstractBuffer.get_end_iter(), true);
                const statusRaw = statusSelector.get_selected_item()?.get_string() || 'To Read';
                const entryTypeRaw = entryTypeSelector.get_selected_item()?.get_string() || 'Other';

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
                    const newDisplayView = buildDisplayView(updatedItem);
                    viewStack.remove(displayView);
                    viewStack.add_named(newDisplayView, 'display');
                    displayView = newDisplayView;
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