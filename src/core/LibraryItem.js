// src/core/LibraryItem.js
'use strict';

var LibraryItem = class LibraryItem {
    /**
     * Represents a single entry in the research library.
     * @param {object} itemData - The raw data object for this item.
     */
    constructor(itemData) {
        this._data = itemData;
    }

    // --- Getters for direct properties ---
    get id() { return this._data.id; }
    get entry_type() { return this._data.entry_type; }
    get source() { return this._data.source; }
    get title() { return this._data.title; }
    get authors() { return this._data.authors || []; }
    get date() { return this._data.date || {}; } // Returns { year, month, day }
    get abstract() { return this._data.abstract; }
    get arxiv_id() { return this._data.arxiv_id; }
    get bibtex() { return this._data.bibtex; }
    get tags() { return this._data.tags || []; }
    get status() { return this._data.status; }
    get local_path() { return this._data.local_path; }
    get web_link() { return this._data.web_link; }
    get personal_notes() { return this._data.personal_notes; }
    get related_entries() { return this._data.related_entries || []; }
    get table_of_contents() { return this._data.table_of_contents || []; }
    get key_items() { return this._data.key_items || []; }

    /**
     * Updates one or more properties of the item.
     * @param {object} updates - An object with keys and values to update.
     */
    update(updates) {
        this._data = { ...this._data, ...updates };
    }

    /**
     * Returns a clean data object suitable for JSON serialization.
     * @returns {object}
     */
    toJSON() {
        return { ...this._data };
    }

    /**
     * Provides a string representation of the LibraryItem.
     * @returns {string}
     */
    toString() {
        const authorStr = this.authors.length > 0 ? this.authors[0] : 'N/A';
        return `<LibraryItem ${this.id} [${this.entry_type}] "${this.title}" (${authorStr}, ${this.date.year})>`;
    }
};

var exports = { LibraryItem };