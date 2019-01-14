'use strict';

const issues2eslint = require('../../lib/issues2eslint');
const fs = require('fs');
const mythXresults = JSON.parse(fs.readFileSync('./MythXResults.json', 'utf-8'));
const buildObj = JSON.parse(fs.readFileSync('./Over.json', 'utf-8'));
const util = require('util');
let results = issues2eslint.mythXresults2Eslint(mythXresults, buildObj, {});
console.log(util.inspect(results));

const maruResults = JSON.parse(fs.readFileSync('./MaruResults.json', 'utf-8'));
results = issues2eslint.mythXresults2Eslint(maruResults, buildObj, {});
console.log(util.inspect(results));
