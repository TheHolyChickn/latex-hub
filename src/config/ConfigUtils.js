/**
 * implements commands to read/edit information from the main config file
 */

'use strict';

const { ConfigManager } = imports.config.ConfigManager;

var ConfigUtils = class ConfigUtils {
    /**
     * gets the value of an entry
     * @param key - the key to get the value for. Can be any of root_dir, projects_dir, current_courses, current_projects, archived_course, archived_projects, github_user, or current_semester.
     * @returns {*} - the value corresponding to the given key
     */
    static get(key)  {
        const config = ConfigManager.loadConfig();
        return this._getNestedProperty(config, key);
    }

    /**
     * sets a key to a specific value.
     * @param key - the field to modify
     * @param value - the value to set the field to
     */
    static set(key, value) {
        const config = ConfigManager.loadConfig();
        this._setNestedProperty(config, key, value);
        ConfigManager.saveConfig(config);
    }

    /**
     * adds a new course to current_courses
     * @param courseName - the course name to add
     */
    static addCourse(courseName) {
        const config = ConfigManager.loadConfig();
        config.current_courses.push(courseName);
        ConfigManager.saveConfig(config);
    }

    /**
     * adds a new project to current_projects
     * @param projectName - the project name to add
     */
    static addProject(projectName) {
        const config = ConfigManager.loadConfig();
        config.current_projects.push(projectName);
        ConfigManager.saveConfig(config);
    }

    /**
     * archives a current course
     * @param courseName - the course to archive
     */
    static archiveCourse(courseName) {
        const config = ConfigManager.loadConfig();
        if (!config.current_courses.includes(courseName)) {
            console.log("Error: courseName not present in current_courses");
            return;
        }
        config.archived_courses.push(courseName);
        config.current_courses = config.current_courses.filter(s => s !== courseName);
        ConfigManager.saveConfig(config);
    }

    /**
     * archives a current project
     * @param projectName - the project to archive
     */
    static archiveProject(projectName) {
        const config = ConfigManager.loadConfig();
        if (!config.current_projects.includes(projectName)) {
            console.log("Error: projectName not present in current_projects");
            return;
        }
        config.archived_projects.push(projectName);
        config.current_projects = config.current_projects.filter(s => s !== projectName);
        ConfigManager.saveConfig(config);
    }

    static _getNestedProperty(obj, key) {
        return key.split('.').reduce((o, k) => (o || {})[k], obj);
    }

    static _setNestedProperty(obj, key, value) {
        const keys = key.split('.');
        const lastKey = keys.pop();

        let current = obj;
        for (const k of keys) {
            if (typeof current[k] !== 'object' || current[k] === null) {
                current[k] = {};
            }
            current = current[k];
        }
        current[lastKey] = value;
    }
}

var exports = { ConfigUtils };