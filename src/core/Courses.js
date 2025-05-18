'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { Course } = imports.core.Course;
const { ConfigUtils } = imports.config.ConfigUtils;

// might want to put these into config.json
const CURRENT_COURSE_SYMLINK_PATH = GLib.build_filenamev([GLib.get_home_dir(), 'current_course']);
const CURRENT_COURSE_WATCH_FILE_PATH = '/tmp/current_course';

/**
 * Manages a collection of Course objects.
 * It reads course directories from a root location and provides access
 * to the "current" course via a symlink.
 */
var Courses = class Courses {
    constructor() {
        this.coursesList = [];
        this._readCourses();
    }

    /**
     * Reads course directories from the configured root directory,
     * creates Course objects, and populates the coursesList.
     * @private
     */
    _readCourses() {
        this.coursesList = []; // Clear previous list
        const rootDirPath = ConfigUtils.get('root_dir');
        if (!rootDirPath) {
            console.error("Root directory for courses is not configured.");
            return;
        }

        const rootDir = Gio.File.new_for_path(rootDirPath);
        if (!rootDir.query_exists(null)) {
            console.warn(`Courses root directory not found: ${rootDirPath}`); // i might want to mkdir if not exist? unsure, should probs be handled in init-courses
            return;
        }

        try {
            const enumerator = rootDir.enumerate_children(
                'standard::name,standard::type,standard::is-hidden',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let fileInfo;
            while ((fileInfo = enumerator.next_file(null)) !== null) {
                if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY && !fileInfo.get_is_hidden()) {
                    const courseDirName = fileInfo.get_name();
                    const courseDirFile = rootDir.get_child(courseDirName);
                    this.coursesList.push(new Course(courseDirFile));
                }
            }
            enumerator.close(null);

            this.coursesList.sort((a, b) => a.name.localeCompare(b.name)); // bcuz why not xd
        } catch (e) {
            console.error(`Error reading course directories from ${rootDirPath}: ${e.message}`);
        }
    }

    /**
     * Reloads the list of courses from the filesystem.
     * @public
     */
    reloadCourses() {
        this._readCourses();
    }

    /**
     * Gets the currently active course, determined by resolving the
     * CURRENT_COURSE_SYMLINK_PATH.
     * @type {Course | null}
     * @public
     */
    get current() {
        const symlinkFile = Gio.File.new_for_path(CURRENT_COURSE_SYMLINK_PATH);
        try {
            if (symlinkFile.query_exists(null) && symlinkFile.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.SYMBOLIC_LINK) { // maybe i should just use watch file?
                const targetFile = symlinkFile.resolve_relative_path(null);
                if (targetFile && targetFile.query_exists(null)) {
                    const existingCourse = this.coursesList.find(c => c.path.get_uri() === targetFile.get_uri());
                    if (existingCourse) return existingCourse;
                }
            }
        } catch (e) {
            console.error(`Error resolving current course symlink ${CURRENT_COURSE_SYMLINK_PATH}: ${e.message}`);
        }
        return null;
    }

    /**
     * Sets the currently active course by updating the symlink and watch file.
     * @param {Course | null} courseToSet - The Course object to set as current.
     * Pass null to attempt to remove the current course symlink.
     * @public
     */
    set current(courseToSet) {
        const symlinkFile = Gio.File.new_for_path(CURRENT_COURSE_SYMLINK_PATH);
        const watchFile = Gio.File.new_for_path(CURRENT_COURSE_WATCH_FILE_PATH);

        try {
            if (symlinkFile.query_exists(null)) {
                symlinkFile.delete(null);
            }

            if (courseToSet && courseToSet.path) {
                symlinkFile.make_symbolic_link(courseToSet.path.get_path(), null);

                const shortName = courseToSet.info && courseToSet.info.short ? courseToSet.info.short : courseToSet.name;
                const watchFileContent = `${shortName}\n`;
                watchFile.replace_contents(
                    watchFileContent,
                    null, false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null
                );
            } else if (!courseToSet) {
                if (watchFile.query_exists(null)) {
                    watchFile.replace_contents("", null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                }
            }
        } catch (e) {
            console.error(`Error setting current course to ${courseToSet ? courseToSet.name : 'null'}: ${e.message}`);
        }
    }

    /**
     * Finds a course in the loaded list by its name.
     * @param {string} name - The name of the course to find.
     * @returns {Course | undefined} The Course object if found, otherwise undefined.
     * @public
     */
    findByName(name) {
        return this.coursesList.find(course => course.name === name);
    }

    /**
     * Gets a course by its index in the internal list.
     * @param {number} index - The index of the course.
     * @returns {Course | undefined} The course at the specified index.
     * @public
     */
    get(index) {
        return this.coursesList[index];
    }

    /**
     * Gets the number of loaded courses.
     * @type {number}
     * @public
     */
    get length() {
        return this.coursesList.length;
    }

    /**
     * Allows iteration over the loaded courses.
     * @returns {Iterator<Course>}
     * @public
     */
    [Symbol.iterator]() {
        return this.coursesList[Symbol.iterator]();
    }
};

var exports = { Courses, CURRENT_COURSE_SYMLINK_PATH, CURRENT_COURSE_WATCH_FILE_PATH };