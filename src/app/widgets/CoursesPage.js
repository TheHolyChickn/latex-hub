// src/app/widgets/CoursesPage.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;
const RofiManager = imports.core.RofiManager;
const { NewHomeworkDialog } = imports.app.widgets.NewHomeworkDialog;

var CoursesPage = GObject.registerClass(
    {
        GTypeName: 'CoursesPage',
    },
    class CoursesPage extends Gtk.Box {
        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
                vexpand: true,
            });

            this.courses = new Courses();
            this.homeworks = new Homeworks(this.courses);

            const splitView = new Adw.NavigationSplitView({
                hexpand: true,
                vexpand: true,
            });
            this.append(splitView);

            this.viewStack = new Adw.ViewStack();
            this.courseListBox = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.SINGLE,
                css_classes: ['navigation-sidebar'],
            });

            const scrolledSidebar = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                child: this.courseListBox,
            });

            splitView.set_sidebar(new Adw.NavigationPage({
                title: 'Courses',
                child: scrolledSidebar,
            }));

            splitView.set_content(new Adw.NavigationPage({
                title: 'Course Details',
                child: this.viewStack,
            }));

            const placeholder = new Adw.StatusPage({
                icon_name: 'notebook-symbolic',
                title: 'Select a Course',
                description: 'Choose a course from the list to see its details.',
            });
            this.viewStack.add_named(placeholder, 'placeholder');

            this._populateCourseList();

            this.courseListBox.connect('row-selected', (box, row) => {
                if (row) {
                    this._onCourseSelected(row);
                }
            });
        }

        _populateCourseList() {
            this.courseListBox.remove_all();
            const courseNames = this.courses.coursesList.map(course => course.name) || [];

            if (courseNames.length === 0) {
                const row = new Gtk.ListBoxRow();
                row.set_child(new Gtk.Label({
                    label: "No courses configured.",
                    margin_top: 12, margin_bottom: 12,
                    margin_start: 12, margin_end: 12
                }));
                this.courseListBox.append(row);
                return;
            }

            courseNames.forEach(name => {
                const row = new Gtk.ListBoxRow();
                row.course_name = name;
                row.set_child(new Gtk.Label({
                    label: name.replace(/-/g, ' '),
                    margin_top: 12, margin_bottom: 12,
                    margin_start: 12, margin_end: 12,
                    halign: Gtk.Align.START
                }));
                this.courseListBox.append(row);
            });
        }

        _onCourseSelected(row) {
            const courseName = row.course_name;
            if (!courseName) return;

            let detailPage = this.viewStack.get_child_by_name(courseName);

            if (!detailPage) {
                const course = this.courses.findByName(courseName);
                if (course) {
                    detailPage = this._createCourseDetailPage(course);
                    this.viewStack.add_named(detailPage, courseName);
                } else {
                    console.error(`Could not find course object for: ${courseName}`);
                    return;
                }
            }
            this.viewStack.set_visible_child_name(courseName);
        }

        _createCourseDetailPage(course) {
            const grid = new Gtk.Grid({
                column_spacing: 20, row_spacing: 20,
                margin_top: 24, margin_bottom: 24,
                margin_start: 24, margin_end: 24,
                column_homogeneous: true,
            });

            grid.attach(this._buildInfoPanel(course), 0, 0, 1, 1);
            grid.attach(this._buildLecturesPanel(course), 0, 1, 1, 1);
            grid.attach(this._buildHomeworksPanel(course), 1, 0, 1, 2);
            grid.attach(this._buildGradesPanel(), 2, 0, 1, 2);

            return new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vexpand: true,
                child: grid,
            });
        }

        _buildInfoPanel(course) {
            const frame = new Gtk.Frame({
                label: 'Course Information',
                css_classes: ['dashboard-card'],
            });
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10, margin_bottom: 10,
                margin_start: 10, margin_end: 10
            });
            frame.set_child(box);

            box.append(new Adw.ActionRow({ title: 'Title', subtitle: course.info.title || 'N/A' }));
            box.append(new Adw.ActionRow({ title: 'Professor', subtitle: course.info.professor || 'N/A' }));

            const activeRow = new Adw.ActionRow({ title: 'Set as Active Course'});
            const activeButton = new Gtk.Button({ icon_name: 'emblem-ok-symbolic', valign: Gtk.Align.CENTER });
            activeButton.connect('clicked', () => {
                this.courses.current = course;
                console.log(`Set active course to: ${course.name}`);
            });
            activeRow.add_suffix(activeButton);
            box.append(activeRow);

            return frame;
        }

        _createLectureRow(lec) {
            const row = new Adw.ActionRow({ title: `Lec ${lec.number}`, subtitle: lec.title });
            const editButton = new Gtk.Button({ icon_name: 'document-edit-symbolic', valign: Gtk.Align.CENTER });
            editButton.connect('clicked', () => lec.edit());
            row.add_suffix(editButton);
            return row;
        }

        _buildLecturesPanel(course) {
            const frame = new Gtk.Frame({
                label: 'Lectures',
                css_classes: ['dashboard-card'],
                vexpand: true,
            });
            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10, margin_bottom: 10,
                margin_start: 10, margin_end: 10
            });
            frame.set_child(mainBox);

            const newButton = new Gtk.Button({ label: 'New', halign: Gtk.Align.END });
            mainBox.append(newButton);

            const scrolled = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vexpand: true,
                min_content_height: 200,
            });
            const contentBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 5 });
            scrolled.set_child(contentBox);

            course.lectures.lecturesList.slice().reverse().forEach(lec => {
                contentBox.append(this._createLectureRow(lec));
            });

            newButton.connect('clicked', () => {
                const newLecture = course.lectures.newLecture();
                if (newLecture) {
                    newLecture.edit();
                    contentBox.prepend(this._createLectureRow(newLecture));
                }
            });

            mainBox.append(scrolled);
            return frame;
        }

        _createHomeworkRow(hw) {
            const row = new Adw.ActionRow({ title: hw.name, subtitle: `Due: ${hw.date}` });

            const editButton = new Gtk.Button({ icon_name: 'document-edit-symbolic', valign: Gtk.Align.CENTER });
            editButton.connect('clicked', () => hw.openHomework());

            const completeButton = new Gtk.Button({ icon_name: 'object-select-symbolic', valign: Gtk.Align.CENTER });
            completeButton.connect('clicked', () => {
                this.homeworks.completeHomework(hw.course.name, hw.number);
                hw.status = true;

                const contentBox = row.get_parent();
                if (contentBox) {
                    // **THE FIX:** Defer the UI refresh until the event handler is complete.
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        this._populateHomeworkList(contentBox, hw.course.name);
                        return GLib.SOURCE_REMOVE; // Ensures the function runs only once
                    });
                }
            });

            if (hw.status) {
                row.add_css_class('dim-label');
                row.set_icon_name('emblem-ok-symbolic');
            } else {
                row.add_suffix(editButton);
                row.add_suffix(completeButton);
            }

            return row;
        }

        _populateHomeworkList(contentBox, courseName) {
            let child = contentBox.get_first_child();
            while (child) {
                contentBox.remove(child);
                child = contentBox.get_first_child();
            }

            const parseDate = (dateStr) => {
                if (!dateStr || typeof dateStr !== 'string') return null;
                const parts = dateStr.split('/');
                if (parts.length !== 3) return null;
                return new Date(`20${parts[2]}`, parts[0] - 1, parts[1]);
            };

            const allHws = this.homeworks.assignments[courseName] || [];

            const incompleteHws = allHws.filter(hw => !hw.status);
            const completedHws = allHws.filter(hw => hw.status);

            incompleteHws.sort((a, b) => {
                const dateA = parseDate(a.date);
                const dateB = parseDate(b.date);
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateA - dateB;
            });

            const sortedHws = [...incompleteHws, ...completedHws];

            sortedHws.forEach(hw => {
                contentBox.append(this._createHomeworkRow(hw));
            });
        }

        _buildHomeworksPanel(course) {
            const frame = new Gtk.Frame({
                label: 'Homework',
                css_classes: ['dashboard-card'],
                vexpand: true,
            });
            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10, margin_bottom: 10,
                margin_start: 10, margin_end: 10
            });
            frame.set_child(mainBox);

            const newButton = new Gtk.Button({ label: 'New', halign: Gtk.Align.END });
            mainBox.append(newButton);

            const scrolled = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER, vexpand: true });
            const contentBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 5 });
            scrolled.set_child(contentBox);

            this._populateHomeworkList(contentBox, course.name);

            newButton.connect('clicked', () => {
                const dialog = new NewHomeworkDialog(this.get_root(), this.courses);

                dialog.connect('submit', (_source, variant) => {
                    const variantDict = variant.deep_unpack();

                    const newItemData = {
                        name:     variantDict.name.deep_unpack(),
                        date:     variantDict.date.deep_unpack(),
                        preamble: variantDict.preamble.deep_unpack(),
                        status:   variantDict.status.deep_unpack(),
                    };

                    this.homeworks.addHomework(
                        variantDict.courseName.deep_unpack(),
                        newItemData
                    );

                    this._populateHomeworkList(contentBox, course.name);
                });

                dialog.present();
            });

            mainBox.append(scrolled);
            return frame;
        }

        _buildGradesPanel() {
            const frame = new Gtk.Frame({
                label: 'Grades',
                css_classes: ['dashboard-card'],
                vexpand: true,
            });
            const placeholder = new Adw.StatusPage({
                icon_name: 'chart-multitype-symbolic',
                title: 'Grades',
                description: 'This feature is coming soon.',
                vexpand: true,
                css_classes: ['compact'],
            });
            frame.set_child(placeholder);
            return frame;
        }
    }
);

var exports = { CoursesPage };