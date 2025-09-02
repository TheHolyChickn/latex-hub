'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;
const Countdown = imports.core.Countdown;
const { ConfigUtils } = imports.config.ConfigUtils;
const {  NewSemesterDialog } = imports.app.widgets.NewSemesterDialog;

var DashboardPage = GObject.registerClass(
    {
        GTypeName: 'DashboardPage',
    },
    class DashboardPage extends Gtk.Box {
        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 20,
                margin_top: 20,
                margin_bottom: 20,
                margin_start: 20,
                margin_end: 20,
            });

            this.courses = new Courses();
            this.homeworks = new Homeworks(this.courses);

            const mainGrid = new Gtk.Grid({
                column_spacing: 20,
                row_spacing: 20,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
                row_homogeneous: true,
                column_homogeneous: true,
            });
            this.append(mainGrid);

            this._buildTodaySchedule(mainGrid);
            this._buildHomeworkSchedule(mainGrid);
            this._buildCourseProgress(mainGrid);
            this._buildGitStatusPlaceholder(mainGrid);
        }

        _buildTodaySchedule(grid) {
            const frame = new Gtk.Frame({
                label: "Today's Schedule",
                css_classes: ['dashboard-card'],
                hexpand: true,
                vexpand: true,
            });
            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                min_content_height: 150,
                vexpand: true,
            });
            frame.set_child(scrolledWindow);

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10,
                margin_bottom: 10,
                margin_start: 10,
                margin_end: 10,
            });
            scrolledWindow.set_child(box);


            Countdown.fetchTodaysEvents(events => {
                if (events.length === 0) {
                    box.append(new Gtk.Label({ label: "No events scheduled for today.", halign: Gtk.Align.CENTER, css_classes: ['dim-label'] }));
                    return;
                }
                events.forEach(event => {
                    // **FIX HERE: Changed %H to %I and added %p for AM/PM**
                    const time = event.start.format('%I:%M %p');
                    const label = new Gtk.Label({
                        label: `<b>${time}</b> - ${event.summary}`,
                        use_markup: true,
                        halign: Gtk.Align.START,
                    });
                    box.append(label);
                });
            });

            grid.attach(frame, 0, 0, 1, 1);
        }

        _buildHomeworkSchedule(grid) {
            const frame = new Gtk.Frame({
                label: "Upcoming Homework",
                css_classes: ['dashboard-card'],
                hexpand: true,
                vexpand: true,
            });
            const scrolledWindow = new Gtk.ScrolledWindow({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                min_content_height: 150,
                vexpand: true,
            });
            frame.set_child(scrolledWindow);

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10,
                margin_bottom: 10,
                margin_start: 10,
                margin_end: 10,
            });
            scrolledWindow.set_child(box);

            const incompleteHW = this.homeworks.getSortedIncompleteHomeworks();

            if (incompleteHW.length === 0) {
                box.append(new Gtk.Label({ label: "No pending homework!", halign: Gtk.Align.CENTER, css_classes: ['dim-label'] }));
            } else {
                incompleteHW.forEach(hw => {
                    const label = new Gtk.Label({
                        label: `<b>${hw.name}</b> (${hw.course.info.short}) - Due ${hw.date}`,
                        use_markup: true,
                        halign: Gtk.Align.START,
                    });
                    box.append(label);
                });
            }
            grid.attach(frame, 1, 0, 1, 1);
        }

        _buildCourseProgress(grid) {
            const frame = new Gtk.Frame({
                label: "Semester at a Glance",
                css_classes: ['dashboard-card'],
                hexpand: true,
                vexpand: true,
            });
            const mainVBox = new Gtk.Box({ // Changed to a VBox to stack the button
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                margin_top: 10, margin_bottom: 10,
                margin_start: 10, margin_end: 10
            });
            frame.set_child(mainVBox);

            const mainHBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 20,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
            });
            mainVBox.append(mainHBox); // Add the original HBox


            const statsBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 15,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
            });

            const { lectures, hw_completed, hw_in_progress } = this._calculateSemesterStats();

            const lecturesLabel = new Gtk.Label({ use_markup: true, justify: Gtk.Justification.CENTER });
            lecturesLabel.set_markup(`<span size='xx-large' weight='bold'>${lectures}</span>\n<span>Total Lectures</span>`);
            lecturesLabel.add_css_class('statistic-container');
            statsBox.append(lecturesLabel);

            const completedLabel = new Gtk.Label({ use_markup: true, justify: Gtk.Justification.CENTER });
            completedLabel.set_markup(`<span size='xx-large' weight='bold'>${hw_completed}</span>\n<span>Completed HW</span>`);
            completedLabel.add_css_class('statistic-container');
            statsBox.append(completedLabel);

            const pendingLabel = new Gtk.Label({ use_markup: true, justify: Gtk.Justification.CENTER });
            pendingLabel.set_markup(`<span size='xx-large' weight='bold'>${hw_in_progress}</span>\n<span>Pending HW</span>`);
            pendingLabel.add_css_class('statistic-container');
            statsBox.append(pendingLabel);

            mainHBox.append(statsBox);

            mainHBox.append(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));

            const coursesBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 10,
                hexpand: true,
                halign: Gtk.Align.FILL,
            });

            const coursesTitle = new Gtk.Label({
                label: "<b>Active Courses</b>",
                use_markup: true,
                halign: Gtk.Align.START,
                css_classes: ['dim-label'],
                margin_bottom: 5,
            });
            coursesBox.append(coursesTitle);

            const courseNames = this.courses.coursesList.map(course => course.name) || [];

            if (courseNames.length > 0) {
                courseNames.forEach(courseName => {
                    const courseButton = new Gtk.Button({
                        label: courseName.replace(/-/g, ' '),
                        halign: Gtk.Align.FILL,
                        css_classes: ['flat'],
                    });
                    courseButton.connect('clicked', () => {
                        console.log(`Maps to course page for: ${courseName}`);
                    });
                    coursesBox.append(courseButton);
                });
            } else {
                coursesBox.append(new Gtk.Label({ label: "No courses found in directory.", halign: Gtk.Align.START, css_classes: ['dim-label'] }));
            }
            mainHBox.append(coursesBox);

            mainVBox.append(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 10, margin_bottom: 5 }));

            const newSemesterButton = new Gtk.Button({
                label: 'Start New Semester Setup...',
                halign: Gtk.Align.END,
                css_classes: ['flat'],
            });
            newSemesterButton.connect('clicked', () => {
                const dialog = new NewSemesterDialog(this.get_root());
                dialog.connect('setup-complete', () => {
                    if (this.app && typeof this.app.refreshAllPages === 'function') {
                        this.app.refreshAllPages();
                    }
                })
                dialog.present();
            });
            mainVBox.append(newSemesterButton);

            grid.attach(frame, 0, 1, 1, 1);
        }

        _calculateSemesterStats() {
            let lectures = 0;

            this.courses.coursesList.forEach(course => {
                lectures += course.lectures.length;
            })

            const { completed, in_progress } = this.homeworks.getSemesterHomeworkCounts();

            return { lectures, hw_completed: completed, hw_in_progress: in_progress };
        }

        _buildGitStatusPlaceholder(grid) {
            const frame = new Gtk.Frame({
                label: "Git Status",
                css_classes: ['dashboard-card'],
                hexpand: true,
                vexpand: true,
            });
            const statusPage = new Adw.StatusPage({
                icon_name: 'vcs-normal-symbolic',
                title: 'Git Integration',
                description: 'Status of your repository will be shown here.',
                css_classes: ['dim-label'],
                vexpand: true,
            });
            frame.set_child(statusPage);
            grid.attach(frame, 1, 1, 1, 1);
        }

        _refreshDataAndUI() {
            console.log("Dashboard: Refreshing data and UI...");
            // Re-initialize the data sources
            this.courses = new Courses();
            this.homeworks = new Homeworks(this.courses);

            // Clear and rebuild the widgets
            // A simple way is to remove all children and call the build functions again
            // A more efficient way would be to update them in-place, but this is robust
            let child = this.get_first_child();
            if (child) {
                this.remove(child);
            }

            const mainGrid = new Gtk.Grid({
                column_spacing: 20,
                row_spacing: 20,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
                row_homogeneous: true,
                column_homogeneous: true,
            });
            this.append(mainGrid);

            this._buildTodaySchedule(mainGrid);
            this._buildHomeworkSchedule(mainGrid);
            this._buildCourseProgress(mainGrid);
            this._buildGitStatusPlaceholder(mainGrid);
        }
    }
);

var exports = { DashboardPage };