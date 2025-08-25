'use strict';

/**
 * Generates a simple BibTeX entry from item data.
 * @param {object} data - The library item data.
 * @returns {string} A formatted BibTeX string.
 */
// src/core/BibtexUtils.js

function generateBibtex(data) {
    // Determine the BibTeX entry type more robustly
    let entryType;
    switch (data.entry_type) {
        case 'book':
            entryType = '@book';
            break;
        case 'article':
        case 'paper':
            entryType = '@article';
            break;
        default:
            entryType = '@misc'; // A safe default for other types
            break;
    }

    const key = data.bibtex_key || (() => {
        const authorLastName = ((data.authors && data.authors[0]) || 'Unknown').split(' ').pop();
        const year = data.date && data.date.year ? data.date.year : 'UnknownYear';
        return `${authorLastName}${year}`;
    })();

    let bibtexString = `${entryType}{${key},\n`;
    bibtexString += `  title={${data.title}},\n`;
    bibtexString += `  author={${(data.authors || []).join(' and ')}},\n`;
    bibtexString += `  year={${data.date && data.date.year ? data.date.year : ''}},\n`;

    if (data.publication_info) {
        // Use the correct field based on the BibTeX type
        if (entryType === '@article') {
            bibtexString += `  journal={${data.publication_info}},\n`;
        } else if (entryType === '@book') {
            bibtexString += `  publisher={${data.publication_info}},\n`;
        }
    }

    if (data.arxiv_id) {
        bibtexString += `  eprint={${data.arxiv_id}},\n`;
        bibtexString += `  archivePrefix={arXiv},\n`;
    }
    bibtexString += `}`;
    return bibtexString;
}

var exports = { generateBibtex };