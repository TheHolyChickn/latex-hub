'use strict';

imports.gi.versions.Soup = '2.4';
imports.gi.versions.GLib = '2.0';
imports.gi.versions.Gio = '2.0';

const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigManager } = imports.config.ConfigManager;
const { Courses } = imports.core.Courses;

const USERCALENDARID = 'primary';
const TOKEN_PATH = GLib.build_filenamev([ConfigManager.getConfigDir(), 'countdown_google_token.json']);
const CREDENTIALS_PATH = GLib.build_filenamev([GLib.get_current_dir(), 'credentials.json']);
const DELAY_SECONDS = 60;

let coursesInstance = null;
let googleAuthToken = null;
let refreshTimeoutId = null;
let mainLoopTimeoutId = null;
let httpSession = new Soup.SessionAsync();

function ensureDirExists(path) {
    if (!GLib.file_test(path, GLib.FileTest.IS_DIR)) {
        try {
            Gio.File.new_for_path(path).make_directory_with_parents(null);
        } catch (e) {
            console.error(`Failed to create directory ${path}: ${e.message}`);
        }
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
        console.error(`FATAL: credentials.json not found at ${CREDENTIALS_PATH}`);
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
            try {
                if (msg.status_code !== 200) {
                    const errorBody = (msg.response_body) ? ByteArray.toString(msg.response_body.flatten().get_data()) : "No response body.";
                    console.error(`Token refresh failed. Status: ${msg.status_code}. Body: ${errorBody}`);
                    return callback(false);
                }

                if (!msg.response_body) {
                    console.error("CRITICAL: Token refresh request succeeded (status 200), but the response body was empty. Cannot proceed.");
                    return callback(false);
                }

                const responseBytes = msg.response_body.flatten().get_data();
                const responseText = ByteArray.toString(responseBytes);
                const response = JSON.parse(responseText);

                const newToken = {
                    ...googleAuthToken,
                    ...response,
                    expiry_date: GLib.DateTime.new_now_utc().add_seconds(response.expires_in - 60).format_iso8601()
                };
                googleAuthToken = newToken;
                saveToken(googleAuthToken);

                // **FIX:** Schedule the *next* refresh from here, and only here.
                scheduleTokenRefresh(googleAuthToken);
                callback(true);
            } catch (e) {
                console.error(`CRITICAL error parsing successful refresh token response: ${e.message}`);
                console.error(e.stack);
                callback(false);
            }
        });
    } catch (e) {
        console.error(`An error occurred preparing the token refresh request: ${e.message}`);
        callback(false);
    }
}

function authenticate(callback) {
    console.log('Authenticating...');
    googleAuthToken = loadToken();
    if (!googleAuthToken) {
        console.error("FATAL: No token file found. Please perform the one-time setup to generate 'countdown_google_token.json'.");
        return callback(false);
    }
    const expiryDateTime = googleAuthToken.expiry_date ? GLib.DateTime.new_from_iso8601(googleAuthToken.expiry_date, null) : null;
    const isExpired = !expiryDateTime || expiryDateTime.compare(GLib.DateTime.new_now_utc()) <= 0;

    if (isExpired) {
        if (googleAuthToken.refresh_token) {
            console.log("Access token is expired, attempting to refresh.");
            // **FIX:** Only call the refresh function and then stop.
            // The callback will handle what happens next.
            return refreshAccessToken(googleAuthToken.refresh_token, callback);
        }
        console.error("Token is expired and no refresh_token is available. Please re-authenticate manually by deleting the old token file.");
        return callback(false);
    }

    // **FIX:** This part only runs if the token is NOT expired.
    console.log("Authentication successful using existing token.");
    scheduleTokenRefresh(googleAuthToken);
    return callback(true);
}

function scheduleTokenRefresh(token) {
    // **FIX:** Clear the previous timeout *before* setting a new one.
    if (refreshTimeoutId) {
        GLib.Source.remove(refreshTimeoutId);
        refreshTimeoutId = null; // Set to null after removing
    }

    if (token && token.expiry_date) {
        const expiryDateTime = GLib.DateTime.new_from_iso8601(token.expiry_date, null);
        const now = GLib.DateTime.new_now_utc();
        // Calculate difference in milliseconds
        const refreshDelayMs = expiryDateTime.difference(now);

        // Set the timeout to be 5 minutes before actual expiry
        const timeoutMs = refreshDelayMs - (5 * 60 * 1000);

        if (timeoutMs > 0) {
            refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.floor(timeoutMs / 1000), () => {
                // When the timer fires, just authenticate. It will handle the refresh.
                authenticate(() => {});
                return GLib.SOURCE_REMOVE; // The timer should only run once.
            });
        } else if (googleAuthToken.refresh_token) {
            // If we are already past the refresh point, trigger it immediately.
            authenticate(() => {});
        }
    }
}


function getEventsFromApi(calendarId, timeMin, timeMax, callback) {
    if (!googleAuthToken || !googleAuthToken.access_token) {
        console.error('Not authenticated. Cannot fetch events.');
        return callback([]);
    }
    console.log(`Fetching events from ${timeMin.to_local().format('%Y-%m-%d %H:%M')} to ${timeMax.to_local().format('%Y-%m-%d %H:%M')}...`);

    const TZAwareISO = (dt) => dt.to_utc().format_iso8601().replace(/\.\d+/, '');
    const params =
        `timeMin=${encodeURIComponent(TZAwareISO(timeMin))}` +
        `&timeMax=${encodeURIComponent(TZAwareISO(timeMax))}` +
        `&singleEvents=true` +
        `&orderBy=startTime`;
    const uri = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`;
    const message = Soup.Message.new('GET', uri);
    message.request_headers.append('Authorization', `Bearer ${googleAuthToken.access_token}`);

    httpSession.queue_message(message, (session, msg) => {
        try {
            if (msg.status_code !== 200) {
                const errorDetails = (msg.response_body) ?
                    ByteArray.toString(msg.response_body.flatten().get_data()) :
                    "No response body.";
                console.error(`Failed to fetch events. Status: ${msg.status_code}. Details: ${errorDetails}`);
                return callback([]);
            }
            if (!msg.response_body) {
                console.warn("Event fetch request succeeded but response body was empty.");
                return callback([]);
            }
            const responseBytes = msg.response_body.flatten().get_data();
            const responseData = JSON.parse(ByteArray.toString(responseBytes));
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

/**
 * Fetches and parses today's Google Calendar events.
 * @param {function(Array<Object>)} callback - A function to call with the array of parsed event objects.
 */
function fetchTodaysEvents(callback) {
    authenticate(authSuccess => {
        if (!authSuccess) {
            callback([]);
            return;
        }

        const now = GLib.DateTime.new_now_local();
        const morning = GLib.DateTime.new_local(
            now.get_year(),
            now.get_month(),
            now.get_day_of_month(),
            0, 0, 0
        );
        const evening = morning.add_days(1).add_seconds(-1);

        getEventsFromApi(USERCALENDARID, morning, evening, (rawEvents) => {
            const parsedEvents = parseEventsFromResponse(rawEvents);
            parsedEvents.sort((a, b) => a.start.compare(b.start));
            callback(parsedEvents);
        });
    });
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
    fetchTodaysEvents(events => {
        eventCache = events;

        currentSchedulerTimeouts.forEach(id => GLib.Source.remove(id));
        currentSchedulerTimeouts = [];
        if (mainLoopTimeoutId) GLib.Source.remove(mainLoopTimeoutId);

        eventCache.forEach(event => {
            const now_local = GLib.DateTime.new_now_local();
            if (now_local.compare(event.start) >= 0 && now_local.compare(event.end) < 0) {
                activateCourse(event);
            }
            else if (event.start.compare(now_local) > 0) {
                const delayMilliseconds = event.start.difference(now_local);
                if (delayMilliseconds > 0) {
                    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.floor(delayMilliseconds / 1000), () => {
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
            if (checkTime.get_hour() === 23 && checkTime.get_minute() >= 59) {
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
            console.log("Authentication successful. Starting main logic.");
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

        for (const course of coursesInstance) {
            console.log(course.toString());
        }

        const signalHandler = (signalNumber) => {
            console.log(`\nCaught signal ${signalNumber}, shutting down.`);
            mainLoop.quit();
            return true;
        };

        if (GLib.unix_signal_add) {
            GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 2, () => signalHandler(2)); // SIGINT for Ctrl+C
            GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, 15, () => signalHandler(15)); // SIGTERM
        } else {
            console.error("CRITICAL: Could not find a method to handle system signals.");
        }

        authenticate(onAuthComplete);
        mainLoop.run();

    } catch (e) {
        console.error("Unhandled error in main:", e.message);
        console.error(e.stack);
        if (mainLoop.is_running()) mainLoop.quit();
    } finally {
        console.log("Countdown script shutting down.");
    }
}

var exports = { fetchTodaysEvents };

//if (System.programInvocationName.endsWith('Countdown.js')) {
//    main();
//}