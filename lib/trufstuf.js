// Truffle related code.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);

/**
 * Turns build json data into an object truffle-security can work with.
 * @param {object} jsonObject 
 */
const normalizeJsonObject = async jsonObject => {
    const { contracts, sources, compiler } = jsonObject;
    const objs = {};

    for (const [ sourcePath, solData ] of Object.entries(contracts)) {
        if (!objs[sourcePath]) {
            objs[sourcePath] = {
                contracts: [],
            };
        }
        for (const [ contractName, contractData ] of Object.entries(solData)) {
            const o = {
                contractName,
                sourcePath,
                bytecode: `0x${contractData.evm.bytecode.object}`,
                deployedBytecode: `0x${contractData.evm.deployedBytecode.object}`,
                sourceMap: contractData.evm.bytecode.sourceMap,
                deployedSourceMap: contractData.evm.deployedBytecode.sourceMap,
            }

            objs[sourcePath].contracts.push(o);
        }
    }

    for (const [ sourcePath, solData ] of Object.entries(sources)) {
        if (!objs[sourcePath]) {
            continue;
        }
        objs[sourcePath].contracts.map(async o => {
            o.ast = solData.ast;
            o.legacyAST = solData.legacyAST;
            o.id = solData.id;
            o.compiler = compiler;
        });
    }

    const result = Object.values(objs).reduce((acc, o) => {
        acc = acc.concat(o.contracts);
        return acc;
    }, []);

    const withSource = await Promise.all(result.map(async contract => {
        const source = await readFile(contract.sourcePath, 'utf8');
        contract.source = source
        return contract;
    }))

    return withSource[0]; // return first contract
};


const parseBuildJson = async file => {
    const buildJson = await readFile(file, 'utf8');
    const buildObj = JSON.parse(buildJson);
    const normalized = await normalizeJsonObject(buildObj);
    // Recent versions of truffle seem to add __ to the end of the bytecode
    for (const field of ['bytecode', 'deployedBytecode']) {
        if (normalized[field]) {
            normalized[field] = normalized[field].replace(/_.+$/, '');
        }
    }
    return normalized;
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
    const filtered1 = files.filter(f => f !== 'Migrations.json');
    const promisified = await Promise.all(filtered1.map(async f => {
        const isStale = await staleBuildContract(directory, f);
        return isStale ? null : f;
    }));
    const filtered2 = promisified.filter(f => !!f);
    const filePaths = filtered2.map(f => path.join(directory, f));
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
