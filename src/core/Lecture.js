'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

var TEX_LECTURE_DATE_FORMAT = '%a %d %b %Y %H:%M';

/**
 * Manually parses a date string in the format "Day DD Mon Year HH:MM"
 * (e.g., "Sun 18 May 2025 10:00").
 * Assumes GLib.DateTime.new_local(Y, M_idx, D) correctly uses
 * M_idx (0-11).
 *
 * @param {string} dateString - The date string to parse.
 * @returns {GLib.DateTime | null} A GLib.DateTime object or null if parsing fails.
 */
function manualParseLectureDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.trim().split(' ');
    if (parts.length !== 5) {
        console.warn(`ManualParse: Incorrect number of parts for date string "${dateString}"`);
        return null;
    }
    const monthMap = {'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12};
    const year = parseInt(parts[3], 10);
    const month_0_indexed = monthMap[parts[2]];
    const day = parseInt(parts[1], 10);

    if (month_0_indexed === undefined) {
        console.warn(`ManualParse: Unknown month "${parts[2]}" in date string "${dateString}"`);
        return null;
    }
    const timeBits = parts[4].split(':');
    if (timeBits.length !== 2) {
        console.warn(`ManualParse: Incorrect time format "${parts[4]}" in date string "${dateString}"`);
        return null;
    }
    const hour = parseInt(timeBits[0], 10);
    const minute = parseInt(timeBits[1], 10);

    if (isNaN(year) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        console.warn(`ManualParse: Date or time components are not numbers in "${dateString}"`);
        return null;
    }
    try {
        let dt = GLib.DateTime.new_local(year, month_0_indexed, day, hour, minute, 0);
        if (dt && typeof dt.get_year === 'function') {
            if (dt.get_year() === year && dt.get_month() === month_0_indexed && dt.get_day_of_month() === day &&
                dt.get_hour() === hour && dt.get_minute() === minute) {
                return dt;
            } else {
                console.warn(`ManualParse: GLib.DateTime created, but components mismatch for "${dateString}".`);
                return null;
            }
        } else {
            console.warn(`ManualParse: GLib.DateTime.new_local returned null or invalid object for "${dateString}".`);
            return null;
        }
    } catch (e) {
        console.error(`ManualParse: Exception during GLib.DateTime creation for "${dateString}": ${e.message}`);
        return null;
    }
}

var Lecture = class Lecture {
    /**
     * Represents a single lecture.
     * @param {Gio.File} file - The Gio.File object for the lecture's .tex file.
     * @param {Course} course - The Course object this lecture belongs to.
     */
    constructor(file, course) {
        this.file = file;
        this.course = course;
        this.number = this._filenameToNumber(this.file.get_basename());
        this.title = 'Untitled';
        this.date = null;
        this._parseLectureFile();
    }

    _parseLectureFile() {
        if (!this.file.query_exists(null)) {
            console.warn(`Lecture file not found: ${this.file.get_path()}. Date and title remain default.`);
            return;
        }
        try {
            const [success, contents] = this.file.load_contents(null);
            if (!success) {
                console.error(`Failed to read lecture file: ${this.file.get_path()}. Date and title remain default.`);
                return;
            }
            const fileContent = ByteArray.toString(contents);
            const lectureRegex = /\\lecture\{[^}]*\}\{([^}]*)\}\{([^}]*)\}/;
            const match = fileContent.match(lectureRegex);

            if (match) {
                const dateString = match[1].trim();
                this.title = match[2].trim();
                this.date = manualParseLectureDate(dateString);
                if (!this.date) {
                    console.warn(`Date parsing failed for lecture ${this.number} (file: ${this.file.get_basename()}) with date string: "${dateString}". Date is null.`);
                }
            } else {
                console.warn(`No \\lecture command found in ${this.file.get_path()} (lecture ${this.number}). Date and title remain default.`);
            }
        } catch (e) {
            console.error(`Error processing lecture file ${this.file.get_path()}: ${e.message}. Date and title remain default.`);
        }
    }

    _filenameToNumber(basename) {
        if (!basename) return 0;
        const match = basename.match(/^lec_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Opens the lecture file in an editor.
     * defaults to opening in nvim, with kitty as the terminal and bash as the shell language.
     */
    edit() {
        const filePath = this.file.get_path();
        if (!filePath) {
            console.error("Lecture file path is not available for editing.");
            return;
        }
        // "kitty" is the default terminal
        // nvim is the default editor
        // bash is the default shell language
        // change these to whatever you use if needed
        const command = ["kitty", "-e", "bash", "-i", "-c", `nvim "${filePath}"`];
        try {
            GLib.spawn_async(null, command, null, GLib.SpawnFlags.DO_NOT_REAP_CHILD | GLib.SpawnFlags.SEARCH_PATH, null);
        } catch (e) {
            console.error(`Failed to launch editor for ${filePath}: ${e.message}`);
        }
    }

    /**
     * Returns a string representation of the Lecture.
     * @returns {string}
     */
    toString() {
        const courseShortName = this.course && this.course.info && this.course.info.short ? this.course.info.short : 'UnknownCourse';
        const dateStr = (this.date && typeof this.date.format === 'function')
            ? this.date.format(TEX_LECTURE_DATE_FORMAT)
            : "Invalid Date";
        return `<Lecture ${courseShortName} ${this.number} "${this.title}" (${dateStr})>`;
    }
};

var exports = { Lecture, TEX_LECTURE_DATE_FORMAT, manualParseLectureDate };