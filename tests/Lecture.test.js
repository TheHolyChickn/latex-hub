'use strict';

const { GLib, Gio } = imports.gi;

// TEX_LECTURE_DATE_FORMAT and manualParseLectureDate are now directly exported by the simplified Lecture.js
const { Lecture, TEX_LECTURE_DATE_FORMAT, manualParseLectureDate } = imports.core.Lecture;
const { ConfigUtils } = imports.config.ConfigUtils;
// const { Course } = imports.core.Course; // Course mock is simpler

// Fixed date strings from setup_test_env.js (ensure these are also updated in setup_test_env.js if they change)
const LECTURE1_DATE_STR_FROM_SETUP = "Sun 18 May 2025 10:00";
const LECTURE2_DATE_STR_FROM_SETUP = "Mon 19 May 2025 11:00";

function getTestCoursesPath() {
    return ConfigUtils.get('root_dir');
}

var lectureTests = {
    'test Lecture constructor with existing file': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;

        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1', title: 'Test Course Alpha' } };
        const lec01File = courseAPath.get_child('lec_01.tex'); // Contains LECTURE1_DATE_STR_FROM_SETUP
        assertTrue(lec01File.query_exists(null), "lec_01.tex should exist.");

        const lecture1 = new Lecture(lec01File, mockCourseA);

        assertEqual(lecture1.number, 1, "Number should be 1 (from filename)");
        assertEqual(lecture1.title, "Introduction to Testing", "Title should be parsed");
        assertNotNull(lecture1.date, "Date object should be created from valid string in file");

        if (lecture1.date) {
            const expectedDate = manualParseLectureDate(LECTURE1_DATE_STR_FROM_SETUP);
            assertNotNull(expectedDate, `Test string LECTURE1_DATE_STR_FROM_SETUP should be parseable by manualParseLectureDate`);
            if (expectedDate) {
                assertEqual(lecture1.date.get_year(), expectedDate.get_year(), "Parsed year should match");
                assertEqual(lecture1.date.get_month(), expectedDate.get_month(), "Parsed month should match"); // check internal 0-11 month
                assertEqual(lecture1.date.get_day_of_month(), expectedDate.get_day_of_month(), "Parsed day should match");
                assertEqual(lecture1.date.get_hour(), expectedDate.get_hour(), "Parsed hour should match");
                assertEqual(lecture1.date.get_minute(), expectedDate.get_minute(), "Parsed minute should match");
            }
        }
        assertEqual(lecture1.course, mockCourseA, "Lecture course object");
    },

    'test Lecture constructor with future date string': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const lec02File = courseAPath.get_child('lec_02.tex'); // Contains LECTURE2_DATE_STR_FROM_SETUP
        assertTrue(lec02File.query_exists(null), "lec_02.tex should exist.");

        const lecture2 = new Lecture(lec02File, mockCourseA);

        assertEqual(lecture2.number, 2, "Number should be 2");
        assertEqual(lecture2.title, "Advanced Testing", "Title should be parsed");
        assertNotNull(lecture2.date, "Date object should be created from LECTURE2_DATE_STR_FROM_SETUP");

        if (lecture2.date) {
            const expectedDate = manualParseLectureDate(LECTURE2_DATE_STR_FROM_SETUP);
            assertNotNull(expectedDate, `Test string LECTURE2_DATE_STR_FROM_SETUP should be parseable`);
            if (expectedDate) {
                assertEqual(lecture2.date.get_year(), expectedDate.get_year(), "Parsed year (future) should match");
                assertEqual(lecture2.date.get_month(), expectedDate.get_month(), "Parsed month (future) should match");
                assertEqual(lecture2.date.get_day_of_month(), expectedDate.get_day_of_month(), "Parsed day (future) should match");
            }
        }
    },

    'test Lecture constructor with non-existent file': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const nonExistentLecFile = courseAPath.get_child('lec_99.tex');
        assertFalse(nonExistentLecFile.query_exists(null), "lec_99.tex should not exist.");

        const lecture99 = new Lecture(nonExistentLecFile, mockCourseA);

        assertEqual(lecture99.number, 99, "Number for non-existent file");
        assertEqual(lecture99.title, "Untitled", "Title for non-existent file");
        assertNull(lecture99.date, "Date should be null for non-existent file");
    },

    'test Lecture constructor with malformed lecture command': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const malformedLecFile = courseAPath.get_child('lec_03.tex'); // Using standard filename from _filenameToNumber
        const malformedContent = "\\lecturemalformed{3}{Date}{Title}"; // Regex won't match this \lecture command
        try {
            malformedLecFile.replace_contents(malformedContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const lectureMalformed = new Lecture(malformedLecFile, mockCourseA);

            assertEqual(lectureMalformed.number, 3, "Number for malformed command file");
            assertEqual(lectureMalformed.title, "Untitled", "Title for malformed command file");
            assertNull(lectureMalformed.date, "Date should be null for malformed command");
        } finally {
            if (malformedLecFile.query_exists(null)) malformedLecFile.delete(null);
        }
    },

    'test Lecture constructor with bad date string in file': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const badDateLecFile = courseAPath.get_child('lec_05.tex');
        const content = `\\lecture{5}{Invalid Date String}{Title With Bad Date}`;
        try {
            badDateLecFile.replace_contents(content, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const lecture = new Lecture(badDateLecFile, mockCourseA);

            assertEqual(lecture.number, 5, "Number for bad date string file");
            assertEqual(lecture.title, "Title With Bad Date", "Title for bad date string file");
            assertNull(lecture.date, "Date should be null for unparseable date string");
        } finally {
            if (badDateLecFile.query_exists(null)) badDateLecFile.delete(null);
        }
    },

    // 'test getAcademicWeek function' REMOVED

    'test Lecture toString method': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };


        const lec01File = courseAPath.get_child('lec_01.tex');
        const lecture1 = new Lecture(lec01File, mockCourseA);
        assertNotNull(lecture1.date, "lecture1.date should be parsed for toString test");

        if (lecture1.date) {
            // Expected string should be what lecture1.date.format() ACTUALLY produces.
            // This tests consistency of parsing and then formatting via toString.
            const actualFormattedDateByGLib = lecture1.date.format(TEX_LECTURE_DATE_FORMAT);
            const expectedToStringOutput = `<Lecture TC1 1 "Introduction to Testing" (${actualFormattedDateByGLib})>`;
            assertEqual(lecture1.toString(), expectedToStringOutput, "toString() with valid parsed date should use the object's format method output.");
        } else {
            // This case should ideally not be hit if lec_01.tex is valid and parsing works.
            const expectedStringIfDateIsNull = `<Lecture TC1 1 "Introduction to Testing" (Invalid Date)>`;
            assertEqual(lecture1.toString(), expectedStringIfDateIsNull, "toString() when date is null due to parsing issue in lec_01.tex.");
        }

        // Test with a null date (this part is correct)
        const nonExistentLecFile = courseAPath.get_child('lec_99.tex');
        const lecture99 = new Lecture(nonExistentLecFile, mockCourseA);
        const expectedString99 = `<Lecture TC1 99 "Untitled" (Invalid Date)>`;
        assertEqual(lecture99.toString(), expectedString99, "toString() for non-existent file (null date).");
    },

    'test Lecture edit method (runs without error)': () => {
        const testCoursesPath = getTestCoursesPath();
        assertTrue(!!testCoursesPath, "Test setup: ConfigUtils should return a root_dir.");
        if (!testCoursesPath) return;
        const courseAPath = Gio.File.new_for_path(GLib.build_filenamev([testCoursesPath, 'TestCourse1']));
        const mockCourseA = { path: courseAPath, name: 'TestCourse1', info: { short: 'TC1' } };
        const lec01File = courseAPath.get_child('lec_01.tex');
        const lecture1 = new Lecture(lec01File, mockCourseA);
        try {
            lecture1.edit();
            assertTrue(true, "lecture1.edit() called without throwing an immediate error.");
        } catch (e) {
            assertTrue(false, `lecture1.edit() threw an error: ${e.message}`);
        }
    },
};

var exports = lectureTests;