// Truffle related code.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

const parseBuildJson = async file => {
    const buildJson = await readFile(file, 'utf8');
    const buildObj = JSON.parse(buildJson);
    return buildObj;
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
    const filtered1 = files.filter(f => f !== 'Migrations.json');
    const filePaths = filtered1.map(f => path.join(directory, f));
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


const isContractDeleted = async contract => {
    try {
        await util.promisify(fs.stat)(contract.sourcePath);
    } catch (e) {
        return true;
    }
    return false;
};

module.exports = {
    getTruffleBuildJsonFiles,
    getSolidityFileFromJson,
    parseBuildJson,
    isContractDeleted,
};
