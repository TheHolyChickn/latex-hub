'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

var TEX_LECTURE_DATE_FORMAT = '%a %d %b %Y %H:%M';

/**
 * Manually parses a date string in the format "Day DD Mon Year HH:MM"
 * e.g., "Sun 18 May 2025 10:00"
 * Returns a GLib.DateTime object or null.
 * This version assumes GLib.DateTime.new_local(Y, M_idx, D) correctly uses
 * M_idx (0-11) internally, even if .format('%b') might be quirky.
 */
function manualParseLectureDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.trim().split(' ');
    if (parts.length !== 5) {
        console.warn(`ManualParse: Bad parts length for "${dateString}"`);
        return null;
    }
    const monthMap = {'Jan':0,'Feb':1,'Mar':2,'Apr':3,'May':4,'Jun':5,'Jul':6,'Aug':7,'Sep':8,'Oct':9,'Nov':10,'Dec':11};
    const year = parseInt(parts[3], 10);
    const month_0_indexed = monthMap[parts[2]];
    const day = parseInt(parts[1], 10);
    if (month_0_indexed === undefined) {
        console.warn(`ManualParse: Unknown month "${parts[2]}" in "${dateString}"`);
        return null;
    }
    const timeBits = parts[4].split(':');
    if (timeBits.length !== 2) {
        console.warn(`ManualParse: Bad time "${parts[4]}" in "${dateString}"`);
        return null;
    }
    const hour = parseInt(timeBits[0], 10);
    const minute = parseInt(timeBits[1], 10);
    if (isNaN(year) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        console.warn(`ManualParse: NaN parts in "${dateString}"`);
        return null;
    }
    try {
        let dt = GLib.DateTime.new_local(year, month_0_indexed, day, hour, minute, 0);
        if (dt && typeof dt.get_year === 'function') {
            if (dt.get_year() === year && dt.get_month() === month_0_indexed && dt.get_day_of_month() === day) {
                return dt;
            } else {
                console.warn(`ManualParse: new_local created a DateTime, but components mismatch for "${dateString}".`)
                return null;
            }
        } else {
            console.warn(`ManualParse: new_local returned null or non-functional object for "${dateString}"`);
            return null;
        }
    } catch (e) {
        console.error(`ManualParse: Crash for "${dateString}": ${e.message}`);
        return null;
    }
}

var Lecture = class Lecture {
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
            console.warn(`Lecture file not found: ${this.file.get_path()}. Date remains null.`);
            this.date = null;
            return;
        }
        try {
            const [success, contents] = this.file.load_contents(null);
            if (!success) {
                console.error(`Failed to read lecture file: ${this.file.get_path()}. Date remains null.`);
                this.date = null;
                return;
            }
            const fileContent = ByteArray.toString(contents);
            const lectureRegex = /\\lecture\{[^}]*\}\{([^}]*)\}\{([^}]*)\}/;
            const match = fileContent.match(lectureRegex);

            if (match) {
                const dateString = match[1].trim();
                this.date = manualParseLectureDate(dateString);
                this.title = match[2].trim();
                if (!this.date) {
                    console.warn(`Date parsing failed for lec ${this.number} (filename) with date string: "${dateString}". Date is null.`);
                }
            } else {
                console.warn(`No \\lecture command in ${this.file.get_path()} (lec ${this.number}). Date is null.`);
                this.date = null;
            }
        } catch (e) {
            console.error(`Error processing ${this.file.get_path()}: ${e.message}. Date is null.`);
            this.date = null;
        }
    }

    _filenameToNumber(basename) {
        if (!basename) return 0;
        const match = basename.match(/^lec_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    edit() {
        const filePath = this.file.get_path();
        if (!filePath) { console.error("Lecture file path is not available."); return; }
        const command = ["kitty", "-e", "bash", "-i", "-c", `nvim "${filePath}"`];
        try { GLib.spawn_async(null, command, null, GLib.SpawnFlags.DO_NOT_REAP_CHILD | GLib.SpawnFlags.SEARCH_PATH, null); }
        catch (e) { console.error(`Failed to launch editor for ${filePath}: ${e.message}`); }
    }

    toString() {
        const courseShortName = this.course && this.course.info && this.course.info.short ? this.course.info.short : 'UnknownCourse';
        const dateStr = (this.date && typeof this.date.format === 'function')
            ? this.date.format(TEX_LECTURE_DATE_FORMAT)
            : "Invalid Date";
        return `<Lecture ${courseShortName} ${this.number} "${this.title}" (${dateStr})>`;
    }
};

var exports = { Lecture, TEX_LECTURE_DATE_FORMAT, manualParseLectureDate };