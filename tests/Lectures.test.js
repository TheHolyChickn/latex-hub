'use strict';

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

// Assuming GJS_PATH is set up by the runner
const { Lectures } = imports.core.Lectures;
const { Lecture, TEX_LECTURE_DATE_FORMAT, manualParseLectureDate } = imports.core.Lecture; // For creating expected Lecture instances
const { ConfigUtils } = imports.config.ConfigUtils;
// const { Course } = imports.core.Course; // For mock course

// Fixed date strings from setup_test_env.js, ensure these are identical
const LECTURE1_DATE_STR_FROM_SETUP = "Sun 18 May 2025 10:00";
const LECTURE2_DATE_STR_FROM_SETUP = "Mon 19 May 2025 11:00";

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

/**
 * Helper to create a minimal master.tex file.
 * @param {Gio.File} masterFile
 * @param {string} title
 * @param {string} [extraHeaderContent='']
 * @param {string} [initialBodyContent='']
 */
function createMinimalMasterTex(masterFile, title = "Test Master", extraHeaderContent = '', initialBodyContent = '') {
    const content = `\\documentclass{article}
\\title{${title}}
\\author{Test Author}
% ${extraHeaderContent} % For testing specific header scenarios
% start lectures
${initialBodyContent}
% end lectures
\\end{document}
`;
    try {
        masterFile.replace_contents(content, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        return true;
    } catch (e) {
        print(`ERROR creating minimal master.tex: ${e.message}`);
        return false;
    }
}


var lecturesTests = {
    mockCourse: null,
    coursePath: null,
    lecturesInstance: null,

    beforeEach: () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) throw new Error("Test setup failed: no root_dir from ConfigUtils.");

        // Use TestCourse1 for most tests as it's set up with lectures
        this.coursePath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        // Ensure the directory exists from setup_test_env.js
        assertTrue(this.coursePath.query_exists(null), "TestCourse1 directory should exist.");

        this.mockCourse = { // A more complete mock for Course, similar to what Lectures expects
            path: this.coursePath,
            name: 'TestCourse1',
            info: {
                short: 'TC1',
                title: 'Test Course Alpha',
                course_id: "TC 101",
                preamble_path: "../global_preamble.tex" // Matches setup_test_env.js
            },
            // No actual lectures property needed on mock for Lectures constructor
        };
        this.lecturesInstance = new Lectures(this.mockCourse);
    },

    afterEach: () => {
        // Cleanup: Re-run setup_test_env.js or selective cleanup of modified/created files
        // For now, setup_test_env.js handles overall cleanup before a full test run.
        // If tests modify master.tex or add lectures, they should ideally clean up or
        // setup_test_env.js must be robust enough to reset.
        // To be safe, let's re-initialize master.tex for TestCourse1 to its setup state
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
\\end{document}`; // This content might need to be exactly what setup_test_env makes
        try {
            masterFile.replace_contents(masterContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch(e) { /* ignore cleanup error */ }
    },

    'test constructor and _readFiles loads existing lectures': () => {
        assertEqual(this.lecturesInstance.lecturesList.length, 2, "Should load 2 lectures from TestCourse1");
        if (this.lecturesInstance.lecturesList.length === 2) {
            assertEqual(this.lecturesInstance.lecturesList[0].number, 1, "First lecture number should be 1");
            assertEqual(this.lecturesInstance.lecturesList[0].title, "Introduction to Testing", "First lecture title");
            assertEqual(this.lecturesInstance.lecturesList[1].number, 2, "Second lecture number should be 2");
            assertEqual(this.lecturesInstance.lecturesList[1].title, "Advanced Testing", "Second lecture title");
        }
    },

    'test _readFiles with empty course (TestCourse2)': () => {
        const testCoursesPath = getTestCoursesPath();
        const courseBPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse2']));
        const mockCourseB = { path: courseBPath, name: 'TestCourse2', info: { short: 'TC2' } };
        const lecturesB = new Lectures(mockCourseB);
        assertEqual(lecturesB.lecturesList.length, 0, "TestCourse2 should have 0 lectures loaded");
    },

    'test getLastLecture and getLectureByNumber': () => {
        const lastLec = this.lecturesInstance.getLastLecture();
        assertNotNull(lastLec, "Last lecture should exist");
        if (lastLec) assertEqual(lastLec.number, 2, "Last lecture number should be 2");

        const lec1 = this.lecturesInstance.getLectureByNumber(1);
        assertNotNull(lec1, "Lecture 1 should be found");
        if (lec1) assertEqual(lec1.title, "Introduction to Testing", "Lecture 1 title check");

        const nonExistentLec = this.lecturesInstance.getLectureByNumber(99);
        assertNull(nonExistentLec, "Lecture 99 should not be found");
    },

    'test parseLectureSpec': () => {
        assertEqual(this.lecturesInstance.parseLectureSpec("1"), 1, "Parse spec '1'");
        assertEqual(this.lecturesInstance.parseLectureSpec("last"), 2, "Parse spec 'last'");
        assertEqual(this.lecturesInstance.parseLectureSpec("prev"), 1, "Parse spec 'prev'");
        assertNull(this.lecturesInstance.parseLectureSpec("invalid"), "Parse spec 'invalid'");

        // Test with empty course
        const courseBPath = Gio.File.new_for_path(GLib.build_filenamev([getTestCoursesPath(), 'TestCourse2']));
        const mockCourseB = { path: courseBPath, name: 'TestCourse2', info: { short: 'TC2' } };
        const lecturesB = new Lectures(mockCourseB);
        assertNull(lecturesB.parseLectureSpec("last"), "Parse spec 'last' on empty list");
    },

    'test parseRangeString': () => {
        let range = this.lecturesInstance.parseRangeString("1");
        assertEqual(range.length, 1, "Range '1' length");
        assertTrue(range.includes(1), "Range '1' contains 1");

        range = this.lecturesInstance.parseRangeString("1-2");
        assertEqual(range.length, 2, "Range '1-2' length");
        assertTrue(range.includes(1) && range.includes(2), "Range '1-2' content");

        range = this.lecturesInstance.parseRangeString("last");
        assertEqual(range.length, 1, "Range 'last' length");
        assertTrue(range.includes(2), "Range 'last' contains 2");

        range = this.lecturesInstance.parseRangeString("all");
        assertEqual(range.length, 2, "Range 'all' length");
        assertTrue(range.includes(1) && range.includes(2), "Range 'all' content");

        range = this.lecturesInstance.parseRangeString("invalid-range");
        assertEqual(range.length, 0, "Range 'invalid-range' length");
    },

    'test _getHeaderFooter with existing master file': () => {
        // setup_test_env.js creates a master.tex for TestCourse1
        const masterFile = this.mockCourse.path.get_child('master.tex');
        assertTrue(masterFile.query_exists(null), "master.tex for TestCourse1 should exist.");

        const hf = this.lecturesInstance._getHeaderFooter(masterFile);
        assertNotNull(hf, "_getHeaderFooter should return an object for existing file");
        assertTrue(hf.header.includes("\\documentclass{article}"), "Header content check");
        assertTrue(hf.header.includes("% start lectures"), "Header should contain '% start lectures'");
        assertTrue(hf.footer.includes("% end lectures"), "Footer should contain '% end lectures'");
        assertTrue(hf.footer.includes("\\end{document}"), "Footer content check");
        assertFalse(hf.header.includes("\\input{lec_01.tex}"), "Header should not contain lecture inputs from default master.tex");
    },

    'test _getHeaderFooter with non-existent master file': () => {
        const coursePath = Gio.File.new_for_path(GLib.build_filenamev([getTestCoursesPath(), 'EmptyCourse']));
        const mockEmptyCourse = { path: coursePath, name: 'EmptyCourse', info: { short: 'EC' } };
        const lecturesEmpty = new Lectures(mockEmptyCourse); // EmptyCourse has no master.tex by setup

        const masterFile = coursePath.get_child('master.tex');
        assertFalse(masterFile.query_exists(null), "master.tex for EmptyCourse should NOT exist.");

        const hf = lecturesEmpty._getHeaderFooter(masterFile);
        // Your Lectures.js _getHeaderFooter returns null if file doesn't exist
        assertNull(hf, "_getHeaderFooter should return null for non-existent file");
    },

    'test updateLecturesInMaster': () => {
        const masterFile = this.lecturesInstance.masterFile;
        // Ensure master file exists for this test (it should from setup)
        if(!masterFile.query_exists(null)) {
            createMinimalMasterTex(masterFile); // Create a basic one if somehow missing
        }

        this.lecturesInstance.updateLecturesInMaster([1, 2]);
        let content = readFileContent(masterFile);
        assertNotNull(content, "master.tex content should be readable after update");
        if (content) {
            assertTrue(content.includes("\\input{lec_01.tex}"), "master.tex should include lec_01.tex after update [1,2]");
            assertTrue(content.includes("\\input{lec_02.tex}"), "master.tex should include lec_02.tex after update [1,2]");
        }

        this.lecturesInstance.updateLecturesInMaster([1]);
        content = readFileContent(masterFile);
        assertNotNull(content, "master.tex content should be readable after update");
        if (content) {
            assertTrue(content.includes("\\input{lec_01.tex}"), "master.tex should include lec_01.tex after update [1]");
            assertFalse(content.includes("\\input{lec_02.tex}"), "master.tex should NOT include lec_02.tex after update [1]");
        }
    },

    'test newLecture': () => {
        const initialLength = this.lecturesInstance.lecturesList.length; // Should be 2
        const newLecture = this.lecturesInstance.newLecture();
        assertNotNull(newLecture, "newLecture() should return a Lecture object");
        assertEqual(this.lecturesInstance.lecturesList.length, initialLength + 1, "Lecture list length should increment by 1");

        if (newLecture) {
            assertEqual(newLecture.number, initialLength + 1, `New lecture number should be ${initialLength + 1}`);
            assertTrue(newLecture.file.query_exists(null), `New lecture file ${newLecture.file.get_basename()} should exist`);
            assertNotNull(newLecture.date, "New lecture should have a date");

            // Check content of new lecture file
            const newLecContent = readFileContent(newLecture.file);
            assertNotNull(newLecContent, "New lecture file should have content");
            if (newLecContent) {
                assertTrue(newLecContent.includes(`\\lecture{${initialLength + 1}}`), "New lecture file content: number");
                // Date string check is tricky due to "now", just check for title part
                assertTrue(newLecContent.includes(`}{}`), "New lecture file content: empty title braces");
            }

            // Check master file update
            const masterContent = readFileContent(this.lecturesInstance.masterFile);
            assertNotNull(masterContent, "Master file content should be readable");
            if (masterContent) {
                assertTrue(masterContent.includes(`\\input{${newLecture.file.get_basename()}}`), "Master file should include new lecture");
            }

            // Clean up the created lecture file
            if (newLecture.file.query_exists(null)) {
                try { newLecture.file.delete(null); } catch(e) {/*ignore*/}
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
        assertEqual(lecturesB.lecturesList.length, 0, "Initially TestCourse2 has 0 lectures");

        // Ensure its master.tex exists (or is created minimally by newLecture if _getHeaderFooter handles it)
        // Your _getHeaderFooter returns null if master.tex doesn't exist, which updateLecturesInMaster needs to handle.
        // Let's create one for this test.
        const masterB = courseBPath.get_child('master.tex');
        if (!masterB.query_exists(null)) {
            createMinimalMasterTex(masterB, "Course B Master");
        }


        const newLecture1 = lecturesB.newLecture();
        assertNotNull(newLecture1, "newLecture() on empty course should return Lecture object");
        assertEqual(lecturesB.lecturesList.length, 1, "Lecture list length should be 1 after first new lecture");
        if (newLecture1) {
            assertEqual(newLecture1.number, 1, "First new lecture number should be 1");
            assertTrue(newLecture1.file.query_exists(null), "New lecture file should exist for empty course");

            // Check master file update
            const masterContent = readFileContent(lecturesB.masterFile);
            assertNotNull(masterContent, "Master file for CourseB should be readable");
            if (masterContent) {
                assertTrue(masterContent.includes(`\\input{${newLecture1.file.get_basename()}}`), "Master file for CourseB should include new lecture");
            }

            // Clean up
            if (newLecture1.file.query_exists(null)) {
                try { newLecture1.file.delete(null); } catch(e) {/*ignore*/}
            }
        }
    },

    // Test compileMaster - very basic, just checks if it runs without error and returns a status
    // This test requires 'latexmk' to be in PATH. It will create dummy .aux etc files.
    'test compileMaster (runs without error on existing master)': () => {
        const masterFile = this.lecturesInstance.masterFile;
        // Ensure it's a minimally compilable master file from setup
        assertTrue(masterFile.query_exists(null), "Master file should exist for compile test.");

        let status = -1;
        try {
            status = this.lecturesInstance.compileMaster();
            // For a simple, valid master.tex (like the one setup creates), latexmk should succeed (status 0)
            // or have a specific status for no changes if run twice.
            // For now, just check it's not -1 (our error indicator)
            assertTrue(status !== -1, "compileMaster should return a status code (not internal -1 error).");
            // A successful compilation is usually 0.
            // print(`DEBUG: compileMaster status: ${status}`);
        } catch (e) {
            assertTrue(false, `compileMaster threw an error: ${e.message}`);
        }
    },

    'test compileMaster on non-existent master file': () => {
        const coursePath = Gio.File.new_for_path(GLib.build_filenamev([getTestCoursesPath(), 'EmptyCourse']));
        const mockEmptyCourse = { path: coursePath, name: 'EmptyCourse', info: { short: 'EC' } };
        const lecturesEmpty = new Lectures(mockEmptyCourse);

        const masterFile = lecturesEmpty.masterFile; // Points to EmptyCourse/master.tex
        assertFalse(masterFile.query_exists(null), "Master file for EmptyCourse should not exist for this test.");

        const status = lecturesEmpty.compileMaster();
        assertEqual(status, -1, "compileMaster should return -1 if master file does not exist (as per Lectures.js logic).");
    },

    'test list-like properties (length, get, iterator)': () => {
        assertEqual(this.lecturesInstance.length, 2, "Length property should be 2");
        assertNotNull(this.lecturesInstance.get(0), "get(0) should return a lecture");
        assertEqual(this.lecturesInstance.get(0).number, 1, "get(0).number should be 1");

        let count = 0;
        for (const lec of this.lecturesInstance) {
            assertNotNull(lec, "Iterated lecture should not be null");
            count++;
        }
        assertEqual(count, 2, "Iterator should yield 2 lectures");
    }
};

var exports = lecturesTests;