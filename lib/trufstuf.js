// Truffle related code
'use strict';

/* FIXME - use truffle libraries:

config = require("truffle-config')  // config.working_directory is truffle root
cs = require('truffle-contract-sources') , //findContracts() to get all the solidity files
*/

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Directories that must be in a truffle project

const TRUFFLE_ROOT_DIRS = ['contracts', 'migrations'];

exports.is_truffle_root = function (path) {
    for (var i in TRUFFLE_ROOT_DIRS) {
        var dir = `${path}/${TRUFFLE_ROOT_DIRS[i]}`;
        if (!fs.existsSync(dir)) {
            return false;
        }
        var stat = fs.statSync(dir);
        if (!stat || !stat.isDirectory()) {
            return false;
        }
    }
    return true;
};

exports.getBuildContractsDir = function (path) {
    assert(exports.is_truffle_root(path));
    return `${path}/build/contracts`;
};
exports.getContractsDir = function (path) {
    assert(exports.is_truffle_root(path));
    return `${path}/contracts`;
};

exports.get_truffle_build_json_files = function (directory) {
    var files = fs.readdirSync(directory);
    var result = [];
    for (var i in files) {
        if (path.extname(files[i]) === '.json' && path.basename(files[i])[0] !== '.') {
            result.push(files[i]);
        }
    }
    return result;
};

exports.guessTruffleBuildJson = function (directory) {
    var jsonPaths = exports.get_truffle_build_json_files(directory);
    var jsonPathsFiltered = [];
    for (var i in jsonPaths) {
        if ((path.basename(jsonPaths[i]) !== 'Migrations.json') &&
    (path.basename(jsonPaths[i]) !== 'mythril.json')) {
            jsonPathsFiltered.push(jsonPaths[i]);
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
