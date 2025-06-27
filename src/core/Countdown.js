'use strict';

imports.gi.versions.Soup = '2.4';
const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigManager } = imports.config.ConfigManager;
const { ConfigUtils } = imports.config.ConfigUtils;
const { Courses } = imports.core.Courses;

const USERCALENDARID = 'primary';
const SCRIPT_APP_NAME = 'LatexHubCountdown/1.0';
const TOKEN_PATH = GLib.build_filenamev([ConfigManager.getConfigDir(), 'countdown_google_token.json']);
const CREDENTIALS_PATH = GLib.build_filenamev([GLib.get_current_dir(), 'credentials.json']);
const DELAY_SECONDS = 60;

let coursesInstance = null;
let googleAuthToken = null;
let refreshTimeoutId = null;
let mainLoopTimeoutId = null;
let httpSession = new Soup.SessionAsync();

// --- Function Definitions ---
function ensureDirExists(path) {
    if (!GLib.file_test(path, GLib.FileTest.IS_DIR)) {
        try { Gio.File.new_for_path(path).make_directory_with_parents(null); }
        catch (e) { console.error(`Failed to create directory ${path}: ${e.message}`); }
    }
}
function loadToken() {
    if (!GLib.file_test(TOKEN_PATH, GLib.FileTest.EXISTS)) return null;
    try {
        const [success, contents] = GLib.file_get_contents(TOKEN_PATH);
        if (success) return JSON.parse(ByteArray.toString(contents));
    } catch (e) {
        console.error(`Error loading token from ${TOKEN_PATH}: ${e.message}`);
    }
    return null;
}
function saveToken(token) {
    ensureDirExists(GLib.path_get_dirname(TOKEN_PATH));
    try {
        const jsonString = JSON.stringify(token, null, 2);
        GLib.file_set_contents(TOKEN_PATH, jsonString);
        console.log("Successfully saved new token.");
    } catch (e) {
        console.error(`Error saving token to ${TOKEN_PATH}: ${e.message}`);
    }
}

function refreshAccessToken(refreshToken, callback) {
    console.log('Refreshing access token...');
    const credentialsFile = Gio.File.new_for_path(CREDENTIALS_PATH);
    if (!credentialsFile.query_exists(null)) {
        console.error(`credentials.json not found at ${CREDENTIALS_PATH}`);
        return callback(false);
    }
    try {
        const [, contents] = credentialsFile.load_contents(null);
        const creds = JSON.parse(ByteArray.toString(contents)).installed;
        const tokenUri = 'https://oauth2.googleapis.com/token';
        const message = Soup.Message.new('POST', tokenUri);
        const requestBody =
            `client_id=${encodeURIComponent(creds.client_id)}` +
            `&client_secret=${encodeURIComponent(creds.client_secret)}` +
            `&refresh_token=${encodeURIComponent(refreshToken)}` +
            `&grant_type=refresh_token`;
        message.set_request("application/x-www-form-urlencoded", Soup.MemoryUse.COPY, ByteArray.fromString(requestBody));

        httpSession.queue_message(message, (session, msg) => {
            // CORRECTED: Check the status code FIRST.
            if (msg.status_code !== 200) {
                const errorDetails = (msg.response_body && msg.response_body.data)
                    ? ByteArray.toString(msg.response_body.data)
                    : "No response body from server.";
                console.error(`Token refresh failed. Status: ${msg.status_code}. Details: ${errorDetails}`);
                // It is very likely your refresh token is now invalid. You may need to delete countdown_google_token.json and re-authenticate.
                return callback(false);
            }
            try {
                // Now that we know the status is 200, it's safe to parse.
                const response = JSON.parse(ByteArray.toString(msg.response_body.data));
                const newToken = { ...response, refresh_token: refreshToken,
                    expiry_date: GLib.DateTime.new_now_utc().add_seconds(response.expires_in - 60).format_iso8601() };
                googleAuthToken = newToken;
                saveToken(googleAuthToken);
                scheduleTokenRefresh(googleAuthToken);
                callback(true);
            } catch (e) {
                console.error(`Error parsing successful refresh token response: ${e.message}`);
                callback(false);
            }
        });
    } catch (e) {
        console.error(`An error occurred preparing the token refresh: ${e.message}`);
        callback(false);
    }
}
function authenticate(callback) {
    console.log('Authenticating...');
    googleAuthToken = loadToken();
    if (!googleAuthToken) {
        console.error("FATAL: No token file found. Please perform the one-time setup.");
        return callback(false);
    }
    const expiryDateTime = googleAuthToken.expiry_date ? GLib.DateTime.new_from_iso8601(googleAuthToken.expiry_date, null) : null;
    const isExpired = !expiryDateTime || expiryDateTime.compare(GLib.DateTime.new_now_utc()) <= 0;
    if (isExpired) {
        if (googleAuthToken.refresh_token) {
            console.log("Access token is expired, attempting to refresh.");
            return refreshAccessToken(googleAuthToken.refresh_token, callback);
        }
        console.error("Token is expired and no refresh_token is available. Please re-authenticate manually.");
        return callback(false);
    }
    console.log("Authentication successful using existing token.");
    scheduleTokenRefresh(googleAuthToken);
    return callback(true);
}
function scheduleTokenRefresh(token) {
    if (refreshTimeoutId) GLib.Source.remove(refreshTimeoutId);
    if (token && token.expiry_date) {
        const expiryDateTime = GLib.DateTime.new_from_iso8601(token.expiry_date, null);
        const now = GLib.DateTime.new_now_utc();
        const refreshDelayMs = expiryDateTime.difference(now) - (5 * 60 * 1000);
        if (refreshDelayMs > 0) {
            refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.floor(refreshDelayMs / 1000), () => {
                authenticate(() => {});
                return GLib.SOURCE_REMOVE;
            });
        } else if (token.refresh_token) {
            authenticate(() => {});
        }
    }
}
function getEventsFromApi(calendarId, timeMin, timeMax, callback) {
    if (!googleAuthToken || !googleAuthToken.access_token) {
        console.error('Not authenticated. Cannot fetch events.');
        return callback([]);
    }
    console.log('Fetching events...');
    const TZAwareISO = (dt) => dt.to_utc().format_iso8601();
    const params =
        `timeMin=${encodeURIComponent(TZAwareISO(timeMin))}` +
        `&timeMax=${encodeURIComponent(TZAwareISO(timeMax))}` +
        `&singleEvents=true` +
        `&orderBy=startTime`;
    const uri = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`;
    const message = Soup.Message.new('GET', uri);
    message.request_headers.append('Authorization', `Bearer ${googleAuthToken.access_token}`);

    httpSession.queue_message(message, (session, msg) => {
        // CORRECTED: Check status code FIRST.
        if (msg.status_code !== 200) {
            const errorDetails = (msg.response_body && msg.response_body.data)
                ? ByteArray.toString(msg.response_body.data)
                : "No response body.";
            console.error(`Failed to fetch events. Status: ${msg.status_code}. Details: ${errorDetails}`);
            return callback([]);
        }
        try {
            const responseData = JSON.parse(ByteArray.toString(msg.response_body.data));
            callback(responseData.items || []);
        } catch(e) {
            console.error(`Error parsing event response: ${e.message}`);
            callback([]);
        }
    });
}
function parseEventsFromResponse(rawEvents) {
    const events = [];
    if (rawEvents && Array.isArray(rawEvents)) {
        for (const item of rawEvents) {
            if (item.start && item.start.dateTime && item.end && item.end.dateTime) {
                try {
                    events.push({
                        summary: item.summary || 'No Title',
                        location: item.location || null,
                        start: GLib.DateTime.new_from_iso8601(item.start.dateTime, null).to_local(),
                        end: GLib.DateTime.new_from_iso8601(item.end.dateTime, null).to_local()
                    });
                } catch (e) {
                    console.warn(`Could not parse event time for "${item.summary}": ${e.message}`);
                }
            }
        }
    }
    return events;
}
function truncate(str, length) {
    const ellipsis = ' ...';
    if (!str || str.length <= length) return str || '';
    return str.substring(0, length - ellipsis.length) + ellipsis;
}
function summary(text) {
    return truncate((text || '').replace(/X[0-9A-Za-z]+/g, '').trim(), 50);
}
function formatDD(begin, end) {
    if (!begin || !end) return '';
    const diff = end.difference(begin);
    if (diff < 0) return '0 min';
    const minutes = Math.ceil(diff / (60 * 1000 * 1000));
    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours > 5 || restMinutes === 0) return `${hours} hours`;
    if (hours === 1 && restMinutes === 0) return `${hours}:${restMinutes.toString().padStart(2, '0')} hour`;
    return `${hours}:${restMinutes.toString().padStart(2, '0')} hours`;
}
function location(text) {
    if (!text) return '';
    const match = text.match(/\((.*)\)/);
    if (!match) return '';
    return `in ${match[1]}`;
}
function formatEventText(events, now) {
    const current = events.find(e => e.start.compare(now) < 0 && now.compare(e.end) < 0);
    if (!current) {
        const next = events.find(e => now.compare(e.start) <= 0);
        if (next) return [summary(next.summary), 'in', formatDD(now, next.start), location(next.location)].filter(Boolean).join(' ');
        return '';
    }
    const next = events.find(e => e.start.compare(current.end) >= 0);
    if (!next) return `Ends in ${formatDD(now, current.end)}!`;
    const common = ['Next:', summary(next.summary), location(next.location)];
    if (current.end.equal(next.start)) return ['Ends in', `${formatDD(now, current.end)}.`, ...common].filter(Boolean).join(' ');
    return ['Ends in', `${formatDD(now, current.end)}.`, ...common, 'after a', formatDD(current.end, next.start), 'break.'].filter(Boolean).join(' ');
}
function activateCourse(event) {
    if (!coursesInstance || !event || !event.summary) return;
    const course = coursesInstance.coursesList.find(c =>
        c.info && c.info.title && event.summary.toLowerCase().includes(c.info.title.toLowerCase())
    );
    if (!course) return;
    const currentCourse = coursesInstance.current;
    if (!currentCourse || !currentCourse.equals(course)) {
        console.log(`Activating course: ${course.name} due to event: ${event.summary}`);
        coursesInstance.current = course;
    }
}
let eventCache = [];
let currentSchedulerTimeouts = [];
function fetchEventsAndManageSchedule() {
    const localNow = GLib.DateTime.new_now_local();
    const localMorning = localNow.get_date().to_local();
    const localEvening = localMorning.add_days(1).add_seconds(-1);

    getEventsFromApi(USERCALENDARID, localMorning.to_utc(), localEvening.to_utc(), (rawEvents) => {
        eventCache = parseEventsFromResponse(rawEvents);
        eventCache.sort((a, b) => a.start.compare(b.start));

        currentSchedulerTimeouts.forEach(id => GLib.Source.remove(id));
        currentSchedulerTimeouts = [];
        if (mainLoopTimeoutId) GLib.Source.remove(mainLoopTimeoutId);
        eventCache.forEach(event => {
            const now = GLib.DateTime.new_now_local();
            if (now.compare(event.start) >= 0 && now.compare(event.end) < 0) activateCourse(event);
            else if (event.start.compare(now) > 0) {
                const delayMilliseconds = event.start.difference(now) / 1000;
                if (delayMilliseconds > 0) {
                    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, Math.floor(delayMilliseconds / 1000)), () => {
                        activateCourse(event);
                        return GLib.SOURCE_REMOVE;
                    });
                    currentSchedulerTimeouts.push(timeoutId);
                }
            }
        });
        updateDisplayedText();
        mainLoopTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, DELAY_SECONDS, () => {
            updateDisplayedText();
            const checkTime = GLib.DateTime.new_now_local();
            if (checkTime.get_hour() === 23 && checkTime.get_minute() >= 58) {
                fetchEventsAndManageSchedule();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
        currentSchedulerTimeouts.push(mainLoopTimeoutId);
    });
}
function updateDisplayedText() {
    const now = GLib.DateTime.new_now_local();
    const textToDisplay = formatEventText(eventCache, now);
    console.log(`[${now.format('%H:%M:%S')}] ${textToDisplay || '(No current/upcoming events for today)'}`);
}

function main() {
    const mainLoop = new GLib.MainLoop(null, false);

    const onAuthComplete = (authSuccess) => {
        if (authSuccess) {
            console.log("Authentication successful. Fetching calendar events...");
            fetchEventsAndManageSchedule();
            console.log("Countdown running. Press Ctrl+C to exit.");
        } else {
            console.error('Authentication failed. Countdown logic will not run.');
            mainLoop.quit();
        }
    };

    try {
        console.log('Initializing Countdown Logic in main()...');
        if (!coursesInstance) coursesInstance = new Courses();

        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 15, () => { mainLoop.quit(); return true; });
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 2, () => { mainLoop.quit(); return true; });

        authenticate(onAuthComplete);

        mainLoop.run();

    } catch (e) {
        console.error("Unhandled error in main:", e);
        if (mainLoop.is_running()) mainLoop.quit();
    } finally {
        console.log("Countdown script shutting down.");
    }
}

main();
var exports = { main, authenticate, getEventsFromApi, formatEventText };