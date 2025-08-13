'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

// Lazy load Lectures to handle potential circular dependency if Lectures imports Course
let LecturesModule = null;

var INFO_FILE_NAME = 'info.json';

/**
 * Represents a single university course.
 * It manages information about the course and provides access to its lectures.
 */
var Course = class Course {
    /**
     * Creates an instance of a Course.
     * @param {Gio.File} courseDirFile - The Gio.File object representing the course's root directory.
     */
    constructor(courseDirFile) {
        this.path = courseDirFile;
        this.name = courseDirFile.get_basename();
        this.info = this._loadInfo();
        this._lectures = null;
    }

    /**
     * Loads course information from the info.json file in the course directory.
     * @returns {Object} The parsed information object, or a default if loading fails.
     * @private
     */
    _loadInfo() {
        const infoFile = this.path.get_child(INFO_FILE_NAME);
        let infoData = {
            title: this.name,
            short: this.name.substring(0, 7),
            course_id: "",
            department: "",
            college: "",
            professor: "",
            section: "",
            homework_preambles: [],
            report_preambles: []
        };

        if (infoFile.query_exists(null)) {
            try {
                const [success, contents] = infoFile.load_contents(null);
                if (success) {
                    const parsedJson = JSON.parse(ByteArray.toString(contents));
                    infoData = Object.assign({}, infoData, parsedJson);
                } else {
                    console.warn(`Failed to read ${INFO_FILE_NAME} for course ${this.name}.`);
                }
            } catch (e) {
                console.error(`Error parsing ${INFO_FILE_NAME} for course ${this.name}: ${e.message}`);
            }
        } else {
            console.warn(`${INFO_FILE_NAME} not found for course ${this.name}. Using default info.`);
        }
        return infoData;
    }

    /**
     * Gets the Lectures object associated with this course.
     * @type {Lectures}
     * @public
     */
    get lectures() {
        if (!LecturesModule) {
            LecturesModule = imports.core.Lectures;
        }
        if (!this._lectures) {
            if (LecturesModule && LecturesModule.Lectures) {
                this._lectures = new LecturesModule.Lectures(this);
            } else {
                console.error("Lectures module or Lectures class not loaded correctly.");
                return { lecturesList: [], length: 0 };
            }
        }
        return this._lectures;
    }

    /**
     * Checks if this Course instance is equal to another Course instance
     * based on their paths.
     * @param {Course | any} otherCourse - The course to compare against.
     * @returns {boolean} True if the courses are considered equal, false otherwise.
     * @public
     */
    equals(otherCourse) {
        if (!otherCourse || !(otherCourse instanceof Course)) {
            return false;
        }
        if (!this.path || !otherCourse.path) {
            return false;
        }
        return this.path.get_uri() === otherCourse.path.get_uri();
    }

    /**
     * Provides a string representation of the Course.
     * @returns {string}
     * @public
     */
    toString() {
        return `<Course ${this.name} (${this.info.title || 'No Title'})>`;
    }
};

var exports = { Course, INFO_FILE_NAME };