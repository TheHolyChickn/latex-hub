'use strict';

/**
 * @fileoverview setup_test_env.js
 * This script prepares the testing environment for LaTeX Hub.
 * IMPORTANT: This script will modify your ~/.config/LatexHub/config.json to point
 * 'root_dir' to a test directory. It will also clear and populate this test directory.
 * BACKUP your existing config.json and test_courses_root if they contain important data.
 */

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

let ConfigManagerModule;
try {
    // The 'ConfigManager' in 'imports.config.ConfigManager' is the module itself,
    // which exports a class named 'ConfigManager'.
    ConfigManagerModule = imports.config.ConfigManager;
} catch (e) {
    print("Error: Could not import ConfigManager module from 'imports.config.ConfigManager'.");
    print("Please ensure GJS_PATH is set correctly to include your 'src' directory (e.g., GJS_PATH=./src).");
    print(e);
    throw new Error("Module import failed. Setup cannot continue.");
}

// These constants should match what Lecture.js and tests expect
var INFO_FILE_NAME = 'info.json';
var TEX_LECTURE_DATE_FORMAT = '%a %d %b %Y %H:%M';

// Define fixed date strings for deterministic testing
// Ensure the day of the week (%a) matches the date.
// For May 18, 2025: It is a Sunday.
// For May 19, 2025: It is a Monday.
var FIXED_DATE_LEC1_STR = "Sun 18 May 2025 10:00";
var FIXED_DATE_LEC2_STR = "Mon 19 May 2025 11:00";
var HOMEWORK_STORAGE_FILENAME_FOR_SETUP = "homeworks.json"; // For cleaning up old test file

/**
 * Defines the structure of the test courses.
 * @type {Object}
 */
const TEST_COURSES_STRUCTURE = {
    "TestCourse1": {
        "info.json": {
            title: "Test Course Alpha",
            short: "TC1",
            course_id: "TC 101",
            department: "Testing Dept",
            college: "School of Tests",
            professor: "Prof. Tester"
            // preamble_path removed as per user request
        },
        "master.tex": `\\documentclass{article}
\\title{Test Course Alpha}
\\author{Prof. Tester}
\\input{../preambles/global_preamble.tex} 
\\begin{document}
\\maketitle
% start lectures
\\input{lec_01.tex}
% end lectures
\\end{document}`,
        "lec_01.tex": `\\lecture{1}{${FIXED_DATE_LEC1_STR}}{Introduction to Testing}`,
        "lec_02.tex": `\\lecture{2}{${FIXED_DATE_LEC2_STR}}{Advanced Testing}`
    },
    "TestCourse2": {
        "info.json": {
            title: "Test Course Beta (No Lectures)",
            short: "TC2",
            course_id: "TC 102"
            // preamble_path removed
        },
        "master.tex": `\\documentclass{report}
\\title{Test Course Beta}
\\input{../preambles/global_preamble.tex}
\\begin{document}
\\maketitle
% start lectures
% end lectures
\\end{document}`
    },
    "EmptyCourse": {
        "info.json": {
            title: "Empty Test Course",
            short: "ETC"
        }
    },
    ".HiddenCourse": { // This directory name starts with a dot
        "info.json": { title: "Hidden Course" }
    },
    "NotACourseFile.txt": "This is not a course directory, just a plain file in test_courses_root."
};

/**
 * Recursively deletes a directory.
 * @param {Gio.File} dirFile - The directory to delete.
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
        print(`DEBUG: Warning: Issue during deletion of ${dirFile.get_path()}: ${e.message}. Manual cleanup might be needed.`);
    }
}

/**
 * Main function to set up the test environment.
 */
function setupEnvironment() {
    print("Starting test environment setup...");

    const projectBaseDir = Gio.File.new_for_path(GLib.get_current_dir());
    // print(`DEBUG: Project base directory determined as: ${projectBaseDir.get_path()}`);
    const testCoursesRootDir = projectBaseDir.get_child('test_courses_root');
    const testCoursesRootPath = testCoursesRootDir.get_path();

    print(`Test courses will be set up in: ${testCoursesRootPath}`);

    // Clean up and recreate the test_courses_root directory
    if (testCoursesRootDir.query_exists(null)) {
        // print(`DEBUG: test_courses_root exists. Attempting to clean: ${testCoursesRootPath}`);
        deleteDirectoryRecursive(testCoursesRootDir);
    }
    try {
        testCoursesRootDir.make_directory_with_parents(null);
        // print(`DEBUG: Successfully created test_courses_root directory: ${testCoursesRootPath}`);
    } catch (e) {
        print(`FATAL: Could not create directory ${testCoursesRootPath}: ${e.message}`);
        return false;
    }
    // Delete homeworks.json from test_courses_root if it exists from a previous run
    const homeworksJsonInTestRoot = testCoursesRootDir.get_child(HOMEWORK_STORAGE_FILENAME_FOR_SETUP);
    if (homeworksJsonInTestRoot.query_exists(null)) {
        try { homeworksJsonInTestRoot.delete(null); } catch(e) { /* ignore */ }
    }


    const CM = ConfigManagerModule.ConfigManager;
    try {
        CM.ensureDirExists();
    } catch (e) {
        print(`FATAL: Could not ensure config directory using ConfigManager: ${e.message}`);
        return false;
    }
    const mainConfig = CM.loadConfig();
    mainConfig.root_dir = testCoursesRootPath; // Point to our test directory
    mainConfig.current_courses = [];
    mainConfig.current_projects = [];
    mainConfig.archived_courses = [];
    mainConfig.archived_projects = [];
    mainConfig.github_user = '';
    mainConfig.current_semester = 'TestSemester';
    mainConfig.projects_dir = GLib.build_filenamev([GLib.get_home_dir(), 'TestProjects']);


    try {
        CM.saveConfig(mainConfig);
        print(`Saved config.json: root_dir set to ${testCoursesRootPath} and other test defaults.`);
    } catch (e) {
        print(`FATAL: Could not save updated config.json: ${e.message}`);
        return false;
    }

    try {
        let logs = CM.loadLogs(); logs.work_sessions = []; logs.workspace_times = {}; CM.saveLogs(logs);
        let preamblesConfig = CM.loadPreambles();
        preamblesConfig.preambles = [];
        preamblesConfig.templates = {};
        preamblesConfig.default_template_for_lecture = "basic_lecture_template";
        CM.savePreambles(preamblesConfig);
    } catch (e) {
        print(`Warning: Could not initialize default log/preamble config files: ${e.message}`);
    }

    // print("DEBUG: Attempting to populate test_courses_root...");
    for (const itemName in TEST_COURSES_STRUCTURE) {
        // print(`DEBUG: Processing item: ${itemName}`);
        const itemPath = testCoursesRootDir.get_child(itemName);
        const itemData = TEST_COURSES_STRUCTURE[itemName];
        try {
            if (typeof itemData === 'string') {
                // print(`DEBUG: Writing file: ${itemPath.get_path()}`);
                itemPath.replace_contents(itemData, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } else {
                // print(`DEBUG: Creating directory: ${itemPath.get_path()}`);
                itemPath.make_directory_with_parents(null);
                for (const fileName in itemData) {
                    const fileContent = itemData[fileName];
                    const fileInCourse = itemPath.get_child(fileName);
                    let contentToWrite = (typeof fileContent === 'object') ? JSON.stringify(fileContent, null, 4) : fileContent;
                    // print(`DEBUG: Writing sub-file: ${fileInCourse.get_path()}`);
                    fileInCourse.replace_contents(contentToWrite, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                }
            }
        } catch (e) { print(`DEBUG: ERROR creating/populating ${itemPath.get_path()}: ${e.message}`); }
    }
    // print(`DEBUG: Finished populating test_courses_root.`);


    // Create dummy preamble directory and files inside test_courses_root
    const preamblesDirInTestRoot = testCoursesRootDir.get_child('preambles');
    try {
        if (!preamblesDirInTestRoot.query_exists(null)) {
            preamblesDirInTestRoot.make_directory_with_parents(null);
        }
        const dummyGlobalPreamble = preamblesDirInTestRoot.get_child('global_preamble.tex');
        const dummyReportPreamble = preamblesDirInTestRoot.get_child('report.tex');
        const dummyHomeworkPreamble = preamblesDirInTestRoot.get_child('homework.tex');

        // Global preamble for master.tex files
        dummyGlobalPreamble.replace_contents(
            '% Dummy Global Preamble for master.tex (inside test_courses_root/preambles)\n\\usepackage{article}\n' + // Minimal
            '\\newcommand{\\lecture}[3]{%\n' + // Definition for \lecture
            '  \\section*{Lec #1: #3 (#2)}\n\\par\\noindent\n}%\n',
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null
        );

        // Preamble for homework "report" type
        dummyReportPreamble.replace_contents(
            '% Dummy Report Preamble for Testing (inside test_courses_root/preambles)\n\\newcommand{\\makereport}{Report Content Here}\n',
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null
        );

        // Preamble for homework "default" type
        dummyHomeworkPreamble.replace_contents(
            '% Dummy Homework Preamble for Testing (inside test_courses_root/preambles)\n\\newcommand{\\makeproblem}{Problem Content Here}\n',
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null
        );
        print(`DEBUG: Ensured dummy preambles in ${preamblesDirInTestRoot.get_path()}`);
    } catch (e) {
        print(`DEBUG: Warning: Could not create dummy preambles in test_courses_root/preambles: ${e.message}`);
    }


    const symlinkFile = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'current_course']));
    if (symlinkFile.query_exists(null)) {
        try { symlinkFile.delete(null); } catch (e) { /* ignore */ }
    }

    print("\nTest environment setup complete!");
    return true;
}

setupEnvironment();

var exports = { setupEnvironment, TEST_COURSES_STRUCTURE, FIXED_DATE_LEC1_STR, FIXED_DATE_LEC2_STR, INFO_FILE_NAME, TEX_LECTURE_DATE_FORMAT, HOMEWORK_STORAGE_FILENAME_FOR_SETUP };