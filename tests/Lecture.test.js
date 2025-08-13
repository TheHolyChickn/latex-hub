'use strict';

const { GLib, Gio } = imports.gi;

const { Lecture, TEX_LECTURE_DATE_FORMAT, manualParseLectureDate } = imports.core.Lecture;
const { ConfigUtils } = imports.config.ConfigUtils;

const LECTURE1_DATE_STR_FROM_SETUP = "Sun 18 May 2025 10:00";
const LECTURE2_DATE_STR_FROM_SETUP = "Mon 19 May 2025 11:00";

/**
 * Retrieves the configured root directory path for test courses.
 * @returns {string | null} The path string, or null if not configured.
 */
function getTestCoursesPath() {
    return ConfigUtils.get('root_dir');
}

/**
 * Test suite for the Lecture class.
 * @namespace lectureTests
 */
var lectureTests = {
    'test Lecture constructor with existing file': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;

        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1', title: 'Test Course Alpha' } };
        const lec01File = courseAPath.get_child('lec_01.tex');
        assertTrue(lec01File.query_exists(null), "Test setup: lec_01.tex for TestCourse1 must exist.");

        const lecture1 = new Lecture(lec01File, mockCourseA);

        assertEqual(lecture1.number, 1, "Lecture number should be correctly parsed from filename (1).");
        assertEqual(lecture1.title, "Introduction to Testing", "Lecture title should be parsed from file content.");
        assertNotNull(lecture1.date, "Lecture date object should be created from a valid date string in the file.");

        if (lecture1.date) {
            const expectedDate = manualParseLectureDate(LECTURE1_DATE_STR_FROM_SETUP);
            assertNotNull(expectedDate, `Test setup: LECTURE1_DATE_STR_FROM_SETUP ("${LECTURE1_DATE_STR_FROM_SETUP}") must be parseable.`);
            if (expectedDate) {
                assertEqual(lecture1.date.get_year(), expectedDate.get_year(), "Parsed year should match expected.");
                assertEqual(lecture1.date.get_month(), expectedDate.get_month(), "Parsed month (0-11) should match expected.");
                assertEqual(lecture1.date.get_day_of_month(), expectedDate.get_day_of_month(), "Parsed day of month should match expected.");
                assertEqual(lecture1.date.get_hour(), expectedDate.get_hour(), "Parsed hour should match expected.");
                assertEqual(lecture1.date.get_minute(), expectedDate.get_minute(), "Parsed minute should match expected.");
            }
        }
        assertEqual(lecture1.course, mockCourseA, "Lecture's course property should be set to the provided course object.");
    },

    'test Lecture constructor with future date string': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const lec02File = courseAPath.get_child('lec_02.tex');
        assertTrue(lec02File.query_exists(null), "Test setup: lec_02.tex for TestCourse1 must exist.");

        const lecture2 = new Lecture(lec02File, mockCourseA);

        assertEqual(lecture2.number, 2, "Lecture number should be 2 for lec_02.tex.");
        assertEqual(lecture2.title, "Advanced Testing", "Lecture title should be parsed correctly for future date.");
        assertNotNull(lecture2.date, "Lecture date object should be created for a future date string.");

        if (lecture2.date) {
            const expectedDate = manualParseLectureDate(LECTURE2_DATE_STR_FROM_SETUP);
            assertNotNull(expectedDate, `Test setup: LECTURE2_DATE_STR_FROM_SETUP ("${LECTURE2_DATE_STR_FROM_SETUP}") must be parseable.`);
            if (expectedDate) {
                assertEqual(lecture2.date.get_year(), expectedDate.get_year(), "Parsed year (future) should match expected.");
                assertEqual(lecture2.date.get_month(), expectedDate.get_month(), "Parsed month (future) should match expected.");
                assertEqual(lecture2.date.get_day_of_month(), expectedDate.get_day_of_month(), "Parsed day (future) should match expected.");
            }
        }
    },

    'test Lecture constructor with non-existent file': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const nonExistentLecFile = courseAPath.get_child('lec_99.tex');
        assertFalse(nonExistentLecFile.query_exists(null), "Test setup: lec_99.tex should not exist for this test.");

        const lecture99 = new Lecture(nonExistentLecFile, mockCourseA);

        assertEqual(lecture99.number, 99, "Lecture number for a non-existent file should be parsed from filename.");
        assertEqual(lecture99.title, "Untitled", "Lecture title for a non-existent file should default to 'Untitled'.");
        assertNull(lecture99.date, "Lecture date for a non-existent file should be null.");
    },

    'test Lecture constructor with malformed lecture command': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const malformedLecFile = courseAPath.get_child('lec_03.tex');
        const malformedContent = "\\lecturemalformed{3}{Date}{Title}";
        try {
            malformedLecFile.replace_contents(malformedContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const lectureMalformed = new Lecture(malformedLecFile, mockCourseA);

            assertEqual(lectureMalformed.number, 3, "Lecture number should be parsed from filename even with malformed content.");
            assertEqual(lectureMalformed.title, "Untitled", "Lecture title should default to 'Untitled' for malformed LaTeX command.");
            assertNull(lectureMalformed.date, "Lecture date should be null for malformed LaTeX command.");
        } finally {
            if (malformedLecFile.query_exists(null)) {
                try { malformedLecFile.delete(null); } catch(e) { /* Suppress cleanup error */ }
            }
        }
    },

    'test Lecture constructor with bad date string in file': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const badDateLecFile = courseAPath.get_child('lec_05.tex');
        const content = `\\lecture{5}{Invalid Date String}{Title With Bad Date}`;
        try {
            badDateLecFile.replace_contents(content, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const lecture = new Lecture(badDateLecFile, mockCourseA);

            assertEqual(lecture.number, 5, "Lecture number should be parsed from filename even with bad date string.");
            assertEqual(lecture.title, "Title With Bad Date", "Lecture title should be parsed correctly even with bad date string.");
            assertNull(lecture.date, "Lecture date should be null for an unparseable date string in file content.");
        } finally {
            if (badDateLecFile.query_exists(null)) {
                try { badDateLecFile.delete(null); } catch(e) { /* Suppress cleanup error */ }
            }
        }
    },

    'test Lecture toString method': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };

        const lec01File = courseAPath.get_child('lec_01.tex');
        const lecture1 = new Lecture(lec01File, mockCourseA);
        assertNotNull(lecture1.date, "Test pre-condition: lecture1.date should be successfully parsed for toString() test.");

        if (lecture1.date) {
            const actualFormattedDateByGLib = lecture1.date.format(TEX_LECTURE_DATE_FORMAT);
            const expectedToStringOutput = `<Lecture TC1 1 "Introduction to Testing" (${actualFormattedDateByGLib})>`;
            assertEqual(lecture1.toString(), expectedToStringOutput, "toString() output for a lecture with a valid date.");
        } else {
            assertTrue(false, "Test logic error: lecture1.date was unexpectedly null, cannot test valid date toString().");
        }

        const nonExistentLecFile = courseAPath.get_child('lec_99.tex');
        const lecture99 = new Lecture(nonExistentLecFile, mockCourseA);
        const expectedString99 = `<Lecture TC1 99 "Untitled" (Invalid Date)>`;
        assertEqual(lecture99.toString(), expectedString99, "toString() output for a lecture with a null date (e.g., non-existent file).");
    },

    'test Lecture edit method (runs without error)': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils must return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const lec01File = courseAPath.get_child('lec_01.tex');
        const lecture1 = new Lecture(lec01File, mockCourseA);
        try {
            lecture1.edit();
            assertTrue(true, "Lecture.edit() method called without throwing an immediate synchronous error.");
        } catch (e) {
            assertTrue(false, `Lecture.edit() method should not throw an error during call: ${e.message}`);
        }
    },
};

var exports = lectureTests;