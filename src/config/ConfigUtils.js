/**
 * implements commands to read/edit information from the main config file
 */

'use strict';

const { ConfigManager } = imports.config.ConfigManager;

var ConfigUtils = class ConfigUtils {
    static get(key)  {
        const config = ConfigManager.loadConfig();
        return this._getNestedProperty(config, key);
    }

    static set(key, value) {
        const config = ConfigManager.loadConfig();
        this._setNestedProperty(config, key, value);
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

    static _deleteNestedProperty(obj, key) {
        const keys = key.split('.');
        const lastKey = keys.pop();

        let current = obj;
        for (const k of keys) {
            current = current[k];
            if (!current) return;
        }
        delete current[lastKey];
    }
}

var exports = { ConfigUtils };