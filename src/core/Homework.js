'use strict'

const { GLib, Gio } = imports.gi;

const { Course } = imports.core.Course;

var Homework = class Homework {
    /**
     * Constructs a homework object
     * @param item an array { "name": string, "date": string, "preamble": string, "status": bool }
     * item.date should be formatted as %m/%d/%y, python syntax
     * @param course the course it belongs to
     * @param number the homework number
     */
    constructor(item, course, number) {
        /** @type {string} */
        this.name = item.name;
        /** @type {string} */
        this.date = item.date;
        /** @type {string} */
        this.preamble = item.preamble;
        /** @type {boolean} */
        this.status = Boolean(item.status);
        /** @type {string} */
        this.number = number;
        /** @type {course} */
        this.course = course; // fuck this needs to be a course object
        /** @type {string} */
        this.path = GLib.build_filenamev([
            this.course.path.get_path(),
            'Homework',
            `${this.name}_${this.number}.tex`
        ]);
    }

    openHomework() {
        const command = ["kitty", "-e", "bash", "-i", "-c", `nvim "${this.path}"`];
        try {
            GLib.spawn_async(null, command, null, GLib.SpawnFlags.DO_NOT_REAP_CHILD | GLib.SpawnFlags.SEARCH_PATH, null);
        } catch (e) {
            console.error(`Failed to launch editor for homework at ${this.path}: ${e.message}`);
        }
    }

    touch() {
        let courseID = "";
        let courseSection = "";
        let professor = "";

        courseID = this.course.info.course_id || "";
        courseSection = this.course.info.section || "";
        professor = this.course.info.professor || "";

        let line1, line2;
        // TODO: report/homework preambles and titlepage package should be configurable in the config file, here are some placeholders
        if (this.preamble === "report") {
            line1 = '\\input{../../../../report.tex}'
            line2 = '\\makereport';
        } else {
            line1 = "\\input{../../homework.tex}";
            line2 = "\\makeproblem";
        }

        const lines = [
            '\\documentclass[11pt, letterpaper]{article}',
            line1,
            "\\usepackage{titlepage}",
            `\\title{${this.name}}`,
            `\\courseID{${courseID}}`,
            `\\courseSection{${courseSection}}`,
            `\\professor{${professor}}`,
            '\\begin{document}',
            line2,
            '\\end{document}'
        ].join('\n');

        const file = Gio.File.new_for_path(this.path);
        const homeworkDir = file.get_parent();
        if (homeworkDir && !homeworkDir.query_exists(null)) {
            try {
                homeworkDir.make_directory_with_parents(null);
            } catch (e_mkdir) {
                console.error(`Error creating homework directory ${homeworkDir.get_path()}: ${e_mkdir.message}`);
                return;
            }
        }

        try {
            file.replace_contents(
                content,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            console.error(`Error creating homework file: ${e.message}`);
        }
    }

    toJSON() {
        return {
            "name": this.name,
            "date": this.date,
            "preamble": this.preamble,
            "status": this.status
        }
    }

    toString() {
        return `<Homework ${this.course.name} #${this.number}: "${this.name}", Due: ${this.date}, Status: ${this.status ? 'Complete' : 'Incomplete'}>`;
    }
}

var exports = { Homework };