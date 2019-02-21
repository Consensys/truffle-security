'use strict';


const armlet = require('armlet');
const trufstuf = require('./lib/trufstuf');
const { MythXIssues } = require('./lib/issues2eslint');
const eslintHelpers = require('./lib/eslint');
const contracts = require('truffle-workflow-compile');
const util = require('util');
const yaml = require('js-yaml');
const asyncPool = require('tiny-async-pool');
const multiProgress = require('multi-progress');
const sleep = require('sleep');


const trialEthAddress = '0x0000000000000000000000000000000000000000';
const trialPassword = 'trial';
const defaultAnalyzeRateLimit = 4;

// FIXME: util.promisify breaks compile internal call to writeContracts
// const contractsCompile = util.promisify(contracts.compile);
const contractsCompile = config => {
    return new Promise((resolve, reject) => {
        contracts.compile(config, (err, result) => {
            if (err) {
                reject(err);
                return ;
            }
            resolve(result);
        });
    });
};

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
        const helpMessage = `Usage: truffle run verify [options] [*contract-name1* [*contract-name2*] ...]

Runs MythX analyses on given Solidity contracts. If no contracts are
given, all are analyzed.

Options:
  --debug    Provide additional debug output. Use --debug=2 for more
             verbose output
  --uuid *UUID*
             Print in YAML results from a prior run having *UUID*
             Note: this is still a bit raw and will be improved.
  --mode { quick | full }
             Perform quick or in-depth (full) analysis.
  --style { stylish | unix | json | table | tap | ... },
             Output report in the given es-lint style style.
             See https://eslint.org/docs/user-guide/formatters/ for a full list.
  --timeout *seconds* ,
             Limit MythX analyses time to *s* seconds.
             The default is 300 seconds (five minutes).
  --limit *N*
             Have no more than *N* analysis requests pending at a time.
             As results come back, remaining contracts are submitted.
             The default is ${defaultAnalyzeRateLimit} contracts, the maximum value, but you can
             set this lower.
  --version  Show package and MythX version information.
  --no-progress
             Do not display progress bars during analysis.
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

/*

   Removes bytecode fields from analyze data input if it is empty.
   This which can as a result of minor compile problems.

   We still want to submit to get analysis which can work just on the
   source code or AST. But we want to remove the fields so we don't
   get complaints from MythX. We will manage what we want to say.
*/
const cleanAnalyDataEmptyProps = (data, debug, logger) => {
    const { bytecode, deployedBytecode, sourceMap, deployedSourceMap, ...props } = data;
    const result = { ...props };

    const unusedFields = [];

    if (bytecode && bytecode !== '0x') {
        result.bytecode = bytecode;
    } else {
        unusedFields.push('bytecode');
    }

    if (deployedBytecode && deployedBytecode !== '0x') {
        result.deployedBytecode = deployedBytecode;
    } else {
        unusedFields.push('deployedBytecode');
    }

    if (sourceMap) {
        result.sourceMap = sourceMap;
    } else {
        unusedFields.push('sourceMap');
    }

    if (deployedSourceMap) {
        result.deployedSourceMap = deployedSourceMap;
    } else {
        unusedFields.push('deployedSourceMap');
    }

    if (debug && unusedFields.length > 0) {
        logger(`Empty JSON data fields from compilation in contract ${props.contractName}: ${unusedFields.join(', ')}`);
    }

    return result;
}

/**
 * Runs MythX security analyses on smart contract build json files found
 * in truffle build folder
 *
 * @param {armlet.Client} client - instance of armlet.Client to send data to API.
 * @param {Object} config - Truffle configuration object.
 * @param {Array<String>} jsonFiles - List of smart contract build json files.
 * @param {Array<String>} contractNames - List of smart contract name to run analyze (*Optional*).
 * @returns {Promise} - Resolves array of hashmaps with issues for each contract.
 */
const doAnalysis = async (client, config, jsonFiles, contractNames = null, limit = defaultAnalyzeRateLimit) => {
    const timeout = (config.timeout || 300) * 1000;

    /**
   * Prepare for progress bar
   */
    const progress = ('progress' in config) ? config.progress : true;
    const cacheLookup = ('cache-lookup' in config) ? config['cache-lookup'] : true;
    let multi;
    let indent;
    if(progress) {
        multi = new multiProgress();
        let contractNameLengths = [];
        await Promise.all(jsonFiles.map(async file => {
            const buildObj = await trufstuf.parseBuildJson(file);
            const contractName = buildObj.contractName;
            if (contractNames && contractNames.indexOf(contractName) < 0) {
                return;
            }
            contractNameLengths.push(contractName.length);
        }));
        indent = Math.max(...contractNameLengths);
    }

    /**
   * Multiple smart contracts need to be run concurrently
   * to speed up analyze report output.
   * Because simple forEach or map can't handle async operations -
   * async map is used and Promise.all to be notified when all analyses
   * are finished.
   */

    const results = await asyncPool(limit, jsonFiles, async file => {
        const buildObj = await trufstuf.parseBuildJson(file);

        /**
         * If contractNames have been passed then skip analyze for unwanted ones.
         */
        if (contractNames && contractNames.indexOf(buildObj.contractName) < 0) {
            return [null, null];
        }

        const obj = new MythXIssues(buildObj);

        let analyzeOpts = {
            clientToolName: 'truffle',
            noCacheLookup: !cacheLookup,
            timeout,
        };

        analyzeOpts.data = cleanAnalyDataEmptyProps(obj.buildObj, config.debug,
                                                    config.logger.debug);
        analyzeOpts.data.analysisMode = analyzeOpts.mode || 'quick';
        if (config.debug > 1) {
            config.logger.debug(`${util.inspect(analyzeOpts, {depth: null})}`);
        }

        // create progress bars.
        let bar;
        let timer;
        if (progress) {
            bar = multi.newBar(`${buildObj.contractName.padStart(indent)} |` + ':bar'.cyan + '| :percent || Elapsed: :elapseds :status', {
                complete: '*',
                incomplete: ' ',
                width: Math.max(Math.min(parseInt((timeout / 1000) / 300 * 100), 100), 40), // based on timeout, but the cap is 300 and the floor is 40.
                total: timeout / 1000
            });
            timer = setInterval(() => {
                bar.tick({
                    'status': 'in progress...'
                });
                if (bar.complete) {
                    clearInterval(timer);
                }
            }, 1000);
        }

        // request analysis to armlet.
        try {
            const {issues, status} = await client.analyzeWithStatus(analyzeOpts);
            if (config.debug) {
                config.logger.debug(`UUID for this job is ${status.uuid}`);
                if (config.debug > 1) {
                    config.logger.debug(`${util.inspect(issues, {depth: null})}`);
                    config.logger.debug(`${util.inspect(status, {depth: null})}`);
                }
            }

            if (progress) {
                clearInterval(timer);
                sleep.msleep(1000); // wait for last setInterval finising
            }

            if (status.status === 'Error') {
                if (progress) {
                    bar.tick({
                        'status': '✗ Error'.red
                    });
                    bar.terminate();    // terminate since bar.complete is false at this time
                }
                return [status, null];
            } else {
                if (progress) {
                    bar.tick(timeout / 1000, {
                        'status': '✓ completed'.green
                    });
                }
                obj.setIssues(issues);
            }
            return [null, obj];
        } catch (err) {
            if (progress) {
                clearInterval(timer);
                sleep.msleep(1000); // wait for last setInterval finising
                bar.tick({
                    'status': '✗ error'.red
                });
                bar.terminate();    // terminate since bar.complete is false at this time
            }
            return [err, null];
        }
    });

    return results.reduce((accum, curr) => {
        const [ err, obj ] = curr;
        if (err) {
            accum.errors.push(err);
        } else if (obj) {
            accum.objects.push(obj);
        }
        return accum;
    }, { errors: [], objects: [] });
};

function doReport(config, objects, errors, notFoundContracts) {
    const spaceLimited = ['tap', 'markdown', 'json'].indexOf(config.style) === -1;
    const eslintIssues = objects
        .map(obj => obj.getEslintIssues(spaceLimited))
        .reduce((acc, curr) => acc.concat(curr), []);

    // FIXME: temporary solution until backend will return correct filepath and output.
    const eslintIssuesByBaseName = groupEslintIssuesByBasename(eslintIssues);

    const uniqueIssues = eslintHelpers.getUniqueIssues(eslintIssuesByBaseName);

    const formatter = getFormatter(config.style);
    config.logger.log(formatter(uniqueIssues));

    if (notFoundContracts.length > 0) {
        config.logger.error(`These smart contracts were not found: ${notFoundContracts.join(', ')}`);
    }

    if (errors.length > 0) {
        config.logger.error('Internal MythX errors encountered:');
        errors.forEach(err => {
            config.logger.error(err.error || err);
            if (config.debug > 1 && err.stack) {
                config.logger.log(err.stack);
            }
        });
    }
}

// A stripped-down listing for issues.
// We will need this until we can beef up information in UUID retrieval
function ghettoReport(logger, results) {
    if (results.length === 0) {
        logger('No issues found');
        return;
    }
    for (const group of results) {
        logger(group.sourceList.join(', '));
        for (const issue of group.issues) {
            logger(yaml.safeDump(issue));
        }
    }
}

const getNotFoundContracts = (mythXIssuesObjects, contracts) => {
    if (!contracts || contracts.length === 0) {
        return [];
    }
    const mythxContracts = mythXIssuesObjects.map(({ contractName }) => contractName);
    return contracts.filter(c => !mythxContracts.includes(c));
}

const getArmletClient = (ethAddress, password, clientToolName = 'truffle') => {
    const options = { clientToolName };
    if (password && ethAddress) {
        options.ethAddress = ethAddress;
        options.password = password;
    } else if (!password && !ethAddress) {
        options.ethAddress = trialEthAddress;
        options.password = trialPassword;
    }

    return new armlet.Client(options);
}

/**
 *
 * @param {Object} config - truffle configuration object.
 */
async function analyze(config) {
    const limit = config.limit || defaultAnalyzeRateLimit;
    const log = config.logger.log;
    if (isNaN(limit)) {
        log(`limit parameter should be a number; got ${limit}.`);
        return;
    }
    if (limit < 0 || limit > defaultAnalyzeRateLimit) {
        log(`limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`);
        return;
    }

    const client = getArmletClient(
        process.env.MYTHX_ETH_ADDRESS,
        process.env.MYTHX_PASSWORD
    )

    if (config.uuid) {
        try {
            const results = await client.getIssues(config.uuid);
            ghettoReport(log, results);
        } catch (err) {
            log(err);
        }
        return ;
    }

    await contractsCompile(config);


    // Extract list of contracts passed in cli to verify
    const contractNames = config._.length > 1 ? config._.slice(1, config._.length) : null;

    // Get list of smart contract build json files from truffle build folder
    const jsonFiles = await trufstuf.getTruffleBuildJsonFiles(config.contracts_build_directory);

    if (!config.style) {
        config.style = 'stylish';
    }

    const { objects, errors } = await doAnalysis(client, config, jsonFiles, contractNames, limit);
    const notFoundContracts = getNotFoundContracts(objects, contractNames);
    doReport(config, objects, errors, notFoundContracts);
}


/**
 * A 2-level line-column comparison function.
 * @returns {integer} -
      zero:      line1/column1 == line2/column2
      negative:  line1/column1 < line2/column2
      positive:  line1/column1 > line2/column2
*/
function compareLineCol(line1, column1, line2, column2) {
    return line1 === line2 ?
        (column1 - column2) :
        (line1 - line2);
}

/**
 * A 2-level comparison function for eslint message structure ranges
 * the fields off a message
 * We use the start position in the first comparison and then the
 * end position only when the start positions are the same.
 *
 * @returns {integer} -
      zero:      range(mess1) == range(mess2)
      negative:  range(mess1) <  range(mess2)
      positive:  range(mess1) > range(mess)

*/
function compareMessLCRange(mess1, mess2) {
    const c = compareLineCol(mess1.line, mess1.column, mess2.line, mess2.column);
    return c != 0 ? c : compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
}


/**
 * Temporary function which turns eslint issues grouped by filepath
 * to eslint issues rouped by filename.

 * @param {ESLintIssue[]}
 * @returns {ESListIssue[]}
 */
const groupEslintIssuesByBasename = issues => {
    const path = require('path');
    const mappedIssues = issues.reduce((accum, issue) => {
        const {
            errorCount,
            warningCount,
            fixableErrorCount,
            fixableWarningCount,
            filePath,
            messages,
        } = issue;

        const basename = path.basename(filePath);
        if (!accum[basename]) {
            accum[basename] = {
                errorCount: 0,
                warningCount: 0,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: filePath,
                messages: [],
            };
        }
        accum[basename].errorCount += errorCount;
        accum[basename].warningCount += warningCount;
        accum[basename].fixableErrorCount += fixableErrorCount;
        accum[basename].fixableWarningCount += fixableWarningCount;
        accum[basename].messages = accum[basename].messages.concat(messages);
        return accum;
    }, {});

    const issueGroups = Object.values(mappedIssues);
    for (const group of issueGroups) {
        group.messages = group.messages.sort(function(mess1, mess2) {
            return compareMessLCRange(mess1, mess2);
        });

    }
    return issueGroups;
};


module.exports = {
    analyze,
    defaultAnalyzeRateLimit,
    compareLineCol,
    versionJSON2String,
    printVersion,
    printHelpMessage,
    contractsCompile,
    doAnalysis,
    cleanAnalyDataEmptyProps,
    getArmletClient,
    trialEthAddress,
    trialPassword,
    getNotFoundContracts,
};
