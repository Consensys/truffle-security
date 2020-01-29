'use strict';

const armlet = require('armlet');
const armletClass = require('./classes/armlet');
const mythxjsClass = require('./classes/mythx');



const trialEthAddress = '0x0000000000000000000000000000000000000000';
const trialPassword = 'trial';
const defaultAnalyzeRateLimit = 4;
const defaultAPIClient = 'mythxjs';

let client;
/**
 *
 * @param {Object} config - truffle configuration object.
 */
async function analyze(config) {
    config = prepareConfig(config);
    if (config.apiClient === 'armlet') {
        console.log('WARNING: You are using Armlet we will be deprecating Armlet in future versions of truffle-security in favour of MythXJS as it is no longer supported.')
        client = new armletClass( config, 'truffle');
    }
    else {
        client = new mythxjsClass( config, 'truffle');
    }
    const analysisResponse = await client.analyze();
    return analysisResponse;

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
    return Object.keys(jsonResponse).sort().map((key) => `${key}: ${jsonResponse[key]}`).join(', ');
}

/**
 *
 * Handles: truffle run verify --help
 *
 * @returns promise which resolves after help is shown
 */
function printHelpMessage() {
    return new Promise(resolve => {
        const helpMessage = `Usage: truffle run verify [options] [solidity-file[:contract-name] [solidity-file[:contract-name] ...]]

Runs MythX analyses on given Solidity contracts. If no contracts are
given, all are analyzed.

Options:
  --all      Compile all contracts instead of only the contracts changed since last compile.
  --apiClient { mythxjs | armlet}
              Which api client to use. Default and recommended is mythxjs.
  --mode { quick | standard | deep}
             Perform quick, in-depth (standard) or deep analysis. Default = quick.
  --style { stylish | json | table | tap | unix | markdown | ... },
             Output report in the given es-lint style style.
             See https://eslint.org/docs/user-guide/formatters/ for a full list.
             The markdown format is also included.
  --json | --yaml
             Dump results in unprocessed JSON or YAML format as it comes back from MythX.
             Note: this disables providing any es-lint style reports, and that
             --style=json is processed for eslint, while --json is not.
  --timeout *secs*
             Limit MythX analyses time to *secs* seconds.
             The default is 300 seconds (five minutes).
  --initial-delay *secs*
             Minimum amount of time to wait before attempting a first status poll to MythX.
             The default is ${armlet.defaultInitialDelay / 1000} seconds.
             See https://github.com/ConsenSys/armlet#improving-polling-response
  --limit *N*
             Have no more than *N* analysis requests pending at a time.
             As results come back, remaining contracts are submitted.
             The default is ${defaultAnalyzeRateLimit} contracts, the maximum value, but you can
             set this lower.
  --debug    Provide additional debug output. Use --debug=2 for more
             verbose output
             Note: progress is disabled if this is set.
  --min-severity { warning | error }
             Ignore SWCs below the designated level
  --swc-blacklist { 101 | 103,111,115 | ... }
             Ignore a specific SWC or list of SWCs.
  --uuid *UUID*
             Print in YAML results from a prior run having *UUID*
             Note: this is still a bit raw and will be improved.
  --version  Show package and MythX version information.
  --progress, --no-progress
             Enable/disable progress bars during analysis. The default is enabled.
             Note: this is disabled if debug is set.
  --mythx-logs --no-mythx-logs
             Enable/disable  MythX logs.
  --ci
             Blocking non zero return for CI integrations to throw an error (non-zero exit code).
  --ci-whitelist { 101 | 103,111,115 | ... }
             List of allowed SWCs that will not throw an error (non-zero exit code).
  --apiKey { api key generated from profile dashboard}
             Authenticate with api key instead of login details.
  --color, --no-color
             Enable/disable output coloring. The default is enabled.
`;
        // FIXME: decide if this is okay or whether we need
        // to pass in `config` and use `config.logger.log`.
        console.log(helpMessage);
        resolve(null);
    });
}

/**
 *
 * Handles: truffle run verify --version
 * Shows version information for this plugin and each of the MythX components.
 *
 * @returns promise which resolves after MythX version information is shown
 */
async function printVersion() {
    const pjson = require('./package.json');
    // FIXME: decide if this is okay or whether we need
    // to pass in `config` and use `config.logger.log`.
    console.log(`${pjson.name} ${pjson.version}`);
    const versionInfo = await armlet.ApiVersion();
    console.log(versionJSON2String(versionInfo));

}

function setConfigSeverityLevel (inputSeverity) {

    // converting severity to a number makes it easier to deal with in `issues2eslint.js`
    const severity2Number = {
        'error': 2,
        'warning': 1
    };

    // default to `warning`
    return severity2Number[inputSeverity] || 1;
}

function setConfigSWCBlacklist (inputBlacklist) {
    if (!inputBlacklist) {
        return false;
    }

    return inputBlacklist
        .toString()
        .split(",")
        .map(swc => "SWC-" + swc.trim());
}

/**
 * Modifies attributes of the Truffle configuration object
 * in order to use project-defined options
 *
 * @param {Object} config - Truffle configuration object.
 * @returns {Oject} config - Extended Truffle configuration object.
 */

function prepareConfig (config) {

    // merge project level configuration
    let projectConfig;
    try {
        projectConfig = require([config.working_directory, 'truffle-security'].join ('/'));
    } catch (ex) {
        projectConfig = {}
        if (config.debug) {
            config.logger.log("truffle-security.json either not found or improperly formatted. Default options will be applied.");
        }
    }

    const projectLevelKeys = Object.keys(projectConfig);

    projectLevelKeys.forEach(function (property) {
        if (!config.hasOwnProperty(property)) {
            config[property] = projectConfig[property];
        }
    });

    // modify and extend initial config params
    config.severityThreshold = setConfigSeverityLevel(config['min-severity']);
    config.swcBlacklist = setConfigSWCBlacklist(config['swc-blacklist']);
    if (typeof(config['mythx-logs']) === 'undefined') {
      config.mythxLogs = true;
    }
    // API Client configuration
    if (typeof config.apiClient === undefined) {
        config.apiClient = defaultAPIClient;
    }

    return config;
}


module.exports = {
    analyze,
    defaultAnalyzeRateLimit,
    versionJSON2String,
    printVersion,
    printHelpMessage,
    setConfigSeverityLevel,
    setConfigSWCBlacklist,
    trialEthAddress,
    trialPassword,
};
