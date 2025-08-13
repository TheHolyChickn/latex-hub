'use strict';

const { GLib, Gio } = imports.gi;
const { Library } = imports.core.Library;
const { LibraryItem } = imports.core.LibraryItem;
const { ConfigManager } = imports.config.ConfigManager;

// Test data
const FISHBURN_NUMBERS_ARXIV_ID = '1401.5345';
const MOCK_ENTRIES = [
    {
        id: `arxiv:${FISHBURN_NUMBERS_ARXIV_ID}`,
        entry_type: "paper", source: "arxiv", title: "Congruences for the Fishburn Numbers",
        authors: ["George E. Andrews", "James A. Sellers"], date: { year: 2014 },
        abstract: "The Fishburn numbers, xi(n), are defined by a formal power series expansion.",
        tags: ["math", "number-theory"], status: "to-read",
    },
    {
        id: 'manual:aluffi-ch0',
        entry_type: 'book', source: 'manual', title: 'Algebra: Chapter 0',
        authors: ['Paolo Aluffi'], date: { year: 2009 },
        personal_notes: "Excellent text on graduate algebra with a categorical approach.",
        tags: ["math", "algebra", "category-theory"], status: 'finished',
    },
    {
        id: 'manual:mcintyre-qm',
        entry_type: 'book', source: 'manual', title: 'Quantum Mechanics',
        authors: ['David H. McIntyre'], date: { year: 2012 },
        tags: ["physics", "quantum-mechanics"], status: 'reading',
    }
];

var libraryTests = {
    beforeEach: () => {
        ConfigManager.saveLibrary({ entries: MOCK_ENTRIES });
    },

    'test Library constructor loads entries from config': () => {
        const library = new Library();
        assertEqual(library.entries.length, 3, "Library should initialize with 3 mock entries.");
    },

    'test search by text query': () => {
        const library = new Library();
        let results = library.search({ query: 'fishburn', fields: ['title', 'abstract'] });
        assertEqual(results.length, 1, "Should find 1 result for 'fishburn'.");
        assertEqual(results[0].title, "Congruences for the Fishburn Numbers", "Found item should be correct.");

        results = library.search({ query: 'categorical', fields: ['personal_notes'] });
        assertEqual(results.length, 1, "Should find 1 result in personal_notes.");
        assertEqual(results[0].id, 'manual:aluffi-ch0', "Found item should be Aluffi.");

        results = library.search({ query: 'nonexistent', fields: ['title'] });
        assertEqual(results.length, 0, "Should find 0 results for a nonexistent query.");
    },

    'test search by tags': () => {
        const library = new Library();
        let results = library.search({ tags: ['math'] });
        assertEqual(results.length, 2, "Should find 2 results for 'math' tag.");

        results = library.search({ tags: ['math', 'category-theory'] });
        assertEqual(results.length, 1, "Should find 1 result for multiple tags (AND logic).");
        assertEqual(results[0].id, 'manual:aluffi-ch0', "Multi-tag search result should be Aluffi.");

        results = library.search({ tags: ['physics', 'algebra'] });
        assertEqual(results.length, 0, "Should find 0 results for disjoint tags.");
    },

    'test search by status': () => {
        const library = new Library();
        let results = library.search({ status: 'finished' });
        assertEqual(results.length, 1, "Should find 1 finished item.");
        assertEqual(results[0].id, 'manual:aluffi-ch0', "Finished item should be Aluffi.");
    },

    'test combined search (query, tags, and status)': () => {
        const library = new Library();
        let results = library.search({
            query: 'fishburn',
            fields: ['title'],
            tags: ['number-theory'],
            status: 'to-read'
        });
        assertEqual(results.length, 1, "Combined search should find the Fishburn paper.");

        results = library.search({
            query: 'fishburn',
            fields: ['title'],
            status: 'finished' // Mismatched status
        });
        assertEqual(results.length, 0, "Combined search should fail if one criterion doesn't match.");
    },
};

// This wrapper is needed for any async tests we might add later
function runAsyncTest(testFn) {
    const loop = new GLib.MainLoop(null, false);
    const done = () => loop.quit();
    testFn(done);
    loop.run();
}

for (const testName in libraryTests) {
    const originalTest = libraryTests[testName];
    if (originalTest.length === 1) {
        libraryTests[testName] = () => runAsyncTest(originalTest);
    }
}

var exports = libraryTests;