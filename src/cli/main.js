#!/usr/bin/gjs

'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.Gio = '2.0';
const { GLib, Gio } = imports.gi;
const System = imports.system;

function getSelfPath() {
    const stack = new Error().stack;
    const stackLine = stack.split('\n')[1];
    if (!stackLine) return null;
    const match = stackLine.match(/@(.+?):\d+/);
    return (match && match[1]) ? match[1] : null;
}

const selfPath = getSelfPath();
if (!selfPath) {
    console.error("Critical: Could not determine the script's own path. Exiting.");
    System.exit(1);
}

const scriptDir = GLib.path_get_dirname(selfPath);
const projectRoot = GLib.build_filenamev([scriptDir, '../../']);
imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'src']));

// Corrected import path
const RofiManager = imports.core.RofiManager;
const { Courses } = imports.core.Courses;

// ... (The rest of the file: openPdf, openDir, printHelp, main switch statement)
// ... (No changes needed in the logic of these functions)

function openPdf() {
    const courses = new Courses();
    const currentCourse = courses.current;

    if (!currentCourse) {
        console.error("Error: No current course is set.");
        return;
    }

    const pdfPath = GLib.build_filenamev([currentCourse.path.get_path(), 'master.pdf']);

    if (!GLib.file_test(pdfPath, GLib.FileTest.EXISTS)) {
        console.error(`Error: PDF file does not exist at: ${pdfPath}`);
        console.log("Hint: You may need to compile the master.tex file first.");
        return;
    }

    try {
        GLib.spawn_async(null, ["zathura", pdfPath], null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    } catch (e) {
        console.error(`Failed to launch Zathura: ${e.message}`);
    }
}

function openDir() {
    const courses = new Courses();
    const currentCourse = courses.current;

    if (!currentCourse) {
        console.error("Error: No current course is set.");
        return;
    }

    const dirPath = currentCourse.path.get_path();
    try {
        GLib.spawn_async(null, ["dolphin", dirPath], null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    } catch (e) {
        console.error(`Failed to launch Dolphin: ${e.message}`);
    }
}

function printHelp() {
    const scriptName = GLib.path_get_basename(selfPath);
    console.log(`\n========== LaTeX Hub CLI ==========
    
Usage: ${scriptName} [command]

Commands:
  courses         Open Rofi to select the current course.
  lectures        Open Rofi to select or create a lecture for the current course.
  homework        Open Rofi to manage homework for the current course.
  view            Open Rofi to change the lecture view in the master file.
  pdf             Open the master.pdf of the current course in Zathura.
  dir             Open the current course directory in Dolphin.
  help            Show this help message.`);
}


function main() {
    if (ARGV.length < 1) {
        printHelp();
        return;
    }

    const command = ARGV[0];

    switch (command) {
        case 'courses':
            RofiManager.selectCourse();
            break;
        case 'lectures':
            RofiManager.selectLecture();
            break;
        case 'homework':
            RofiManager.manageHomework();
            break;
        case 'view':
            RofiManager.selectLectureView();
            break;
        case 'pdf':
            openPdf();
            break;
        case 'dir':
            openDir();
            break;
        case 'help':
        default:
            printHelp();
            break;
    }
}

main();