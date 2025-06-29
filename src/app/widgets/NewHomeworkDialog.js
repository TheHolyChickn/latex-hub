// src/app/widgets/NewHomeworkDialog.js

'use strict';

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Adw = '1';
const { GObject, Gtk, Adw, GLib } = imports.gi;

var NewHomeworkDialog = GObject.registerClass(
    {
        GTypeName: 'NewHomeworkDialog',
        Signals: {
            'submit': { param_types: [GLib.Variant.$gtype] },
        },
    },
    class NewHomeworkDialog extends Adw.Window {
        _init(parent, courses) {
            super._init({
                modal: true,
                transient_for: parent,
                width_request: 450,
                hide_on_close: true,
            });

            this.courses = courses;

            const rootBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
            });
            this.set_content(rootBox);

            const header = new Adw.HeaderBar({
                title_widget: new Adw.WindowTitle({
                    title: 'New Homework Assignment',
                }),
            });
            rootBox.append(header);

            const grid = new Gtk.Grid({
                margin_top: 24, margin_bottom: 24,
                margin_start: 24, margin_end: 24,
                row_spacing: 12,
                column_spacing: 12,
                column_homogeneous: false,
            });
            rootBox.append(grid);

            grid.attach(new Gtk.Label({ label: 'Assignment Name', halign: Gtk.Align.START }), 0, 0, 1, 1);
            this.nameEntry = new Gtk.Entry();
            grid.attach(this.nameEntry, 1, 0, 1, 1);

            grid.attach(new Gtk.Label({ label: 'Course', halign: Gtk.Align.START }), 0, 1, 1, 1);
            const courseTitles = this.courses.coursesList.map(c => c.info.title || c.name);
            this.courseSelector = Gtk.DropDown.new_from_strings(courseTitles);
            grid.attach(this.courseSelector, 1, 1, 1, 1);

            grid.attach(new Gtk.Label({ label: 'Due Date', halign: Gtk.Align.START }), 0, 2, 1, 1);
            this.dateEntry = new Gtk.Entry({
                text: 'MM/DD/YY',
            });
            grid.attach(this.dateEntry, 1, 2, 1, 1);

            grid.attach(new Gtk.Label({ label: 'Assignment Type', halign: Gtk.Align.START }), 0, 3, 1, 1);
            this.preambleSelector = Gtk.DropDown.new_from_strings(['Homework', 'Report']);
            grid.attach(this.preambleSelector, 1, 3, 1, 1);

            const submitButton = new Gtk.Button({
                label: 'Submit',
                css_classes: ['suggested-action'],
            });
            submitButton.connect('clicked', this._onSubmit.bind(this));
            header.pack_end(submitButton);

            const cancelButton = new Gtk.Button({ label: 'Cancel' });
            cancelButton.connect('clicked', () => this.close());
            header.pack_start(cancelButton);
        }

        _onSubmit() {
            const name = this.nameEntry.get_text();
            const courseIndex = this.courseSelector.get_selected();
            const date = this.dateEntry.get_text();
            const preambleIndex = this.preambleSelector.get_selected();

            if (!name || courseIndex === Gtk.INVALID_LIST_POSITION || !date.match(/^\d{2}\/\d{2}\/\d{2}$/)) {
                console.warn("Please fill out all fields correctly. Date must be MM/DD/YY.");
                return;
            }

            const selectedCourse = this.courses.get(courseIndex);
            const preamble = (preambleIndex === 0) ? 'homework' : 'report';

            // Create an object where each value is a GLib.Variant
            const variantDict = {
                courseName: new GLib.Variant('s', selectedCourse.name),
                name:       new GLib.Variant('s', name),
                date:       new GLib.Variant('s', date),
                preamble:   new GLib.Variant('s', preamble),
                status:     new GLib.Variant('b', false),
            };

            // Now, pack this dictionary of variants into the main variant
            this.emit('submit', new GLib.Variant('a{sv}', variantDict));
            this.close();
        }
    }
);

var exports = { NewHomeworkDialog };