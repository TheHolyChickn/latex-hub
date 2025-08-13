// src/core/Library.js
'use strict';

imports.gi.versions.Soup = '2.4';
const { GLib, Gio, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const { ConfigManager } = imports.config.ConfigManager;
const { LibraryItem } = imports.core.LibraryItem;

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
        const { query, fields, tags, status } = filters;
        const lowerCaseQuery = query ? query.toLowerCase() : null;

        return this.entries.filter(entry => {
            if (status && entry.status !== status) return false;
            if (tags && tags.length > 0) {
                if (!tags.every(tag => entry.tags.includes(tag))) return false;
            }
            if (lowerCaseQuery && fields && fields.length > 0) {
                if (!fields.some(field => {
                    const fieldValue = entry[field];
                    return fieldValue && typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(lowerCaseQuery);
                })) return false;
            }
            return true;
        });
    }
};

var exports = { Library };