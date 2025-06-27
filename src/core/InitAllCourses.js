'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.Gio = '2.0';
const { GLib, Gio } = imports.gi;

// Set up the search path to include the 'src' directory
const projectRoot = GLib.get_current_dir();
imports.searchPath.unshift(projectRoot);
imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'src']));

const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;

/**
 * Generates the content for a new master.tex file based on course info.
 * @param {Course} course - The course object.
 * @returns {string} The LaTeX content for the master file.
 */
function generateMasterTexContent(course) {
    const courseInfo = course.info || {};
    const title = courseInfo.title || course.name;
    const courseId = courseInfo.course_id || '';
    const college = courseInfo.college || '';
    const department = courseInfo.department || '';

    const lines = [
        '\\documentclass[11pt, letterpaper]{report}',
        '\\input{../preambles/global_preamble.tex}', // TODO: fix this shit
        '\\usepackage{titlepage}',
        `\\title{${title}}`,
        `\\college{${college}}`,
        `\\department{${department}}`,
        `\\courseID{${courseId}}`,
        `\\professor{${professor}}`,
        '\\begin{document}',
        '    \\maketitle',
        '    \\tableofcontents',
        '    % start lectures',
        '    % end lectures',
        '\\end{document}'
    ];

    return lines.join('\n');
}

/**
 * Initializes all course directories. This process includes:
 * 1. Initializing the homeworks.json tracker file.
 * 2. For each course found:
 * a. Creating a default master.tex file.
 * b. Creating a .latexmain marker file for IDEs.
 * c. Creating 'figures' and 'Homework' subdirectories.
 *
 * This action is idempotent; running it multiple times will overwrite master.tex
 * but will not harm existing subdirectory content.
 *
 * @returns {Promise<void>} A promise that resolves when all initialization is complete.
 */
async function initializeAllCourses() {
    console.log("Starting initialization for all course directories...");

    try {
        const courses = new Courses();
        if (courses.length === 0) {
            console.log("No courses found. Nothing to initialize.");
            return;
        }

        // 1. Initialize the homework tracker file
        // The Homeworks constructor automatically handles file creation if it doesn't exist.
        const homeworks = new Homeworks(courses);
        homeworks.initializeFile();
        console.log(`Initialized homeworks tracker at: ${homeworks.homeworkFilePath}`);


        console.log(`Found ${courses.length} courses to process.`);

        for (const course of courses) {
            console.log(`\n--- Initializing Course: ${course.name} ---`);
            const courseDir = course.path;

            // 2a. Create master.tex
            const masterTexContent = generateMasterTexContent(course);
            const masterFile = courseDir.get_child('master.tex');
            masterFile.replace_contents(masterTexContent, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            console.log(`Created/updated master.tex for ${course.name}.`);

            // 2b. Create .latexmain marker file
            const latexMainFile = courseDir.get_child('master.tex.latexmain');
            latexMainFile.replace_contents('', null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            console.log('Created .latexmain marker.');

            // 2c. Create subdirectories
            const figuresDir = courseDir.get_child('figures');
            if (!figuresDir.query_exists(null)) {
                figuresDir.make_directory_with_parents(null);
                console.log('Created figures/ directory.');
            }

            const homeworkDir = courseDir.get_child('Homework');
            if (!homeworkDir.query_exists(null)) {
                homeworkDir.make_directory_with_parents(null);
                console.log('Created Homework/ directory.');
            }
        }

    } catch (e) {
        console.error(`An unexpected error occurred during initialization: ${e.message}`);
        console.error(e.stack);
    }

    console.log("\nAll courses have been initialized.");
}

var exports = { initializeAllCourses };