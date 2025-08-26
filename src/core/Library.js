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
        const lowerCaseFilterTags = tags ? tags.map(t => t.toLowerCase()) : [];

        return this.entries.filter(entry => {
            // --- Establish a "pass" status for each filter type ---
            let statusPass = !status || entry.status === status;

            let tagsPass = lowerCaseFilterTags.length === 0;
            if (!tagsPass) {
                const entryTags = (entry.tags || []).map(t => t.toLowerCase());
                tagsPass = lowerCaseFilterTags.every(filterTag => entryTags.includes(filterTag));
            }

            let queryPass = !lowerCaseQuery;
            if (!queryPass) {
                let textMatch = false;
                // Main field search
                if (fields && fields.length > 0) {
                    textMatch = fields.some(field => {
                        const fieldValue = entry[field];
                        if (Array.isArray(fieldValue)) {
                            return fieldValue.join(', ').toLowerCase().includes(lowerCaseQuery);
                        }
                        return fieldValue && typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(lowerCaseQuery);
                    });
                }
                // Key results search
                if (!textMatch && searchKeyResults && entry.key_items && entry.key_items.length > 0) {
                    textMatch = entry.key_items.some(keyItem => {
                        const titleMatch = keyItem.title && keyItem.title.toLowerCase().includes(lowerCaseQuery);
                        const keyItemTagsMatch = keyItem.tags && keyItem.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery));
                        return titleMatch || keyItemTagsMatch;
                    });
                }
                queryPass = textMatch;
            }

            // The entry is only included if it passes ALL active filters.
            return statusPass && tagsPass && queryPass;
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
            updates.bibtex = newBibtex;
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

// In src/core/Library.js

    /**
     * Fetches and parses data from arXiv. Returns a Promise.
     * @param {string} arxivId - The arXiv identifier.
     * @returns {Promise<object|null>} A promise that resolves with the parsed data object.
     * @private
     */
    _fetchArxivDataAsync(arxivId) {
        console.log(`Fetching data for arXiv:${arxivId}...`);
        return new Promise((resolve, reject) => {
            const encodedArxivId = encodeURIComponent(arxivId);
            const uri = `http://export.arxiv.org/api/query?id_list=${encodedArxivId}`;
            const message = Soup.Message.new('GET', uri);

            _httpSession.queue_message(message, (session, msg) => {
                if (msg.status_code !== 200) {
                    return reject(new Error(`arXiv API request failed. Status: ${msg.status_code}.`));
                }
                if (!msg.response_body) {
                    return reject(new Error("arXiv API request succeeded but response body was empty."));
                }

                try {
                    const responseBytes = msg.response_body.flatten().get_data();
                    const xmlString = ByteArray.toString(responseBytes);
                    const parsedData = _parseArxivXml(xmlString);

                    if (!parsedData) {
                        return reject(new Error("Failed to parse XML response from arXiv."));
                    }

                    // --- THIS IS THE CORRECTED PART ---
                    // Construct the full object with all required fields.
                    resolve({
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
                    reject(new Error(`Error processing arXiv response: ${e.message}`));
                }
            });
        });
    }

    /**
     * Creates a symmetric link between two library items.
     * @param {string} sourceId - The ID of the first item.
     * @param {string} targetId - The ID of the second item.
     * @returns {boolean} True if the link was successfully created, false otherwise.
     */
    addRelatedEntry(sourceId, targetId) {
        if (sourceId === targetId) return false; // An item cannot be related to itself.

        const sourceItem = this.getEntryById(sourceId);
        const targetItem = this.getEntryById(targetId);

        if (!sourceItem || !targetItem) {
            console.error("Could not create related entry link: one or both items not found.");
            return false;
        }

        // Add target to source's relations (if not already present)
        const sourceRelations = sourceItem.related_entries || [];
        if (!sourceRelations.includes(targetId)) {
            sourceItem.update({ related_entries: [...sourceRelations, targetId] });
        }

        // Add source to target's relations (if not already present)
        const targetRelations = targetItem.related_entries || [];
        if (!targetRelations.includes(sourceId)) {
            targetItem.update({ related_entries: [...targetRelations, sourceId] });
        }

        this.save();
        return true;
    }

    /**
     * Removes a symmetric link between two library items.
     * @param {string} sourceId - The ID of the first item.
     * @param {string} targetId - The ID of the second item.
     * @returns {boolean} True if the link was successfully removed, false otherwise.
     */
    removeRelatedEntry(sourceId, targetId) {
        const sourceItem = this.getEntryById(sourceId);
        const targetItem = this.getEntryById(targetId);

        if (!sourceItem || !targetItem) {
            console.error("Could not remove related entry link: one or both items not found.");
            return false;
        }

        // Remove target from source's relations
        const sourceRelations = sourceItem.related_entries || [];
        if (sourceRelations.includes(targetId)) {
            sourceItem.update({ related_entries: sourceRelations.filter(id => id !== targetId) });
        }

        // Remove source from target's relations
        const targetRelations = targetItem.related_entries || [];
        if (targetRelations.includes(sourceId)) {
            targetItem.update({ related_entries: targetRelations.filter(id => id !== sourceId) });
        }

        this.save();
        return true;
    }

    /**
     * Calculates various statistics about the library's contents.
     * @returns {object} An object containing the calculated statistics.
     */
    getStatistics() {
        const totalEntries = this.entries.length;
        if (totalEntries === 0) {
            return {
                totalEntries: 0,
                entriesByType: {},
                totalUniqueTags: 0,
                topTags: [],
                totalKeyItems: 0,
                mostReferencedEntry: null,
            };
        }

        const entriesByType = {};
        const tagFrequency = new Map();
        const relatedEntryFrequency = new Map();
        let totalKeyItems = 0;

        this.entries.forEach(entry => {
            // Count entries by type
            const entryType = entry.entry_type || 'uncategorized';
            entriesByType[entryType] = (entriesByType[entryType] || 0) + 1;

            // Tally tag frequencies
            (entry.tags || []).forEach(tag => {
                const lowerCaseTag = tag.toLowerCase();
                tagFrequency.set(lowerCaseTag, (tagFrequency.get(lowerCaseTag) || 0) + 1);
            });

            // Tally related entry frequencies
            (entry.related_entries || []).forEach(relatedId => {
                relatedEntryFrequency.set(relatedId, (relatedEntryFrequency.get(relatedId) || 0) + 1);
            });

            // Sum key items
            totalKeyItems += (entry.key_items || []).length;
        });

        // Determine top 5 tags
        const sortedTags = [...tagFrequency.entries()].sort((a, b) => b[1] - a[1]);
        const topTags = sortedTags.slice(0, 5).map(entry => ({ tag: entry[0], count: entry[1] }));

        // Determine the most referenced entry
        let mostReferencedEntry = null;
        if (relatedEntryFrequency.size > 0) {
            const sortedRelated = [...relatedEntryFrequency.entries()].sort((a, b) => b[1] - a[1]);
            const mostReferencedId = sortedRelated[0][0];
            const entry = this.getEntryById(mostReferencedId);
            if (entry) {
                mostReferencedEntry = {
                    title: entry.title,
                    id: entry.id,
                    count: sortedRelated[0][1],
                };
            }
        }

        return {
            totalEntries,
            entriesByType,
            totalUniqueTags: tagFrequency.size,
            topTags,
            totalKeyItems,
            mostReferencedEntry,
        };
    }

    // Add this new method inside the Library class in src/core/Library.js

    /**
     * Fetches data from arXiv and adds it as a new entry. Designed for CLI usage.
     * @param {string} arxivId - The arXiv identifier.
     * @param {boolean} downloadPdf - Whether to also download the PDF.
     * @returns {Promise<LibraryItem|null>} A promise that resolves with the new item or null on failure.
     */
    async addEntryFromArxivCLI(arxivId, downloadPdf = false) {
        try {
            const newItemData = await this._fetchArxivDataAsync(arxivId); // <--- Use the renamed async method
            const newItem = this.addEntry(newItemData);

            if (newItem && downloadPdf) {
                console.log(`Downloading PDF for ${newItem.title}...`);
                const downloadPromise = new Promise((resolve) => {
                    this.downloadArxivPdf(newItem.id, (success) => {
                        resolve(success);
                    });
                });
                const success = await downloadPromise;
                if (!success) {
                    console.warn(`Warning: Entry was added, but PDF download failed.`);
                }
            }
            return newItem;

        } catch (e) {
            console.error(e.message);
            return null;
        }
    }
};

var exports = { Library };