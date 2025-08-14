'use strict';

/**
 * Generates a simple BibTeX entry from item data.
 * @param {object} data - The library item data.
 * @returns {string} A formatted BibTeX string.
 */
function generateBibtex(data) {
    const entryType = data.entry_type === 'book' ? '@book' : '@article';

    // Use a custom bibtex_key if it exists, otherwise generate one.
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
        if (data.entry_type === 'paper' || data.entry_type === 'article') {
            bibtexString += `  journal={${data.publication_info}},\n`;
        } else {
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