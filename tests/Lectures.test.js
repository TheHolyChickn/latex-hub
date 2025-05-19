'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const { Lectures } = imports.core.Lectures;
const { Lecture, TEX_LECTURE_DATE_FORMAT } = imports.core.Lecture;
const { ConfigUtils } = imports.config.ConfigUtils;

const LECTURE1_DATE_STR_FROM_SETUP = "Sun 18 May 2025 10:00";
const LECTURE2_DATE_STR_FROM_SETUP = "Mon 19 May 2025 11:00";

/**
 * Retrieves the configured root directory path for test courses.
 * @returns {string | null} The path string or null if not configured.
 */
function getTestCoursesPath() {
    return ConfigUtils.get('root_dir');
}

/**
 * Reads the content of a given file.
 * @param {Gio.File} file - The Gio.File object to read.
 * @returns {string | null} The file content as a string, or null if the file doesn't exist or reading fails.
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
 * Creates a minimal master.tex file for testing purposes.
 * @param {Gio.File} masterFile - The Gio.File object representing where to create the master.tex file.
 * @param {string} [title="Test Master"] - The title to use in the LaTeX document.
 * @param {string} [extraHeaderContent=''] - Optional extra content to insert in the header comments.
 * @param {string} [initialBodyContent=''] - Optional initial content to insert between lecture markers.
 * @returns {boolean} True if the file was successfully created, false otherwise.
 */
function createMinimalMasterTex(masterFile, title = "Test Master", extraHeaderContent = '', initialBodyContent = '') {
    const content = `\\documentclass{article}
\\title{${title}}
\\author{Test Author}
% ${extraHeaderContent}
% start lectures
${initialBodyContent}
% end lectures
\\end{document}
`;
    try {
        masterFile.replace_contents(content, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        return true;
    } catch (e) {
        print(`ERROR creating minimal master.tex at ${masterFile.get_path()}: ${e.message}`);
        return false;
    }
}

/**
 * Test suite for the Lectures class.
 * @namespace lecturesTests
 */
var lecturesTests = {
    /** @type {Object | null} Mock course object used for tests. */
    mockCourse: null,
    /** @type {Gio.File | null} Gio.File object for the current test course path. */
    coursePath: null,
    /** @type {Lectures | null} Instance of the Lectures class under test. */
    lecturesInstance: null,

    /**
     * Sets up the testing environment before each test case.
     * Initializes mockCourse and lecturesInstance for TestCourse1.
     */
    beforeEach: () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Setup: ConfigUtils must return a valid root_dir for tests.");
        if (!testCoursesPath) throw new Error("Test setup failed: no root_dir provided by ConfigUtils.");

        this.coursePath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        assertTrue(this.coursePath.query_exists(null), "Test setup: 'TestCourse1' directory must exist.");

        this.mockCourse = {
            path: this.coursePath,
            name: 'TestCourse1',
            info: {
                short: 'TC1',
                title: 'Test Course Alpha',
                course_id: "TC 101",
                preamble_path: "../global_preamble.tex"
            },
        };
        this.lecturesInstance = new Lectures(this.mockCourse);
    },

    /**
     * Cleans up or resets state after each test case.
     * Re-initializes master.tex for TestCourse1 to its setup state.
     */
    afterEach: () => {
        const masterFile = this.coursePath.get_child('master.tex');
        const masterContent = `\\documentclass{article}
\\title{Test Course Alpha}
\\author{Prof. Tester}
\\input{../global_preamble.tex}
\\begin{document}
\\maketitle
% start lectures
\\input{lec_01.tex}
% end lectures
\\end{document}`;
        try {
            masterFile.replace_contents(masterContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch(e) {
            print(`Warning: Could not reset master.tex in afterEach: ${e.message}`);
        }
    },

    'test constructor and _readFiles loads existing lectures': () => {
        assertEqual(this.lecturesInstance.lecturesList.length, 2, "Should load 2 lectures from 'TestCourse1'.");
        if (this.lecturesInstance.lecturesList.length === 2) {
            assertEqual(this.lecturesInstance.lecturesList[0].number, 1, "First lecture's number should be 1.");
            assertEqual(this.lecturesInstance.lecturesList[0].title, "Introduction to Testing", "First lecture's title check.");
            assertEqual(this.lecturesInstance.lecturesList[1].number, 2, "Second lecture's number should be 2.");
            assertEqual(this.lecturesInstance.lecturesList[1].title, "Advanced Testing", "Second lecture's title check.");
        }
    },

    'test _readFiles with empty course (TestCourse2)': () => {
        const testCoursesPath = getTestCoursesPath();
        const courseBPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse2']));
        const mockCourseB = { path: courseBPath, name: 'TestCourse2', info: { short: 'TC2' } };
        const lecturesB = new Lectures(mockCourseB);
        assertEqual(lecturesB.lecturesList.length, 0, "'TestCourse2' (no lecture files) should load 0 lectures.");
    },

    'test getLastLecture and getLectureByNumber': () => {
        const lastLec = this.lecturesInstance.getLastLecture();
        assertNotNull(lastLec, "getLastLecture should return a lecture for 'TestCourse1'.");
        if (lastLec) assertEqual(lastLec.number, 2, "Last lecture number for 'TestCourse1' should be 2.");

        const lec1 = this.lecturesInstance.getLectureByNumber(1);
        assertNotNull(lec1, "getLectureByNumber(1) should find lecture 1.");
        if (lec1) assertEqual(lec1.title, "Introduction to Testing", "Title of lecture 1 check.");

        const nonExistentLec = this.lecturesInstance.getLectureByNumber(99);
        assertNull(nonExistentLec, "getLectureByNumber(99) should return null for a non-existent lecture.");
    },

    'test parseLectureSpec': () => {
        assertEqual(this.lecturesInstance.parseLectureSpec("1"), 1, "parseLectureSpec('1') should return 1.");
        assertEqual(this.lecturesInstance.parseLectureSpec("last"), 2, "parseLectureSpec('last') should return last lecture number (2).");
        assertEqual(this.lecturesInstance.parseLectureSpec("prev"), 1, "parseLectureSpec('prev') should return previous lecture number (1).");
        assertNull(this.lecturesInstance.parseLectureSpec("invalid_spec"), "parseLectureSpec('invalid_spec') should return null.");

        const courseBPath = Gio.File.new_for_path(GLib.build_filenamev([getTestCoursesPath(), 'TestCourse2']));
        const mockCourseB = { path: courseBPath, name: 'TestCourse2', info: { short: 'TC2' } };
        const lecturesB = new Lectures(mockCourseB);
        assertNull(lecturesB.parseLectureSpec("last"), "parseLectureSpec('last') on an empty lecture list should return null.");
    },

    'test parseRangeString': () => {
        let range = this.lecturesInstance.parseRangeString("1");
        assertEqual(range.length, 1, "parseRangeString('1') should result in a list of length 1.");
        assertTrue(range.includes(1), "parseRangeString('1') result should include 1.");

        range = this.lecturesInstance.parseRangeString("1-2");
        assertEqual(range.length, 2, "parseRangeString('1-2') should result in a list of length 2.");
        assertTrue(range.includes(1) && range.includes(2), "parseRangeString('1-2') result should include 1 and 2.");

        range = this.lecturesInstance.parseRangeString("last");
        assertEqual(range.length, 1, "parseRangeString('last') should result in a list of length 1.");
        assertTrue(range.includes(2), "parseRangeString('last') result should include the last lecture number (2).");

        range = this.lecturesInstance.parseRangeString("all");
        assertEqual(range.length, 2, "parseRangeString('all') should result in a list of all lecture numbers.");
        assertTrue(range.includes(1) && range.includes(2), "parseRangeString('all') result should include 1 and 2 for TestCourse1.");

        range = this.lecturesInstance.parseRangeString("invalid-range-spec");
        assertEqual(range.length, 0, "parseRangeString with an invalid spec should result in an empty list.");
    },

    'test _getHeaderFooter with existing master file': () => {
        const masterFile = this.mockCourse.path.get_child('master.tex');
        assertTrue(masterFile.query_exists(null), "Test setup: master.tex for 'TestCourse1' must exist.");

        const hf = this.lecturesInstance._getHeaderFooter(masterFile);
        assertNotNull(hf, "_getHeaderFooter should return an object for an existing master file.");
        if (hf) {
            assertTrue(hf.header.includes("\\documentclass{article}"), "Header content should include '\\documentclass{article}'.");
            assertTrue(hf.header.includes("% start lectures"), "Header content should include the '% start lectures' marker.");
            assertTrue(hf.footer.includes("% end lectures"), "Footer content should include the '% end lectures' marker.");
            assertTrue(hf.footer.includes("\\end{document}"), "Footer content should include '\\end{document}'.");
            assertFalse(hf.header.includes("\\input{lec_01.tex}"), "Default header from setup should not contain specific lecture inputs.");
        }
    },

    'test _getHeaderFooter with non-existent master file': () => {
        const emptyCoursePath = Gio.File.new_for_path(GLib.build_filenamev([getTestCoursesPath(), 'EmptyCourse']));
        const mockEmptyCourse = { path: emptyCoursePath, name: 'EmptyCourse', info: { short: 'EC' } };
        const lecturesEmpty = new Lectures(mockEmptyCourse);

        const masterFile = emptyCoursePath.get_child('master.tex');
        assertFalse(masterFile.query_exists(null), "Test setup: master.tex for 'EmptyCourse' must not exist.");

        const hf = lecturesEmpty._getHeaderFooter(masterFile);
        assertNull(hf, "_getHeaderFooter should return null if the master file does not exist.");
    },

    'test updateLecturesInMaster': () => {
        const masterFile = this.lecturesInstance.masterFile;
        if(!masterFile.query_exists(null)) {
            createMinimalMasterTex(masterFile);
        }

        this.lecturesInstance.updateLecturesInMaster([1, 2]);
        let content = readFileContent(masterFile);
        assertNotNull(content, "master.tex content should be readable after update.");
        if (content) {
            assertTrue(content.includes("\\input{lec_01.tex}"), "master.tex should include lec_01.tex after update with [1,2].");
            assertTrue(content.includes("\\input{lec_02.tex}"), "master.tex should include lec_02.tex after update with [1,2].");
        }

        this.lecturesInstance.updateLecturesInMaster([1]);
        content = readFileContent(masterFile);
        assertNotNull(content, "master.tex content should be readable after subsequent update.");
        if (content) {
            assertTrue(content.includes("\\input{lec_01.tex}"), "master.tex should include lec_01.tex after update with [1].");
            assertFalse(content.includes("\\input{lec_02.tex}"), "master.tex should NOT include lec_02.tex after update with [1].");
        }
    },

    'test newLecture': () => {
        const initialLength = this.lecturesInstance.lecturesList.length;
        const newLecture = this.lecturesInstance.newLecture();
        assertNotNull(newLecture, "newLecture() should return a Lecture object.");
        assertEqual(this.lecturesInstance.lecturesList.length, initialLength + 1, "Lecture list length should increment by 1 after creating a new lecture.");

        if (newLecture) {
            assertEqual(newLecture.number, initialLength + 1, `New lecture number should be ${initialLength + 1}.`);
            assertTrue(newLecture.file.query_exists(null), `New lecture file '${newLecture.file.get_basename()}' should exist.`);
            assertNotNull(newLecture.date, "New lecture should have a non-null date.");

            const newLecContent = readFileContent(newLecture.file);
            assertNotNull(newLecContent, "New lecture file should have content.");
            if (newLecContent) {
                assertTrue(newLecContent.includes(`\\lecture{${initialLength + 1}}`), "New lecture file content should include the correct lecture number command.");
                assertTrue(newLecContent.includes(`}{}`), "New lecture file content should include empty braces for the title by default.");
            }

            const masterContent = readFileContent(this.lecturesInstance.masterFile);
            assertNotNull(masterContent, "Master file should be readable after new lecture creation.");
            if (masterContent) {
                assertTrue(masterContent.includes(`\\input{${newLecture.file.get_basename()}}`), "Master file should be updated to include the new lecture.");
            }

            if (newLecture.file.query_exists(null)) {
                try { newLecture.file.delete(null); } catch(e) { /* Suppress error during test cleanup */ }
            }
        }
    },

    'test newLecture for an empty course': () => {
        const testCoursesPath = getTestCoursesPath();
        const courseBPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse2']));
        const mockCourseB = {
            path: courseBPath,
            name: 'TestCourse2',
            info: { short: 'TC2', title: "Course B", preamble_path: "../global_preamble.tex" }
        };
        const lecturesB = new Lectures(mockCourseB);
        assertEqual(lecturesB.lecturesList.length, 0, "Initially, 'TestCourse2' (empty course) should have 0 lectures.");

        const masterB = courseBPath.get_child('master.tex');
        if (!masterB.query_exists(null)) {
            assertTrue(createMinimalMasterTex(masterB, "Course B Master"), "Test setup: Minimal master.tex for Course B should be created if missing.");
        }

        const newLecture1 = lecturesB.newLecture();
        assertNotNull(newLecture1, "newLecture() on an empty course should return a Lecture object.");
        assertEqual(lecturesB.lecturesList.length, 1, "Lecture list length should be 1 after the first new lecture in an empty course.");
        if (newLecture1) {
            assertEqual(newLecture1.number, 1, "The first new lecture's number in an empty course should be 1.");
            assertTrue(newLecture1.file.query_exists(null), "The new lecture file should exist after creation in an empty course.");

            const masterContent = readFileContent(lecturesB.masterFile);
            assertNotNull(masterContent, "Master file for 'TestCourse2' should be readable.");
            if (masterContent) {
                assertTrue(masterContent.includes(`\\input{${newLecture1.file.get_basename()}}`), "Master file for 'TestCourse2' should include the new lecture.");
            }

            if (newLecture1.file.query_exists(null)) {
                try { newLecture1.file.delete(null); } catch(e) { /* Suppress error during test cleanup */ }
            }
        }
    },

    'test compileMaster (runs without error on existing master)': () => {
        const masterFile = this.lecturesInstance.masterFile;
        assertTrue(masterFile.query_exists(null), "Test setup: Master file for 'TestCourse1' must exist for compile test.");

        let status = -1;
        try {
            status = this.lecturesInstance.compileMaster();
            assertTrue(status !== -1, "compileMaster should return a status code (not the internal -1 error indicator).");
        } catch (e) {
            assertTrue(false, `compileMaster threw an unexpected error: ${e.message}`);
        }
    },

    'test compileMaster on non-existent master file': () => {
        const emptyCoursePath = Gio.File.new_for_path(GLib.build_filenamev([getTestCoursesPath(), 'EmptyCourse']));
        const mockEmptyCourse = { path: emptyCoursePath, name: 'EmptyCourse', info: { short: 'EC' } };
        const lecturesEmpty = new Lectures(mockEmptyCourse);

        const masterFile = lecturesEmpty.masterFile;
        assertFalse(masterFile.query_exists(null), "Test setup: Master file for 'EmptyCourse' should not exist for this test scenario.");

        const status = lecturesEmpty.compileMaster();
        assertEqual(status, -1, "compileMaster should return -1 if the master file does not exist.");
    },

    'test list-like properties (length, get, iterator)': () => {
        assertEqual(this.lecturesInstance.length, 2, "'length' property should be 2 for 'TestCourse1'.");
        assertNotNull(this.lecturesInstance.get(0), "get(0) should return the first lecture object.");
        if(this.lecturesInstance.get(0)) {
            assertEqual(this.lecturesInstance.get(0).number, 1, "The 'number' of lecture from get(0) should be 1.");
        }

        let count = 0;
        for (const lec of this.lecturesInstance) {
            assertNotNull(lec, "Each iterated lecture should not be null.");
            assertTrue(lec instanceof Lecture, "Each item yielded by iterator should be an instance of Lecture.");
            count++;
        }
        assertEqual(count, 2, "Iterator should yield 2 lectures for 'TestCourse1'.");
    }
};

var exports = lecturesTests;