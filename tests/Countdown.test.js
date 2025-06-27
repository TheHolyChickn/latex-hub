'use strict';

const { GLib } = imports.gi;

// We can't import the whole Countdown module because it runs a main loop.
// Instead, we would typically extract the functions to a separate utility file.
// For now, I will duplicate the functions under test here, as if they were imported.
// In a real refactor, you would move these to a 'CountdownUtils.js' and import them here and in Countdown.js.

// --- Functions copied from src/core/Countdown.js for testing ---

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


// --- Test Suite ---

var countdownTests = {
    mockEvents: [],
    now: null,

    beforeAll: () => {
        // Set a fixed "now" for all tests to ensure results are predictable.
        // Time: Thursday, June 26, 2025 9:35:00 PM EDT
        const tz = GLib.TimeZone.new('America/New_York');
        this.now = GLib.DateTime.new(tz, 2025, 6, 26, 21, 35, 0);

        // Create the mock event schedule
        this.mockEvents = [
            // Event 1: Currently happening
            {
                summary: 'Quantum Mechanics Lecture',
                location: 'A place (PHYS-213)',
                start: GLib.DateTime.new(tz, 2025, 6, 26, 21, 0, 0), // 9:00 PM
                end:   GLib.DateTime.new(tz, 2025, 6, 26, 22, 0, 0), // 10:00 PM
            },
            // Event 2: Back-to-back with Event 1
            {
                summary: 'Office Hours',
                location: null,
                start: GLib.DateTime.new(tz, 2025, 6, 26, 22, 0, 0), // 10:00 PM
                end:   GLib.DateTime.new(tz, 2025, 6, 26, 23, 0, 0), // 11:00 PM
            },
            // Event 3: After a 15-minute break
            {
                summary: 'Study Session',
                location: 'Library (Group Room 4)',
                start: GLib.DateTime.new(tz, 2025, 6, 26, 23, 15, 0), // 11:15 PM
                end:   GLib.DateTime.new(tz, 2025, 6, 27, 0, 0, 0),   // 12:00 AM (next day)
            }
        ];
    },

    'test formatEventText when no event is current or upcoming': () => {
        const futureTime = GLib.DateTime.new(this.now.get_timezone(), 2025, 6, 27, 2, 0, 0); // 2 AM, long after all events
        const result = formatEventText(this.mockEvents, futureTime);
        assertEqual(result, '', "Should return empty string when no events are active or next.");
    },

    'test formatEventText when an event is happening (back-to-back next)': () => {
        const result = formatEventText(this.mockEvents, this.now);
        // "now" is 9:35 PM. Event 1 ends at 10:00 PM (25 mins left). Event 2 starts immediately.
        assertEqual(result, 'Ends in 25 min. Next: Office Hours', "Should show current event ending and the next event.");
    },

    'test formatEventText when an event is happening (break next)': () => {
        // Let's simulate time being 10:50 PM. Event 2 has 10 mins left. Event 3 is next after a 15 min break.
        const laterTime = GLib.DateTime.new(this.now.get_timezone(), 2025, 6, 26, 22, 50, 0); // 10:50 PM
        const result = formatEventText(this.mockEvents, laterTime);
        assertEqual(result, 'Ends in 10 min. Next: Study Session in Group Room 4 after a 15 min break.', "Should show break time correctly.");
    },

    'test formatEventText when between events': () => {
        // Let's simulate time being 8:30 PM. Event 1 is next.
        const earlierTime = GLib.DateTime.new(this.now.get_timezone(), 2025, 6, 26, 20, 30, 0); // 8:30 PM
        const result = formatEventText(this.mockEvents, earlierTime);
        assertEqual(result, 'Quantum Mechanics Lecture in 30 min in PHYS-213', "Should show countdown to the first event.");
    },

    'test formatEventText for the very last event': () => {
        // Let's simulate time being 11:30 PM. Event 3 is active and nothing is next.
        const lastEventTime = GLib.DateTime.new(this.now.get_timezone(), 2025, 6, 26, 23, 30, 0); // 11:30 PM
        const result = formatEventText(this.mockEvents, lastEventTime);
        assertEqual(result, 'Ends in 30 min!', "Should show only the end time for the last event.");
    }
};

var exports = countdownTests;