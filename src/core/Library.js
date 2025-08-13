// src/core/Library.js
'use strict';

imports.gi.versions.Soup = '2.4';
const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigManager } = imports.config.ConfigManager;
const { LibraryItem } = imports.core.LibraryItem;

// Helper to create a shared Soup.SessionAsync for all Library instances
const _httpSession = new Soup.SessionAsync();

/**
 * Parses the raw XML string from the arXiv API response.
 * @param {string} xmlString - The XML content from the API.
 * @returns {object|null} A data object or null on failure.
 * @private
 */
function _parseArxivXml(xmlString) {
    if (!xmlString) return null;

    // Helper to extract content from a specific tag
    const getTagContent = (tagName, xml) => {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim().replace(/\s+/g, ' ') : null;
    };

    const entryXml = getTagContent('entry', xmlString);
    if (!entryXml) return null;

    const title = getTagContent('title', entryXml);
    const rawSummary = getTagContent('summary', entryXml);
    const summary = _cleanLatex(rawSummary);
    const published = getTagContent('published', entryXml); // e.g., 2014-01-22T15:23:19Z
    const arxivId = (getTagContent('id', entryXml) || '').split('/').pop().split('v')[0];

    const authors = [...entryXml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
        .map(match => match[1].trim());

    if (!title || !arxivId || authors.length === 0) return null;

    // Parse date components from 'published' string
    let date = {};
    if (published) {
        try {
            const dt = GLib.DateTime.new_from_iso8601(published, null);
            if (dt) {
                date.year = dt.get_year();
                date.month = dt.get_month();
                date.day = dt.get_day_of_month();
            }
        } catch (e) {
            console.warn(`Could not parse date "${published}": ${e.message}`);
        }
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
        // First, remove the math delimiters ($ and $$)
        .replace(/\$\$?/g, '')
        // Replace commands with one argument, e.g., \pmod{p} -> p
        .replace(/\\([a-zA-Z]+)\s*\{([^}]+)\}/g, '$2')
        // Replace parameter-less commands, e.g., \xi -> xi, \sum -> sum
        .replace(/\\([a-zA-Z]+)/g, '$1')
        // Clean up sub/superscripts, but keep the content
        .replace(/_\{([^}]+)\}/g, '_$1')
        .replace(/\^\{([^}]+)\}/g, '^$1')
        // Remove any remaining stray braces
        .replace(/[{}]/g, '')
        // Normalize whitespace that may have been left over
        .replace(/\s\s+/g, ' ')
        .trim();
}

var Library = class Library {
    constructor() {
        /** @type {LibraryItem[]} */
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
        this.entries.unshift(newItem); // Add to the beginning of the list
        this.save();
        return newItem;
    }

    getEntryById(id) {
        return this.entries.find(entry => entry.id === id);
    }

    /**
     * Fetches metadata from arXiv and adds a new entry to the library.
     * @param {string} arxivId - The arXiv identifier (e.g., '1401.5345').
     * @param {function(LibraryItem|null)} callback - Function to call on completion.
     */
    addEntryFromArxiv(arxivId, callback) {
        console.log(`Fetching data for arXiv:${arxivId}...`);
        const uri = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
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

                // Construct the full entry object
                const newItemData = {
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
                    tags: [],
                    personal_notes: "",
                    related_entries: [],
                    table_of_contents: [],
                    key_items: []
                };

                const newItem = this.addEntry(newItemData);
                callback(newItem);

            } catch(e) {
                console.error(`Error processing arXiv response: ${e.message}`);
                callback(null);
            }
        });
    }

    /**
     * Searches and filters library entries based on given criteria.
     * @param {object} filters - An object containing filter criteria.
     * @param {string} [filters.query] - The text string to search for.
     * @param {string[]} [filters.fields] - Fields to search within (e.g., ['title', 'abstract']).
     * @param {string[]} [filters.tags] - A list of tags that must all be present.
     * @param {string} [filters.status] - A specific status to filter by.
     * @returns {LibraryItem[]} An array of matching library items.
     */
    search(filters = {}) {
        const { query, fields, tags, status } = filters;
        const lowerCaseQuery = query ? query.toLowerCase() : null;

        return this.entries.filter(entry => {
            // Filter by status
            if (status && entry.status !== status) {
                return false;
            }

            // Filter by tags (entry must have ALL specified tags)
            if (tags && tags.length > 0) {
                const hasAllTags = tags.every(tag => entry.tags.includes(tag));
                if (!hasAllTags) {
                    return false;
                }
            }

            // Filter by text query
            if (lowerCaseQuery && fields && fields.length > 0) {
                const isMatch = fields.some(field => {
                    const fieldValue = entry[field];
                    return fieldValue && typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(lowerCaseQuery);
                });
                if (!isMatch) {
                    return false;
                }
            }

            // If it passed all filters, include it
            return true;
        });
    }
};

var exports = { Library };