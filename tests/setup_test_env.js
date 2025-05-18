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
            professor: "Prof. Tester",
            preamble_path: "../global_preamble.tex" // Relative to the course dir
        },
        "master.tex": `\\documentclass{article}
\\title{Test Course Alpha}
\\author{Prof. Tester}
\\input{../global_preamble.tex}
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
            course_id: "TC 102",
            preamble_path: "../global_preamble.tex"
        },
        "master.tex": `\\documentclass{report}
\\title{Test Course Beta}
\\input{../global_preamble.tex}
\\begin{document}
\\maketitle
% start lectures
% end lectures
\\end{document}`
        // No lecture files for this course
    },
    "EmptyCourse": {
        "info.json": {
            title: "Empty Test Course",
            short: "ETC"
        }
        // No master.tex, no lectures for this course
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
 * Main function to set up the test environment.
 */
function setupEnvironment() {
    print("Starting test environment setup...");

    const projectBaseDir = Gio.File.new_for_path(GLib.get_current_dir());
    print(`DEBUG: Project base directory determined as: ${projectBaseDir.get_path()}`);
    const testCoursesRootDir = projectBaseDir.get_child('test_courses_root');
    const testCoursesRootPath = testCoursesRootDir.get_path();

    print(`DEBUG: Target test_courses_root path: ${testCoursesRootPath}`);

    if (testCoursesRootDir.query_exists(null)) {
        print(`DEBUG: test_courses_root exists. Attempting to clean: ${testCoursesRootPath}`);
        deleteDirectoryRecursive(testCoursesRootDir);
        if (testCoursesRootDir.query_exists(null)) {
            print(`DEBUG: FAILED to delete existing test_courses_root: ${testCoursesRootPath}. Check permissions or locks.`);
        } else {
            print(`DEBUG: Successfully deleted existing test_courses_root.`);
        }
    } else {
        print(`DEBUG: test_courses_root does not exist, will attempt to create it.`);
    }

    try {
        testCoursesRootDir.make_directory_with_parents(null);
        if (testCoursesRootDir.query_exists(null)) {
            print(`DEBUG: Successfully created test_courses_root directory: ${testCoursesRootPath}`);
        } else {
            print(`DEBUG: FAILED to create test_courses_root directory: ${testCoursesRootPath}. Make sure parent dirs are writable.`);
            return false;
        }
    } catch (e) {
        print(`FATAL: Could not create directory ${testCoursesRootPath}: ${e.message}`);
        return false;
    }

    const CM = ConfigManagerModule.ConfigManager;
    try {
        CM.ensureDirExists();
        // print(`Ensured config directory exists at: ${CM.getConfigDir()}`);
    } catch (e) {
        print(`FATAL: Could not ensure config directory using ConfigManager: ${e.message}`);
        return false;
    }
    const mainConfig = CM.loadConfig();
    // print(`Original root_dir (or default if new config): ${mainConfig.root_dir}`);
    mainConfig.root_dir = testCoursesRootPath;
    mainConfig.current_courses = []; // Resetting for tests
    mainConfig.current_projects = [];
    mainConfig.archived_courses = [];
    mainConfig.archived_projects = [];
    mainConfig.github_user = '';
    mainConfig.current_semester = 'TestSemester';
    // Default projects_dir if not set, or set a specific test one
    mainConfig.projects_dir = mainConfig.projects_dir || GLib.build_filenamev([GLib.get_home_dir(), 'TestProjects']);


    try {
        CM.saveConfig(mainConfig);
        print(`Saved config.json: root_dir set to ${testCoursesRootPath} and other test defaults.`);
    } catch (e) {
        print(`FATAL: Could not save updated config.json: ${e.message}`);
        return false;
    }

    try {
        let logs = CM.loadLogs();
        logs.work_sessions = []; logs.workspace_times = {}; // Clear logs for test
        CM.saveLogs(logs);
        let preambles = CM.loadPreambles();
        preambles.preambles = []; preambles.templates = {}; preambles.default_template_for_lecture = null; // Clear preambles
        CM.savePreambles(preambles);
        // print("Initialized/Ensured default (and cleared) log.json and preambles.json.");
    } catch (e) {
        print(`Warning: Could not initialize default log/preamble config files: ${e.message}`);
    }

    print("DEBUG: Attempting to populate test_courses_root...");
    let itemsCreatedCount = 0;
    if (Object.keys(TEST_COURSES_STRUCTURE).length === 0) {
        print("DEBUG: TEST_COURSES_STRUCTURE is empty. No courses will be populated.");
    }

    for (const itemName in TEST_COURSES_STRUCTURE) {
        print(`DEBUG: Processing item: ${itemName}`);
        const itemPath = testCoursesRootDir.get_child(itemName);
        const itemData = TEST_COURSES_STRUCTURE[itemName];
        try {
            if (typeof itemData === 'string') {
                print(`DEBUG: Writing file: ${itemPath.get_path()}`);
                itemPath.replace_contents(itemData, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                itemsCreatedCount++;
            } else { // It's a course directory
                print(`DEBUG: Creating directory: ${itemPath.get_path()}`);
                itemPath.make_directory_with_parents(null);
                itemsCreatedCount++; // Count the dir itself
                for (const fileName in itemData) {
                    const fileContent = itemData[fileName];
                    const fileInCourse = itemPath.get_child(fileName);
                    let contentToWrite = (typeof fileContent === 'object') ? JSON.stringify(fileContent, null, 4) : fileContent;
                    print(`DEBUG: Writing sub-file: ${fileInCourse.get_path()}`);
                    fileInCourse.replace_contents(contentToWrite, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                    itemsCreatedCount++;
                }
            }
        } catch (e) {
            print(`DEBUG: ERROR creating/populating ${itemPath.get_path()}: ${e.message}`);
        }
    }
    print(`DEBUG: Finished populating. Items created/attempted (approx based on structure): ${itemsCreatedCount > 0 ? 'some' : 'none'}`);
    if (itemsCreatedCount === 0 && Object.keys(TEST_COURSES_STRUCTURE).length > 0) {
        print("DEBUG: WARNING! No items seem to have been created in test_courses_root, but TEST_COURSES_STRUCTURE was not empty.");
    }

    // Create dummy global_preamble.tex inside test_courses_root
    const globalPreambleInTestRoot = testCoursesRootDir.get_child('global_preamble.tex');
    if (!globalPreambleInTestRoot.query_exists(null)) {
        try {
            globalPreambleInTestRoot.replace_contents(
                '% Dummy Global Preamble for Testing (inside test_courses_root)\n\\usepackage{amsmath}\n',
                null, false, Gio.FileCreateFlags.NONE, null
            );
            print(`DEBUG: Created dummy global_preamble.tex in ${globalPreambleInTestRoot.get_path()}`);
        } catch (e) {
            print(`DEBUG: Warning: Could not create dummy global_preamble.tex in test_courses_root: ${e.message}`);
        }
    }

    const symlinkFile = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'current_course']));
    if (symlinkFile.query_exists(null)) {
        try {
            symlinkFile.delete(null);
            // print("Removed existing ~/current_course symlink.");
        } catch (e) {
            // print(`Warning: Could not remove ~/current_course symlink: ${e.message}`);
        }
    }

    print("\nTest environment setup complete!");
    print("IMPORTANT: To revert, manually edit your ~/.config/LatexHub/config.json to restore the original 'root_dir'.");
    print("You may also want to delete the 'latex-hub/test_courses_root/' directory after testing.");
    return true;
}

setupEnvironment();

var exports = { setupEnvironment, TEST_COURSES_STRUCTURE, FIXED_DATE_LEC1_STR, FIXED_DATE_LEC2_STR, INFO_FILE_NAME, TEX_LECTURE_DATE_FORMAT };