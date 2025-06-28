'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { Gtk, Adw, GLib } = imports.gi;

const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;
const { fetchTodaysEvents } = imports.core.Countdown;
const { ConfigUtils } = imports.config.ConfigUtils;

var DashboardPage = class DashboardPage extends Gtk.Box {
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
        });

        this.append(mainGrid);

        this._buildTodaySchedule(mainGrid);
        this._buildHomeworkSchedule(mainGrid);
        this._buildCourseProgress(mainGrid);
        this._buildGitStatusPlaceholder(mainGrid);
    }

    _buildTodaySchedule(grid) {
        const frame = new Gtk.Frame({ label: "Today's Schedule" });
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });
        frame.set_child(box);

        fetchTodaysEvents(events => {
            if (events.length === 0) {
                box.append(new Gtk.Label({ label: "No events scheduled for today.", halign: Gtk.Align.CENTER }));
                return;
            }
            events.forEach(event => {
                const time = event.start.format('%H:%M');
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
        const frame = new Gtk.Frame({ label: "Upcoming Homework" });
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            min_content_height: 150,
        });
        frame.set_child(scrolledWindow);

        const listBox = new Gtk.ListBox();
        scrolledWindow.set_child(listBox);

        const incompleteHW = this.homeworks.getSortedIncompleteHomeworks();

        if (incompleteHW.length === 0) {
            const row = new Gtk.ListBoxRow();
            row.set_child(new Gtk.Label({ label: "No pending homework!", halign: Gtk.Align.CENTER }));
            listBox.append(row);
        } else {
            incompleteHW.forEach(hw => {
                const row = new Gtk.ListBoxRow();
                const label = new Gtk.Label({
                    label: `<b>${hw.name}</b> (${hw.course.info.short}) - Due ${hw.date}`,
                    use_markup: true,
                    halign: Gtk.Align.START,
                });
                row.set_child(label);
                listBox.append(row);
            });
        }
        grid.attach(frame, 1, 0, 1, 1);
    }

    _buildCourseProgress(grid) {
        const frame = new Gtk.Frame({ label: "Semester at a Glance" });
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        frame.set_child(box);

        const { lectures, hw_completed, hw_in_progress } = this._calculateSemesterStats();

        box.append(new Gtk.Label({
            label: `<span size='large'><b>${lectures}</b></span>\n<span size='small'>Total Lectures</span>`,
            use_markup: true,
            justify: Gtk.Justification.CENTER
        }));
        box.append(new Gtk.Label({
            label: `<span size='large'><b>${hw_completed}</b></span>\n<span size='small'>Completed HW</span>`,
            use_markup: true,
            justify: Gtk.Justification.CENTER
        }));
        box.append(new Gtk.Label({
            label: `<span size='large'><b>${hw_in_progress}</b></span>\n<span size='small'>Pending HW</span>`,
            use_markup: true,
            justify: Gtk.Justification.CENTER
        }));

        grid.attach(frame, 0, 1, 1, 1);
    }

    _calculateSemesterStats() {
        let lectures = 0;
        const currentCourses = ConfigUtils.get('current_courses');

        this.courses.coursesList.forEach(course => {
            if (currentCourses.includes(course.name)) {
                lectures += course.lectures.length;
            }
        });

        const { completed, in_progress } = this.homeworks.getSemesterHomeworkCounts();

        return { lectures, hw_completed: completed, hw_in_progress: in_progress };
    }

    _buildGitStatusPlaceholder(grid) {
        const frame = new Gtk.Frame({ label: "Git Status" });
        const statusPage = new Adw.StatusPage({
            icon_name: 'vcs-normal-symbolic',
            title: 'Git Integration',
            description: 'Status of your repository will be shown here.',
        });
        frame.set_child(statusPage);
        grid.attach(frame, 1, 1, 1, 1);
    }
};

var exports = { DashboardPage };