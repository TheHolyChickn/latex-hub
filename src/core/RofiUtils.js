'use strict';

const MAX_LEN = 23;

function generateShortTitle(title) {
    let shortTitle = title;
    if (shortTitle.length >= MAX_LEN) {
        shortTitle = shortTitle.substring(0, MAX_LEN - 4) + ' ...';
    }
    return shortTitle.replace(/[&<>]/g, '');
}

var exports = { generateShortTitle, MAX_LEN };