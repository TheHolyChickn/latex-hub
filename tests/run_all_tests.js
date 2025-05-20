'use strict';

/**
 * @fileoverview run_all_tests.js
 * A simple test runner for LaTeX Hub.
 * This script should be run AFTER `setup_test_env.js` has configured the environment.
 */

const { GLib, Gio } = imports.gi;

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
let currentTestFile = '';
let currentTestSuiteName = '';

/**
 * Logs the result of a single assertion or an error during a test case.
 * @param {string} status - 'PASS', 'FAIL', or 'ERROR'.
 * @param {string} testCaseName - The name of the test case (function name).
 * @param {string} [details=''] - Additional details for FAIL or ERROR.
 */
function logTestResult(status, testCaseName, details = '') {
    const testId = `${currentTestFile} -> ${testCaseName}`;
    if (status === 'FAIL') {
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
    let actualError = null;
    try {
        func();
    } catch (e) {
        threw = true;
        actualError = e;
        if (expectedErrorType && !(e instanceof expectedErrorType)) {
            errorTypeMatch = false;
        }
    }

    if (threw && errorTypeMatch) {
        testsPassed++;
        logTestResult('PASS', message);
    } else if (threw && !errorTypeMatch) {
        testsFailed++;
        logTestResult('FAIL', message, `Threw error, but type mismatch. Expected ${expectedErrorType ? expectedErrorType.name : 'any error'}, got ${actualError.constructor.name}. Error: ${actualError.message}`);
    } else {
        testsFailed++;
        logTestResult('FAIL', message, `Expected function to throw an error, but it did not.`);
    }
};

/**
 * Runs test functions from a test suite object (exported by a test file).
 * Handles beforeAll, afterAll, beforeEach, and afterEach hooks if present.
 * @param {Object} testSuiteObject - An object where keys are test names (or hook names)
 * and values are the corresponding functions.
 * @param {string} fileName - The name of the test file being run (e.g., "Lecture.test.js").
 */
function runTestFunctions(testSuiteObject, fileName) {
    print(`\n--- Running tests from: \x1b[1m${fileName}\x1b[0m ---`);
    currentTestFile = fileName;

    if (!testSuiteObject || typeof testSuiteObject !== 'object' || Object.keys(testSuiteObject).length === 0) {
        print(`No tests found or test suite object is invalid in ${fileName}.`);
        return;
    }

    const { beforeAll, afterAll, beforeEach, afterEach, ...tests } = testSuiteObject;

    if (typeof beforeAll === 'function') {
        try {
            beforeAll();
        } catch (e) {
            print(`\x1b[31mERROR in beforeAll for ${fileName}: ${e.message}\x1b[0m`);
            testsFailed++;
            return;
        }
    }

    for (const testName in tests) {
        if (typeof tests[testName] === 'function') {
            currentTestSuiteName = testName;
            print(`  \x1b[1m⦿ Running test:\x1b[0m ${testName}`);
            try {
                if (typeof beforeEach === 'function') beforeEach();
                tests[testName]();
            } catch (e) {
                testsFailed++;
                logTestResult('ERROR', testName, `Unhandled exception: ${e.message}${e.stack ? ('\nStack:' + e.stack) : ''}`);
            } finally {
                if (typeof afterEach === 'function') {
                    try {
                        afterEach();
                    } catch (e_afterEach) {
                        print(`\x1b[31mERROR in afterEach for ${testName} in ${fileName}: ${e_afterEach.message}\x1b[0m`);
                    }
                }
            }
        }
    }

    if (typeof afterAll === 'function') {
        try {
            afterAll();
        } catch (e) {
            print(`\x1b[31mERROR in afterAll for ${fileName}: ${e.message}\x1b[0m`);
        }
    }
}

/**
 * Main function to discover and run all test suites.
 */
function main() {
    const startTime = GLib.get_monotonic_time();
    print("====== LaTeX Hub Test Run ======");

    const projectRoot = GLib.get_current_dir();
    imports.searchPath.unshift(projectRoot);
    imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'src']));
    imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'tests']));
    imports.searchPath.unshift(GLib.build_filenamev([projectRoot, 'tests', 'support']));

    const testModules = [
        // { name: 'Lecture.test.js', importer: () => imports['Lecture.test'] },
        // { name: 'Lectures.test.js', importer: () => imports['Lectures.test'] },
        // { name: 'Course.test.js', importer: () => imports['Course.test'] },
        // { name: 'Courses.test.js', importer: () => imports['Courses.test'] },
        { name: 'Homework.test.js', importer: () => imports['Homework.test'] },
        // { name: 'Homeworks.test.js', importer: () => imports['Homeworks.test'] },
    ];

    for (const testModuleInfo of testModules) {
        try {
            const importedModuleObject = testModuleInfo.importer();
            let actualTestFunctionsObject = null;

            if (importedModuleObject && typeof importedModuleObject.exports === 'object' && importedModuleObject.exports !== null) {
                actualTestFunctionsObject = importedModuleObject.exports;
            } else if (importedModuleObject && typeof importedModuleObject === 'object' && importedModuleObject !== null) {
                actualTestFunctionsObject = importedModuleObject;
            }

            if (actualTestFunctionsObject) {
                runTestFunctions(actualTestFunctionsObject, testModuleInfo.name);
            } else {
                print(`\x1b[33mWarning: Test module ${testModuleInfo.name} loaded, but no recognizable test suite object was found.\x1b[0m`);
            }
        } catch (e) {
            print(`\x1b[31mFATAL ERROR loading or processing test module ${testModuleInfo.name}: ${e.message}\x1b[0m`);
            if (e.stack) {
                const stackLines = e.stack.split('\n');
                for(const line of stackLines) {
                    print(`    ${line}`);
                }
            }
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
        print("\n\x1b[1;31mOverall TEST RUN FAILED\x1b[0m\n");
    } else if (testsRun === 0) {
        print("\n\x1b[1;33mWARNING: NO TESTS WERE RUN (or no assertions made).\x1b[0m\n");
    } else {
        print("\n\x1b[1;32mOverall TEST RUN PASSED\x1b[0m\n");
    }
}

main();