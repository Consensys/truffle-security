'use strict';


const path = require('path');
const fs = require('fs');
const armlet = require('armlet');
const mythril = require('./lib/mythril');
const trufstuf = require('./lib/trufstuf');
const esReporter = require('./lib/es-reporter');
const contracts = require("truffle-workflow-compile");
const util = require('util');

const readFile = util.promisify(fs.readFile);
const contractsCompile = util.promisify(contracts.compile);

function getFormatter(style) {
    const formatterName = style || 'stylish';
    try {
        return require(`eslint/lib/formatters/${formatterName}`);
    } catch (ex) {
        ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
            ex.message
        }`;
        throw ex;
    }
}

function versionJSON2String(jsonResponse) {
    return Object.keys(jsonResponse).map((key) => `${key}: ${jsonResponse[key]}`).join(', ');
}

async function printHelpMessage() {
  return new Promise(resolve => {
    const helpMessage = `Usage: truffle run analyze [options]

Options:
  --debug    Provide additional debug output
  --mode { quick | full }
             Perform quick or in-depth (full) analysis.
  --style {stylish | unix | visualstudio | table | tap | ...},
             Output report in the given es-lint style style.
             See https://eslint.org/docs/user-guide/formatters/ for a full list.
  --timeout *seconds* ,
          Limit MythX analysis time to *s* seconds.
          The default is 30 seconds.
  --version show package and MythX version information
`;
    console.log(helpMessage);
    resolve(null);
  });
}

async function printVersion() {
  const pjson = require('./package.json');
  console.log(`${pjson.name} ${pjson.version}`);

  const version = await armlet.ApiVersion();
  
  console.log(versionJSON2String(version))

  return version;
}

function getSolidityDetails(config) {
  const rootDir = config.working_directory;
  const buildDir = config.contracts_build_directory;
  // FIXME: use truffle library routine
  const contractsDir = trufstuf.getContractsDir(rootDir);

  // const expect = require("truffle-expect");
  // FIXME: expect things

  let solidityFileBase;
  let solidityFile;
  let buildJsonPath;
  let buildJson;

  if (config._.length === 1) {
    buildJson = trufstuf.guessTruffleBuildJson(buildDir);
  } else {
    buildJson = path.basename(config._[0]);
  }
  solidityFileBase = path.basename(buildJson, '.json');

  if (!solidityFileBase.endsWith('.sol')) {
    solidityFileBase += '.sol';
  }

  solidityFile = path.join(contractsDir, solidityFileBase);
  if (config.debug) {
    config.logger.log(`Solidity file used: ${solidityFile}`);
  }

  buildJsonPath = path.join(buildDir, buildJson);
  if (!buildJsonPath.endsWith('.json')) {
    buildJsonPath += '.json';
  }

  return { solidityFile, buildJsonPath }; 
}

// Run Mythril Platform analyze after we have
// ensured via compile that JSON data is there and
// up to date.
async function analyze(config) {
  const { solidityFile, buildJsonPath } = getSolidityDetails(config);
  const buildJson = await readFile(buildJsonPath);
  const buildObj = JSON.parse(buildJson);
  const armletOptions = {
    platforms: ['truffle']  // client chargeback
  }

  if (process.env.MYTHRIL_API_KEY) {
    armletOptions.apiKey = process.env.MYTHRIL_API_KEY;
  } else {
    if (!process.env.MYTHRIL_PASSWORD) {
      throw new Error('You need to set environment variable MYTHRIL_PASSWORD to run analyze.');
    }
  
    armletOptions.password = process.env.MYTHRIL_PASSWORD;

    if (process.env.MYTHRIL_ETH_ADDRESS) {
      armletOptions.ethAddress = process.env.MYTHRIL_ETH_ADDRESS
    } else if (process.env.MYTHRIL_EMAIL) {
      armletOptions.email = process.env.MYTHRIL_EMAIL
    } else {
      throw new Error('You need to set either environment variable MYTHRIL_ETH_ADDRESS or MYTHRIL_EMAIL to run analyze.');
    }
  }

  const client = new armlet.Client(armletOptions);
  const analyzeOpts = {
    _: config._,
    debug: config.debug,
    data: mythril.truffle2MythrilJSON(buildObj),
    logger: config.logger,
    style: config.style,
    timeout: (config.timeout || 120) * 1000,

    // FIXME: The below "partners" will change when
    // https://github.com/ConsenSys/mythril-api/issues/59
    // is resolved.
    partners: ['truffle'],
  };

  analyzeOpts.data.analysisMode = analyzeOpts.mode || 'full';

  const issues = await client.analyze(analyzeOpts);
  const formatter = getFormatter(analyzeOpts.style);
  const esIssues = mythril.issues2Eslint(issues, buildObj, analyzeOpts);
  esReporter.printReport(esIssues, solidityFile, formatter, analyzeOpts.logger.log);

  return issues;
}


module.exports = {
  analyze,
  getSolidityDetails,
  printVersion,
  printHelpMessage,
  contractsCompile,
}
