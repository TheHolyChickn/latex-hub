'use strict';

const { GLib, Gio } = imports.gi;

const { ConfigManager } = imports.config.ConfigManager;
const { Course } = imports.core.Course;
const { Courses } = imports.core.Courses;
const { Homework } = imports.core.Homework;

var HOMEWORK_TRACKER = GLib.build_filenamev([ConfigManager.getConfigDir(), "homeworks.json"]);

var Homeworks = class Homeworks {
    constructor() {
        this.assignments = _readHomeworkFiles();
    }

    _readHomeworkFiles() {
        try {
            const [success, contents] = GLib.file_get_contents(HOMEWORK_TRACKER);
            if (success) {
                const jsonData = JSON.parse(imports.byteArray.toString(contents));
                const assignments = jsonData.map(s => []);
                jsonData.forEach((course, items) => {
                    if (items) {
                        for (let j = 0; j < items.length; j++) {
                            assignments[course].push(Homework(items[j], course, j.toString()));
                        }
                    }
                    });
                return assignments;
            } else {
                console.warn("Could not read homework file");
            }
        } catch (error) {
            console.error(`Could not read homework config file: ${error.message}`);
        }
        return null;
    }

    update() {
        try {
            GLib.file_set_contents(HOMEWORK_TRACKER, this._toJson());
        } catch (e) {
            console.error(`Could not update homework file: ${e.message}`);
        }
    }

    _toJson() {
        const data = self.assignments.map(course => {});
        this.assignments.forEach((course, assignments) => {
            assignments.forEach((item) => {
                data[course][item.number] = item.toJSON();
            });
        });
        return data;
    }
}

var exports = { Homeworks, HOMEWORK_TRACKER };