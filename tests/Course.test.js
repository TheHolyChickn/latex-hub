'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

// Assuming GJS_PATH is set up by the runner
const { Course, INFO_FILE_NAME } = imports.core.Course; // INFO_FILE_NAME is exported by Course.js
const { Lectures } = imports.core.Lectures;
const { ConfigUtils } = imports.config.ConfigUtils;

// Helper to get the path string to the test courses root
function getTestCoursesPathString() {
    return ConfigUtils.get('root_dir');
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

var courseTests = {
    /** @type {Gio.File | null} */
    testCoursesRootFile: null,
    /** @type {Gio.File | null} */
    courseAFile: null, // Renamed for clarity, represents TestCourse1 directory
    /** @type {Gio.File | null} */
    courseBFile: null, // Renamed for clarity, represents TestCourse2 directory
    /** @type {Gio.File | null} */
    emptyCourseFile: null, // Renamed for clarity, represents EmptyCourse directory

    beforeAll: () => {
        const testCoursesPathString = getTestCoursesPathString();
        assertTrue(!!testCoursesPathString, "Setup: ConfigUtils should return a root_dir string for Course tests.");
        if (!testCoursesPathString) throw new Error("Missing testCoursesPathString in Course.test.js beforeAll");

        this.testCoursesRootFile = Gio.File.new_for_path(testCoursesPathString);
        assertTrue(this.testCoursesRootFile.query_exists(null) && this.testCoursesRootFile.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY,
            "Test courses root directory must exist.");

        this.courseAFile = this.testCoursesRootFile.get_child('TestCourse1');
        this.courseBFile = this.testCoursesRootFile.get_child('TestCourse2');
        this.emptyCourseFile = this.testCoursesRootFile.get_child('EmptyCourse');

        assertTrue(this.courseAFile.query_exists(null), "TestCourse1 directory must exist.");
        assertTrue(this.courseBFile.query_exists(null), "TestCourse2 directory must exist.");
        assertTrue(this.emptyCourseFile.query_exists(null), "EmptyCourse directory must exist.");
    },

    afterEach: () => {
        // Minimal cleanup; setup_test_env.js handles major resets.
        // If tests create *new* top-level course dirs, they should clean them here or within the test.
    },

    'test Course constructor sets path and name': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized in beforeAll");
        const courseA = new Course(this.courseAFile);
        assertEqual(courseA.path.get_uri(), this.courseAFile.get_uri(), "Course path should be set correctly.");
        assertEqual(courseA.name, "TestCourse1", "Course name should be derived from path basename.");
    },

    'test _loadInfo with existing and complete info.json': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized in beforeAll");
        const courseA = new Course(this.courseAFile); // TestCourse1 has info.json from setup
        assertNotNull(courseA.info, "courseA.info should not be null.");
        assertEqual(courseA.info.title, "Test Course Alpha", "Title from TestCourse1/info.json");
        assertEqual(courseA.info.short, "TC1", "Short name from TestCourse1/info.json");
        assertEqual(courseA.info.course_id, "TC 101", "Course ID from TestCourse1/info.json");
        assertEqual(courseA.info.preamble_path, undefined, "Preamble path from TestCourse1/info.json");
    },

    'test _loadInfo with existing info.json (some fields missing, uses defaults)': () => {
        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized");
        const tempCourseDir = this.testCoursesRootFile.get_child("TempInfoCourse");
        try {
            tempCourseDir.make_directory_with_parents(null);
            const partialInfo = { title: "Partial Info Title", course_id: "PI 101" };
            assertTrue(writeInfoJson(tempCourseDir, partialInfo), "Should write partial info.json for test.");

            const course = new Course(tempCourseDir);
            assertEqual(course.info.title, "Partial Info Title", "Title from partial info.json");
            assertEqual(course.info.course_id, "PI 101", "Course ID from partial info.json");
            assertEqual(course.info.short, "TempInf", "Short name should use default (substring of name, 7 chars)");
            assertEqual(course.info.department, "", "Department should use default (empty string)");
            assertEqual(course.info.preamble_path, undefined, "Preamble path should use default");
        } finally {
            deleteInfoJson(tempCourseDir);
            if (tempCourseDir.query_exists(null)) tempCourseDir.delete(null);
        }
    },

    'test _loadInfo with missing info.json (uses all defaults)': () => {
        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized");
        const noInfoCourseDir = this.testCoursesRootFile.get_child("NoInfoCourse");
        try {
            noInfoCourseDir.make_directory_with_parents(null);
            deleteInfoJson(noInfoCourseDir); // Ensure it's missing

            const course = new Course(noInfoCourseDir);
            assertNotNull(course.info, "course.info should still be an object.");
            assertEqual(course.info.title, "NoInfoCourse", "Title should default to course name.");
            assertEqual(course.info.short, "NoInfoC", "Short name should default (substring of name).");
            assertEqual(course.info.course_id, "", "Course ID should default to empty string.");
        } finally {
            if (noInfoCourseDir.query_exists(null)) noInfoCourseDir.delete(null);
        }
    },

    'test _loadInfo with malformed info.json (uses defaults)': () => {
        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized");
        const malformedCourseDir = this.testCoursesRootFile.get_child("MalformedInfoCourse");
        const infoFile = malformedCourseDir.get_child(INFO_FILE_NAME);
        const malformedContent = '{"title": "Malformed", "short": "MF",, }'; // Extra comma
        try {
            malformedCourseDir.make_directory_with_parents(null);
            infoFile.replace_contents(malformedContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

            const course = new Course(malformedCourseDir);
            assertNotNull(course.info, "course.info should be an object even with malformed JSON.");
            assertEqual(course.info.title, "MalformedInfoCourse", "Title should default due to malformed JSON.");
            assertEqual(course.info.short, "Malform", "Short name should default due to malformed JSON.");
        } finally {
            if (infoFile.query_exists(null)) infoFile.delete(null);
            if (malformedCourseDir.query_exists(null)) malformedCourseDir.delete(null);
        }
    },

    'test lectures getter (lazy loading and correct type)': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized");
        const courseA = new Course(this.courseAFile);
        assertNull(courseA._lectures, "Initially _lectures should be null (lazy loading).");

        const lecturesObj1 = courseA.lectures;
        assertNotNull(lecturesObj1, "First access to course.lectures should return an object.");
        assertTrue(lecturesObj1 instanceof Lectures, "course.lectures should be an instance of Lectures.");
        assertNotNull(courseA._lectures, "_lectures should now be populated.");
        assertTrue(lecturesObj1.course === courseA, "Lectures object should be associated with the correct course instance.");
        assertEqual(lecturesObj1.lecturesList.length, 2, "Lectures object for TestCourse1 should load 2 lectures from setup.");

        const lecturesObj2 = courseA.lectures;
        assertTrue(lecturesObj1 === lecturesObj2, "Subsequent access to course.lectures should return the same instance.");
    },

    'test equals method': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized");
        assertNotNull(this.courseBFile, "courseBFile should be initialized");

        const courseA1 = new Course(this.courseAFile);
        const courseA2 = new Course(this.courseAFile); // Different instance, same path
        const courseB = new Course(this.courseBFile);

        assertTrue(courseA1.equals(courseA2), "Two Course instances with the same path should be equal.");
        assertFalse(courseA1.equals(courseB), "Two Course instances with different paths should not be equal.");
        assertFalse(courseA1.equals(null), "Course should not be equal to null.");
        assertFalse(courseA1.equals({ path: this.courseAFile }), "Course should not be equal to a generic object with same path.");
    },

    'test toString method': () => {
        assertNotNull(this.courseAFile, "courseAFile should be initialized");
        const courseA = new Course(this.courseAFile); // TestCourse1 info.json has title "Test Course Alpha"
        assertEqual(courseA.toString(), "<Course TestCourse1 (Test Course Alpha)>", "toString() should format correctly.");

        assertNotNull(this.testCoursesRootFile, "testCoursesRootFile should be initialized");
        const noInfoCourseDir = this.testCoursesRootFile.get_child("ToStringDefaultCourse");
        try {
            noInfoCourseDir.make_directory_with_parents(null);
            deleteInfoJson(noInfoCourseDir); // Ensure no info.json
            const courseDefault = new Course(noInfoCourseDir);
            assertEqual(courseDefault.toString(), "<Course ToStringDefaultCourse (ToStringDefaultCourse)>", "toString() should use course name as title if info.title is default.");
        } finally {
            if (noInfoCourseDir.query_exists(null)) noInfoCourseDir.delete(null);
        }
    }
};

var exports = courseTests;