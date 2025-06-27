'use strict';

imports.gi.versions.GLib = '2.0';
const { GLib } = imports.gi;

// Set up the search path to include the 'src' directory
// This might be redundant if run from a main app, but is good for potential standalone use.
const projectRoot = GLib.get_current_dir();
imports.searchPath.unshift(projectRoot);
imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'src']));

const { Courses } = imports.core.Courses;

/**
 * Iterates through all available courses, updates their master.tex file
 * to include all lectures, and then triggers a compilation using latexmk.
 *
 * @returns {Promise<void>} A promise that resolves when all compilations are attempted.
 */
async function compileAllMasters() {
    console.log("Starting master file compilation for all courses...");

    try {
        const courses = new Courses();
        if (courses.length === 0) {
            console.log("No courses found. Nothing to compile.");
            return;
        }

        console.log(`Found ${courses.length} courses to process.`);

        for (const course of courses) {
            console.log(`\n--- Processing Course: ${course.name} ---`);

            const lectures = course.lectures;
            if (!lectures || lectures.length === 0) {
                console.log(`Skipping: No lectures found for ${course.name}.`);
                continue;
            }

            // Get the range of all lectures
            const allLectureNumbers = lectures.parseRangeString('all');
            console.log(`Found ${allLectureNumbers.length} lectures. Updating master file...`);

            // Update the master file to include all lectures
            lectures.updateLecturesInMaster(allLectureNumbers);
            console.log("Master file updated.");

            // Compile the master file
            console.log("Compiling master.tex with latexmk...");
            const exitCode = lectures.compileMaster();

            if (exitCode === 0) {
                console.log(`Successfully compiled master.tex for ${course.name}.`);
            } else {
                console.warn(`Warning: Compilation for ${course.name} finished with exit code ${exitCode}. Check logs for errors.`);
            }
        }
    } catch (e) {
        console.error(`An unexpected error occurred during the compilation process: ${e.message}`);
        console.error(e.stack);
    }

    console.log("\nAll compilation tasks finished.");
}

var exports = { compileAllMasters };