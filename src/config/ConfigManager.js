/**
 * a script for managing the various config files
 */

'use strict';

const { GLib, Gio } = imports.gi;

const CONFIG_DIR = GLib.build_filenamev([
    GLib.get_user_config_dir(),
    'LatexHub'
]);

const CONFIG_PATHS = {
    config: GLib.build_filenamev([CONFIG_DIR, 'config.json']),
    log: GLib.build_filenamev([CONFIG_DIR, 'log.json']),
    preambles: GLib.build_filenamev([CONFIG_DIR, 'preambles', 'preambles.json'])
};

var ConfigManager = class ConfigManager {

    static getConfigDir() {
        return CONFIG_DIR;
    }

    static ensureDirExists() {
        if (!GLib.file_test(CONFIG_DIR, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(CONFIG_DIR, 0o755);
        }

        const preamblesDir = GLib.build_filenamev([CONFIG_DIR, 'preambles']);
        if (!GLib.file_test(preamblesDir, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(preamblesDir, 0o755);
        }
    }

    // main config

    static loadConfig() {
        this.ensureDirExists();
        return this._loadJsonFile(CONFIG_PATHS.config, {
            root_dir: GLib.build_filenamev([GLib.get_home_dir(), 'Classes']),
            projects_dir: GLib.build_filenamev([GLib.get_home_dir(), 'Projects']),
            current_courses: [],
            current_projects: [],
            archived_courses: [],
            archived_projects: [],
            github_user: '',
            current_semester: ''
        });
    }

    static saveConfig(config) {
        this.ensureDirExists();
        this._saveJsonFile(CONFIG_PATHS.config, config);
    }

    // working logs

    static loadLogs() {
        this.ensureDirExists();
        return this._loadJsonFile(CONFIG_PATHS.log, {
            work_sessions: [],
            workspace_times: {}
        });
    }

    static saveLogs(logData) {
        this.ensureDirExists();
        this._saveJsonFile(CONFIG_PATHS.log, logData);
    }

    // preamble config

    static loadPreambles() {
        this.ensureDirExists();
        return this._loadJsonFile(CONFIG_PATHS.preambles, {
            preambles: [],
            templates: {},
            default_template_for_lecture: null
        });
    }

    static savePreambles(preambles) {
        this.ensureDirExists();
        this._saveJsonFile(CONFIG_PATHS.preambles, preambles);
    }

    // other shit

    static _loadJsonFile(path, defaultValue = {}) {
        try {
            const [success, contents] = GLib.file_get_contents(path);
            if (success) {
                return JSON.parse(imports.byteArray.toString(contents));
            }
        } catch (e) {
            console.error(`Error loading file: ${path}:`, e.message);
        }
        return defaultValue;
    }

    static _saveJsonFile(path, data) {
        try {
             const jsonString = JSON.stringify(data, null, 4);
             GLib.file_set_contents(path, jsonString);
        } catch (e) {
            console.error(`Error saving file: ${path}:`, e.message);
            throw e;
        }
    }
}

var exports = { ConfigManager };