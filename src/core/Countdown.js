'use strict';

const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigUtils } = imports.config.ConfigUtils;
const { Courses } = imports.core.Courses;

const USERCALENDARID = 'primary'; // From legacy-scripts/config.py, adjust if dynamic
const SCRIPT_APP_NAME = 'LatexHubCountdown'; // For user agent or other identifiers
const TOKEN_PATH = GLib.build_filenamev([ConfigUtils.get('root_dir'), 'countdown_google_token.json']);
const CREDENTIALS_PATH = GLib.build_filenamev([GLib.get_current_dir(), 'credentials.json']);

const DELAY_SECONDS = 60; // For rescheduling the message print

let coursesInstance = null;
let googleAccessToken = null; // To store the OAuth access token
let refreshTimeoutId = null;
let mainLoopTimeoutId = null;

/**
 * Ensures a directory exists.
 * @param {string} path - The directory path.
 */
function ensureDirExists(path) {
    if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
        try {
            Gio.File.new_for_path(path).make_directory_with_parents(null);
        } catch (e) {
            console.error(`Failed to create directory ${path}: ${e.message}`);
        }
    }
}

/**
 * Mimics Python's pickle load for the token, using JSON.
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
 * Mimics Python's pickle dump for the token, using JSON.
 * @param {Object} token - The token object to save.
 */
function saveToken(token) {
    ensureDirExists(ConfigUtils.get('root_dir'));
    try {
        const jsonString = JSON.stringify(token, null, 2);
        GLib.file_set_contents(TOKEN_PATH, jsonString);
    } catch (e) {
        console.error(`Error saving token to ${TOKEN_PATH}: ${e.message}`);
    }
}

/**
 * Placeholder for authenticating with Google and getting an access token.
 * This is a highly simplified version of the Python script's OAuth flow.
 * @async
 * @returns {Promise<boolean>} True if authentication was successful.
 */
async function authenticate() {
    console.log('Authenticating...');
    let token = loadToken();

    if (token && token.access_token && token.expiry_date && GLib.DateTime.new_from_iso8601(token.expiry_date, null).compare(GLib.DateTime.new_now_utc()) > 0) {
        googleAccessToken = token.access_token;
        console.log('Using existing valid token.');
        scheduleTokenRefresh(token);
        return true;
    }

    if (token && token.refresh_token) {
        console.log('Attempting to refresh token...');
        // TODO: Implement token refresh logic using HTTP request to Google's OAuth 2.0 token endpoint
        // This involves POSTing client_id, client_secret, refresh_token, grant_type='refresh_token'
        // For now, we'll simulate failure to prompt for new auth.
        console.warn('Token refresh logic not fully implemented. Please re-authenticate if needed.');
        // If refresh successful:
        // googleAccessToken = new_access_token;
        // saveToken(new_token_data); // including new expiry
        // scheduleTokenRefresh(new_token_data);
        // return true;
    }

    console.log('Need to obtain new token via OAuth flow.');
    // TODO: Implement full OAuth 2.0 flow for installed applications.
    // 1. Read client_id, client_secret from CREDENTIALS_PATH.
    // 2. Construct authorization URL.
    // 3. Open URL for user, user authorizes, gets authorization code.
    // 4. Exchange authorization code for access token and refresh token via HTTP POST.
    // 5. Save the new token (including access_token, refresh_token, expiry_date).
    console.error('OAuth flow not fully implemented. Please manually obtain and save token or implement this section.');
    // Example of what to save if successful:
    // const newToken = {
    //     access_token: "new_access_token",
    //     refresh_token: "new_refresh_token",
    //     expiry_date: new GLib.DateTime.new_now_utc().add_seconds(3500).format_iso8601(), // Example: expires in slightly less than 1 hour
    //     token_type: "Bearer",
    //     // ... other fields like scope, id_token if present
    // };
    // saveToken(newToken);
    // googleAccessToken = newToken.access_token;
    // scheduleTokenRefresh(newToken);

    return false; // Return false if full auth is needed and not implemented
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
        // Refresh 5 minutes before expiry
        const refreshDelayMs = expiryDateTime.difference(now) - (5 * 60 * 1000);

        if (refreshDelayMs > 0) {
            refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.floor(refreshDelayMs / 1000), () => {
                console.log("Attempting scheduled token refresh...");
                authenticate(); // This will trigger the refresh logic if refresh_token is available
                return GLib.SOURCE_REMOVE;
            });
        } else { // Token already expired or close to expiring, refresh now
            if(token.refresh_token) authenticate();
        }
    }
}


/**
 * Placeholder for fetching events from Google Calendar.
 * @async
 * @param {string} calendarId - The ID of the calendar to fetch events from.
 * @param {GLib.DateTime} timeMin - Start of the time range.
 * @param {GLib.DateTime} timeMax - End of the time range.
 * @returns {Promise<Array<Object>>} A list of event objects.
 */
async function getEvents(calendarId, timeMin, timeMax) {
    if (!googleAccessToken) {
        console.error('Not authenticated. Cannot fetch events.');
        return [];
    }
    console.log('Fetching events...');

    const TZAwareISO = (dt) => {
        // Google API expects ISO 8601 format, often with timezone offset or 'Z' for UTC.
        // GLib.DateTime.format_iso8601 provides UTC if the DateTime object is UTC.
        // Ensure DateTime objects are in desired timezone or UTC before formatting.
        // For simplicity, assuming UTC for API calls as Python script did.
        return dt.to_utc().format_iso8601();
    };

    const params = GLib.Uri.new_params();
    params.append('timeMin', TZAwareISO(timeMin));
    params.append('timeMax', TZAwareISO(timeMax));
    params.append('singleEvents', 'true');
    params.append('orderBy', 'startTime');

    const uri = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.to_string()}`;

    // TODO: Replace with actual HTTP GET request using Soup.Session or similar
    // This requires setting up Soup.Message, adding Authorization header: `Bearer ${googleAccessToken}`
    // and handling the async response.
    console.warn(`HTTP GET to ${uri} not fully implemented.`);
    console.log(`Would fetch events for calendar: ${calendarId} from ${TZAwareISO(timeMin)} to ${TZAwareISO(timeMax)}`);

    // Simulated response structure:
    // const fakeApiResponse = {
    //     items: [
    //         { summary: 'Test Event 1', location: 'Test Location (Room 101)', start: { dateTime: timeMin.add_hours(1).format_iso8601() }, end: { dateTime: timeMin.add_hours(2).format_iso8601() } },
    //         { summary: 'Test Event 2 X123', start: { dateTime: timeMin.add_hours(3).format_iso8601() }, end: { dateTime: timeMin.add_hours(4).format_iso8601() } }
    //     ]
    // };
    // return parseEventsFromResponse(fakeApiResponse);

    return []; // Return empty for now
}

/**
 * Parses event objects from API response.
 * @param {Object} apiResponse - The JSON response from Google Calendar API.
 * @returns {Array<Object>} Parsed event objects.
 */
function parseEventsFromResponse(apiResponse) {
    const events = [];
    if (apiResponse && apiResponse.items) {
        for (const item of apiResponse.items) {
            if (item.start && item.start.dateTime && item.end && item.end.dateTime) {
                try {
                    events.push({
                        summary: item.summary || 'No Title',
                        location: item.location || null,
                        start: GLib.DateTime.new_from_iso8601(item.start.dateTime, null).to_local(), // Convert to local for processing
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


/**
 * Truncates a string to a given length, adding ellipsis if needed.
 * @param {string} str - The string to truncate.
 * @param {number} length - The maximum length.
 * @returns {string} The truncated string.
 */
function truncate(str, length) {
    const ellipsis = ' ...';
    if (!str || str.length <= length) {
        return str || '';
    }
    return str.substring(0, length - ellipsis.length) + ellipsis;
}

/**
 * Cleans up a summary string.
 * @param {string} text - The summary text.
 * @returns {string} The cleaned and truncated summary.
 */
function summary(text) {
    return truncate((text || '').replace(/X[0-9A-Za-z]+/g, '').trim(), 50);
}

/**
 * Formats a duration in a human-readable way.
 * @param {GLib.DateTime} begin - The start time.
 * @param {GLib.DateTime} end - The end time.
 * @returns {string} The formatted duration string.
 */
function formatDD(begin, end) {
    if (!begin || !end) return '';
    const diff = end.difference(begin); // Microseconds
    if (diff < 0) return '0 min';

    const minutes = Math.ceil(diff / (60 * 1000 * 1000));

    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    if (hours > 5 || restMinutes === 0) {
        return `${hours} hours`;
    }
    if (hours === 1 && restMinutes === 0) {
        return `${hours}:${restMinutes.toString().padStart(2, '0')} hour`;
    }
    return `${hours}:${restMinutes.toString().padStart(2, '0')} hours`;
}

/**
 * Extracts location information from event location string.
 * @param {string} text - The event's location string.
 * @returns {string} Formatted location string.
 */
function location(text) {
    if (!text) return '';
    const match = text.match(/\((.*)\)/);
    if (!match) return '';
    return `in ${match[1]}`; // Removed gray for direct port
}

/**
 * Generates the display text based on current and upcoming events.
 * @param {Array<Object>} events - Sorted list of event objects.
 * @param {GLib.DateTime} now - The current time (local).
 * @returns {string} The text to display.
 */
function formatEventText(events, now) {
    const current = events.find(e => e.start.compare(now) < 0 && now.compare(e.end) < 0);

    if (!current) {
        const next = events.find(e => now.compare(e.start) <= 0);
        if (next) {
            return [
                summary(next.summary),
                'in', // Removed gray
                formatDD(now, next.start),
                location(next.location)
            ].filter(Boolean).join(' ');
        }
        return '';
    }

    const next = events.find(e => e.start.compare(current.end) >= 0);
    if (!next) {
        return `Ends in ${formatDD(now, current.end)}!`; // Removed gray
    }

    if (current.end.equal(next.start)) {
        return [
            'Ends in', // Removed gray
            `${formatDD(now, current.end)}.`, // Removed gray
            'Next:', // Removed gray
            summary(next.summary),
            location(next.location)
        ].filter(Boolean).join(' ');
    }

    return [
        'Ends in', // Removed gray
        `${formatDD(now, current.end)}.`, // Removed gray
        'Next:', // Removed gray
        summary(next.summary),
        location(next.location),
        'after a', // Removed gray
        formatDD(current.end, next.start),
        'break.' // Removed gray
    ].filter(Boolean).join(' ');
}

/**
 * Activates a course if an event matches.
 * @param {Object} event - The event object.
 */
function activateCourse(event) {
    if (!coursesInstance || !event || !event.summary) return;

    const course = coursesInstance.coursesList.find(c => {
        return c.info && c.info.title && event.summary.toLowerCase().includes(c.info.title.toLowerCase());
    });

    if (!course) {
        return;
    }
    console.log(`Activating course: ${course.name} due to event: ${event.summary}`);
    coursesInstance.current = course;
}


let eventCache = [];
let currentSchedulerTimeouts = [];

/**
 * Fetches events and schedules activations and text updates.
 * This function replaces the main scheduling logic of the Python script's `main` and `print_message`.
 */
async function fetchEventsAndManageSchedule() {
    const localNow = GLib.DateTime.new_now_local();
    const localMorning = localNow.get_date().to_local(); // Midnight today, local
    const localEvening = localMorning.add_days(1).add_seconds(-1); // End of today, local

    try {
        const rawEvents = await getEvents(USERCALENDARID, localMorning.to_utc(), localEvening.to_utc());
        eventCache = parseEventsFromResponse(rawEvents); // parseEventsFromResponse converts to local
        eventCache.sort((a, b) => a.start.compare(b.start));
    } catch (e) {
        console.error(`Failed to fetch or parse events: ${e.message}`);
        // Keep using stale cache if available, or clear if desired
    }

    // Clear previous timeouts related to event scheduling
    currentSchedulerTimeouts.forEach(id => GLib.Source.remove(id));
    currentSchedulerTimeouts = [];

    if (mainLoopTimeoutId) {
        GLib.Source.remove(mainLoopTimeoutId);
        mainLoopTimeoutId = null;
    }

    // Schedule course activations
    eventCache.forEach(event => {
        const now = GLib.DateTime.new_now_local();
        if (event.start.compare(now) > 0) { // If event start is in the future
            const delayMilliseconds = event.start.difference(now) / 1000; // GLib.TimeSpan is in microseconds
            if (delayMilliseconds > 0) {
                const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, Math.floor(delayMilliseconds / 1000)), () => {
                    activateCourse(event);
                    return GLib.SOURCE_REMOVE; // Run once
                });
                currentSchedulerTimeouts.push(timeoutId);
            } else { // If event should have started, activate now
                activateCourse(event);
            }
        } else if (now.compare(event.end) < 0) { // If event is ongoing
            activateCourse(event);
        }
    });

    // Perform initial text update and schedule periodic updates
    updateDisplayedText(); // Call once immediately
    mainLoopTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, DELAY_SECONDS, () => {
        updateDisplayedText();
        // Check if we need to re-fetch events (e.g., if it's near midnight)
        const checkTime = GLib.DateTime.new_now_local();
        if (checkTime.get_hour() === 23 && checkTime.get_minute() >= 55) { // Near end of day, refetch for tomorrow
            console.log("Nearing end of day, rescheduling full event fetch.");
            fetchEventsAndManageSchedule(); // This will re-schedule itself
            return GLib.SOURCE_REMOVE; // Stop this specific periodic timeout, new one will be set
        }
        return GLib.SOURCE_CONTINUE; // Keep running
    });
    currentSchedulerTimeouts.push(mainLoopTimeoutId); // Track it
}

/**
 * Updates the displayed text (currently logs to console).
 */
function updateDisplayedText() {
    const now = GLib.DateTime.new_now_local();
    const textToDisplay = formatEventText(eventCache, now);
    console.log(`Countdown Text (${now.format('%Y-%m-%d %H:%M:%S')}): ${textToDisplay || '(No current/upcoming events)'}`);
    // In a GUI app, this would update a label: someLabel.set_text(textToDisplay);
}


/**
 * Checks for internet connection. Simplified, blocking version.
 * @returns {boolean} True if connected.
 */
function checkInternetConnection() {
    // This is a very basic check. Soup.Session would be better for async.
    // Python script used http.client, which is blocking.
    // For GJS, a synchronous check can be tricky without blocking the main thread.
    // This is a placeholder. For a real GJS app, use async Soup request.
    try {
        let [res, out, err, status] = GLib.spawn_command_line_sync('ping -c 1 www.google.com');
        return status === 0;
    } catch (e) {
        console.error(`Error checking internet: ${e.message}`);
        return false;
    }
}

/**
 * Main function to start the countdown logic.
 */
async function main() {
    console.log('Initializing Countdown Logic...');
    ensureDirExists(ConfigUtils.get('root_dir')); // Ensure token directory exists early

    // It's better to instantiate Courses once if this is part of a larger app.
    // For a standalone script, this is fine.
    if (!coursesInstance) {
        coursesInstance = new Courses();
    }

    console.log('Waiting for internet connection...');
    while (!checkInternetConnection()) {
        console.log('No internet connection, retrying in 30 seconds...');
        GLib.usleep(30 * 1000 * 1000); // sleep is not ideal in GJS main thread if this blocks UI
    }
    console.log('Internet connection available.');

    if (await authenticate()) {
        fetchEventsAndManageSchedule();
    } else {
        console.error('Authentication failed. Countdown logic will not run effectively.');
    }
    // The GLib timeouts will keep the process alive if running in a GJS environment
    // that has a main loop (e.g., a Gtk application).
    // If run as a simple gjs script, it might exit if no main loop is running.
}

// If this script is meant to be run directly for testing, you might call main():
// main().catch(e => console.error("Unhandled error in main:", e));

// For use as a module:
var exports = { main, authenticate, getEvents, formatEventText };