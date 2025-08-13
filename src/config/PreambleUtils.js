'use strict'

const { ConfigManager } = imports.config.ConfigManager;
const { GLib, Gio } = imports.gi;

/**
 * Retrieves the directory path where preamble content files are stored.
 * This directory should be `~/.config/LatexHub/preambles/`.
 * @returns {string} The absolute path to the preamble content directory.
 */
function getPreambleContentDir() {
    return GLib.build_filenamev([ConfigManager.getConfigDir(), 'preambles']);
}

var PreambleUtils = class PreambleUtils {

    /**
     * Gets the full path for a preamble content file.
     * @param {string} fileName - The base file_name.
     * @returns {string} The absolute path to the content file.
     * @private
     */
    static _getPreambleContentFilePath(fileName) {
        return GLib.build_filenamev([getPreambleContentDir(), fileName + '.tex']);
    }

    /**
     * Retrieves all preamble snippet metadata objects from `preambles.json`.
     * @returns {Array<Object>} An array of preamble snippet metadata objects.
     * Each object contains `file_name`, `description`, `tags`, and `dependencies`.
     */
    static getAllPreambleSnippets() {
        const config = ConfigManager.loadPreambles();
        return config.preambles || [];
    }

    /**
     * Gets a specific preamble snippet's metadata by its file_name.
     * @param {string} fileName - The file_name of the preamble snippet.
     * @returns {Object|undefined} The preamble snippet metadata object, or undefined if not found.
     */
    static getPreambleSnippetMetadata(fileName) {
        return this.getAllPreambleSnippets().find(s => s.file_name === fileName);
    }

    /**
     * Adds metadata for a new preamble snippet to `preambles.json`.
     * @param {Object} snippetData - An object containing the snippet's metadata:
     * `{file_name: string, description?: string, tags?: Array<string>, dependencies?: Array<string>}`.
     * `file_name` is mandatory.
     * @returns {boolean} True if the metadata was successfully added and saved, false otherwise.
     */
    static addPreambleSnippet(snippetData) {
        if (!snippetData || !snippetData.file_name) {
            console.log("PreambleUtils Error: New snippet requires 'file_name'.");
            return false;
        }
        if (this.getPreambleSnippetMetadata(snippetData.file_name)) {
            console.log(`PreambleUtils Error: Snippet metadata for "${snippetData.file_name}" already exists.`);
            return false;
        }

        const config = ConfigManager.loadPreambles();
        config.preambles = config.preambles || [];
        const newMetadata = {
            file_name: snippetData.file_name,
            description: snippetData.description || "",
            tags: Array.isArray(snippetData.tags) ? snippetData.tags : [],
            dependencies: Array.isArray(snippetData.dependencies) ? snippetData.dependencies : [],
        };
        config.preambles.push(newMetadata);

        try {
            ConfigManager.savePreambles(config);
            return true;
        } catch (e) {
            console.log(`PreambleUtils Error saving metadata for new snippet "${snippetData.file_name}": ${e.message}`);
            return false;
        }
    }

    /**
     * Updates the metadata of an existing preamble snippet.
     * @param {string} fileName - The `file_name` of the preamble snippet to update.
     * @param {Object} updates - An object containing the metadata fields to update:
     * `{description?: string, tags?: Array<string>, dependencies?: Array<string>}`.
     * The `file_name` itself cannot be updated with this method.
     * @returns {boolean} True if the metadata was successfully updated and saved,
     * false if the snippet was not found or if an error occurred during saving.
     * Returns true even if no changes were made but the snippet exists.
     */
    static updatePreambleSnippet(fileName, updates) {
        const config = ConfigManager.loadPreambles();
        config.preambles = config.preambles || [];
        const snippetIndex = config.preambles.findIndex(s => s.file_name === fileName);

        if (snippetIndex === -1) {
            console.log(`PreambleUtils Error: Snippet metadata for "${fileName}" not found for update.`);
            return false;
        }

        let metadataChanged = false;
        const currentMetadata = config.preambles[snippetIndex];

        ['description', 'tags', 'dependencies'].forEach(key => {
            if (updates[key] !== undefined) {
                if (currentMetadata[key] !== updates[key]) {
                    currentMetadata[key] = updates[key];
                    metadataChanged = true;
                }
            }
        });

        if (metadataChanged) {
            try {
                ConfigManager.savePreambles(config);
            } catch (e) {
                console.log(`PreambleUtils Error updating metadata for snippet "${fileName}": ${e.message}`);
                return false;
            }
        }
        return true;
    }

    /**
     * Retrieves all defined templates.
     * @returns {Object} An object where keys are template names and values are arrays of `file_name` strings.
     * Returns an empty object if no templates are defined.
     */
    static getAllTemplates() {
        return ConfigManager.loadPreambles().templates || {};
    }

    /**
     * Retrieves the list of preamble `file_name`s associated with a given template name.
     * @param {string} templateName - The name of the template.
     * @returns {Array<string>|undefined} An array of `file_name` strings for the template,
     * or undefined if the template does not exist.
     */
    static getTemplatePreambleFileNames(templateName) {
        return this.getAllTemplates()[templateName];
    }

    /**
     * Creates a new template or updates an existing one.
     * A template is a named list of preamble `file_name`s.
     * @param {string} templateName - The name for the new or existing template.
     * @param {Array<string>} preambleFileNames - An array of `file_name` strings that make up this template.
     * These `file_name`s must correspond to existing preamble snippets.
     * @returns {boolean} True if the template was successfully created/updated and saved, false otherwise.
     */
    static createTemplate(templateName, preambleFileNames) {
        if (!templateName || typeof templateName !== 'string' || templateName.trim() === '') {
            console.log("PreambleUtils Error: Template name must be a non-empty string.");
            return false;
        }
        if (!Array.isArray(preambleFileNames) || !preambleFileNames.every(name => typeof name === 'string')) {
            console.log("PreambleUtils Error: preambleFileNames must be an array of strings.");
            return false;
        }
        const allPreambleMetadata = this.getAllPreambleSnippets();
        const existingFileNames = new Set(allPreambleMetadata.map(p => p.file_name));
        for (const fn of preambleFileNames) {
            if (!existingFileNames.has(fn)) {
                console.log(`PreambleUtils Error: Preamble snippet "${fn}" referenced in template "${templateName}" does not exist in metadata.`);
                return false;
            }
        }

        const config = ConfigManager.loadPreambles();
        config.templates = config.templates || {};
        config.templates[templateName] = [...new Set(preambleFileNames)];
        try {
            ConfigManager.savePreambles(config);
            return true;
        } catch (e) {
            console.log(`PreambleUtils Error saving template "${templateName}": ${e.message}`);
            return false;
        }
    }

    /**
     * Updates an existing template by replacing its list of preamble `file_name`s.
     * If the template does not exist, it will be created.
     * @param {string} templateName - The name of the template to update.
     * @param {Array<string>} newPreambleFileNames - The new array of `file_name` strings for the template.
     * @returns {boolean} True if the template was successfully updated/created and saved, false otherwise.
     */
    static updateTemplate(templateName, newPreambleFileNames) {
        return this.createTemplate(templateName, newPreambleFileNames);
    }

    /**
     * Resolves dependencies for a list of initial preamble file names and returns an ordered list
     * of file names suitable for generating `\input` commands.
     * Dependencies are listed before the files that depend on them. Each file name appears only once.
     * @param {Array<string>} initialFileNames - An array of starting `file_name`s (typically from a template).
     * @param {Array<Object>} allSnippetsMetadataArray - The complete list of all preamble snippet metadata objects.
     * @returns {Array<string>} An ordered array of unique `file_name` strings.
     * @private
     */
    static _resolveOrderForInputs(initialFileNames, allSnippetsMetadataArray) {
        const orderedFileNames = [];
        const visited = new Set();
        const processingStack = new Set();

        const allSnippetsMap = new Map(allSnippetsMetadataArray.map(s => [s.file_name, s]));

        const addSnippetRecursive = (fileName) => {
            if (visited.has(fileName)) {
                return; // Already processed and added to orderedFileNames
            }
            if (processingStack.has(fileName)) {
                console.log(`PreambleUtils Warning: Circular dependency detected for snippet "${fileName}".`);
                return; // Cycle detected, stop this path
            }

            const snippetMeta = allSnippetsMap.get(fileName);
            if (!snippetMeta) {
                console.log(`PreambleUtils Warning: Metadata for snippet "${fileName}" not found during resolution.`);
                return;
            }

            processingStack.add(fileName);

            if (snippetMeta.dependencies && snippetMeta.dependencies.length > 0) {
                for (const depFileName of snippetMeta.dependencies) {
                    addSnippetRecursive(depFileName);
                }
            }

            processingStack.delete(fileName);

            if (!visited.has(fileName)) {
                orderedFileNames.push(fileName);
                visited.add(fileName);
            }
        };

        for (const fileName of initialFileNames) {
            addSnippetRecursive(fileName);
        }
        return orderedFileNames;
    }

    /**
     * Assembles a string of LaTeX `\input` commands for a given template.
     * The commands are ordered based on snippet dependencies.
     * Each `\input` command will be of the form `\input{fileName.tex}`.
     * @param {string} templateName - The name of the template.
     * @returns {string} A string containing newline-separated `\input` commands,
     * or an empty string if the template is not found or is empty.
     */
    static assemblePreambleFromTemplate(templateName) {
        const initialFileNames = this.getTemplatePreambleFileNames(templateName);
        if (!initialFileNames || initialFileNames.length === 0) {
            return "";
        }
        const allSnippetsMetadata = this.getAllPreambleSnippets();
        const orderedFileNames = this._resolveOrderForInputs(initialFileNames, allSnippetsMetadata);

        return orderedFileNames.map(fileName =>
            `\\input{${GLib.build_filenamev([getPreambleContentDir(), fileName + '.tex'])}}`
        ).join("\n");
    }

    /**
     * Sets the default template.
     * @param {string|null} templateName - The name of the template to set as default.
     * Must be an existing template name, or `null` to clear the default.
     * @returns {boolean} True if the default was successfully set and saved, false otherwise.
     */
    static setDefaultTemplate(templateName) {
        const config = ConfigManager.loadPreambles();
        if (templateName !== null && (typeof templateName !== 'string' || !config.templates || !config.templates[templateName])) {
            console.log(`PreambleUtils Error: Template "${templateName}" does not exist. Cannot set as default.`);
            return false;
        }

        if (config.default_template_for_lecture !== templateName) {
            config.default_template_for_lecture = templateName;
        }

        try {
            ConfigManager.savePreambles(config);
            return true;
        } catch (e) {
            console.log(`PreambleUtils Error saving default template: ${e.message}`);
            return false;
        }
    }

    /**
     * Gets the name of the default template.
     * @returns {string|null} The name of the default template.
     */
    static getDefaultTemplateName() {
        return ConfigManager.loadPreambles().default_template_for_lecture;
    }
};

var exports = { PreambleUtils };