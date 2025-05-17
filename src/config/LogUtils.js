'use strict';

const { ConfigManager } = imports.config.ConfigManager;
const { GLib } = imports.gi;

/**
 * Stores log entries to track working time.
 * logs.sessions: list of working sessions. Sessions take the form `{"id": Int, "start_time": iso, "end_time": iso, "context": project/course, "workspace": project/course.name}`
 * log.workspace_times: map of `project/course.name`s -> the total working time in that workspace
 * @type {LogUtils}
 */
var LogUtils = class LogUtils {
    static _generateId() {
        return '_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    }

    /**
     * Adds a new work session and updates aggregated times.
     * @param {Object} sessionData - e.g., { start_time_iso, end_time_iso, context_type, context_id, notes }
     */
    static addWorkSession(sessionData) {
        if (!sessionData.context || !sessionData.workspace || !sessionData.start_time || !sessionData.end_time) {
            log("Error: sessionData missing an entry.");
            return;
        }

        const logs = ConfigManager.loadLogs();

        if (!(sessionData.workspace in ConfigManager.loadConfig().current_courses) && !(sessionData.workspace in ConfigManager.loadConfig().current_projects)) {
            console.log("Invalid or archived workspace passed, exiting.");
            return;
        }

        let durationMs = GLib.DateTime.new_from_iso8601(sessionData.end_time) - GLib.DateTime.new_from_iso8601(sessionData.start_time);
        if (durationMs < 0) {
            durationMs = 0;
            console.log('Error: negative duration_ms');
        }
        logs.workspace_times[sessionData.workspace] += durationMs;

        const newSession = {
            id: this._generateId(),
            start_time: sessionData.start_time,
            end_time: sessionData.end_time,
            context: sessionData.context,
            workspace: sessionData.workspace
        };
        logs.work_sessions.push(newSession);
        ConfigManager.saveLogs(logs);
    }

    /**
     * Retrieves work sessions, optionally filtered.
     * @param {Object} filters - e.g., { context, workspace, date_range_start, date_range_end }
     * @returns {Array} List of session objects.
     * Should call this upstream and then filter out overlapping times when upstream
     */
    static getWorkSessions(filters = {}) {
        let sessions = ConfigManager.loadLogs().work_sessions;

        if (filters.context) { // filters by context
            sessions = sessions.filter(s => s.context === filters.context);
        }
        if (filters.workspace) { // filters by workspace
            sessions = sessions.filter(s => s.workspace === filters.workspace);
        }
        if (filters.date_range_start) { // filters by start date
            const startDate = GLib.DateTime.new_from_iso8601(filters.date_range_start, null);
            sessions = sessions.filter(s => {
                const sessionStartDate = GLib.DateTime.new_from_iso8601(s.start_time, null);
                return sessionStartDate && startDate && sessionStartDate.compare(startDate) >= 0;
            });
        }
        if (filters.date_range_end) { // filters by end date
            const endDate = GLib.DateTime.new_from_iso8601(filters.date_range_end, null);
            sessions = sessions.filter(s => {
                const sessionStartDate = GLib.DateTime.new_from_iso8601(s.start_time, null);
                return sessionStartDate && endDate && sessionStartDate.compare(endDate) <= 0;
            });
        }
        return sessions;
    }

    static getWorkspaceTotalTime(workspace) {
        return ConfigManager.loadLogs().workspace_times[workspace] || 0;
    }

    static getAllWorkspaceTimes() {
        const logs = ConfigManager.loadLogs();
        return { ...logs.project_times };
    }
};

var exports = { LogUtils };