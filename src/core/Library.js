// src/core/Library.js
'use strict';

imports.gi.versions.Soup = '2.4';
const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigManager } = imports.config.ConfigManager;
const { ConfigUtils } = imports.config.ConfigUtils;
const { LibraryItem } = imports.core.LibraryItem;
const { generateBibtex } = imports.core.BibtexUtils;

const _httpSession = new Soup.SessionAsync();


/**
 * Parses the raw XML string from the arXiv API response using string searching.
 * @param {string} xmlString - The XML content from the API.
 * @returns {object|null} A data object or null on failure.
 * @private
 */
function _parseArxivXml(xmlString) {
    if (!xmlString) return null;

    // Helper to find content between two tags using string indexing
    const getContent = (xml, tagName) => {
        const startTag = `<${tagName}>`;
        const endTag = `</${tagName}>`;
        const startIndex = xml.indexOf(startTag);
        if (startIndex === -1) return null;
        const endIndex = xml.indexOf(endTag, startIndex);
        if (endIndex === -1) return null;
        return xml.substring(startIndex + startTag.length, endIndex).trim();
    };

    const entryXml = getContent(xmlString, 'entry');
    if (!entryXml) return null;

    const rawTitle = getContent(entryXml, 'title');
    const rawSummary = getContent(entryXml, 'summary');
    const published = getContent(entryXml, 'published');
    const rawId = getContent(entryXml, 'id') || '';

    const title = _cleanLatex(rawTitle);
    const summary = _cleanLatex(rawSummary);
    const arxivId = (rawId.split('/abs/')[1] || '').split('v')[0];
    // More robust author parsing
    const authors = [];
    let authorBlock = entryXml;
    while (authorBlock.includes('<author>')) {
        const authorXml = getContent(authorBlock, 'author');
        if (authorXml) {
            const authorName = getContent(authorXml, 'name');
            if (authorName) {
                authors.push(_cleanLatex(authorName));
            }
        }
        authorBlock = authorBlock.substring(authorBlock.indexOf('</author>') + 9);
    }

    if (!title || !arxivId || authors.length === 0) return null;

    let date = {};
    if (published) {
        try {
            const dt = GLib.DateTime.new_from_iso8601(published, null);
            if (dt) {
                date.year = dt.get_year();
                date.month = dt.get_month();
                date.day = dt.get_day_of_month();
            }
        } catch (e) { console.warn(`Could not parse date "${published}": ${e.message}`); }
    }

    return { title, authors, date, abstract: summary, arxivId };
}
/**
 * A simple parser to remove common LaTeX commands from a string.
 * @param {string} text - The string containing LaTeX.
 * @returns {string} The cleaned string.
 * @private
 */
function _cleanLatex(text) {
    if (!text) return '';
    return text
        .replace(/\$\$?/g, '')
        .replace(/\\([a-zA-Z]+)\s*\{([^}]+)\}/g, '$2')
        .replace(/\\([a-zA-Z]+)/g, '$1')
        .replace(/_\{([^}]+)\}/g, '_$1')
        .replace(/\^\{([^}]+)\}/g, '^$1')
        .replace(/[{}]/g, '')
        .replace(/\s\s+/g, ' ')
        .trim();
}

var Library = class Library {
    constructor() {
        this.entries = [];
        this._loadFromFile();
    }

    _loadFromFile() {
        const libraryData = ConfigManager.loadLibrary();
        this.entries = (libraryData.entries || []).map(itemData => new LibraryItem(itemData));
        this.entries.sort((a, b) => (b.date.year || 0) - (a.date.year || 0));
    }

    save() {
        const dataToSave = {
            entries: this.entries.map(item => item.toJSON())
        };
        try {
            ConfigManager.saveLibrary(dataToSave);
        } catch (e) {
            console.error(`Could not save library file: ${e.message}`);
        }
    }

    addEntry(itemData) {
        if (!itemData.id || !itemData.title) {
            console.error("Cannot add library entry: 'id' and 'title' are required.");
            return null;
        }
        if (this.getEntryById(itemData.id)) {
            console.warn(`Entry with ID "${itemData.id}" already exists. Aborting.`);
            return this.getEntryById(itemData.id);
        }

        const newItem = new LibraryItem(itemData);
        this.entries.unshift(newItem);
        this.save();
        return newItem;
    }

    getEntryById(id) {
        return this.entries.find(entry => entry.id === id);
    }

    fetchArxivData(arxivId, callback) {
        console.log(`Fetching data for arXiv:${arxivId}...`);
        const encodedArxivId = encodeURIComponent(arxivId);
        const uri = `http://export.arxiv.org/api/query?id_list=${encodedArxivId}`;
        const message = Soup.Message.new('GET', uri);

        _httpSession.queue_message(message, (session, msg) => {
            if (msg.status_code !== 200) {
                console.error(`arXiv API request failed. Status: ${msg.status_code}.`);
                return callback(null);
            }
            if (!msg.response_body) {
                console.error("arXiv API request succeeded but response body was empty.");
                return callback(null);
            }

            try {
                const responseBytes = msg.response_body.flatten().get_data();
                const xmlString = ByteArray.toString(responseBytes);
                const parsedData = _parseArxivXml(xmlString);

                if (!parsedData) {
                    console.error("Failed to parse XML response from arXiv.");
                    return callback(null);
                }

                callback({
                    id: `arxiv:${parsedData.arxivId}`,
                    entry_type: "paper",
                    source: "arxiv",
                    title: parsedData.title,
                    authors: parsedData.authors,
                    date: parsedData.date,
                    abstract: parsedData.abstract,
                    arxiv_id: parsedData.arxivId,
                    web_link: `https://arxiv.org/abs/${parsedData.arxivId}`,
                    status: "to-read",
                });

            } catch(e) {
                console.error(`Error processing arXiv response: ${e.message}`);
                callback(null);
            }
        });
    }

    addEntryFromArxiv(arxivId, callback) {
        this.fetchArxivData(arxivId, (newItemData) => {
            if (newItemData) {
                const newItem = this.addEntry(newItemData);
                callback(newItem);
            } else {
                callback(null);
            }
        });
    }

    search(filters = {}) {
        const { query, fields, tags, status, searchKeyResults } = filters;
        const lowerCaseQuery = query ? query.toLowerCase() : null;

        return this.entries.filter(entry => {
            // Filter by status (unchanged)
            if (status && entry.status !== status) {
                return false;
            }

            // Filter by tags (unchanged)
            if (tags && tags.length > 0) {
                const hasAllTags = tags.every(tag => (entry.tags || []).includes(tag));
                if (!hasAllTags) {
                    return false;
                }
            }

            // If there's no text query, the item passes the text search part
            if (!lowerCaseQuery) {
                return true;
            }

            // --- Main Text Search Logic ---
            let textMatch = false;

            // Search in the main entry fields (title, abstract, etc.)
            if (fields && fields.length > 0) {
                textMatch = fields.some(field => {
                    const fieldValue = entry[field];
                    return fieldValue && typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(lowerCaseQuery);
                });
            }

            // If we have a match already, we can skip the key results search
            if (textMatch) {
                return true;
            }

            // If specified, also search in the key results
            if (searchKeyResults && entry.key_items && entry.key_items.length > 0) {
                textMatch = entry.key_items.some(keyItem => {
                    const titleMatch = keyItem.title && keyItem.title.toLowerCase().includes(lowerCaseQuery);
                    const tagsMatch = keyItem.tags && keyItem.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery));
                    return titleMatch || tagsMatch;
                });
            }

            return textMatch;
        });
    }

    /**
     * Updates an existing entry with new data and saves the library.
     * @param {string} itemId - The ID of the item to update.
     * @param {object} updates - An object with the properties to update.
     * @returns {LibraryItem|null} The updated item, or null if not found.
     */
    updateEntry(itemId, updates) {
        const itemToUpdate = this.getEntryById(itemId);

        if (itemToUpdate) {
            itemToUpdate.update(updates);

            // Regenerate the BibTeX entry in case core fields changed
            const newBibtex = generateBibtex(itemToUpdate._data);
            itemToUpdate.update({ bibtex: newBibtex });

            this.save();
            return itemToUpdate;
        }

        console.warn(`Could not update: Item with ID "${itemId}" not found.`);
        return null;
    }

    /**
     * Regenerates the BibTeX for an entry and saves it.
     * @param {string} itemId - The ID of the item.
     */
    regenerateBibtex(itemId) {
        const item = this.getEntryById(itemId);
        if (item) {
            // This function needs to be accessible here.
            // A better design would be to make generateBibtex a method of LibraryItem.
            // For now, we'll assume a global helper or duplicate it.
            // Let's assume a global `generateBibtex` for simplicity.
            const newBibtex = generateBibtex(item._data);
            this.updateEntry(itemId, { bibtex: newBibtex });
        }
    }

    /**
     * Adds a new key item (definition, theorem, etc.) to a library entry.
     * @param {string} itemId - The ID of the parent library entry.
     * @param {object} keyItemData - The data for the new key item { type, title, tags }.
     */
    addKeyItem(itemId, keyItemData) {
        const item = this.getEntryById(itemId);
        if (item) {
            if (!item._data.key_items) {
                item._data.key_items = [];
            }
            // Add a simple unique ID for editing/deleting later
            keyItemData.id = `key_${Date.now()}`;
            item._data.key_items.push(keyItemData);
            this.save();
        }
    }

    /**
     * Removes a key item from a library entry.
     * @param {string} itemId - The ID of the parent library entry.
     * @param {string} keyItemId - The ID of the key item to remove.
     */
    removeKeyItem(itemId, keyItemId) {
        const item = this.getEntryById(itemId);
        if (item && item._data.key_items) {
            item._data.key_items = item._data.key_items.filter(ki => ki.id !== keyItemId);
            this.save();
        }
    }

    /**
     * Updates an existing key item in a library entry.
     * @param {string} itemId - The ID of the parent library entry.
     * @param {string} keyItemId - The ID of the key item to update.
     * @param {object} updates - The new data for the key item.
     */
    updateKeyItem(itemId, keyItemId, updates) {
        const item = this.getEntryById(itemId);
        if (item && item._data.key_items) {
            const itemIndex = item._data.key_items.findIndex(ki => ki.id === keyItemId);
            if (itemIndex !== -1) {
                // Merge the updates with the existing data
                item._data.key_items[itemIndex] = { ...item._data.key_items[itemIndex], ...updates };
                this.save();
            }
        }
    }

    /**
     * Downloads the PDF for an arXiv item and updates its local_path.
     * @param {string} itemId - The ID of the library item.
     * @param {function(boolean)} callback - A function to call with success status.
     */
    downloadArxivPdf(itemId, callback) {
        const item = this.getEntryById(itemId);
        if (!item || item.source !== 'arxiv' || !item.arxiv_id) {
            console.error(`Item is not a valid arXiv entry. Cannot download PDF.`);
            return callback(false);
        }

        const pdfDir = ConfigUtils.get('pdf_download_dir');
        if (!pdfDir) {
            console.error("PDF download directory is not configured.");
            return callback(false);
        }

        // Ensure the directory exists
        try {
            if (!GLib.file_test(pdfDir, GLib.FileTest.IS_DIR)) {
                GLib.mkdir_with_parents(pdfDir, 0o755);
            }
        } catch (e) {
            console.error(`Failed to create PDF directory at ${pdfDir}: ${e.message}`);
            return callback(false);
        }

        const pdfUrl = `https://arxiv.org/pdf/${item.arxiv_id}.pdf`;
        // Sanitize the title to create a safe filename
        const safeTitle = item.title.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const filename = `${item.arxiv_id.replace('/', '-')}_${safeTitle}.pdf`;
        const localPath = GLib.build_filenamev([pdfDir, filename]);

        console.log(`Downloading ${pdfUrl} to ${localPath}...`);

        const message = Soup.Message.new('GET', pdfUrl);
        _httpSession.queue_message(message, (session, msg) => {
            if (msg.status_code !== 200) {
                console.error(`Failed to download PDF. Status: ${msg.status_code}`);
                return callback(false);
            }

            try {
                const bytes = msg.response_body.flatten().get_data();
                GLib.file_set_contents(localPath, bytes);

                // Update the item's local_path and save
                this.updateEntry(itemId, { local_path: localPath });
                console.log("Download complete.");
                callback(true);
            } catch (e) {
                console.error(`Error saving PDF to ${localPath}: ${e.message}`);
                callback(false);
            }
        });
    }

    /**
     * Fetches and parses data from arXiv without saving it to the library.
     * @param {string} arxivId - The arXiv identifier.
     * @param {function(object|null)} callback - Function called with the parsed data object.
     */
    fetchArxivData(arxivId, callback) {
        console.log(`Fetching data for arXiv:${arxivId}...`);
        const encodedArxivId = encodeURIComponent(arxivId);
        const uri = `http://export.arxiv.org/api/query?id_list=${encodedArxivId}`;
        const message = Soup.Message.new('GET', uri);

        _httpSession.queue_message(message, (session, msg) => {
            if (msg.status_code !== 200) {
                console.error(`arXiv API request failed. Status: ${msg.status_code}.`);
                return callback(null);
            }
            if (!msg.response_body) {
                console.error("arXiv API request succeeded but response body was empty.");
                return callback(null);
            }

            try {
                const responseBytes = msg.response_body.flatten().get_data();
                const xmlString = ByteArray.toString(responseBytes);
                const parsedData = _parseArxivXml(xmlString);

                if (!parsedData) {
                    console.error("Failed to parse XML response from arXiv.");
                    return callback(null);
                }

                // Construct and return the full data object, but do not save
                callback({
                    id: `arxiv:${parsedData.arxivId}`,
                    entry_type: "paper",
                    source: "arxiv",
                    title: parsedData.title,
                    authors: parsedData.authors,
                    date: parsedData.date,
                    abstract: parsedData.abstract,
                    arxiv_id: parsedData.arxivId,
                    web_link: `https://arxiv.org/abs/${parsedData.arxivId}`,
                    status: "to-read",
                });

            } catch(e) {
                console.error(`Error processing arXiv response: ${e.message}`);
                callback(null);
            }
        });
    }
};

var exports = { Library };