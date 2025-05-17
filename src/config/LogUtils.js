'use strict';

const { ConfigManager } = imports.config.ConfigManager;
const { GLib } = imports.gi;

var LogUtils = class LogUtils {
    static _generateId() {
        return '_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    }

    /**
     * Adds a new work session and updates aggregated times.
     * @param {Object} sessionData - e.g., { start_time_iso, end_time_iso, duration_ms (optional), context_type, context_id, notes }
     * If duration_ms is not provided, it can be calculated from start/end times.
     * @returns {Object|null} The new session object or null if error.
     */
    static addWorkSession(sessionData) {
        if (!sessionData.context_type || !sessionData.context_id) {
            log("Error: context_type and context_id are required for work session.");
            return null;
        }

        const logs = ConfigManager.loadLogs();
        let durationMs = sessionData.duration_ms;

        // Calculate duration if not provided but start and end times are
        if (durationMs === undefined && sessionData.start_time_iso && sessionData.end_time_iso) {
            try {
                const startTime = GLib.DateTime.new_from_iso8601(sessionData.start_time_iso, null); // Assuming UTC or well-defined timezone
                const endTime = GLib.DateTime.new_from_iso8601(sessionData.end_time_iso, null);
                if (startTime && endTime) {
                    durationMs = endTime.difference(startTime);
                    durationMs = Math.floor(durationMs / 1000); // convert to ms
                }
            } catch(e) {
                log(`Error parsing session times: ${e.message}`);
                durationMs = 0;
            }
        }
        if (typeof durationMs !== 'number' || durationMs < 0) durationMs = 0;


        const newSession = {
            id: this._generateId(),
            start_time: sessionData.start_time_iso || new GLib.DateTime().new_now_utc().format_iso8601(),
            end_time: sessionData.end_time_iso,
            duration_ms: durationMs,
            context_type: sessionData.context_type,
            context_id: sessionData.context_id,
            notes: sessionData.notes || ''
        };
        logs.work_sessions.push(newSession);

        if (newSession.duration_ms > 0) {
            if (newSession.context_type === 'project') {
                logs.project_times[newSession.context_id] = (logs.project_times[newSession.context_id] || 0) + newSession.duration_ms;
            } else if (newSession.context_type === 'course') {
                logs.course_times[newSession.context_id] = (logs.course_times[newSession.context_id] || 0) + newSession.duration_ms;
            }
        }
        ConfigManager.saveLogs(logs);
        return newSession; // needed?
    }

    /**
     * Retrieves work sessions, optionally filtered.
     * @param {Object} filters - e.g., { context_type, context_id, date_range_start_iso, date_range_end_iso }
     * @returns {Array} List of session objects.
     */
    static getWorkSessions(filters = {}) {
        const logs = ConfigManager.loadLogs();
        let sessions = logs.work_sessions;

        if (filters.context_type) {
            sessions = sessions.filter(s => s.context_type === filters.context_type);
        }
        if (filters.context_id) {
            sessions = sessions.filter(s => s.context_id === filters.context_id);
        }
        if (filters.date_range_start_iso) {
            const startDate = GLib.DateTime.new_from_iso8601(filters.date_range_start_iso, null);
            sessions = sessions.filter(s => {
                const sessionStartDate = GLib.DateTime.new_from_iso8601(s.start_time, null);
                return sessionStartDate && startDate && sessionStartDate.compare(startDate) >= 0;
            });
        }
        if (filters.date_range_end_iso) {
            const endDate = GLib.DateTime.new_from_iso8601(filters.date_range_end_iso, null);
            sessions = sessions.filter(s => {
                const sessionStartDate = GLib.DateTime.new_from_iso8601(s.start_time, null);
                return sessionStartDate && endDate && sessionStartDate.compare(endDate) <= 0;
            });
        }
        return sessions;
    }

    static getProjectTotalTime(projectId) {
        const logs = ConfigManager.loadLogs();
        return logs.project_times[projectId] || 0;
    }

    static getCourseTotalTime(courseId) {
        const logs = ConfigManager.loadLogs();
        return logs.course_times[courseId] || 0;
    }

    static getAllProjectTimes() {
        const logs = ConfigManager.loadLogs();
        return { ...logs.project_times };
    }

    static getAllCourseTimes() {
        const logs = ConfigManager.loadLogs();
        return { ...logs.course_times };
    }
};

var exports = { LogUtils };