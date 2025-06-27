'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.Gio = '2.0';
const { GLib, Gio } = imports.gi;

const projectRoot = GLib.get_current_dir();
imports.searchPath.unshift(projectRoot);
imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'src']));

const { Courses } = imports.core.Courses;
const { Homeworks } = imports.core.Homeworks;
const { PreambleUtils } = imports.config.PreambleUtils;
const { ConfigManager } = imports.config.ConfigManager;

/**
 * Generates the content for a new master.tex file based on course info.
 * @param {Course} course - The course object.
 * @param preambles - the list of preamble snippets to use.
 * @returns {string} The LaTeX content for the master file.
 */
function generateMasterTexContent(course, preambles) {
    const courseInfo = course.info || {};
    const title = courseInfo.title || course.name;
    const courseId = courseInfo.course_id || '';
    const college = courseInfo.college || '';
    const department = courseInfo.department || '';

    const preambleInputs = preambles.map(p => `\\input{${GLib.build_filenamev([ConfigManager.getConfigDir(), 'preambles', p + '.tex'])}}`).join('\n');

    const lines = [
        '\\documentclass[11pt, letterpaper]{report}',
        preambleInputs,
        '\\usepackage{titlepage}',
        `\\title{${title}}`,
        `\\college{${college}}`,
        `\\department{${department}}`,
        `\\courseID{${courseId}}`,
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
            const selectedPreambles = await selectPreamblesInteractively();
            const masterTexContent = generateMasterTexContent(course, selectedPreambles);
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

async function selectPreamblesInteractively() {
    const allPreambles = PreambleUtils.getAllPreambleSnippets();
    const allTemplates = PreambleUtils.getAllTemplates();

    console.log("\n--- Availale Preambles ---");
    allPreambles.forEach(p => {
        console.log(`- ${p.file_name}: ${p.description}`)
    })

    console.log("\n--- Available Templates ---");
    for (const templateName in allTemplates) {
        console.log(`- ${templateName}: [${allTemplates[templateName].join(', ')}]`);
    }

    const userInput = await new Promise(resolve => {
        const cancellable = new Gio.Cancellable();
        const stream = new Gio.DataInputStream({
            base_stream: new Gio.UnixInputStream({ fd: 0 })
        });
        console.log("\nEnter a comma-separated list of preambles and/or templates to include:");
        stream.read_line_async(0, cancellable, (steam, res) => {
            const line = stream.read_line_finish_utf8(res)[0];
            resolve(line);
        });
    });

    const selectedItems = userInput.split(',').map(item => item.trim());
    const selectedPreambles = new Set();

    selectedItems.forEach(item => {
        if (allTemplates[item]) {
            allTemplates[item].forEach(p => selectedPreambles.add(p));
        } else if (allPreambles.some(p => p.file_name === item)) {
            selectedPreambles.add(item);
        } else {
            console.log(`Warning: Preamble or template "${item}" not found.`);
        }
    });

    return Array.from(selectedPreambles);
}

var exports = { initializeAllCourses };