#!/usr/bin/gjs

'use strict';

imports.gi.versions.GLib = '2.0';
imports.gi.versions.Gio = '2.0';
imports.gi.versions.GioUnix = '2.0';
const { GLib, Gio, GioUnix } = imports.gi;
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
const { Library } = imports.core.Library;
const Countdown = imports.core.Countdown;

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


async function handleNativeMessage() {
    const stdin = new Gio.DataInputStream({
        base_stream: new GioUnix.InputStream({ fd: 0 })
    });

    // Read the 4-byte length header from the browser
    const lengthBytes = stdin.read_bytes(4, null);
    const u8Array = lengthBytes.get_data();

    // Use the standard JavaScript DataView on the underlying ArrayBuffer
    const dataView = new DataView(u8Array.buffer);
    const length = dataView.getUint32(0, true); // true for little-endian

    // Read the message content itself
    const messageBytes = stdin.read_bytes(length, null);
    const messageStr = imports.byteArray.toString(messageBytes.get_data());
    const message = JSON.parse(messageStr);

    // Now, act on the parsed message
    if (message.command === 'add' && message.arxivId) {
        const library = new Library();
        // Send a response back to the extension
        const newItem = await library.addEntryFromArxivCLI(message.arxivId, message.downloadPdf);
        const response = { success: !!newItem, title: newItem ? newItem.title : null };

        // The browser expects a response in the same length-prefixed format
        const responseStr = JSON.stringify(response);
        const responseBytesOut = imports.byteArray.fromString(responseStr);
        const responseLength = new Uint8Array(4);
        new DataView(responseLength.buffer).setUint32(0, responseBytesOut.length, true);

        // Write the length and then the message to standard output
        const stdout = new GioUnix.OutputStream({ fd: 1 });
        stdout.write_all(responseLength, null);
        stdout.write_all(responseBytesOut, null);
    }
}


async function main() {
    if (ARGV.length === 0) {
        printHelp();
        return;
    }

    // Check if being run by browser (no arguments will be passed in this case)
    // note: normally running with len 0 should printHelp(). will need a second special check later
    const knownCommands = ['courses', 'lectures', 'homework', 'view', 'library', 'pdf', 'dir', 'help']
    const command = ARGV[0];
    const isNativeMessageCall = !knownCommands.includes(command);

    if (isNativeMessageCall) {
        await handleNativeMessage();
        return;
    }

    // Argument parsing logic for more complex commands
    const args = {};
    for (let i = 1; i < ARGV.length; i++) {
        const arg = ARGV[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            args[key] = value === undefined ? true : value;
        } else {
            args[`arg${i}`] = arg;
        }
    }

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
        case 'library':
            const subCommand = args.arg1;
            if (subCommand === 'add' && args.arxiv) {
                const library = new Library();
                const newItem = await library.addEntryFromArxivCLI(args.arxiv, args['download-pdf']);
                if (newItem) {
                    print(`Successfully added: "${newItem.title}"`);
                } else {
                    print(`Failed to add entry for arXiv:${args.arxiv}`);
                }
            } else if (subCommand === 'open' || subCommand === 'cite') {
                RofiManager.manageLibrary(subCommand);
            } else {
                print("Usage: latex-hub library [open|cite|add] --arxiv=<id> [--download-pdf]");
            }
            break;
        case 'pdf':
            openPdf();
            break;
        case 'countdown':
            Countdown.main();
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

const loop = new GLib.MainLoop(null, false);

main().catch(logError).finally(() => {
    loop.quit();
});

loop.run();