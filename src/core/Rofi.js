'use strict'

imports.gi.version.GLib = '2.0';
const { Glib } = imports.gi;
const ByteArray = imports.byteArray;

/**
 * A GJS wrapper for the rofi command.
 * @param {string} prompt - The prompt text to display in Rofi.
 * @param {string[]} options - An array of strings to display as options.
 * @param {string[]} [rofiArgs=[]] - An array of additional command-line arguments for Rofi.
 * @returns {{key: number, index: number, selected: string}} - An object containing:
 * - key: 0 for selection, -1 for escape, or a custom keybinding number.
 * - index: The index of the selected option, or -1 if not found.
 * - selected: The text of the selected option.
 */
function rofi(prompt, options, [rofiArgs=[]]) {
    const optionStr = options.join('\n');

    let args = [
        'rofi',
        '-dmenu',
        '-i',
        '-p',
        prompt,
        ...rofiArgs
    ];

    const [success, stdoutBytes, stderrBytes, waitStatus] = GLib.spawn_sync(
        null,
        null,
        args,
        null,
        GLib.SpawnFlags.SEARCH_PATH,
        null,
        ByteArray.fromString(optionStr)
    );

    if (!success) {
        const stderr = ByteArray.toString(stderrBytes).trim();
        console.error(`Failed to spawn rofi: ${stderr}`);
        return { key: -1, index: -1, selected: '' };
    }

    const selected = ByteArray.toString(stdoutBytes).trim();
    const index = options.findIndex(item => item.trim() === selected);

    let key = -1;
    if (waitStatus === 0) {
        key = 0;
    } else if (waitStatus === 10) {
        key = waitStatus - 9;
    }

    return { key, index, selected };
}

var exports = { rofi };