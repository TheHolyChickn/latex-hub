'use strict';

// TODO: ai code im so tired ill do this tomorrow hgoly ufkc

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

// Assuming these are correctly found via GJS_PATH=./src
const { ConfigUtils } = imports.config.ConfigUtils;
// const { Course } = imports.core.Course; // Not directly instantiated here
const { Courses } = imports.core.Courses; // Homeworks will receive an instance of this
const { Homework } = imports.core.Homework;

// Path to homeworks.json, now in the root classes directory like Python
var HOMEWORK_STORAGE_FILE = "homeworks.json"; // Filename, path combined with root_dir

var Homeworks = class Homeworks {
    /**
     * Manages all homework assignments.
     * @param {Courses} coursesInstance - The main application's Courses instance.
     * @param {string} classesRootDir - The root directory where all courses (and homeworks.json) reside.
     */
    constructor(coursesInstance, classesRootDir) {
        if (!coursesInstance || !(coursesInstance instanceof Courses)) {
            throw new Error("Homeworks constructor requires a valid Courses instance.");
        }
        if (!classesRootDir || typeof classesRootDir !== 'string') {
            throw new Error("Homeworks constructor requires a valid classesRootDir string.");
        }

        /** @type {Courses} */
        this.courses = coursesInstance; // Store the Courses instance
        /** @type {string} */
        this.homeworkFilePath = GLib.build_filenamev([classesRootDir, HOMEWORK_STORAGE_FILE]);

        /**
         * Stores homework assignments, loaded from homeworks.json.
         * Structure: { "CourseName1": [HomeworkObj, HomeworkObj, ...], "CourseName2": [...], ... }
         * @type {Object.<string, Homework[]>}
         */
        this.assignments = this._loadFromFile();
    }

    /**
     * Loads homework data from the JSON file.
     * Populates this.assignments.
     * @private
     * @returns {Object.<string, Homework[]>}
     */
    _loadFromFile() {
        const loadedAssignments = {};
        let jsonData = null;
        const homeworkFile = Gio.File.new_for_path(this.homeworkFilePath);

        if (!homeworkFile.query_exists(null)) {
            // console.log(`Homeworks file ${this.homeworkFilePath} not found. Returning empty assignments.`);
            return {}; // If file doesn't exist, start fresh
        }

        try {
            const [success, contents_bytes] = homeworkFile.load_contents(null);
            if (success) {
                jsonData = JSON.parse(ByteArray.toString(contents_bytes));
            } else {
                console.warn(`Could not read homework file: ${this.homeworkFilePath}. Returning empty assignments.`);
                return {};
            }
        } catch (e) {
            console.error(`Error loading or parsing ${this.homeworkFilePath}: ${e.message}. Returning empty assignments.`);
            return {};
        }

        // Expected jsonData structure: { "CourseName": { "1": {itemData}, "2": {itemData} }, ... }
        for (const courseName in jsonData) {
            if (jsonData.hasOwnProperty(courseName)) {
                const courseObject = this.courses.findByName(courseName); // Get Course object
                if (!courseObject) {
                    // console.warn(`Homeworks: Course '${courseName}' found in homeworks.json but not in current Courses list. Skipping.`);
                    continue;
                }

                loadedAssignments[courseName] = [];
                const homeworksForCourseData = jsonData[courseName]; // This is an object: { "1": itemData, "2": itemData }
                if (homeworksForCourseData && typeof homeworksForCourseData === 'object') {
                    for (const hwNumberString in homeworksForCourseData) {
                        if (homeworksForCourseData.hasOwnProperty(hwNumberString)) {
                            const itemData = homeworksForCourseData[hwNumberString];
                            // Your Homework constructor: constructor(item, course, number)
                            // where 'course' is the Course OBJECT.
                            loadedAssignments[courseName].push(new Homework(itemData, courseObject, hwNumberString));
                        }
                    }
                    // Sort by number after loading all for this course
                    loadedAssignments[courseName].sort((a,b) => parseInt(a.number) - parseInt(b.number));
                }
            }
        }
        return loadedAssignments;
    }

    /**
     * Prepares the homework data for saving to JSON.
     * This structure matches the Python script's JSON output.
     * @returns {object} Data object suitable for JSON.stringify.
     */
    _prepareDataForSave() {
        const dataToSave = {};
        for (const courseName in this.assignments) {
            if (this.assignments.hasOwnProperty(courseName)) {
                dataToSave[courseName] = {}; // Homeworks for this course will be an object {hwNum: hwData}
                const homeworkList = this.assignments[courseName]; // Array of Homework objects
                if (Array.isArray(homeworkList)) {
                    homeworkList.forEach(hwInstance => {
                        dataToSave[courseName][hwInstance.number] = hwInstance.toJSON(); // Use Homework's toJSON
                    });
                }
            }
        }
        return dataToSave;
    }

    /**
     * Saves the current state of all homework assignments to the JSON file.
     */
    save() {
        try {
            const dataToSave = this._prepareDataForSave();
            const jsonString = JSON.stringify(dataToSave, null, 4); // Pretty print
            const file = Gio.File.new_for_path(this.homeworkFilePath);
            // Ensure parent directory exists (though root_dir should exist)
            const parentDir = file.get_parent();
            if (parentDir && !parentDir.query_exists(null)) {
                parentDir.make_directory_with_parents(null);
            }
            file.replace_contents(jsonString, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.error(`Could not save homework file ${this.homeworkFilePath}: ${e.message}`);
        }
    }

    /**
     * Initializes the homeworks.json file based on current courses,
     * creating an empty homework list for each.
     * (Equivalent to Python's init_homework function)
     */
    initializeFile() {
        const initialData = {};
        if (this.courses && this.courses.coursesList) {
            for (const course of this.courses.coursesList) {
                initialData[course.name] = {}; // Empty object for each course's homeworks
            }
        } else {
            console.error("Cannot initialize homework file: Courses instance or coursesList is missing.");
            return;
        }
        this.assignments = {}; // Reset in-memory assignments to match this new empty file state.
                               // Or re-populate after saving:
                               // for (const courseName in initialData) { this.assignments[courseName] = []; }
        try {
            const jsonString = JSON.stringify(initialData, null, 4);
            const file = Gio.File.new_for_path(this.homeworkFilePath);
            const parentDir = file.get_parent();
            if (parentDir && !parentDir.query_exists(null)) {
                parentDir.make_directory_with_parents(null);
            }
            file.replace_contents(jsonString, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            // console.log(`Initialized homework file at ${this.homeworkFilePath}`);
            this._loadFromFile(); // Reload to ensure in-memory state is fresh & Homework objects are created (empty lists)
        } catch (e) {
            console.error(`Could not write initial homework file ${this.homeworkFilePath}: ${e.message}`);
        }
    }

    /**
     * Adds a new homework assignment.
     * @param {string} courseName - The name of the course.
     * @param {object} newItemData - Data for the new homework {name, date, preamble, status (optional)}.
     */
    addHomework(courseName, newItemData) {
        const courseObject = this.courses.findByName(courseName);
        if (!courseObject) {
            console.error(`Cannot add homework: Course "${courseName}" not found.`);
            return null;
        }

        if (!this.assignments[courseName]) {
            this.assignments[courseName] = [];
        }

        let newNumber = 1;
        const courseHomeworks = this.assignments[courseName];
        if (courseHomeworks.length > 0) {
            // Get the last homework's number and increment
            const lastHwNumber = parseInt(courseHomeworks[courseHomeworks.length - 1].number, 10);
            newNumber = lastHwNumber + 1;
        }

        const homework = new Homework(newItemData, courseObject, String(newNumber));
        this.assignments[courseName].push(homework);
        this.assignments[courseName].sort((a,b) => parseInt(a.number) - parseInt(b.number)); // Keep sorted

        homework.touch(); // Create the .tex file, passing the Course object's info
        this.save();      // Save changes to homeworks.json

        // homework.openHomework(); // Optional: open after creation
        return homework;
    }

    /**
     * Finds and returns a specific homework object.
     * @param {string} courseName
     * @param {string | number} homeworkNumber
     * @returns {Homework | undefined}
     */
    getHomework(courseName, homeworkNumber) {
        const hwsForCourse = this.assignments[courseName];
        if (hwsForCourse) {
            return hwsForCourse.find(hw => hw.number === String(homeworkNumber));
        }
        return undefined;
    }

    /**
     * Marks a homework assignment as complete.
     * @param {string} courseName
     * @param {string | number} homeworkNumber
     */
    completeHomework(courseName, homeworkNumber) {
        const homework = this.getHomework(courseName, String(homeworkNumber));
        if (homework) {
            homework.status = true;
            this.save();
        } else {
            console.warn(`Cannot complete homework: HW #${homeworkNumber} for course "${courseName}" not found.`);
        }
    }

    /**
     * Gets all incomplete homeworks, sorted by date.
     * @returns {Homework[]}
     */
    getSortedIncompleteHomeworks() {
        const incomplete = [];
        for (const courseName in this.assignments) {
            if (this.assignments.hasOwnProperty(courseName)) {
                this.assignments[courseName].forEach(hw => {
                    if (!hw.status) {
                        incomplete.push(hw);
                    }
                });
            }
        }

        // Sort by date. hw.date is "MM/DD/YY". Needs parsing for correct sort.
        incomplete.sort((a, b) => {
            // Basic date string comparison, assumes "MM/DD/YY" can be compared lexicographically for rough order
            // or implement a robust date parser here if GLib.DateTime is problematic.
            // For robust: parse a.date and b.date to GLib.DateTime, then compare.
            // This is a simplified sort if dates are always "MM/DD/YY"
            const dateA = this._parseSimpleDate(a.date);
            const dateB = this._parseSimpleDate(b.date);

            if (!dateA && !dateB) return 0;
            if (!dateA) return 1; // Put unparseable dates last
            if (!dateB) return -1; // Put unparseable dates last

            if (dateA.year !== dateB.year) return dateA.year - dateB.year;
            if (dateA.month !== dateB.month) return dateA.month - dateB.month;
            return dateA.day - dateB.day;
        });
        return incomplete;
    }

    /**
     * Helper to parse "MM/DD/YY" date strings for sorting.
     * Returns { year, month (0-11), day } or null.
     * @param {string} dateStr
     * @private
     */
    _parseSimpleDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const month = parseInt(parts[0], 10) - 1; // To 0-indexed
        const day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);

        if (isNaN(month) || isNaN(day) || isNaN(year)) return null;

        // Assuming 'YY' means 20YY
        if (year < 100) {
            year += 2000;
        }
        // Basic validation
        if (month < 0 || month > 11 || day < 1 || day > 31) return null;

        return { year, month, day };
        // For actual GLib.DateTime comparison (more robust if GLib.DateTime.new_local works):
        // try {
        //     return GLib.DateTime.new_local(year, month, day, 0, 0, 0);
        // } catch (e) { return null; }
    }
};

var exports = { Homeworks, HOMEWORK_STORAGE_FILE }; // Export the filename constant