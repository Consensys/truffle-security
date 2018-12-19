// Truffle related code.
/* FIXME - use truffle libraries more */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Directories that must be in a truffle project

const TRUFFLE_ROOT_DIRS = ['contracts', 'migrations'];

exports.isTruffleRoot = function (p) {
    for (const shortDir of TRUFFLE_ROOT_DIRS) {
        const dir = `${p}/${shortDir}`;
        if (!fs.existsSync(dir)) {
            return false;
        }
        const stat = fs.statSync(dir);
        if (!stat || !stat.isDirectory()) {
            return false;
        }
    }
    return true;
};

exports.getBuildContractsDir = function (p) {
    assert(exports.isTruffleRoot(p));
    return `${p}/build/contracts`;
};

exports.getContractsDir = function (p) {
    assert(exports.isTruffleRoot(p));
    return `${p}/contracts`;
};

exports.getTruffleBuildJsonFiles = function (directory) {
    const files = fs.readdirSync(directory);
    const result = [];
    for (const file of files) {
        if (path.extname(file) === '.json' && path.basename(file)[0] !== '.') {
            result.push(files);
        }
    }
    return result;
};

exports.guessTruffleBuildJson = function (directory) {
    const jsonPaths = exports.getTruffleBuildJsonFiles(directory);
    const jsonPathsFiltered = [];
    for (const jsonPath of jsonPaths.concat.apply([], jsonPaths)) {
        if ((path.basename(jsonPath) !== 'Migrations.json') &&
            (path.basename(jsonPath) !== 'mythril.json')) {
            jsonPathsFiltered.push(jsonPath);
        }
    }
    let jsonPath;
    if (jsonPathsFiltered.length >= 1) {
        jsonPath = jsonPathsFiltered[0];
    } else {
        jsonPath = jsonPaths[0];
    }
    return jsonPath;
};
