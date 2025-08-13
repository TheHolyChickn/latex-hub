'use strict';

const { Gio } = imports.gi; // Make sure Gio is imported
const ByteArray = imports.byteArray;

/**
 * A GJS wrapper for the rofi command using the robust Gio.Subprocess API.
 * @param {string} prompt - The prompt text to display in Rofi.
 * @param {string[]} options - An array of strings to display as options.
 * @param {string[]} [rofiArgs=[]] - An array of additional command-line arguments for Rofi.
 * @returns {{key: number, index: number, selected: string}}
 */
function rofi(prompt, options, rofiArgs = []) {
    const optionStr = options.join('\n');
    let args = ['-dmenu', '-i', '-p', prompt, ...rofiArgs];

    try {
        const subprocess = new Gio.Subprocess({
            argv: ['rofi', ...args],
            flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE,
        });
        subprocess.init(null);

        // --- THE REAL FIX ---
        // The function returns [ok, stdout, stderr]. We need to capture all three.
        // My previous version was missing 'ok', so 'stdout' was a boolean.
        const [ok, stdout, stderr] = subprocess.communicate_utf8(optionStr, null);
        const waitStatus = subprocess.get_exit_status();
        // --- END FIX ---

        if (!ok) {
            console.error(`Rofi communicate() failed. Stderr: ${stderr}`);
            return { key: -1, index: -1, selected: '' };
        }

        // Now 'stdout' is correctly a string, so .trim() will work.
        const selected = stdout ? stdout.trim() : '';
        const index = selected ? options.findIndex(opt => opt.trim() === selected) : -1;

        let key = -1;
        if (waitStatus === 0) {
            key = 0;
        } else if (waitStatus >= 10) {
            key = waitStatus - 9;
        }

        return { key, index, selected };

    } catch (e) {
        console.error(`Failed to launch Rofi process: ${e.message}`);
        return { key: -1, index: -1, selected: '' };
    }
}

var exports = { rofi };