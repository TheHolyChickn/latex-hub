'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib, Gio } = imports.gi;

const { ConfigManager } = imports.config.ConfigManager;
const { PreambleUtils } = imports.config.PreambleUtils;
const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;

var NewSemesterDialog = GObject.registerClass(
    {
        GTypeName: 'NewSemesterDialog',
        Signals: {
            'setup-complete': {},
        },
    },
    class NewSemesterDialog extends Adw.Window {
        _init(parent) {
            super._init({
                modal: true,
                transient_for: parent,
                width_request: 800,
                default_height: 600,
                hide_on_close: true,
            });

            this.semesterData = {
                root_dir: null,
                courses: [],
            };
            this.currentCourseIndex = 0;

            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
            });
            this.set_content(mainBox);

            this.headerBar = new Adw.HeaderBar({
                title_widget: new Adw.WindowTitle({ title: 'Set Up New Semester' }),
            });
            mainBox.append(this.headerBar);

            this.viewStack = new Adw.ViewStack();
            mainBox.append(this.viewStack);

            const page1 = this._createSelectDirectoryPage();
            this.viewStack.add_named(page1, 'page1');

            const page2 = this._createAddCoursesPage();
            this.viewStack.add_named(page2, 'page2');

            const page3 = this._createCourseConfigPage();
            this.viewStack.add_named(page3, 'page3');

            this.viewStack.set_visible_child_name('page1');
        }

        _createSelectDirectoryPage() {
            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 20, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, hexpand: true, vexpand: true });
            const statusPage = new Adw.StatusPage({ icon_name: 'folder-open-symbolic', title: 'Select a Semester Folder', description: 'Choose a main folder to store all of your course directories for the new semester.' });
            box.append(statusPage);
            const selectFolderButton = new Gtk.Button({ label: 'Choose a Folder...', css_classes: ['suggested-action'], halign: Gtk.Align.CENTER });
            selectFolderButton.connect('clicked', this._onSelectFolderClicked.bind(this));
            box.append(selectFolderButton);
            return box;
        }

        _onSelectFolderClicked() {
            const dialog = new Gtk.FileChooserDialog({ title: 'Select Semester Folder', transient_for: this, action: Gtk.FileChooserAction.SELECT_FOLDER });
            dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
            dialog.add_button('Select', Gtk.ResponseType.ACCEPT);
            dialog.connect('response', (_source, response_id) => {
                if (response_id === Gtk.ResponseType.ACCEPT) {
                    this.semesterData.root_dir = dialog.get_file().get_path();
                    this._updateHeader('page2');
                    this.viewStack.set_visible_child_name('page2');
                }
                dialog.destroy();
            });
            dialog.present();
        }

        _createAddCoursesPage() {
            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 });
            const entryBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
            const courseEntry = new Gtk.Entry({ placeholder_text: 'e.g., Advanced Electromagnetism', hexpand: true });
            entryBox.append(courseEntry);
            const addButton = new Gtk.Button({ label: 'Add', css_classes: ['suggested-action'] });
            entryBox.append(addButton);
            box.append(entryBox);

            const scrolledWindow = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, vexpand: true });
            box.append(scrolledWindow);
            const coursesListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
            scrolledWindow.set_child(coursesListBox);

            const addCourseAction = () => {
                const courseName = courseEntry.get_text().trim();
                if (courseName && !this.semesterData.courses.some(c => c.name === courseName)) {
                    this.semesterData.courses.push({ name: courseName, config: {}, preamble: {} });
                    const row = new Adw.ActionRow({ title: courseName });
                    const removeButton = new Gtk.Button({ icon_name: 'edit-delete-symbolic' });
                    row.add_suffix(removeButton);

                    removeButton.connect('clicked', () => {
                        this.semesterData.courses = this.semesterData.courses.filter(c => c.name !== courseName);
                        coursesListBox.remove(row);
                    });

                    coursesListBox.append(row);
                    courseEntry.set_text('');
                }
                courseEntry.grab_focus();
            };

            addButton.connect('clicked', addCourseAction);
            courseEntry.connect('activate', addCourseAction);

            this.page2Nav = {
                back: new Gtk.Button({ label: 'Back' }),
                next: new Gtk.Button({ label: 'Next' }),
            };
            this.page2Nav.back.connect('clicked', () => { this._updateHeader(null); this.viewStack.set_visible_child_name('page1'); });
            this.page2Nav.next.connect('clicked', () => {
                if (this.semesterData.courses.length > 0) {
                    this.currentCourseIndex = 0;
                    this._populateCourseConfigPage(this.currentCourseIndex);
                    this._updateHeader('page3');
                    this.viewStack.set_visible_child_name('page3');
                }
            });
            return box;
        }

        _createCourseConfigPage() {
            const grid = new Gtk.Grid({
                column_spacing: 20,
                row_spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
                column_homogeneous: true,
            });
            const scrolled = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, child: grid });

            const infoGroup = new Adw.PreferencesGroup({ title: 'Course Information' });
            grid.attach(infoGroup, 0, 0, 1, 1);

            this.conf = {
                title: new Gtk.Entry({ placeholder_text: 'Full course title...' }),
                shortName: new Gtk.Entry({ max_length: 7, placeholder_text: 'Short name for display...' }),
                courseId: new Gtk.Entry({ placeholder_text: 'Course identifier...' }),
                professor: new Gtk.Entry({ placeholder_text: 'Professor\'s name...' }),
                syllabus: new Gtk.Entry({ placeholder_text: 'URL or local file path...' }),
                officeHours: new Gtk.Entry({ placeholder_text: 'Office hours...' }),
                coursePage: new Gtk.Entry({ placeholder_text: 'URL for Canvas, etc...' }),
            };
            infoGroup.add(new Adw.ActionRow({ title: 'Title', child: this.conf.title }));
            infoGroup.add(new Adw.ActionRow({ title: 'Short Name', child: this.conf.shortName }));
            infoGroup.add(new Adw.ActionRow({ title: 'Course ID', child: this.conf.courseId }));
            infoGroup.add(new Adw.ActionRow({ title: 'Professor', child: this.conf.professor }));
            infoGroup.add(new Adw.ActionRow({ title: 'Syllabus', child: this.conf.syllabus }));
            infoGroup.add(new Adw.ActionRow({ title: 'Office Hours', child: this.conf.officeHours }));
            infoGroup.add(new Adw.ActionRow({ title: 'Course Page', child: this.conf.coursePage }));

            const preambleGroup = new Adw.PreferencesGroup({ title: 'Homework Preamble Setup' });
            grid.attach(preambleGroup, 1, 0, 1, 1);

            const preambleBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
            preambleGroup.add(preambleBox);

            const templatesSearchEntry = new Gtk.SearchEntry({ placeholder_text: 'Search Templates...' });
            preambleBox.append(templatesSearchEntry);
            const templatesScrolled = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, min_content_height: 150, vexpand: true });
            preambleBox.append(templatesScrolled);
            this.templatesListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
            templatesScrolled.set_child(this.templatesListBox);

            const preamblesSearchEntry = new Gtk.SearchEntry({ placeholder_text: 'Search Preambles...' });
            preambleBox.append(preamblesSearchEntry);
            const preamblesScrolled = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, min_content_height: 150, vexpand: true });
            preambleBox.append(preamblesScrolled);
            this.preamblesListBox = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
            preamblesScrolled.set_child(this.preamblesListBox);

            templatesSearchEntry.connect('search-changed', () => {
                const query = templatesSearchEntry.get_text().toLowerCase();
                this.templatesListBox.set_filter_func(row => {
                    if (!query) return true;
                    return row.template_name.toLowerCase().includes(query) || row.template_preambles.some(p => p.toLowerCase().includes(query));
                });
            });

            preamblesSearchEntry.connect('search-changed', () => {
                const query = preamblesSearchEntry.get_text().toLowerCase();
                this.preamblesListBox.set_filter_func(row => {
                    if (!query) return true;
                    return row.preamble_data.file_name.toLowerCase().includes(query) ||
                        row.preamble_data.description.toLowerCase().includes(query) ||
                        (row.preamble_data.tags || []).some(t => t.toLowerCase().includes(query));
                });
            });

            this.page3Nav = {
                back: new Gtk.Button({ label: 'Back' }),
                next: new Gtk.Button({ label: 'Next Course' }),
            };
            this.page3Nav.back.connect('clicked', async () => {
                await this._saveCurrentCourseConfig();
                this.currentCourseIndex--;
                if (this.currentCourseIndex < 0) {
                    this._updateHeader('page2');
                    this.viewStack.set_visible_child_name('page2');
                } else {
                    this._populateCourseConfigPage(this.currentCourseIndex);
                }
            });
            this.page3Nav.next.connect('clicked', async () => {
                await this._saveCurrentCourseConfig();
                this.currentCourseIndex++;
                if (this.currentCourseIndex >= this.semesterData.courses.length) {
                    this._finalizeSemesterSetup();
                } else {
                    this._populateCourseConfigPage(this.currentCourseIndex);
                }
            });
            return scrolled;
        }

        _populateCourseConfigPage(index) {
            const course = this.semesterData.courses[index];
            this.headerBar.get_title_widget().set_subtitle(`Configuring: ${course.name}`);

            this.conf.title.set_text(course.config.title || course.name);
            this.conf.shortName.set_text(course.config.short || course.name.substring(0, 7));
            this.conf.courseId.set_text(course.config.course_id || '');
            this.conf.professor.set_text(course.config.professor || '');
            this.conf.syllabus.set_text(course.config.syllabus_link || '');
            this.conf.officeHours.set_text(course.config.office_hours || '');
            this.conf.coursePage.set_text(course.config.course_page_link || '');

            this._populatePreambleLists();

            if (index === this.semesterData.courses.length - 1) {
                this.page3Nav.next.set_label('Finish Setup');
            } else {
                this.page3Nav.next.set_label('Next Course');
            }
        }

        _populatePreambleLists() {
            this.templatesListBox.remove_all();
            this.preamblesListBox.remove_all();

            const allTemplates = PreambleUtils.getAllTemplates();
            for (const name in allTemplates) {
                const row = new Adw.ActionRow({ title: name, subtitle: allTemplates[name].join(', ') });
                row.set_activatable(true);
                row.template_name = name;
                row.template_preambles = allTemplates[name];
                this.templatesListBox.append(row);

                row.connect('activated', () => {
                    const isSelected = row.has_css_class('selected');
                    let child = this.templatesListBox.get_first_child();
                    while (child) {
                        child.remove_css_class('selected');
                        child = child.get_next_sibling();
                    }
                    if (!isSelected) {
                        row.add_css_class('selected');
                    }
                });
            }

            const allPreambles = PreambleUtils.getAllPreambleSnippets();
            allPreambles.forEach(p => {
                const row = new Adw.ActionRow({ title: p.file_name, subtitle: p.description });
                row.set_activatable(true);
                row.preamble_data = p;
                this.preamblesListBox.append(row);

                row.connect('activated', () => {
                    if (row.has_css_class('selected')) {
                        row.remove_css_class('selected');
                    } else {
                        row.add_css_class('selected');
                    }
                });
            });
        }

        async _saveCurrentCourseConfig() {
            if (this.currentCourseIndex < 0 || this.currentCourseIndex >= this.semesterData.courses.length) {
                return;
            }
            const course = this.semesterData.courses[this.currentCourseIndex];

            course.config = {
                title: this.conf.title.get_text(),
                short: this.conf.shortName.get_text(),
                course_id: this.conf.courseId.get_text(),
                professor: this.conf.professor.get_text(),
                syllabus_link: this.conf.syllabus.get_text(),
                office_hours: this.conf.officeHours.get_text(),
                course_page_link: this.conf.coursePage.get_text(),
                homework_preambles: [],
                report_preambles: [],
            };

            let selectedTemplateRow = null;
            let child = this.templatesListBox.get_first_child();
            while(child) {
                if (child.has_css_class('selected')) {
                    selectedTemplateRow = child;
                    break;
                }
                child = child.get_next_sibling();
            }

            const selectedPreambleRows = [];
            child = this.preamblesListBox.get_first_child();
            while(child) {
                if (child.has_css_class('selected')) {
                    selectedPreambleRows.push(child);
                }
                child = child.get_next_sibling();
            }

            let finalPreambleSet = new Set();
            if (selectedTemplateRow) {
                selectedTemplateRow.template_preambles.forEach(p => finalPreambleSet.add(p));
            }
            selectedPreambleRows.forEach(r => finalPreambleSet.add(r.preamble_data.file_name));

            if (finalPreambleSet.size > 0) {
                if (selectedPreambleRows.length > 0) {
                    let templateName = `${course.name}-homework`;
                    if (PreambleUtils.getTemplatePreambleFileNames(templateName)) {
                        templateName = await this._promptForTemplateName(templateName);
                    }
                    if(templateName) {
                        PreambleUtils.createTemplate(templateName, Array.from(finalPreambleSet));
                        course.config.homework_preambles = [templateName];
                    }
                } else if(selectedTemplateRow) {
                    course.config.homework_preambles = [selectedTemplateRow.template_name];
                }
            }
        }

        async _promptForTemplateName(defaultName) { // TODO: should also look for report-style templates
            return new Promise(resolve => {
                const dialog = new Adw.MessageDialog({
                    transient_for: this,
                    modal: true,
                    heading: 'Template Name Conflict',
                    body: `A template named "${defaultName}" already exists. Please enter a new name.`,
                });
                const entry = new Gtk.Entry({ text: `${defaultName}-1` });
                dialog.set_extra_child(entry);
                dialog.add_response('cancel', 'Cancel');
                dialog.add_response('ok', 'Save');
                dialog.set_default_response('ok');
                dialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);

                dialog.connect('response', (_source, response) => {
                    if (response === 'ok') {
                        resolve(entry.get_text().trim());
                    } else {
                        resolve(null);
                    }
                    dialog.destroy();
                });
                dialog.present();
            });
        }

        _generateMasterTexContent(courseConfig) { // TODO: preamble should be default lecs preamble
            const preambleTemplateName = (courseConfig.homework_preambles && courseConfig.homework_preambles.length > 0) ? courseConfig.homework_preambles[0] : null;
            const preambleInputs = preambleTemplateName ? PreambleUtils.assemblePreambleFromTemplate(preambleTemplateName) : '';

            const lines = [
                '\\documentclass[11pt, letterpaper]{report}',
                preambleInputs,
                '\\usepackage{titlepageBU}',
                `\\title{${courseConfig.title || ''}}`,
                `\\courseID{${courseConfig.course_id || ''}}`,
                `\\professor{${courseConfig.professor || ''}}`,
                '\\begin{document}',
                '    \\maketitle',
                '    \\tableofcontents',
                '    % start lectures',
                '    % end lectures',
                '\\end{document}'
            ];

            return lines.filter(line => line !== null).join('\n');
        }

        _finalizeSemesterSetup() {
            console.log("Finalizing semester setup...");
            try {
                // 1. Update main config
                const mainConfig = ConfigManager.loadConfig();
                mainConfig.root_dir = this.semesterData.root_dir;
                mainConfig.current_courses = this.semesterData.courses.map(c => c.name);
                ConfigManager.saveConfig(mainConfig);

                // 2. Create directories and files for each course
                for (const course of this.semesterData.courses) {
                    const courseDir = Gio.File.new_for_path(GLib.build_filenamev([this.semesterData.root_dir, course.name]));
                    courseDir.make_directory_with_parents(null);

                    courseDir.get_child('figures').make_directory(null);
                    courseDir.get_child('Homework').make_directory(null);

                    const infoFile = courseDir.get_child('info.json');
                    const infoContent = JSON.stringify(course.config, null, 4);
                    infoFile.replace_contents(infoContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

                    const masterFile = courseDir.get_child('master.tex');
                    const masterContent = this._generateMasterTexContent(course.config);
                    masterFile.replace_contents(masterContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

                    courseDir.get_child('master.tex.latexmain').replace_contents('', null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                }

                // 3. Initialize homeworks.json directly from semester data
                const homeworksFile = Gio.File.new_for_path(GLib.build_filenamev([this.semesterData.root_dir, 'homeworks.json']));
                const initialHomeworksData = {};
                for (const course of this.semesterData.courses) {
                    initialHomeworksData[course.name] = {};
                }
                const homeworksContent = JSON.stringify(initialHomeworksData, null, 4);
                homeworksFile.replace_contents(homeworksContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

                console.log("Setup complete!");
                this.emit('setup-complete');
                this.close();

            } catch (e) {
                console.error(`Failed during finalization: ${e.message}`);
                this._showErrorDialog(`An error occurred during setup: ${e.message}`);
            }
        }

        _showErrorDialog(message) {
            const dialog = new Adw.MessageDialog({
                transient_for: this,
                modal: true,
                heading: 'Setup Failed',
                body: message,
            });
            dialog.add_response('ok', 'OK');
            dialog.set_default_response('ok');
            dialog.present();
        }

        _updateHeader(page) {
            if (this.page2Nav?.back.get_parent()) this.headerBar.remove(this.page2Nav.back);
            if (this.page2Nav?.next.get_parent()) this.headerBar.remove(this.page2Nav.next);
            if (this.page3Nav?.back.get_parent()) this.headerBar.remove(this.page3Nav.back);
            if (this.page3Nav?.next.get_parent()) this.headerBar.remove(this.page3Nav.next);

            if (page === 'page2') {
                this.headerBar.pack_start(this.page2Nav.back);
                this.headerBar.pack_end(this.page2Nav.next);
            } else if (page === 'page3') {
                this.headerBar.pack_start(this.page3Nav.back);
                this.headerBar.pack_end(this.page3Nav.next);
            }
        }
    }
);

var exports = { NewSemesterDialog };