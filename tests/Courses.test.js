'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { Courses, CURRENT_COURSE_SYMLINK_PATH, CURRENT_COURSE_WATCH_FILE_PATH } = imports.core.Courses;
const { Course, INFO_FILE_NAME } = imports.core.Course;
const { ConfigUtils } = imports.config.ConfigUtils;

/**
 * Helper function to get the path string to the root directory where test courses are stored.
 * @returns {string | null} The path to the test courses root, or null if not configured.
 */
function getTestCoursesPath() {
    return ConfigUtils.get('root_dir');
}

/**
 * Helper function to read file content.
 * @param {Gio.File} file - The Gio.File object representing the file to read.
 * @returns {string | null} The file content as a string, or null if reading fails or file doesn't exist.
 */
function readFileContent(file) {
    if (!file.query_exists(null)) return null;
    try {
        const [success, contents] = file.load_contents(null);
        return success ? ByteArray.toString(contents) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Helper function to write an info.json file for a test course.
 * @param {Gio.File} courseDirFile - The Gio.File object for the course's directory.
 * @param {Object} infoData - The JavaScript object to stringify and write as info.json.
 * @returns {boolean} True if writing was successful, false otherwise.
 */
function writeInfoJson(courseDirFile, infoData) {
    const infoFile = courseDirFile.get_child(INFO_FILE_NAME);
    const content = JSON.stringify(infoData, null, 4);
    try {
        infoFile.replace_contents(content, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        return true;
    } catch (e) {
        print(`ERROR writing test info.json for ${courseDirFile.get_basename()}: ${e.message}`);
        return false;
    }
}

/**
 * Helper function to delete the info.json file from a course directory, if it exists.
 * @param {Gio.File} courseDirFile - The Gio.File object for the course's directory.
 */
function deleteInfoJson(courseDirFile) {
    const infoFile = courseDirFile.get_child(INFO_FILE_NAME);
    if (infoFile.query_exists(null)) {
        try {
            infoFile.delete(null);
        } catch (e) {
            // Suppress error during cleanup
        }
    }
}

/**
 * Recursively deletes a directory and its contents.
 * @param {Gio.File} dirFile - The Gio.File object representing the directory to delete.
 */
function deleteDirectoryRecursive(dirFile) {
    if (!dirFile.query_exists(null)) {
        return;
    }
    try {
        const enumerator = dirFile.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        let childInfo;
        while ((childInfo = enumerator.next_file(null)) !== null) {
            const childFile = dirFile.get_child(childInfo.get_name());
            if (childInfo.get_file_type() === Gio.FileType.DIRECTORY) {
                deleteDirectoryRecursive(childFile);
            } else {
                childFile.delete(null);
            }
        }
        enumerator.close(null);
        dirFile.delete(null);
    } catch (e) {
        print(`Warning: Issue during recursive deletion of ${dirFile.get_path()}: ${e.message}. Manual cleanup might be needed.`);
    }
}

/**
 * Helper to safely delete a file if it exists.
 * @param {Gio.File} file - The Gio.File object representing the file to delete.
 */
function deleteFileIfExists(file) {
    if (file.query_exists(null)) {
        try {
            file.delete(null);
        } catch (e) {
            // Suppress error during cleanup
        }
    }
}

/**
 * Test suite for the Courses class.
 * @namespace coursesTests
 */
var coursesTests = {
    /** @type {string | null} Path string to the root of the test courses directory. */
    testCoursesRootPath: null,
    /** @type {Gio.File | null} Gio.File object for the current course symlink. */
    symlinkFile: null,
    /** @type {Gio.File | null} Gio.File object for the current course watch file. */
    watchFile: null,

    /**
     * Sets up shared resources before all tests in this suite run.
     * Initializes paths and file objects for the symlink and watch file.
     */
    beforeAll: () => {
        this.testCoursesRootPath = getTestCoursesPath();
        assertTrue(!!this.testCoursesRootPath, "Setup: ConfigUtils should return a root_dir for Courses tests.");
        if (!this.testCoursesRootPath) {
            throw new Error("FATAL: Missing testCoursesRootPath in Courses.test.js beforeAll. Cannot proceed with tests.");
        }

        this.symlinkFile = Gio.File.new_for_path(CURRENT_COURSE_SYMLINK_PATH);
        this.watchFile = Gio.File.new_for_path(CURRENT_COURSE_WATCH_FILE_PATH);
    },

    /**
     * Cleans up the current course symlink and watch file before each test.
     * This ensures a consistent state for tests involving these files.
     */
    beforeEach: () => {
        deleteFileIfExists(this.symlinkFile);
        deleteFileIfExists(this.watchFile);
    },

    /**
     * Performs final cleanup after all tests in this suite have run.
     * Removes the current course symlink and watch file.
     */
    afterAll: () => {
        deleteFileIfExists(this.symlinkFile);
        deleteFileIfExists(this.watchFile);
    },

    'test constructor and _readCourses loads and sorts courses': () => {
        const courses = new Courses();
        assertEqual(courses.coursesList.length, 3, "Should load 3 non-hidden course directories (TestCourse1, TestCourse2, EmptyCourse).");

        if (courses.coursesList.length === 3) {
            assertEqual(courses.coursesList[0].name, "EmptyCourse", "First course after sorting should be 'EmptyCourse'.");
            assertEqual(courses.coursesList[1].name, "TestCourse1", "Second course after sorting should be 'TestCourse1'.");
            assertEqual(courses.coursesList[2].name, "TestCourse2", "Third course after sorting should be 'TestCourse2'.");
        }
    },

    'test _readCourses handles empty root_dir': () => {
        const originalRootDir = ConfigUtils.get('root_dir');
        const emptyTestDirFile = Gio.File.new_for_path(GLib.build_filenamev([this.testCoursesRootPath, 'temp_empty_test_root']));
        try {
            emptyTestDirFile.make_directory_with_parents(null);
            ConfigUtils.set('root_dir', emptyTestDirFile.get_path());

            const courses = new Courses();
            assertEqual(courses.coursesList.length, 0, "Should load 0 courses when root_dir is empty.");

        } finally {
            ConfigUtils.set('root_dir', originalRootDir);
            if (emptyTestDirFile.query_exists(null)) {
                deleteDirectoryRecursive(emptyTestDirFile);
            }
        }
    },

    'test current getter when no symlink exists': () => {
        deleteFileIfExists(this.symlinkFile);
        const courses = new Courses();
        assertNull(courses.current, "courses.current should be null if the symlink does not exist.");
    },

    'test current setter and getter': () => {
        const courses = new Courses();
        const courseToSet = courses.findByName("TestCourse1");
        assertNotNull(courseToSet, "Test setup: 'TestCourse1' should exist in the courses list.");
        if (!courseToSet) return;

        courses.current = courseToSet;

        assertTrue(GLib.file_test(CURRENT_COURSE_SYMLINK_PATH, GLib.FileTest.EXISTS), "Symlink file should exist after setting current course.");
        assertTrue(GLib.file_test(CURRENT_COURSE_SYMLINK_PATH, GLib.FileTest.IS_SYMLINK), "File at symlink path should be a symlink (checked with GLib.file_test).");

        const resolvedByGetter = courses.current;
        assertNotNull(resolvedByGetter, "courses.current getter should successfully resolve the symlink to a Course object.");
        if (resolvedByGetter) {
            assertTrue(resolvedByGetter.equals(courseToSet), "The Course object resolved by the getter should be equal to the one that was set.");
        }

        assertTrue(this.watchFile.query_exists(null), "Watch file should be created after setting current course.");
        const watchContent = readFileContent(this.watchFile);
        assertNotNull(watchContent, "Watch file should have content.");
        assertEqual(watchContent.trim(), courseToSet.info.short, "Watch file content should be the short name of the set course.");
    },

    'test current setter with null (removes symlink and watch file)': () => {
        const courses = new Courses();
        const courseToSet = courses.findByName("TestCourse1");
        if (!courseToSet) {
            assertTrue(false, "Test setup: 'TestCourse1' missing, cannot proceed with test.");
            return;
        }
        courses.current = courseToSet;

        assertTrue(GLib.file_test(CURRENT_COURSE_SYMLINK_PATH, GLib.FileTest.EXISTS), "Pre-check: Symlink should exist before setting current to null.");
        assertTrue(this.watchFile.query_exists(null), "Pre-check: Watch file should exist before setting current to null.");

        courses.current = null;

        assertFalse(GLib.file_test(CURRENT_COURSE_SYMLINK_PATH, GLib.FileTest.EXISTS), "Symlink should be removed after setting current course to null.");
        const watchContent = readFileContent(this.watchFile);
        assertNotNull(watchContent, "Watch file should still exist after setting current to null (content is cleared).");
        assertEqual(watchContent, "", "Watch file content should be empty after setting current course to null.");
    },

    'test current getter with broken symlink': () => {
        deleteFileIfExists(this.symlinkFile);
        const nonExistentTargetPath = GLib.build_filenamev([this.testCoursesRootPath, 'NonExistentCourseTarget']);
        try {
            this.symlinkFile.make_symbolic_link(nonExistentTargetPath, null);
        } catch (e) {
            assertTrue(false, `Test setup: Failed to create broken symlink for test: ${e.message}`);
            return;
        }

        const courses = new Courses();
        assertNull(courses.current, "courses.current should be null if the symlink is broken (points to a non-existent target).");
    },

    'test findByName': () => {
        const courses = new Courses();
        const foundCourse = courses.findByName("TestCourse1");
        assertNotNull(foundCourse, "findByName should find 'TestCourse1'.");
        if (foundCourse) {
            assertEqual(foundCourse.name, "TestCourse1", "Found course should have the name 'TestCourse1'.");
        }

        const notFoundCourse = courses.findByName("DefinitelyNoSuchCourse");
        assertEqual(notFoundCourse, undefined, "findByName should return undefined for a non-existent course name.");
    },

    'test reloadCourses': () => {
        const courses = new Courses();
        const initialLength = courses.coursesList.length;
        assertEqual(initialLength, 3, "Pre-check: Initial number of courses should be 3.");

        const newCourseDirName = 'NewTempCourseForReload';
        const newCourseDir = Gio.File.new_for_path(GLib.build_filenamev([this.testCoursesRootPath, newCourseDirName]));

        try {
            newCourseDir.make_directory_with_parents(null);
            writeInfoJson(newCourseDir, { title: "New Temp Course", short: "NTC" });

            courses.reloadCourses();
            assertEqual(courses.coursesList.length, initialLength + 1, "Number of courses should increase by one after reload with a new course.");
            assertNotNull(courses.findByName(newCourseDirName), `Newly created course '${newCourseDirName}' should be found after reload.`);

        } finally {
            if (newCourseDir.query_exists(null)) {
                deleteDirectoryRecursive(newCourseDir);
            }
            courses.reloadCourses();
            assertEqual(courses.coursesList.length, initialLength, "Number of courses should revert to initial count after cleanup and another reload.");
        }
    },

    'test list-like properties (length, get, iterator)': () => {
        const courses = new Courses();
        assertEqual(courses.length, 3, "Courses object 'length' property should be 3.");
        assertNotNull(courses.get(0), "courses.get(0) should return a Course object.");
        assertEqual(courses.get(0).name, "EmptyCourse", "courses.get(0).name should be 'EmptyCourse' (due to sorting).");

        let count = 0;
        let foundTestCourse1InIteration = false;
        for (const course of courses) {
            assertNotNull(course, "Iterated course should not be null.");
            assertTrue(course instanceof Course, "Each item yielded by iterator should be a Course instance.")
            if (course.name === "TestCourse1") {
                foundTestCourse1InIteration = true;
            }
            count++;
        }
        assertEqual(count, 3, "Iterator should yield 3 courses.");
        assertTrue(foundTestCourse1InIteration, "Iterator should include 'TestCourse1'.");
    }
};

var exports = coursesTests;