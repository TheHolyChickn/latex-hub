'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigUtils } = imports.config.ConfigUtils;
const { Courses } = imports.core.Courses;
const { Homework } = imports.core.Homework;

var HOMEWORK_TRACKER = "homeworks.json";

var Homeworks = class Homeworks {
    /**
     * Manages all homework assignments.
     */
    constructor() {
        if (!classesRootDir || typeof classesRootDir !== 'string') {
            throw new Error("Homeworks constructor requires a valid classesRootDir string.");
        }

        /** @type {Courses} */
        this.courses = Courses();
        /** @type {string} */
        this.homeworkFilePath = GLib.build_filenamev([ConfigUtils.get('root_dir'), HOMEWORK_TRACKER]);
        /** @type {Object.<string, Homework[]>} */
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
            this.initializeFile();
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

        for (const courseName in jsonData) {
            const courseObject = this.courses.findByName(courseName);
            if (!courseObject) continue;

            loadedAssignments[courseName] = [];
            const homeworksForCourseData = jsonData[courseName];
            if (homeworksForCourseData && typeof homeworksForCourseData === 'object') {
                for (const hwNum in homeworksForCourseData) {
                    if (homeworksForCourseData.hasOwnProperty(hwNum)) {
                        loadedAssignments[courseName].push(new Homework(homeworksForCourseData[hwNum], courseObject, hwNum));
                    }
                }
                // Sort by number after loading all for this course cuz y not
                loadedAssignments[courseName].sort((a,b) => parseInt(a.number) - parseInt(b.number));
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
                dataToSave[courseName] = {};
                const homeworkList = this.assignments[courseName];
                if (Array.isArray(homeworkList)) {
                    homeworkList.forEach(hwInstance => {
                        dataToSave[courseName][hwInstance.number] = hwInstance.toJSON();
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
            const jsonString = JSON.stringify(dataToSave, null, 4);
            const file = Gio.File.new_for_path(this.homeworkFilePath);
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
        }
        const jsonString = JSON.stringify(initialData, null, 4);
        file.replace_contents(jsonString, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
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
            const lastHwNumber = parseInt(courseHomeworks[courseHomeworks.length - 1].number, 10);
            newNumber = lastHwNumber + 1;
        }

        const homework = new Homework(newItemData, courseObject, String(newNumber));
        this.assignments[courseName].push(homework);
        this.assignments[courseName].sort((a,b) => parseInt(a.number) - parseInt(b.number));

        this.save();
        homework.touch();

        homework.openHomework();
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
            const dateA = this._parseSimpleDate(a.date);
            const dateB = this._parseSimpleDate(b.date);

            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;

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
        const month = parseInt(parts[0], 10) - 1;
        const day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);

        if (isNaN(month) || isNaN(day) || isNaN(year)) return null;

        if (year < 100) {
            year += 2000;
        }
        if (month < 0 || month > 11 || day < 1 || day > 31) return null;

        return { year, month, day };
    }
};

var exports = { Homeworks, HOMEWORK_TRACKER };