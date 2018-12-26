'use strict';


const fs = require('fs');
const armlet = require('armlet');
const mythril = require('./lib/mythril');
const trufstuf = require('./lib/trufstuf');
const esReporter = require('./lib/es-reporter');
const contracts = require("truffle-workflow-compile");
const util = require('util');

const readFile = util.promisify(fs.readFile);
const contractsCompile = util.promisify(contracts.compile);


/**
 *
 * Loads preferred ESLint formatter for warning reports.
 *
 * @param {String} config
 * @returns ESLint formatter module
 */
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


/**
 *
 * Returns a JSON object from a version response. Each attribute/key
 * is a tool name and the value is a version string of the tool.
 *
 * @param {Object} jsonResponse
 * @returns string  A comma-separated string of tool: version
 */
function versionJSON2String(jsonResponse) {
    return Object.keys(jsonResponse).map((key) => `${key}: ${jsonResponse[key]}`).join(', ');
}

/**
 *
 * Handles: truffle run analyze --help
 *
 * @returns promise which resolves after help is shown
 */
function printHelpMessage() {
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
          The default is 120 seconds (two minutes).
  --version show package and MythX version information
`;
        // FIXME: decide if this is okay or whether we need
        // to pass in `config` and use `config.logger.log`.
        console.log(helpMessage);
        resolve(null);
    });
}

/**
 *
 * Handles: truffle run analyze --version
 * Shows version information for this plugin and each of the MythX components.
 *
 * @returns promise which resolves after MythX version information is shown
 */
function printVersion() {
  return new Promise(resolve => {
      const pjson = require('./package.json');
      // FIXME: decide if this is okay or whether we need
      // to pass in `config` and use `config.logger.log`.
      console.log(`${pjson.name} ${pjson.version}`);
      const version = armlet.ApiVersion();
      console.log(versionJSON2String(version))
      resolve(null);
  });
}


/**
 * Runs Mythril Platform analyze on smart contract build json files found
 * in truffle build folder
 * 
 * @param {armlet.Client} client - instance of armlet.Client to send data to API.
 * @param {Object} config - Truffle configuration object.
 * @param {Array<String>} jsonFiles - List of smart contract build json files.
 * @returns {Promise} - Resolves array of hashmaps with issues for each contract.
 */
const doAnalysis = async (client, config, jsonFiles) => {
  /**
   * Multiple smart contracts need to be run concurrently
   * to speed up analyze report output.
   * Because simple forEach or map can't handle async operations -
   * async map is used and Promise.all to be notified when all analyses
   * are finished.
   */

  return Promise.all(jsonFiles.map(async file => {
    const buildJson = await readFile(file, 'utf8');
    const buildObj = JSON.parse(buildJson);
    const solidityFile = trufstuf.getSolidityFileFromJson(buildObj);

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

    return {
      buildObj,
      solidityFile,
      issues,
    }
  }));
}

/**
 * 
 * @param {Object} config - truffle configuration object.
 */
async function analyze(config) {
  const armletOptions = {
    // FIXME: The below "partners" will change when
    // https://github.com/ConsenSys/mythril-api/issues/59
    // is resolved.
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

  // Get list of smart contract build json files from truffle build folder
  const jsonFiles = await trufstuf.getTruffleBuildJsonFiles(config.contracts_build_directory);

  const analysisResults = await doAnalysis(client, config, jsonFiles);

  const formatter = getFormatter(config.style);
  
  analysisResults.forEach(({issues, solidityFile, buildObj }) => {
    const esIssues = mythril.issues2Eslint(issues, buildObj, config);
    esReporter.printReport(esIssues, solidityFile, formatter, config.logger.log);
  });

  return analysisResults;
}

module.exports = {
  analyze,
  printVersion,
  printHelpMessage,
  contractsCompile,
}
