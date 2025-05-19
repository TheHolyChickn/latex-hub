'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { Course } = imports.core.Course;
const { ConfigUtils } = imports.config.ConfigUtils;

var CURRENT_COURSE_SYMLINK_PATH = GLib.build_filenamev([GLib.get_home_dir(), 'current_course']);
var CURRENT_COURSE_WATCH_FILE_PATH = '/tmp/current_course';

/**
 * Manages a collection of Course objects.
 * It reads course directories from a root location and provides access
 * to the "current" course via a symlink.
 */
var Courses = class Courses {
    /**
     * Initializes a new instance of the Courses manager, automatically loading
     * courses from the configured root directory.
     */
    constructor() {
        this.coursesList = [];
        this._readCourses();
    }

    /**
     * Reads course directories from the configured root directory,
     * creates Course objects, and populates the internal courses list.
     * Hidden directories and non-directory files are ignored.
     * Courses are sorted by name.
     * @private
     */
    _readCourses() {
        this.coursesList = [];
        const rootDirPath = ConfigUtils.get('root_dir');
        if (!rootDirPath) {
            console.error("Root directory for courses is not configured. Cannot load courses.");
            return;
        }

        const rootDir = Gio.File.new_for_path(rootDirPath);
        if (!rootDir.query_exists(null)) {
            console.warn(`Courses root directory not found: ${rootDirPath}`);
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
                    const courseDirFile = rootDir.get_child(fileInfo.get_name());
                    this.coursesList.push(new Course(courseDirFile));
                }
            }
            enumerator.close(null);
            this.coursesList.sort((a, b) => a.name.localeCompare(b.name));
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
     * Gets the currently active course.
     * This is determined by resolving the symlink at CURRENT_COURSE_SYMLINK_PATH.
     * Due to observed inconsistencies with Gio.File object's symlink method reporting,
     * this getter uses GLib.file_test to confirm the symlink type and
     * GLib.spawn_command_line_sync('readlink ...') to robustly get the target path.
     * @type {Course | null} The current Course object, or null if no current course is set,
     * the symlink is broken, or its target cannot be resolved to a known course.
     * @public
     */
    get current() {
        const symlinkPathString = CURRENT_COURSE_SYMLINK_PATH;
        const symlinkFileGio = Gio.File.new_for_path(symlinkPathString);

        try {
            if (symlinkFileGio.query_exists(null) && GLib.file_test(symlinkPathString, GLib.FileTest.IS_SYMLINK)) {
                let targetPathString = null;
                try {
                    const command = `readlink "${symlinkPathString}"`;
                    const [success, stdout_bytes, stderr_bytes, wait_status] = GLib.spawn_command_line_sync(command);

                    if (success && wait_status === 0 && stdout_bytes) {
                        targetPathString = ByteArray.toString(stdout_bytes).trim();
                    } else {
                        let stderr_str = stderr_bytes ? ByteArray.toString(stderr_bytes).trim() : "N/A";
                        console.error(`Courses.current: CLI 'readlink "${symlinkPathString}"' failed. Success: ${success}, Status: ${wait_status}, Stderr: "${stderr_str}"`);
                        return null;
                    }
                } catch (e_cli_readlink) {
                    console.error(`Courses.current: Exception during CLI 'readlink "${symlinkPathString}"': ${e_cli_readlink.message}`);
                    return null;
                }

                if (!targetPathString) {
                    console.warn(`Courses.current: Symlink target for "${symlinkPathString}" resolved to empty or null via CLI.`);
                    return null;
                }

                const targetFile = Gio.File.new_for_path(targetPathString);
                if (targetFile.query_exists(null)) {
                    const existingCourse = this.coursesList.find(c => c.path.get_uri() === targetFile.get_uri());
                    if (existingCourse) {
                        return existingCourse;
                    } else {
                        console.warn(`Courses.current: Symlink target "${targetPathString}" (from "${symlinkPathString}") exists but does not match any known course URI.`);
                    }
                } else {
                    console.warn(`Courses.current: Symlink target "${targetPathString}" (from "${symlinkPathString}") does not exist.`);
                }
            }
        } catch (e) {
            console.error(`Courses.current: General error resolving symlink "${symlinkPathString}": ${e.message}`);
        }
        return null;
    }

    /**
     * Sets the currently active course.
     * This updates the symlink at CURRENT_COURSE_SYMLINK_PATH to point to the
     * specified course's directory and updates the watch file at
     * CURRENT_COURSE_WATCH_FILE_PATH with the course's short name.
     * @param {Course | null} courseToSet - The Course object to set as current.
     * Pass null to remove the current course symlink and clear the watch file.
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
                try {
                    symlinkFile.make_symbolic_link(courseToSet.path.get_path(), null);
                } catch (e) {
                    console.error(`Courses.current: Failed to create symlink to "${courseToSet.path.get_path()}": ${e.message}`);
                }

                const shortName = (courseToSet.info && courseToSet.info.short) ? courseToSet.info.short : courseToSet.name;
                const watchFileContent = `${shortName}\n`;
                try {
                    watchFile.replace_contents(watchFileContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                } catch (e_watch) {
                    console.error(`Courses.current: Failed to update watch file "${watchFile.get_path()}": ${e_watch.message}`);
                }
            } else if (courseToSet === null) {
                try {
                    if (watchFile.query_exists(null)) {
                        watchFile.replace_contents("", null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                    }
                } catch (e_watch_clear) {
                    console.error(`Courses.current: Failed to clear watch file "${watchFile.get_path()}": ${e_watch_clear.message}`);
                }
            } else {
                console.warn("Courses.current: Setter called with invalid 'courseToSet' argument (not a Course object or null).");
            }
        } catch (e) {
            console.error(`Courses.current: Error setting current course to "${courseToSet ? courseToSet.name : 'null'}": ${e.message}`);
        }
    }

    /**
     * Finds a course in the loaded list by its name (directory basename).
     * @param {string} name - The name of the course to find.
     * @returns {Course | undefined} The Course object if found, otherwise undefined.
     * @public
     */
    findByName(name) {
        return this.coursesList.find(course => course.name === name);
    }

    /**
     * Gets a course by its index in the internal (sorted) list.
     * @param {number} index - The index of the course.
     * @returns {Course | undefined} The course at the specified index, or undefined if out of bounds.
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
     * Allows iteration over the loaded courses (e.g., using a for...of loop).
     * @returns {Iterator<Course>}
     * @public
     */
    [Symbol.iterator]() {
        return this.coursesList[Symbol.iterator]();
    }
};

var exports = { Courses, CURRENT_COURSE_SYMLINK_PATH, CURRENT_COURSE_WATCH_FILE_PATH };