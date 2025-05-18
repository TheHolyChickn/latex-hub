'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

// Assuming GJS_PATH is set up by the runner
const { Courses, CURRENT_COURSE_SYMLINK_PATH, CURRENT_COURSE_WATCH_FILE_PATH } = imports.core.Courses;
const { Course, INFO_FILE_NAME } = imports.core.Course;
const { ConfigUtils } = imports.config.ConfigUtils;

// Helper to get the path to the test courses root
function getTestCoursesPath() {
    return ConfigUtils.get('root_dir');
}

/**
 * Helper to read file content.
 * @param {Gio.File} file
 * @returns {string|null}
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

// Helper to write file content for info.json during tests
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

// Helper to delete info.json
function deleteInfoJson(courseDirFile) {
    const infoFile = courseDirFile.get_child(INFO_FILE_NAME);
    if (infoFile.query_exists(null)) {
        try {
            infoFile.delete(null);
        } catch (e) { /* ignore cleanup error */ }
    }
}

/**
 * Recursively deletes a directory.
 * @param {Gio.File} dirFile - The directory to delete.
 */
function deleteDirectoryRecursive(dirFile) {
    // print(`DEBUG: Attempting to delete ${dirFile.get_path()}`);
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
        print(`DEBUG: Warning: Issue during deletion of ${dirFile.get_path()}: ${e.message}. Manual cleanup might be needed.`);
    }
}

/**
 * Helper to safely delete a file if it exists.
 * @param {Gio.File} file
 */
function deleteFileIfExists(file) {
    if (file.query_exists(null)) {
        try {
            file.delete(null);
        } catch (e) {
            // print(`Warning: Could not delete file for cleanup: ${file.get_path()}`);
        }
    }
}


var coursesTests = {
    testCoursesRootPath: null,
    symlinkFile: null,
    watchFile: null,

    beforeAll: () => {
        this.testCoursesRootPath = getTestCoursesPath();
        assertTrue(!!this.testCoursesRootPath, "Setup: ConfigUtils should return a root_dir for Courses tests.");
        if (!this.testCoursesRootPath) throw new Error("Missing testCoursesRootPath in Courses.test.js beforeAll");

        this.symlinkFile = Gio.File.new_for_path(CURRENT_COURSE_SYMLINK_PATH);
        this.watchFile = Gio.File.new_for_path(CURRENT_COURSE_WATCH_FILE_PATH);
    },

    beforeEach: () => {
        // Ensure a clean state for symlink and watch file before each test involving them.
        // setup_test_env.js already does this once, but tests might modify them.
        deleteFileIfExists(this.symlinkFile);
        deleteFileIfExists(this.watchFile);
    },

    afterAll: () => {
        // Final cleanup of symlink and watch file
        deleteFileIfExists(this.symlinkFile);
        deleteFileIfExists(this.watchFile);
        // Note: Reverting config.json's root_dir is a manual step after all tests.
    },

    'test constructor and _readCourses loads and sorts courses': () => {
        const courses = new Courses();
        // Expecting TestCourse1, TestCourse2, EmptyCourse. .HiddenCourse and NotACourseFile.txt ignored.
        assertEqual(courses.coursesList.length, 3, "Should load 3 non-hidden course directories.");

        // Check sorting by name (EmptyCourse, TestCourse1, TestCourse2)
        if (courses.coursesList.length === 3) {
            assertEqual(courses.coursesList[0].name, "EmptyCourse", "First course should be EmptyCourse (sorted).");
            assertEqual(courses.coursesList[1].name, "TestCourse1", "Second course should be TestCourse1 (sorted).");
            assertEqual(courses.coursesList[2].name, "TestCourse2", "Third course should be TestCourse2 (sorted).");
        }
    },

    'test _readCourses handles empty root_dir': () => {
        const originalRootDir = ConfigUtils.get('root_dir');
        const emptyTestDirFile = Gio.File.new_for_path(GLib.build_filenamev([this.testCoursesRootPath, 'temp_empty_root']));
        try {
            emptyTestDirFile.make_directory_with_parents(null);
            ConfigUtils.set('root_dir', emptyTestDirFile.get_path()); // Temporarily change config

            const courses = new Courses();
            assertEqual(courses.coursesList.length, 0, "Should load 0 courses from an empty root_dir.");

        } finally {
            ConfigUtils.set('root_dir', originalRootDir); // Restore original config
            if (emptyTestDirFile.query_exists(null)) { // Cleanup
                const enumerator = emptyTestDirFile.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
                let childInfo;
                while((childInfo = enumerator.next_file(null)) !== null) {
                    emptyTestDirFile.get_child(childInfo.get_name()).delete(null);
                }
                enumerator.close(null);
                emptyTestDirFile.delete(null);
            }
        }
    },

    'test current getter when no symlink exists': () => {
        deleteFileIfExists(this.symlinkFile); // Ensure it's gone
        const courses = new Courses();
        assertNull(courses.current, "courses.current should be null if symlink does not exist.");
    },

    'test current setter and getter': () => {
        const courses = new Courses();
        const courseToSet = courses.findByName("TestCourse1");
        assertNotNull(courseToSet, "TestCourse1 should exist in the courses list.");
        if (!courseToSet) return;

        courses.current = courseToSet;

        assertTrue(this.symlinkFile.query_exists(null), "Symlink should be created after setting current course.");
        assertTrue(this.symlinkFile.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.SYMBOLIC_LINK, "File should be a symlink.");

        const resolvedByGetter = courses.current;
        assertNotNull(resolvedByGetter, "courses.current getter should resolve the symlink.");
        if (resolvedByGetter) {
            assertTrue(resolvedByGetter.equals(courseToSet), "Getter should return the course that was set.");
        }

        // Check watch file content
        assertTrue(this.watchFile.query_exists(null), "Watch file should be created.");
        const watchContent = readFileContent(this.watchFile);
        assertNotNull(watchContent, "Watch file should have content.");
        // TestCourse1 info.short is "TC1"
        assertEqual(watchContent.trim(), courseToSet.info.short, "Watch file content should be the short name of the course.");
    },

    'test current setter with null (removes symlink and watch file)': () => {
        const courses = new Courses();
        const courseToSet = courses.findByName("TestCourse1");
        if (!courseToSet) {assertTrue(false, "TestCourse1 missing for setup"); return;}
        courses.current = courseToSet; // Set it first
        assertTrue(this.symlinkFile.query_exists(null), "Symlink should exist initially.");
        assertTrue(this.watchFile.query_exists(null), "Watch file should exist initially.");

        courses.current = null; // Now set to null

        assertFalse(this.symlinkFile.query_exists(null), "Symlink should be removed after setting current course to null.");
        // Your Courses.js current setter clears watch file content, doesn't delete file.
        const watchContent = readFileContent(this.watchFile);
        assertNotNull(watchContent, "Watch file should still exist after setting current to null.");
        assertEqual(watchContent, "", "Watch file should be empty after setting current course to null.");
    },

    'test current getter with broken symlink': () => {
        deleteFileIfExists(this.symlinkFile);
        const nonExistentTargetPath = GLib.build_filenamev([this.testCoursesRootPath, 'NonExistentCourse']);
        this.symlinkFile.make_symbolic_link(nonExistentTargetPath, null); // Create a symlink to a non-existent target

        const courses = new Courses();
        assertNull(courses.current, "courses.current should be null if symlink is broken.");
    },

    'test findByName': () => {
        const courses = new Courses();
        const foundCourse = courses.findByName("TestCourse1");
        assertNotNull(foundCourse, "findByName should find 'TestCourse1'.");
        if (foundCourse) {
            assertEqual(foundCourse.name, "TestCourse1", "Found course should have the correct name.");
        }

        const notFoundCourse = courses.findByName("NoSuchCourse");
        assertEqual(notFoundCourse, undefined, "findByName should return undefined for non-existent course.");
    },

    'test reloadCourses': () => {
        const courses = new Courses();
        const initialLength = courses.coursesList.length;
        assertEqual(initialLength, 3, "Initial number of courses.");

        // Create a new temporary course directory
        const newCourseDir = Gio.File.new_for_path(GLib.build_filenamev([this.testCoursesRootPath, 'NewTempCourse']));
        const infoFile = newCourseDir.get_child(INFO_FILE_NAME);
        try {
            newCourseDir.make_directory_with_parents(null);
            writeInfoJson(newCourseDir, { title: "New Temp Course", short: "NTC" });

            courses.reloadCourses(); // Reload
            assertEqual(courses.coursesList.length, initialLength + 1, "Number of courses should increase after reload.");
            assertNotNull(courses.findByName("NewTempCourse"), "Newly created course should be found after reload.");

        } finally {
            // Cleanup
            if (newCourseDir.query_exists(null)) deleteDirectoryRecursive(newCourseDir);
            courses.reloadCourses(); // Reload again to restore original list count for other tests
            assertEqual(courses.coursesList.length, initialLength, "Number of courses should revert after cleanup and reload.");
        }
    },

    'test list-like properties (length, get, iterator)': () => {
        const courses = new Courses();
        assertEqual(courses.length, 3, "Length property should be 3.");
        assertNotNull(courses.get(0), "get(0) should return a course.");
        // Name depends on sort order: EmptyCourse, TestCourse1, TestCourse2
        assertEqual(courses.get(0).name, "EmptyCourse", "get(0).name should be 'EmptyCourse'.");

        let count = 0;
        let foundTestCourse1 = false;
        for (const course of courses) {
            assertNotNull(course, "Iterated course should not be null.");
            if (course.name === "TestCourse1") foundTestCourse1 = true;
            count++;
        }
        assertEqual(count, 3, "Iterator should yield 3 courses.");
        assertTrue(foundTestCourse1, "Iterator should include TestCourse1.");
    }
};

var exports = coursesTests;