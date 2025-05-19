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
    ConfigManagerModule = imports.config.ConfigManager;
} catch (e) {
    print("Error: Could not import ConfigManager module from 'imports.config.ConfigManager'.");
    print("Please ensure GJS_PATH is set correctly to include your 'src' directory (e.g., GJS_PATH=./src).");
    print(e.message);
    throw new Error("Module import failed. Test environment setup cannot continue.");
}

var INFO_FILE_NAME = 'info.json';
var TEX_LECTURE_DATE_FORMAT = '%a %d %b %Y %H:%M';

var FIXED_DATE_LEC1_STR = "Sun 18 May 2025 10:00";
var FIXED_DATE_LEC2_STR = "Mon 19 May 2025 11:00";


/**
 * Defines the structure of the test courses, including their info.json,
 * master.tex, and sample lecture files.
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
        },
        "master.tex": `\\documentclass{report}
\\title{Test Course Beta}
\\input{../global_preamble.tex}
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
    ".HiddenCourse": {
        "info.json": { title: "Hidden Course" }
    },
    "NotACourseFile.txt": "This is not a course directory, just a plain file in test_courses_root."
};

/**
 * Recursively deletes a directory and its contents.
 * @param {Gio.File} dirFile - The Gio.File object representing the directory to delete.
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
        print(`Warning: Issue during recursive deletion of ${dirFile.get_path()}: ${e.message}. Manual cleanup might be needed.`);
    }
}

/**
 * Sets up the test environment by creating a test courses directory,
 * configuring the application to use it, and populating it with test data.
 * @returns {boolean} True if setup was successful, false otherwise.
 */
function setupEnvironment() {
    print("Starting test environment setup...");

    const projectBaseDir = Gio.File.new_for_path(GLib.get_current_dir());
    const testCoursesRootDir = projectBaseDir.get_child('test_courses_root');
    const testCoursesRootPath = testCoursesRootDir.get_path();

    print(`Test courses root will be: ${testCoursesRootPath}`);

    if (testCoursesRootDir.query_exists(null)) {
        print(`Cleaning existing test_courses_root: ${testCoursesRootPath}`);
        deleteDirectoryRecursive(testCoursesRootDir);
        if (testCoursesRootDir.query_exists(null)) {
            print(`ERROR: FAILED to delete existing test_courses_root: ${testCoursesRootPath}. Check permissions or locks.`);
            return false;
        } else {
            print(`Successfully deleted existing test_courses_root.`);
        }
    }

    try {
        testCoursesRootDir.make_directory_with_parents(null);
        if (!testCoursesRootDir.query_exists(null)) {
            print(`ERROR: FAILED to create test_courses_root directory: ${testCoursesRootPath}. Make sure parent directories are writable.`);
            return false;
        }
        print(`Successfully created test_courses_root directory: ${testCoursesRootPath}`);
    } catch (e) {
        print(`FATAL: Could not create directory ${testCoursesRootPath}: ${e.message}`);
        return false;
    }

    const CM = ConfigManagerModule.ConfigManager;
    try {
        CM.ensureDirExists();
    } catch (e) {
        print(`FATAL: Could not ensure LaTeX Hub config directory exists: ${e.message}`);
        return false;
    }

    const mainConfig = CM.loadConfig();
    mainConfig.root_dir = testCoursesRootPath;
    mainConfig.current_courses = [];
    mainConfig.current_projects = [];
    mainConfig.archived_courses = [];
    mainConfig.archived_projects = [];
    mainConfig.github_user = '';
    mainConfig.current_semester = 'TestSemester';
    mainConfig.projects_dir = mainConfig.projects_dir || GLib.build_filenamev([GLib.get_home_dir(), 'TestProjects']);

    try {
        CM.saveConfig(mainConfig);
        print(`Saved config.json: 'root_dir' set to ${testCoursesRootPath} and other test defaults applied.`);
    } catch (e) {
        print(`FATAL: Could not save updated config.json: ${e.message}`);
        return false;
    }

    try {
        let logs = CM.loadLogs();
        logs.work_sessions = [];
        logs.workspace_times = {};
        CM.saveLogs(logs);

        let preambles = CM.loadPreambles();
        preambles.preambles = [];
        preambles.templates = {};
        preambles.default_template_for_lecture = null;
        CM.savePreambles(preambles);
        print("Cleared test log.json and preambles.json.");
    } catch (e) {
        print(`Warning: Could not initialize/clear default log or preamble config files: ${e.message}`);
    }

    print("Populating test_courses_root...");
    if (Object.keys(TEST_COURSES_STRUCTURE).length === 0) {
        print("TEST_COURSES_STRUCTURE is empty. No courses will be populated.");
    }

    for (const itemName in TEST_COURSES_STRUCTURE) {
        const itemPath = testCoursesRootDir.get_child(itemName);
        const itemData = TEST_COURSES_STRUCTURE[itemName];
        try {
            if (typeof itemData === 'string') {
                itemPath.replace_contents(itemData, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } else {
                itemPath.make_directory_with_parents(null);
                for (const fileName in itemData) {
                    const fileInCourse = itemPath.get_child(fileName);
                    let contentToWrite = (typeof itemData[fileName] === 'object') ? JSON.stringify(itemData[fileName], null, 4) : itemData[fileName];
                    fileInCourse.replace_contents(contentToWrite, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                }
            }
        } catch (e) {
            print(`ERROR creating/populating test item ${itemPath.get_path()}: ${e.message}`);
        }
    }
    print("Finished populating test_courses_root.");

    const globalPreambleInTestRoot = testCoursesRootDir.get_child('global_preamble.tex');
    try {
        globalPreambleInTestRoot.replace_contents(
            '% Dummy Global Preamble for Testing (inside test_courses_root)\n' +
            '\\usepackage{amsmath}\n' +
            '\\usepackage{amsfonts}\n' +
            '\\usepackage{amssymb}\n' +
            '% Minimal definition for \\lecture{number}{date}{title}\n' +
            '\\newcommand{\\lecture}[3]{%\n' +
            '  \\section*{Lecture #1: #3 (#2)}\n' +
            '  \\par\\noindent\n' +
            '}%\n',
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null
        );
        print(`Created/Updated dummy global_preamble.tex in ${globalPreambleInTestRoot.get_path()}`);
    } catch (e) {
        print(`Warning: Could not create/update dummy global_preamble.tex in test_courses_root: ${e.message}`);
    }

    const symlinkFile = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'current_course']));
    if (symlinkFile.query_exists(null)) {
        try {
            symlinkFile.delete(null);
        } catch (e) {
            print(`Warning: Could not remove existing ~/current_course symlink: ${e.message}`);
        }
    }

    print("\nTest environment setup complete!");
    print("IMPORTANT: To revert, manually edit your ~/.config/LatexHub/config.json to restore the original 'root_dir'.");
    print("You may also want to delete the 'latex-hub/test_courses_root/' directory after testing.");
    return true;
}

if (!setupEnvironment()) {
    throw new Error("Test environment setup failed. See logs above.");
}


var exports = {
    setupEnvironment,
    TEST_COURSES_STRUCTURE,
    FIXED_DATE_LEC1_STR,
    FIXED_DATE_LEC2_STR,
    INFO_FILE_NAME,
    TEX_LECTURE_DATE_FORMAT
};