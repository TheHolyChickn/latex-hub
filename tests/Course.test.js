'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { Course, INFO_FILE_NAME } = imports.core.Course;
const { Lectures } = imports.core.Lectures;
const { ConfigUtils } = imports.config.ConfigUtils;

/**
 * Helper function to get the path string to the root directory where test courses are stored.
 * @returns {string | null} The path to the test courses root, or null if not configured.
 */
function getTestCoursesPathString() {
    return ConfigUtils.get('root_dir');
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
            print(`Warning: Could not delete info.json during cleanup for ${courseDirFile.get_basename()}: ${e.message}`);
        }
    }
}

/**
 * Test suite for the Course class.
 * @namespace courseTests
 */
var courseTests = {
    /** @type {Gio.File | null} The Gio.File object for the root directory of test courses. */
    testCoursesRootFile: null,
    /** @type {Gio.File | null} The Gio.File object for the 'TestCourse1' directory. */
    courseAFile: null,
    /** @type {Gio.File | null} The Gio.File object for the 'TestCourse2' directory. */
    courseBFile: null,
    /** @type {Gio.File | null} The Gio.File object for the 'EmptyCourse' directory. */
    emptyCourseFile: null,

    /**
     * Sets up shared resources before all tests in this suite run.
     * Initializes paths to test course directories.
     */
    beforeAll: () => {
        const testCoursesPathString = getTestCoursesPathString();
        assertTrue(!!testCoursesPathString, "Setup: ConfigUtils should return a root_dir string for Course tests.");
        if (!testCoursesPathString) {
            throw new Error("FATAL: Missing testCoursesPathString in Course.test.js beforeAll. Setup failed.");
        }

        this.testCoursesRootFile = Gio.File.new_for_path(testCoursesPathString);
        assertTrue(this.testCoursesRootFile.query_exists(null) && this.testCoursesRootFile.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY,
            "Test courses root directory must exist and be a directory.");

        this.courseAFile = this.testCoursesRootFile.get_child('TestCourse1');
        this.courseBFile = this.testCoursesRootFile.get_child('TestCourse2');
        this.emptyCourseFile = this.testCoursesRootFile.get_child('EmptyCourse');

        assertTrue(this.courseAFile.query_exists(null), "'TestCourse1' directory must exist for tests.");
        assertTrue(this.courseBFile.query_exists(null), "'TestCourse2' directory must exist for tests.");
        assertTrue(this.emptyCourseFile.query_exists(null), "'EmptyCourse' directory must exist for tests.");
    },

    /**
     * Placeholder for cleanup after each test if needed.
     * Currently, major cleanup is handled by setup_test_env.js.
     */
    afterEach: () => {
        //
    },

    'test Course constructor sets path and name': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized in beforeAll.");
        const courseA = new Course(this.courseAFile);
        assertEqual(courseA.path.get_uri(), this.courseAFile.get_uri(), "Course path URI should be set correctly.");
        assertEqual(courseA.name, "TestCourse1", "Course name should be derived from its directory's basename.");
    },

    'test _loadInfo with existing and complete info.json': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized in beforeAll.");
        const courseA = new Course(this.courseAFile);
        assertNotNull(courseA.info, "Course.info object should not be null.");
        assertEqual(courseA.info.title, "Test Course Alpha", "Title should be loaded from TestCourse1/info.json.");
        assertEqual(courseA.info.short, "TC1", "Short name should be loaded from TestCourse1/info.json.");
        assertEqual(courseA.info.course_id, "TC 101", "Course ID should be loaded from TestCourse1/info.json.");
        assertEqual(courseA.info.preamble_path, undefined, "Preamble path should be undefined as it's not in TestCourse1/info.json.");
    },

    'test _loadInfo with existing info.json (some fields missing, uses defaults)': () => {
        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized for creating temporary test data.");
        const tempCourseDir = this.testCoursesRootFile.get_child("TempInfoCourse");
        try {
            tempCourseDir.make_directory_with_parents(null);
            const partialInfo = { title: "Partial Info Title", course_id: "PI 101" };
            assertTrue(writeInfoJson(tempCourseDir, partialInfo), "Test setup: Should write partial info.json for 'TempInfoCourse'.");

            const course = new Course(tempCourseDir);
            assertEqual(course.info.title, "Partial Info Title", "Title should be loaded from partial info.json.");
            assertEqual(course.info.course_id, "PI 101", "Course ID should be loaded from partial info.json.");
            assertEqual(course.info.short, "TempInf", "Short name should use default generation (substring of directory name).");
            assertEqual(course.info.department, "", "Department should use default (empty string).");
            assertEqual(course.info.preamble_path, undefined, "Preamble path should use default (undefined).");
        } finally {
            deleteInfoJson(tempCourseDir);
            if (tempCourseDir.query_exists(null)) {
                try { tempCourseDir.delete(null); } catch(e) { /* ignore cleanup error */ }
            }
        }
    },

    'test _loadInfo with missing info.json (uses all defaults)': () => {
        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized for creating temporary test data.");
        const noInfoCourseDir = this.testCoursesRootFile.get_child("NoInfoCourse");
        try {
            noInfoCourseDir.make_directory_with_parents(null);
            deleteInfoJson(noInfoCourseDir);

            const course = new Course(noInfoCourseDir);
            assertNotNull(course.info, "Course.info should be a default object, not null.");
            assertEqual(course.info.title, "NoInfoCourse", "Title should default to the course (directory) name.");
            assertEqual(course.info.short, "NoInfoC", "Short name should default (substring of directory name).");
            assertEqual(course.info.course_id, "", "Course ID should default to an empty string.");
        } finally {
            if (noInfoCourseDir.query_exists(null)) {
                try { noInfoCourseDir.delete(null); } catch(e) { /* ignore cleanup error */ }
            }
        }
    },

    'test _loadInfo with malformed info.json (uses defaults)': () => {
        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized for creating temporary test data.");
        const malformedCourseDir = this.testCoursesRootFile.get_child("MalformedInfoCourse");
        const infoFile = malformedCourseDir.get_child(INFO_FILE_NAME);
        const malformedContent = '{"title": "Malformed", "short": "MF",, }';
        try {
            malformedCourseDir.make_directory_with_parents(null);
            infoFile.replace_contents(malformedContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

            const course = new Course(malformedCourseDir);
            assertNotNull(course.info, "Course.info should be a default object even with malformed JSON.");
            assertEqual(course.info.title, "MalformedInfoCourse", "Title should default to course name due to malformed JSON.");
            assertEqual(course.info.short, "Malform", "Short name should default (substring of directory name) due to malformed JSON.");
        } finally {
            if (infoFile.query_exists(null)) {
                try { infoFile.delete(null); } catch(e) { /* ignore cleanup error */ }
            }
            if (malformedCourseDir.query_exists(null)) {
                try { malformedCourseDir.delete(null); } catch(e) { /* ignore cleanup error */ }
            }
        }
    },

    'test lectures getter (lazy loading and correct type)': () => {
        assertNotNull(this.courseAFile, "courseAFile (TestCourse1) should be initialized.");
        const courseA = new Course(this.courseAFile);
        assertNull(courseA._lectures, "Internal _lectures property should be initially null (lazy loading).");

        const lecturesObj1 = courseA.lectures;
        assertNotNull(lecturesObj1, "First access to course.lectures should return a Lectures object.");
        assertTrue(lecturesObj1 instanceof Lectures, "The returned object from course.lectures should be an instance of Lectures.");
        assertNotNull(courseA._lectures, "Internal _lectures property should now be populated after first access.");
        assertTrue(lecturesObj1.course === courseA, "The Lectures object should be correctly associated with its parent Course instance.");
        assertEqual(lecturesObj1.lecturesList.length, 2, "Lectures object for TestCourse1 should load the correct number of lectures from setup.");

        const lecturesObj2 = courseA.lectures;
        assertTrue(lecturesObj1 === lecturesObj2, "Subsequent access to course.lectures should return the same cached instance.");
    },

    'test equals method': () => {
        assertNotNull(this.courseAFile, "courseAFile (TestCourse1) should be initialized.");
        assertNotNull(this.courseBFile, "courseBFile (TestCourse2) should be initialized.");

        const courseA1 = new Course(this.courseAFile);
        const courseA2 = new Course(this.courseAFile);
        const courseB = new Course(this.courseBFile);

        assertTrue(courseA1.equals(courseA2), "Two Course instances with the same path should be considered equal.");
        assertFalse(courseA1.equals(courseB), "Two Course instances with different paths should not be considered equal.");
        assertFalse(courseA1.equals(null), "A Course instance should not be equal to null.");
        assertFalse(courseA1.equals({ path: this.courseAFile }), "A Course instance should not be equal to a generic object, even if it has a similar path property.");
    },

    'test toString method': () => {
        assertNotNull(this.courseAFile, "courseAFile (TestCourse1) should be initialized.");
        const courseA = new Course(this.courseAFile);
        assertEqual(courseA.toString(), "<Course TestCourse1 (Test Course Alpha)>", "toString() should format correctly with title from info.json.");

        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized for creating temporary test data.");
        const noInfoCourseDir = this.testCoursesRootFile.get_child("ToStringDefaultCourse");
        try {
            noInfoCourseDir.make_directory_with_parents(null);
            deleteInfoJson(noInfoCourseDir);
            const courseDefault = new Course(noInfoCourseDir);
            assertEqual(courseDefault.toString(), "<Course ToStringDefaultCourse (ToStringDefaultCourse)>", "toString() should use course name as title if info.title is the default.");
        } finally {
            if (noInfoCourseDir.query_exists(null)) {
                try { noInfoCourseDir.delete(null); } catch(e) { /* ignore cleanup error */ }
            }
        }
    }
};

var exports = courseTests;