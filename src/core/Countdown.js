'use strict';

const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigUtils } = imports.config.ConfigUtils;
const { Courses } = imports.core.Courses;

const USERCALENDARID = 'primary';
const SCRIPT_APP_NAME = 'LatexHubCountdown/1.0';
const TOKEN_PATH = GLib.build_filenamev([ConfigUtils.getConfigDir(), 'countdown_google_token.json']);
const CREDENTIALS_PATH = GLib.build_filenamev([GLib.get_current_dir(), 'credentials.json']);

const DELAY_SECONDS = 60; // For rescheduling the message print

let coursesInstance = null;
let googleAuthToken = null; // To store the full token object { access_token, refresh_token, ... }
let refreshTimeoutId = null;
let mainLoopTimeoutId = null;
let httpSession = new Soup.Session({ user_agent: SCRIPT_APP_NAME });

/**
 * Ensures a directory exists.
 * @param {string} path - The directory path.
 */
function ensureDirExists(path) {
    if (!GLib.file_test(path, GLib.FileTest.IS_DIR)) {
        try {
            Gio.File.new_for_path(path).make_directory_with_parents(null);
        } catch (e) {
            console.error(`Failed to create directory ${path}: ${e.message}`);
        }
    }
}

/**
 * Loads the token from the JSON file.
 * @returns {Object|null} The loaded token object or null.
 */
function loadToken() {
    if (!GLib.file_test(TOKEN_PATH, GLib.FileTest.EXISTS)) {
        return null;
    }
    try {
        const [success, contents] = GLib.file_get_contents(TOKEN_PATH);
        if (success) {
            return JSON.parse(ByteArray.toString(contents));
        }
    } catch (e) {
        console.error(`Error loading token from ${TOKEN_PATH}: ${e.message}`);
    }
    return null;
}

/**
 * Saves the token object to the JSON file.
 * @param {Object} token - The token object to save.
 */
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

/**
 * Refreshes the access token using the refresh token.
 * @async
 * @param {string} refreshToken - The refresh token.
 * @returns {Promise<boolean>} True if token refresh was successful.
 */
async function refreshAccessToken(refreshToken) {
    console.log('Refreshing access token...');
    const credentialsFile = Gio.File.new_for_path(CREDENTIALS_PATH);
    if (!credentialsFile.query_exists(null)) {
        console.error("credentials.json not found. Please obtain it from Google Cloud Console.");
        return false;
    }

    try {
        const [, contents] = credentialsFile.load_contents(null);
        const creds = JSON.parse(ByteArray.toString(contents)).installed;

        const tokenUri = 'https://oauth2.googleapis.com/token';
        const message = Soup.Message.new('POST', tokenUri);
        message.set_request_body_from_fields(
            'application/x-www-form-urlencoded',
            'client_id', creds.client_id,
            'client_secret', creds.client_secret,
            'refresh_token', refreshToken,
            'grant_type', 'refresh_token'
        );

        const bytes = await httpSession.send_async(message, null);
        const response = JSON.parse(ByteArray.toString(bytes.get_data()));

        if (message.get_status() !== 200) {
            console.error(`Token refresh failed. Status: ${message.get_status()}`, response);
            return false;
        }

        // Google refresh responses don't include a new refresh token, so we must add it back.
        const newToken = {
            ...response,
            refresh_token: refreshToken,
            // Calculate new expiry date. 'expires_in' is in seconds.
            expiry_date: GLib.DateTime.new_now_utc().add_seconds(response.expires_in - 60).format_iso8601()
        };

        googleAuthToken = newToken;
        saveToken(googleAuthToken);
        scheduleTokenRefresh(googleAuthToken);
        return true;

    } catch (e) {
        console.error(`An error occurred during token refresh: ${e.message}`);
        return false;
    }
}

/**
 * Authenticates with Google. It will use a saved token, refresh it if needed,
 * or guide the user to perform the initial auth.
 * @async
 * @returns {Promise<boolean>} True if authentication is successful and we have a valid access token.
 */
async function authenticate() {
    console.log('Authenticating...');
    googleAuthToken = loadToken();

    if (!googleAuthToken) {
        console.error("FATAL: No token file found.");
        console.log("--- ONE-TIME SETUP ---");
        console.log(`1. Ensure 'credentials.json' is in your project root.`);
        console.log(`2. Visit the following URL in your browser (you may need to construct it from credentials.json):`);
        console.log(`   https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline`);
        console.log(`3. Authorize the app. You'll be redirected to a non-existent localhost page. Copy the 'code' from the URL.`);
        console.log(`4. Exchange the code for a token using curl:`);
        console.log(`   curl -d client_id=YOUR_CLIENT_ID -d client_secret=YOUR_CLIENT_SECRET -d redirect_uri=http://localhost -d grant_type=authorization_code -d code=PASTE_CODE_HERE https://oauth2.googleapis.com/token`);
        console.log(`5. Save the JSON output from curl into ${TOKEN_PATH}. Ensure it includes the 'refresh_token'.`);
        return false;
    }

    const expiryDateTime = googleAuthToken.expiry_date ? GLib.DateTime.new_from_iso8601(googleAuthToken.expiry_date, null) : null;
    const isExpired = !expiryDateTime || expiryDateTime.compare(GLib.DateTime.new_now_utc()) <= 0;

    if (isExpired) {
        if (googleAuthToken.refresh_token) {
            console.log("Access token is expired, attempting to refresh.");
            return await refreshAccessToken(googleAuthToken.refresh_token);
        } else {
            console.error("Token is expired and no refresh_token is available. Please re-authenticate manually.");
            return false;
        }
    }

    console.log("Authentication successful using existing token.");
    scheduleTokenRefresh(googleAuthToken);
    return true;
}


/**
 * Schedules token refresh before expiry.
 * @param {Object} token - The token object with 'expiry_date'.
 */
function scheduleTokenRefresh(token) {
    if (refreshTimeoutId) {
        GLib.Source.remove(refreshTimeoutId);
        refreshTimeoutId = null;
    }
    if (token && token.expiry_date) {
        const expiryDateTime = GLib.DateTime.new_from_iso8601(token.expiry_date, null);
        const now = GLib.DateTime.new_now_utc();
        const refreshDelayMs = expiryDateTime.difference(now) - (5 * 60 * 1000);

        if (refreshDelayMs > 0) {
            refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.floor(refreshDelayMs / 1000), () => {
                console.log("Attempting scheduled token refresh...");
                authenticate();
                return GLib.SOURCE_REMOVE;
            });
        } else {
            if(token.refresh_token) authenticate();
        }
    }
}


/**
 * Fetches events from Google Calendar.
 * @async
 * @param {string} calendarId - The ID of the calendar to fetch events from.
 * @param {GLib.DateTime} timeMin - Start of the time range.
 * @param {GLib.DateTime} timeMax - End of the time range.
 * @returns {Promise<Array<Object>>} A list of event objects from the API response.
 */
async function getEventsFromApi(calendarId, timeMin, timeMax) {
    if (!googleAuthToken || !googleAuthToken.access_token) {
        console.error('Not authenticated. Cannot fetch events.');
        return [];
    }
    console.log('Fetching events...');

    const TZAwareISO = (dt) => dt.to_utc().format_iso8601();

    const params = new GLib.UriParamsBuilder();
    params.add('timeMin', TZAwareISO(timeMin));
    params.add('timeMax', TZAwareISO(timeMax));
    params.add('singleEvents', 'true');
    params.add('orderBy', 'startTime');

    const uri = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.to_string()}`;

    const message = Soup.Message.new('GET', uri);
    message.request_headers.append('Authorization', `Bearer ${googleAuthToken.access_token}`);

    try {
        const bytes = await httpSession.send_async(message, null);
        const responseData = JSON.parse(ByteArray.toString(bytes.get_data()));

        if (message.get_status() !== 200) {
            console.error(`Failed to fetch events. Status: ${message.get_status()}`, responseData);
            return [];
        }
        return responseData.items || [];
    } catch (e) {
        console.error(`Error during event fetch request: ${e.message}`);
        return [];
    }
}


/**
 * Parses event objects from API response into a more usable format.
 * @param {Array<Object>} rawEvents - The `items` array from the Google Calendar API response.
 * @returns {Array<Object>} Parsed and structured event objects.
 */
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
        if (next) {
            return [summary(next.summary), 'in', formatDD(now, next.start), location(next.location)].filter(Boolean).join(' ');
        }
        return '';
    }

    const next = events.find(e => e.start.compare(current.end) >= 0);
    if (!next) {
        return `Ends in ${formatDD(now, current.end)}!`;
    }

    if (current.end.equal(next.start)) {
        return ['Ends in', `${formatDD(now, current.end)}.`, 'Next:', summary(next.summary), location(next.location)].filter(Boolean).join(' ');
    }

    return ['Ends in', `${formatDD(now, current.end)}.`, 'Next:', summary(next.summary), location(next.location), 'after a', formatDD(current.end, next.start), 'break.'].filter(Boolean).join(' ');
}

function activateCourse(event) {
    if (!coursesInstance || !event || !event.summary) return;

    const course = coursesInstance.coursesList.find(c => {
        return c.info && c.info.title && event.summary.toLowerCase().includes(c.info.title.toLowerCase());
    });

    if (!course) return;

    // Avoid setting if it's already the current course
    const currentCourse = coursesInstance.current;
    if (!currentCourse || !currentCourse.equals(course)) {
        console.log(`Activating course: ${course.name} due to event: ${event.summary}`);
        coursesInstance.current = course;
    }
}

let eventCache = [];
let currentSchedulerTimeouts = [];

async function fetchEventsAndManageSchedule() {
    const localNow = GLib.DateTime.new_now_local();
    const localMorning = localNow.get_date().to_local();
    const localEvening = localMorning.add_days(1).add_seconds(-1);

    try {
        const rawEvents = await getEventsFromApi(USERCALENDARID, localMorning.to_utc(), localEvening.to_utc());
        eventCache = parseEventsFromResponse(rawEvents);
        eventCache.sort((a, b) => a.start.compare(b.start));
    } catch (e) {
        console.error(`Failed to fetch or parse events: ${e.message}`);
    }

    currentSchedulerTimeouts.forEach(id => GLib.Source.remove(id));
    currentSchedulerTimeouts = [];

    if (mainLoopTimeoutId) {
        GLib.Source.remove(mainLoopTimeoutId);
        mainLoopTimeoutId = null;
    }

    eventCache.forEach(event => {
        const now = GLib.DateTime.new_now_local();
        // Activate if ongoing
        if (now.compare(event.start) >= 0 && now.compare(event.end) < 0) {
            activateCourse(event);
        }
        // Schedule activation for future events
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
            console.log("Nearing end of day, rescheduling full event fetch for tomorrow.");
            fetchEventsAndManageSchedule();
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    });
    currentSchedulerTimeouts.push(mainLoopTimeoutId);
}

function updateDisplayedText() {
    const now = GLib.DateTime.new_now_local();
    const textToDisplay = formatEventText(eventCache, now);
    console.log(`[${now.format('%H:%M:%S')}] ${textToDisplay || '(No current/upcoming events for today)'}`);
}

/**
 * Main function to start the countdown logic.
 * This should be called from your main application entry point.
 */
async function main() {
    const mainLoop = new GLib.MainLoop(null, false);
    console.log('Initializing Countdown Logic...');

    if (!coursesInstance) {
        coursesInstance = new Courses();
    }

    // Since this is a CLI script, we'll run the main loop and handle signals.
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, GLib.unix_signal_from_str("TERM"), () => mainLoop.quit());
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, GLib.unix_signal_from_str("INT"), () => mainLoop.quit());

    try {
        if (await authenticate()) {
            fetchEventsAndManageSchedule();
            console.log("Countdown running. Press Ctrl+C to exit.");
            mainLoop.run();
        } else {
            console.error('Authentication failed. Countdown logic will not run.');
        }
    } catch (e) {
        console.error("Unhandled error in main:", e);
    } finally {
        console.log("Countdown script shutting down.");
        if (mainLoop.is_running()) {
            mainLoop.quit();
        }
    }
}


// To make this file runnable directly via `gjs -m src/core/Countdown.js`
if (import.meta.main) {
    imports.searchPath.unshift(GLib.get_current_dir());
    main().catch(console.error);
}

// For use as a module:
var exports = { main, authenticate, getEventsFromApi, formatEventText };