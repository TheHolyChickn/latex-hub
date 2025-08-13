'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

// Assuming GJS_PATH is set up by the runner for these imports
const { Homework } = imports.core.Homework;
const { Course, INFO_FILE_NAME } = imports.core.Course;
const { ConfigUtils } = imports.config.ConfigUtils;
const { Courses } = imports.core.Courses; // Needed to get a Course instance for tests

// Helper to get the path to the test courses root
function getTestCoursesPathString() {
    return ConfigUtils.get('root_dir');
}

/**
 * Helper to read file content.
 * @param {Gio.File} file
 * @returns {string|null}
 */
function readFileContent(file) {
    if (!file || !file.query_exists(null)) return null;
    try {
        const [success, contents] = file.load_contents(null);
        return success ? ByteArray.toString(contents) : null;
    } catch (e) { return null; }
}

/**
 * Helper to safely delete a file if it exists.
 * @param {Gio.File} file
 */
function deleteFileIfExists(file) {
    if (file.query_exists(null)) {
        try { file.delete(null); } catch (e) { /* ignore */ }
    }
}
/**
 * Recursively deletes a directory for test cleanup.
 * @param {Gio.File} dirFile - The directory to delete.
 */
function deleteTestDirectoryRecursive(dirFile) {
    if (!dirFile.query_exists(null)) { return; }
    try {
        const enumerator = dirFile.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        let childInfo;
        while ((childInfo = enumerator.next_file(null)) !== null) {
            const childFile = dirFile.get_child(childInfo.get_name());
            if (childInfo.get_file_type() === Gio.FileType.DIRECTORY) {
                deleteTestDirectoryRecursive(childFile);
            } else { childFile.delete(null); }
        }
        enumerator.close(null);
        dirFile.delete(null);
    } catch (e) { print(`WARN: Issue during recursive deletion of ${dirFile.get_path()}: ${e.message}.`); }
}


var homeworkTests = {
    testCoursesRootFile: null,
    /** @type {Course | null} */
    mockCourse1: null,   // Actual Course object for TestCourse1

    beforeAll: () => {
        const testCoursesPathString = getTestCoursesPathString();
        assertTrue(!!testCoursesPathString, "Setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPathString) throw new Error("Missing testCoursesPathString in Homework.test.js beforeAll");

        this.testCoursesRootFile = Gio.File.new_for_path(testCoursesPathString);
        const mockCourse1File = this.testCoursesRootFile.get_child("TestCourse1");
        assertTrue(mockCourse1File.query_exists(null), "TestCourse1 directory must exist for Homework tests.");

        // Get the actual Course object for TestCourse1.
        // This relies on the global `courses` instance from Homework.js for this test setup.
        // Ideally, a test-specific Courses instance would be better.
        const globalCourses = new Courses(); // Create a new Courses instance to find our test course
        this.mockCourse1 = globalCourses.findByName("TestCourse1");
        assertNotNull(this.mockCourse1, "Mock Course object for TestCourse1 should be found.");
        assertTrue(this.mockCourse1 instanceof Course, "mockCourse1 should be an instance of Course.");
        assertNotNull(this.mockCourse1.info, "mockCourse1.info should be loaded.");
    },

    afterEach: () => {
        // Clean up any created Homework subdirectories and files within TestCourse1
        if (this.mockCourse1 && this.mockCourse1.path) {
            const hwDir = this.mockCourse1.path.get_child('Homework');
            if (hwDir.query_exists(null)) {
                deleteTestDirectoryRecursive(hwDir);
            }
        }
    },

    'test Homework constructor': () => {
        assertNotNull(this.mockCourse1, "mockCourse1 must be initialized for test constructor");
        const itemData = { name: "HW1_Constructor", date: "09/15/25", preamble: "default", status: false };
        const hw = new Homework(itemData, this.mockCourse1, "1"); // Pass the Course object

        assertEqual(hw.name, "HW1_Constructor", "Homework name should be set.");
        assertEqual(hw.date, "09/15/25", "Homework date should be set.");
        assertEqual(hw.preamble, "default", "Homework preamble should be set.");
        assertEqual(hw.status, false, "Homework status should be set.");
        assertEqual(hw.number, "1", "Homework number should be set as string.");
        assertTrue(hw.course === this.mockCourse1, "Homework should store the exact Course object instance.");

        const expectedPath = GLib.build_filenamev([
            this.mockCourse1.path.get_path(),
            'Homework',
            "HW1_Constructor_1.tex" // Assumes no sanitization needed for this name
        ]);
        assertEqual(hw.path, expectedPath, "Homework path should be correctly constructed using Course object's path.");
    },

    'test touch creates file with correct homework_preambles': () => {
        assertNotNull(this.mockCourse1, "mockCourse1 must be initialized for touch test");
        // Note: 'preamble' is now 'homework' to match the default case in the new logic
        const itemData = { name: "StandardHW", date: "10/01/25", preamble: "homework", status: false };
        const hw = new Homework(itemData, this.mockCourse1, "10");

        hw.touch();

        const hwFile = Gio.File.new_for_path(hw.path);
        assertTrue(hwFile.query_exists(null), "Homework file should exist after touch.");
        const content = readFileContent(hwFile);
        assertNotNull(content, "Homework file should have content.");

        if (content) {
            // Check that it used the 'homework_preambles' from the mock info.json
            assertTrue(content.includes("\\input{~/.config/LatexHub/preambles/ams.tex}"), "File should include absolute path to ams.tex");
            assertTrue(content.includes("\\input{~/.config/LatexHub/preambles/macros.tex}"), "File should include absolute path to macros.tex");
            assertFalse(content.includes("fullpage.tex"), "File should NOT include a report-specific preamble.");
            assertTrue(content.includes("\\makeproblem"), "File content should include \\makeproblem command for standard homework.");
        }
    },

    'test touch creates file with correct report_preambles': () => {
        assertNotNull(this.mockCourse1, "mockCourse1 must be initialized for report preamble test");
        const itemData = { name: "ReportHW", date: "10/02/25", preamble: "report", status: false };
        const hw = new Homework(itemData, this.mockCourse1, "11");

        hw.touch();

        const hwFile = Gio.File.new_for_path(hw.path);
        assertTrue(hwFile.query_exists(null), "Report homework file should exist after touch.");
        const content = readFileContent(hwFile);
        assertNotNull(content, "Report homework file should have content.");

        if (content) {
            // Check that it used the 'report_preambles' from the mock info.json
            assertTrue(content.includes("fullpage.tex"), "File should include the report-specific preamble.");
            assertTrue(content.includes("\\makereport"), "File content should include \\makereport command for reports.");
        }
    },

    'test toJSON method': () => {
        assertNotNull(this.mockCourse1, "mockCourse1 must be initialized for toJSON test");
        const itemData = { name: "JSONTestHW", date: "11/11/25", preamble: "default", status: true };
        const hw = new Homework(itemData, this.mockCourse1, "20");
        const jsonData = hw.toJSON();

        assertEqual(jsonData.name, "JSONTestHW", "toJSON name property.");
        assertEqual(jsonData.date, "11/11/25", "toJSON date property.");
        assertEqual(jsonData.preamble, "default", "toJSON preamble property.");
        assertEqual(jsonData.status, true, "toJSON status property.");
        assertFalse(jsonData.hasOwnProperty('number'), "toJSON should not include number property itself.");
        assertFalse(jsonData.hasOwnProperty('course'), "toJSON should not include course object property itself.");
    },

    'test toString method': () => {
        assertNotNull(this.mockCourse1, "mockCourse1 must be initialized for toString test");
        const itemData = { name: "ToStringTestHW", date: "12/12/25", preamble: "report", status: false };
        const hw = new Homework(itemData, this.mockCourse1, "21");
        const expectedString = `<Homework TestCourse1 #21: "ToStringTestHW", Due: 12/12/25, Status: Incomplete>`;
        assertEqual(hw.toString(), expectedString, "toString() should format correctly for incomplete HW.");

        hw.status = true;
        const expectedStringDone = `<Homework TestCourse1 #21: "ToStringTestHW", Due: 12/12/25, Status: Complete>`;
        assertEqual(hw.toString(), expectedStringDone, "toString() should reflect completed status.");
    },

    'test openHomework (runs without error)': () => {
        assertNotNull(this.mockCourse1, "mockCourse1 must be initialized for openHomework test");
        const itemData = { name: "OpenThisHW", date: "01/01/26", preamble: "default", status: false };
        const hw = new Homework(itemData, this.mockCourse1, "22");
        hw.touch(); // Ensure file exists for nvim to open
        try {
            hw.openHomework();
            assertTrue(true, "hw.openHomework() called without throwing an immediate error.");
        } catch (e) {
            assertTrue(false, `hw.openHomework() threw an error: ${e.message}`);
        }
    }
};

var exports = homeworkTests;