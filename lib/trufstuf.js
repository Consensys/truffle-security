// Truffle related code.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);

const parseBuildJson = function(file) {
    const buildJson = fs.readFileSync(file, 'utf8');
    const buildObj = JSON.parse(buildJson);
    return buildObj;
};

/* returns true if directory/file out of date
*/
const staleBuildContract = function(directory, file) {
    const fullPath = path.join(directory, file);
    const buildObj = parseBuildJson(fullPath);
    const buildMtime = fs.statSync(fullPath).mtime;
    const sourcePath = buildObj.sourcePath;
    if (!fs.existsSync(sourcePath)) {
        return true;
    }
    const sourceMtime = fs.statSync(sourcePath).mtime;
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
    const filteredFiles = files.filter(file =>
        ((file !== 'Migrations.json') &&
                                        !staleBuildContract(directory, file)));
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
