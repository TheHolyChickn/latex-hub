'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

const { Courses } = imports.core.Courses;
const RofiManager = imports.core.RofiManager;

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
            const courseNames = this.courses.coursesList.map(course => course.name) || [];

            if (courseNames.length === 0) {
                const row = new Gtk.ListBoxRow();
                row.set_child(new Gtk.Label({
                    label: "No courses configured.",
                    margin_top: 12,
                    margin_bottom: 12,
                    margin_start: 12,
                    margin_end: 12
                }));
                this.courseListBox.append(row);
                return;
            }

            courseNames.forEach(name => {
                const row = new Gtk.ListBoxRow();
                row.course_name = name;
                row.set_child(new Gtk.Label({
                    label: name.replace(/-/g, ' '),
                    margin_top: 12,
                    margin_bottom: 12,
                    margin_start: 12,
                    margin_end: 12,
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
            // **THE FIX: Replicate the successful Dashboard structure**

            // 1. The root widget is a ScrolledWindow to allow for scrolling.
            const scrolled = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vexpand: true,
            });

            // 2. Inside it, a Box holds all the content. This is the key.
            const contentBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 15,
                margin_top: 24, margin_bottom: 24,
                margin_start: 24, margin_end: 24,
            });
            scrolled.set_child(contentBox);

            // --- Information Section ---
            // Use a simple styled Label as a title.
            const infoTitle = new Gtk.Label({
                label: "<b>Course Information</b>",
                use_markup: true,
                halign: Gtk.Align.START,
                css_classes: ['title-4'],
                margin_bottom: 5,
            });
            contentBox.append(infoTitle);

            // Add ActionRows directly to the contentBox.
            contentBox.append(new Adw.ActionRow({ title: 'Title', subtitle: course.info.title || 'N/A' }));
            contentBox.append(new Adw.ActionRow({ title: 'Professor', subtitle: course.info.professor || 'N/A' }));
            contentBox.append(new Adw.ActionRow({ title: 'Course ID', subtitle: course.info.course_id || 'N/A' }));

            // --- Actions Section ---
            contentBox.append(new Gtk.Separator({ margin_top: 15, margin_bottom: 15 }));

            const actionsTitle = new Gtk.Label({
                label: "<b>Actions</b>",
                use_markup: true,
                halign: Gtk.Align.START,
                css_classes: ['title-4'],
                margin_bottom: 5,
            });
            contentBox.append(actionsTitle);

            const lecturesRow = new Adw.ActionRow({ title: 'Lectures' });
            const lecturesButton = new Gtk.Button({ icon_name: 'media-playlist-repeat-symbolic', valign: Gtk.Align.CENTER });
            lecturesButton.connect('clicked', () => {
                this.courses.current = course;
                RofiManager.selectLecture();
            });
            lecturesRow.add_suffix(lecturesButton);
            contentBox.append(lecturesRow);

            const homeworksRow = new Adw.ActionRow({ title: 'Homeworks' });
            const homeworksButton = new Gtk.Button({ icon_name: 'document-edit-symbolic', valign: Gtk.Align.CENTER });
            homeworksButton.connect('clicked', () => {
                this.courses.current = course;
                RofiManager.manageHomework();
            });
            homeworksRow.add_suffix(homeworksButton);
            contentBox.append(homeworksRow);

            const gradesRow = new Adw.ActionRow({ title: 'Grades', subtitle: 'Coming soon!' });
            gradesRow.set_activatable(false);
            contentBox.append(gradesRow);

            const configRow = new Adw.ActionRow({ title: 'Edit Config' });
            const configButton = new Gtk.Button({ icon_name: 'document-properties-symbolic', valign: Gtk.Align.CENTER });
            configButton.connect('clicked', () => {
                const infoFilePath = GLib.build_filenamev([course.path.get_path(), 'info.json']);
                try {
                    GLib.spawn_command_line_async(`xdg-open "${infoFilePath}"`);
                } catch(e) {
                    console.error(`Failed to open info.json: ${e.message}`);
                }
            });
            configRow.add_suffix(configButton);
            contentBox.append(configRow);

            // 3. Return the root ScrolledWindow.
            return scrolled;
        }
    }
);

var exports = { CoursesPage };