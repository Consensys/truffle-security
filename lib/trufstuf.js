// Truffle related code.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);

const parseBuildJson = async file => {
    const buildJson = await readFile(file, 'utf8');
    const buildObj = JSON.parse(buildJson);
    return buildObj;
};

/* returns true if directory/file out of date
*/
const staleBuildContract = async (directory, file) => {
    const fullPath = path.join(directory, file);
    const buildObj = await parseBuildJson(fullPath);
    const fullPathStat = await stat(fullPath);
    const buildMtime = fullPathStat.mtime;
    const sourcePath = buildObj.sourcePath;
    let sourcePathStat;

    try {
        sourcePathStat = await stat(sourcePath);
    } catch (err) {
        return true;
    }

    const sourceMtime = sourcePathStat.mtime;
    return sourceMtime > buildMtime;
};

/**
 * Scans Truffle smart contracts build directory and returns
 * array of paths to smart contract build JSON files.
 *
 * @param {string} directory - path to truffle smart contracts build directory. {
 * @returns {Array<string>} - list of JSON files.
 */
const getTruffleBuildJsonFiles = async function(directory) {
    const files = await readdir(directory);
    const filteredFiles = await Promise.all(files.filter(async file => {
        if (file === 'Migrations.json') {
            return false;
        }
        const isStale = await staleBuildContract(directory, file);
        return !isStale;
    }));
    const filePaths = filteredFiles.map(f => path.join(directory, f));
    return filePaths;
};


/**
 * Extracts path to solidity file from smart contract build object
 * found in json files in truffle build directories.
 *
 * Build objects have property "sourcePath".
 * For simplicity and readabilty build object is destructured and
 * "sourcePath" property extracted to output directly.
 *
 * @param {Object} param - Smart contract build object,
 * @returns {String} - Absolute path to solidity file.
 */
const getSolidityFileFromJson = ({ sourcePath }) => sourcePath;


module.exports = {
    getTruffleBuildJsonFiles,
    getSolidityFileFromJson,
    parseBuildJson,
    staleBuildContract,
};
