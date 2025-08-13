'use strict';

var MAX_LEN = 23;

function generateShortTitle(title) {
    const safeTitle = String(title || '');
    let shortTitle = safeTitle || 'Untitled';
    if (shortTitle.length >= MAX_LEN) {
        shortTitle = shortTitle.substring(0, MAX_LEN - 4) + ' ...';
    }
    return shortTitle.replace(/[&<>]/g, '');
}

var exports = { generateShortTitle, MAX_LEN };