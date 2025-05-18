'use strict';

/**
 * @fileoverview run_all_tests.js
 * A simple test runner for LaTeX Hub.
 * This script should be run AFTER `setup_test_env.js` has configured the environment.
 */

const { GLib, Gio } = imports.gi;

// Assertion functions
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
let currentTestFile = '';
let currentTestSuite = ''; // This will now be the key from the test suite object (e.g., 'test Lecture constructor')
// let currentTestName = ''; // Not strictly needed with this structure

function logTestResult(status, testCaseName, details = '') {
    const testId = `${currentTestFile} -> ${testCaseName}`; // Changed currentTestSuite to currentTestFile for broader context
    if (status === 'PASS') {
        // print(`  \x1b[32m✓ ${testId}\x1b[0m`); // Verbose pass
    } else if (status === 'FAIL') {
        print(`\n\x1b[31m✗ FAIL: ${testId}\x1b[0m`);
        if (details) print(`     ${details}`);
    } else if (status === 'ERROR') {
        print(`\n\x1b[31m✗ ERROR: ${testId}\x1b[0m`);
        if (details) print(`     ${details}`);
    }
}

globalThis.assertEqual = function(actual, expected, message) {
    testsRun++;
    if (actual === expected) {
        testsPassed++;
        logTestResult('PASS', message);
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected: ${expected} (type: ${typeof expected}), Actual: ${actual} (type: ${typeof actual})`);
    }
};

globalThis.assertTrue = function(value, message) {
    testsRun++;
    if (value === true) {
        testsPassed++;
        logTestResult('PASS', message);
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected: true, Actual: ${value}`);
    }
};

globalThis.assertFalse = function(value, message) {
    testsRun++;
    if (value === false) {
        testsPassed++;
        logTestResult('PASS', message);
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected: false, Actual: ${value}`);
    }
};

globalThis.assertNotNull = function(value, message) {
    testsRun++;
    if (value !== null && value !== undefined) {
        testsPassed++;
        logTestResult('PASS', message);
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected: not null/undefined, Actual: ${value}`);
    }
};

globalThis.assertNull = function(value, message) {
    testsRun++;
    if (value === null || value === undefined) {
        testsPassed++;
        logTestResult('PASS', message);
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected: null or undefined, Actual: ${value}`);
    }
};

globalThis.assertThrows = function(func, expectedErrorType, message) {
    testsRun++;
    let threw = false;
    let errorTypeMatch = true;
    try {
        func();
    } catch (e) {
        threw = true;
        if (expectedErrorType && !(e instanceof expectedErrorType)) {
            errorTypeMatch = false;
            logTestResult('FAIL', message, `Threw error, but type mismatch. Expected ${expectedErrorType ? expectedErrorType.name : 'any error'}, got ${e.constructor.name}. Error: ${e.message}`);
        }
    }

    if (threw && errorTypeMatch) {
        testsPassed++;
        logTestResult('PASS', message);
    } else if (threw && !errorTypeMatch) {
        testsFailed++; // Already logged by errorTypeMatch check
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected function to throw an error, but it did not.`);
    }
};

/**
 * Runs test functions from a test suite object.
 * @param {Object} testSuiteObject - An object where keys are test names and values are test functions.
 * @param {string} fileName - The name of the test file being run.
 */
function runTestFunctions(testSuiteObject, fileName) { // Renamed from runTestSuites to avoid confusion
    print(`\n--- Running tests from: \x1b[1m${fileName}\x1b[0m ---`);
    currentTestFile = fileName; // Set context for logging

    // Debug what testSuiteObject contains
    if (testSuiteObject && typeof testSuiteObject === 'object') {
        const keys = Object.keys(testSuiteObject);
        print(`DEBUG: Test functions in ${fileName}: [${keys.join(', ')}]`);
        if (keys.length === 0) {
            print(`DEBUG: The test suite object from ${fileName} is empty.`);
            return;
        }
    } else {
        print(`DEBUG: Test suite object from ${fileName} is not an object or is null. Type: ${typeof testSuiteObject}`);
        return;
    }

    const beforeAll = testSuiteObject.beforeAll;
    const afterAll = testSuiteObject.afterAll;
    const beforeEach = testSuiteObject.beforeEach;
    const afterEach = testSuiteObject.afterEach;

    if (typeof beforeAll === 'function') {
        print(`DEBUG: Executing beforeAll for ${fileName}`);
        try {
            beforeAll();
        } catch (e) {
            print(`\x1b[31mERROR in beforeAll for ${fileName}: ${e.message}\x1b[0m`);
            testsFailed++;
            return;
        }
    }

    for (const testName in testSuiteObject) { // Iterate over the actual test functions
        if (testName === 'beforeAll' || testName === 'afterAll' ||
            testName === 'beforeEach' || testName === 'afterEach') {
            continue;
        }

        if (typeof testSuiteObject[testName] === 'function') {
            currentTestSuite = testName; // More accurately, this is the current test case name
            print(`  \x1b[1m⦿ Running test:\x1b[0m ${testName}`);
            try {
                if (typeof beforeEach === 'function') beforeEach();
                testSuiteObject[testName](); // Execute the test function
            } catch (e) {
                testsFailed++;
                logTestResult('ERROR', testName, `Unhandled exception: ${e.message}${e.stack ? ('\nStack:' + e.stack) : ''}`);
            } finally {
                if (typeof afterEach === 'function') {
                    try { afterEach(); } catch (e) {
                        print(`\x1b[31mERROR in afterEach for ${testName} in ${fileName}: ${e.message}\x1b[0m`);
                    }
                }
            }
        } else {
            print(`DEBUG: Property "${testName}" in ${fileName} is NOT a function. Type: ${typeof testSuiteObject[testName]}`);
        }
    }

    if (typeof afterAll === 'function') {
        print(`DEBUG: Executing afterAll for ${fileName}`);
        try { afterAll(); } catch (e) {
            print(`\x1b[31mERROR in afterAll for ${fileName}: ${e.message}\x1b[0m`);
        }
    }
}

function main() {
    const startTime = GLib.get_monotonic_time();
    print("====== LaTeX Hub Test Run ======");

    const projectRoot = GLib.get_current_dir();
    imports.searchPath.unshift(projectRoot);
    imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'src']));
    imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'tests']));
    imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'tests', 'support']));

    const testModules = [
        { name: 'Lecture.test.js', importer: () => imports['Lecture.test'] },
        //{ name: 'Lectures.test.js', importer: () => imports['Lectures.test'] },
        //{ name: 'Course.test.js', importer: () => imports['Course.test'] },
        //{ name: 'Courses.test.js', importer: () => imports['Courses.test'] },
    ];

    for (const testModuleInfo of testModules) {
        try {
            const importedModuleObject = testModuleInfo.importer();

            // The object assigned to "var exports" in the test file is what we want.
            // In GJS, if "var exports = ..." is used, the imported module object often
            // has an "exports" property that points to this assigned object.
            // Or, the imported module object *is* the exported object directly.
            let actualTestFunctionsObject = null;

            if (importedModuleObject && typeof importedModuleObject.exports === 'object' && importedModuleObject.exports !== null) {
                print(`DEBUG: Using 'exports' property from ${testModuleInfo.name} as the test suite object.`);
                actualTestFunctionsObject = importedModuleObject.exports;
            } else if (importedModuleObject && typeof importedModuleObject === 'object' && importedModuleObject !== null) {
                // Fallback: if there's no 'exports' property, assume the imported module itself
                // is the object containing test functions (e.g. if Lecture.test.js was only `exports.testName = ...`)
                // This is also the case if `var exports = someObject` makes `someObject` the direct import.
                print(`DEBUG: Using the directly imported module object from ${testModuleInfo.name} as the test suite object.`);
                actualTestFunctionsObject = importedModuleObject;
            }

            if (actualTestFunctionsObject) {
                runTestFunctions(actualTestFunctionsObject, testModuleInfo.name);
            } else {
                print(`\x1b[33mWarning: Test module ${testModuleInfo.name} loaded, but no recognizable test suite object found (checked module.exports and module itself).\x1b[0m`);
                if (importedModuleObject) {
                    const keys = Object.keys(importedModuleObject);
                    print(`DEBUG: Keys in directly imported module for ${testModuleInfo.name}: [${keys.join(', ')}]`);
                }
            }
        } catch (e) {
            print(`\x1b[31mFATAL ERROR loading/processing test module ${testModuleInfo.name}: ${e.message}\x1b[0m`);
            if (e.stack) print(e.stack);
            testsFailed++;
        }
    }

    print("\n-----------------------------------");
    print("           Test Summary            ");
    print("-----------------------------------");
    print(`Total test assertions evaluated: ${testsRun}`);
    print(`  \x1b[32mPassed: ${testsPassed}\x1b[0m`);
    if (testsFailed > 0) {
        print(`  \x1b[31mFailed: ${testsFailed}\x1b[0m`);
    } else {
        print(`  Failed: 0`);
    }
    const endTime = GLib.get_monotonic_time();
    const durationSeconds = (endTime - startTime) / 1000000.0;
    print(`Duration: ${durationSeconds.toFixed(3)}s`);
    print("-----------------------------------");

    if (testsFailed > 0) {
        print("\n\x1b[1;31m complessive TEST RUN FAILED \x1b[0m\n");
    } else if (testsRun === 0) {
        print("\n\x1b[1;33m WARNING: NO TESTS WERE RUN (or no assertions made). \x1b[0m\n");
    } else {
        print("\n\x1b[1;32m complessive TEST RUN PASSED \x1b[0m\n");
    }
}

main();