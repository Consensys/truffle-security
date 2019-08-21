'use strict';

const armlet = require('armlet');
const path = require('path');
const trufstuf = require('./lib/trufstuf');
const { MythXIssues } = require('./lib/issues2eslint');
const eslintHelpers = require('./lib/eslint');
const contracts = require('./lib/wfc');
const mythx = require('./lib/mythx');
const util = require('util');
const yaml = require('js-yaml');
const asyncPool = require('tiny-async-pool');
const multiProgress = require('multi-progress');
const sleep = require('sleep');
const inquirer = require('inquirer');

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
                return;
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
        if (formatterName == 'markdown') {
            return require('./compat/eslint-formatter-markdown/markdown');
        }
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
    return Object.keys(jsonResponse)
        .sort()
        .map(key => `${key}: ${jsonResponse[key]}`)
        .join(', ');
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
  --mode { quick | full }
             Perform quick or in-depth (full) analysis.
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

/*

   Removes bytecode fields from analyze data input if it is empty.
   This which can as a result of minor compile problems.

   We still want to submit to get analysis which can work just on the
   source code or AST. But we want to remove the fields so we don't
   get complaints from MythX. We will manage what we want to say.
*/
const cleanAnalyzeDataEmptyProps = (data, debug, logger) => {
    const {
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        ...props
    } = data;
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
        logger(
            `${
                props.contractName
            }: Empty JSON data fields from compilation - ${unusedFields.join(
                ', '
            )}`
        );
    }

    return result;
};

const filterIssuesAndLocations = issues => {
    issues.filter(({ sourceFormat }) => {
        return sourceFormat !== 'evm-byzantium-bytecode';
    });

    if (issues && issues[0].issues) {
        issues[0].issues.map(issue => {
            if (issue.locations) {
                issue.locations = issue.locations.filter(location => {
                    return location.sourceFormat !== 'evm-byzantium-bytecode';
                });
            }

            if (issue.decodedLocations) {
                issue.decodedLocations = issue.decodedLocations.filter(
                    decodedLocation => {
                        return decodedLocation.length > 0;
                    }
                );
            }
        });
    }
};

/**
 * Runs MythX security analyses on smart contract files found
 * in truffle build folder
 *
 * @param {armlet.Client} client - instance of armlet.Client to send data to API.
 * @param {Object} config - Truffle configuration object.
 * @param {Array<String>} constracts - List of smart contract.
 * @param {Array<String>} contractNames - List of smart contract name to run analyze (*Optional*).
 * @returns {Promise} - Resolves array of hashmaps with issues for each contract.
 */
const doAnalysis = async (
    client,
    config,
    contracts,
    limit = defaultAnalyzeRateLimit
) => {
    const timeout =
        config.timeout || (config.mode === 'full' ? 125 * 60000 : 5 * 60000);

    const initialDelay =
        'initial-delay' in config ? config['initial-delay'] * 1000 : undefined;
    const cacheLookup =
        'cache-lookup' in config ? config['cache-lookup'] : true;

    /**
     * Prepare for progress bar
     */
    const progress =
        'debug' in config
            ? false
            : 'progress' in config
                ? config.progress
                : true;
    let multi;
    let indent;
    if (progress) {
        multi = new multiProgress();
        const contractNames = contracts.map(({ contractName }) => contractName);
        indent = contractNames.reduce((max, next) =>
            max > next.length ? max : next.length
        );
    }

    const results = await asyncPool(limit, contracts, async buildObj => {
        /**
         * If contractNames have been passed then skip analyze for unwanted ones.
         */

        const obj = new MythXIssues(buildObj.contract, config);
        let analyzeOpts = {
            clientToolName: 'truffle',
            noCacheLookup: !cacheLookup,
        };
        /**REMOVE THIS */
        // config.logger.debug('build obj', obj.buildObj);

        analyzeOpts.data = cleanAnalyzeDataEmptyProps(
            obj.buildObj,
            config.debug,
            config.logger.debug
        );

        /**REMOVE THIS */
        // config.logger.debug('analyseOpts.data', analyzeOpts.data);

        analyzeOpts.data.analysisMode = config.mode || 'quick';
        if (config.debug > 1) {
            config.logger.debug(
                `${util.inspect(analyzeOpts, { depth: null })}`
            );
        }

        // create progress bars.
        let bar;
        let timer;
        if (progress) {
            bar = multi.newBar(
                `${buildObj.contractName.padStart(indent)} |` +
                    ':bar'.cyan +
                    '| :percent || Elapsed: :elapseds :status',
                {
                    complete: '*',
                    incomplete: ' ',
                    width: Math.max(
                        Math.min(parseInt((timeout / 1000 / 300) * 100), 100),
                        40
                    ), // based on timeout, but the cap is 300 and the floor is 40.
                    total: timeout / 1000,
                }
            );
            timer = setInterval(() => {
                bar.tick({
                    status: 'in progress...',
                });
                if (bar.complete) {
                    clearInterval(timer);
                }
            }, 1000);
        }

        // request analysis to armlet.
        try {
            let { issues, status } = await client.analyzeWithStatus(
                analyzeOpts,
                timeout,
                initialDelay
            );

            filterIssuesAndLocations(issues);

            obj.uuid = status.uuid;
            if (config.debug) {
                config.logger.debug(
                    `${analyzeOpts.data.contractName}: UUID is ${status.uuid}`
                );
                if (config.debug > 1) {
                    config.logger.debug(
                        `${util.inspect(issues, { depth: null })}`
                    );
                    config.logger.debug(
                        `${util.inspect(status, { depth: null })}`
                    );
                }
            }

            if (progress) {
                clearInterval(timer);
                sleep.msleep(1000); // wait for last setInterval finising
            }

            if (status.status === 'Error') {
                if (progress) {
                    bar.tick({
                        status: '✗ Error'.red,
                    });
                    bar.terminate(); // terminate since bar.complete is false at this time
                }
                return [status, null];
            } else {
                if (progress) {
                    bar.tick(timeout / 1000, {
                        status: '✓ completed'.green,
                    });
                }
                obj.setIssues(issues);
            }
            return [null, obj];
        } catch (err) {
            if (progress) {
                clearInterval(timer);
                sleep.msleep(1000); // wait for last setInterval finising
            }

            let errStr;
            if (typeof err === 'string') {
                // It is assumed that err should be string here.
                errStr = `${err}`;
            } else if (typeof err.message === 'string') {
                // If err is Error, get message property.
                errStr = err.message;
            } else {
                // If err is unexpected type, coerce err to inspectable format.
                // This situation itself is not assumed, but this is for robustness and investigation.
                errStr = `${util.inspect(err)}`;
            }

            // Check error message from armlet to determine if a timeout occurred.
            if (
                errStr.includes('User or default timeout reached after') ||
                errStr.includes('Timeout reached after')
            ) {
                if (progress) {
                    bar.tick({
                        status: '✗ timeout'.yellow,
                    });
                    bar.terminate(); // terminate since bar.complete is false at this time
                }
                return [(buildObj.contractName + ': ').yellow + errStr, null];
            } else {
                if (progress) {
                    bar.tick({
                        status: '✗ error'.red,
                    });
                    bar.terminate(); // terminate since bar.complete is false at this time
                }
                return [(buildObj.contractName + ': ').red + errStr, null];
            }
        }
    });

    return results.reduce(
        (accum, curr) => {
            const [err, obj] = curr;
            if (err) {
                accum.errors.push(err);
            } else if (obj) {
                accum.objects.push(obj);
            }
            return accum;
        },
        { errors: [], objects: [] }
    );
};

function doReport(config, objects, errors) {
    let ret = 0;

    // Return true if we shold show log.
    // Ignore logs with log.level "info" unless the "debug" flag
    // has been set.
    function showLog(log) {
        return config.debug || log.level !== 'info';
    }

    // Return 1 if some vulenrabilities were found.
    objects.forEach(ele => {
        ele.issues.forEach(ele => {
            ret = ele.issues.length > 0 ? 1 : ret;
        });
    });

    if (config.yaml) {
        const yamlDumpObjects = objects;
        for (let i = 0; i < yamlDumpObjects.length; i++) {
            delete yamlDumpObjects[i].logger;
        }
        config.logger.log(
            yaml.safeDump(yamlDumpObjects, { skipInvalid: true })
        );
    } else if (config.json) {
        config.logger.log(JSON.stringify(objects, null, 4));
    } else {
        const spaceLimited =
            ['tap', 'markdown', 'json'].indexOf(config.style) === -1;
        const eslintIssues = objects
            .map(obj => obj.getEslintIssues(config, spaceLimited))
            .reduce((acc, curr) => acc.concat(curr), []);

        // FIXME: temporary solution until backend will return correct filepath and output.
        const eslintIssuesByBaseName = groupEslintIssuesByBasename(
            eslintIssues
        );

        const uniqueIssues = eslintHelpers.getUniqueIssues(
            eslintIssuesByBaseName
        );

        const formatter = getFormatter(config.style);
        let formatterResult;
        const rulesMeta = uniqueIssues.reduce((resultData, issue) => {
            issue.messages.forEach(({ ruleId }) => {
                if (!resultData[ruleId]) {
                    resultData[ruleId] = {
                        docs: {
                            url: `https://smartcontractsecurity.github.io/SWC-registry/docs/${ruleId}`,
                        },
                    };
                }
            });
            return resultData;
        }, {});

        formatterResult = formatter(uniqueIssues, { rulesMeta });
        config.logger.log(formatterResult);
    }

    const logGroups = objects
        .map(obj => {
            return {
                sourcePath: obj.sourcePath,
                logs: obj.logs,
                uuid: obj.uuid,
            };
        })
        .reduce((acc, curr) => acc.concat(curr), []);

    let haveLogs = false;
    logGroups.some(logGroup => {
        logGroup.logs.some(log => {
            if (showLog(log)) {
                haveLogs = true;
                return;
            }
        });
        if (haveLogs) return;
    });

    if (haveLogs) {
        ret = 1;
        config.logger.log('MythX Logs:'.yellow);
        logGroups.forEach(logGroup => {
            config.logger.log(`\n${logGroup.sourcePath}`.yellow);
            config.logger.log(`UUID: ${logGroup.uuid}`.yellow);
            logGroup.logs.forEach(log => {
                if (showLog(log) && log.length > 0) {
                    config.logger.log(`${log[0].level}: ${log[0].msg}`);
                }
            });
        });
    }

    if (errors.length > 0) {
        ret = 1;
        config.logger.error('Internal MythX errors encountered:'.red);
        errors.forEach(err => {
            config.logger.error(err.error || err);
            if (config.debug > 1 && err.stack) {
                config.logger.log(err.stack);
            }
        });
    }

    return ret;
}

// A stripped-down listing for issues.
// We will need this until we can beef up information in UUID retrieval
function ghettoReport(logger, results) {
    let issuesCount = 0;
    results.forEach(ele => {
        issuesCount += ele.issues.length;
    });

    if (issuesCount === 0) {
        logger('No issues found');
        return 0;
    }
    for (const group of results) {
        logger(group.sourceList.join(', ').underline);
        for (const issue of group.issues) {
            logger(yaml.safeDump(issue, { skipInvalid: true }));
        }
    }
    return 1;
}

function setConfigSeverityLevel(inputSeverity) {
    // converting severity to a number makes it easier to deal with in `issues2eslint.js`
    const severity2Number = {
        error: 2,
        warning: 1,
    };

    // default to `warning`
    return severity2Number[inputSeverity] || 1;
}

function setConfigSWCBlacklist(inputBlacklist) {
    if (!inputBlacklist) {
        return false;
    }

    return inputBlacklist
        .toString()
        .split(',')
        .map(swc => 'SWC-' + swc.trim());
}

/**
 * Modifies attributes of the Truffle configuration object
 * in order to use project-defined options
 *
 * @param {Object} config - Truffle configuration object.
 * @returns {Oject} config - Extended Truffle configuration object.
 */

function prepareConfig(config) {
    // merge project level configuration
    let projectConfig;
    try {
        projectConfig = require([
            config.working_directory,
            'truffle-security',
        ].join('/'));
    } catch (ex) {
        projectConfig = {};
        if (config.debug) {
            config.logger.log(
                'truffle-security.json either not found or improperly formatted. Default options will be applied.'
            );
        }
    }

    const projectLevelKeys = Object.keys(projectConfig);

    projectLevelKeys.forEach(function(property) {
        if (!config.hasOwnProperty(property)) {
            config[property] = projectConfig[property];
        }
    });

    // modify and extend initial config params
    config.severityThreshold = setConfigSeverityLevel(config['min-severity']);
    config.swcBlacklist = setConfigSWCBlacklist(config['swc-blacklist']);

    return config;
}

function verifyConfig(config) {
    const limit = config.limit || defaultAnalyzeRateLimit;

    if (isNaN(limit)) {
        return `limit parameter should be a number; got ${limit}.`;
    }
    if (limit < 0 || limit > defaultAnalyzeRateLimit) {
        return `limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`;
    }
    try {
        getFormatter(config.style);
    } catch (e) {
        return 'style is not a valid eslint formatter.';
    }
    if (config.mode && !['quick', 'full'].includes(config.mode)) {
        return 'mode must be \'quick\' or \'full\'';
    }
    if (config.uuid === true) {
        return 'uuid must be specified';
    }
    if (['warning', 'error'].includes(config.minSeverity)) {
        return 'minSeverity must be \'warning\' or \'error\'';
    }
    if (config.timeout === true) {
        return 'timeout not set';
    }
    if (config.initialDelay === true) {
        return 'initial-delay not set';
    }

    return null;
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
};

const buildObjForContractName = (allBuildObjs, contractName) => {
    // Deprecated. Delete this for v2.0.0
    const buildObjsThatContainContract = allBuildObjs.filter(
        buildObj =>
            Object.keys(buildObj.sources).filter(
                sourceKey =>
                    buildObj.sources[sourceKey].contracts.filter(
                        contract => contract.contractName == contractName
                    ).length > 0
            ).length > 0
    );
    if (buildObjsThatContainContract.length == 0) return null;
    return buildObjsThatContainContract.reduce((prev, curr) =>
        Object.keys(prev.sources).length < Object.keys(curr.sources).length
            ? prev
            : curr
    );
};

const buildObjForSourcePath = (allBuildObjs, sourcePath) => {
    // From all lists of contracts that include ContractX, the shortest list is gaurenteed to be the
    // one it was compiled in because only it and its imports are needed, and contracts that import it
    // will not be included.
    // Note - When an imported contract is changed, currently the parent isn't recompiled, meaning that if contracts are added to
    // an imported contract and the parent isn't modified, it is possible that an incorrect build object will be chosen.
    // The parent's build object would need to be updated with the extra contracts that were imported.

    const buildObjsThatContainFile = allBuildObjs.filter(buildObj =>
        Object.keys(buildObj.sources).includes(sourcePath)
    );
    if (buildObjsThatContainFile.length == 0) return null;
    return buildObjsThatContainFile.reduce((prev, curr) =>
        Object.keys(prev.sources).length < Object.keys(curr.sources).length
            ? prev
            : curr
    );
};

const buildObjIsCorrect = (allBuildObjs, contract, buildObj) => {
    // Whether or not the given build object is the one where the given contract was compiled to.
    // false if the contract is not in the build object or if it was an import

    const correctBuildObj = buildObjForSourcePath(
        allBuildObjs,
        contract.sourcePath
    );
    // If the length is the same and the contract is in it, they are the same object and it is not an import.
    if (
        correctBuildObj &&
        Object.keys(correctBuildObj.sources).length ==
            Object.keys(buildObj.sources).length
    ) {
        return true;
    }
    return false;
};

/**
 *
 * @param {Object} config - truffle configuration object.
 */
async function analyze(config) {
    config = prepareConfig(config);

    const err = verifyConfig(config);
    if (err) {
        config.logger.error(err);
        return 1;
    }

    const limit = config.limit || defaultAnalyzeRateLimit;

    const client = getArmletClient(
        process.env.MYTHX_ETH_ADDRESS,
        process.env.MYTHX_PASSWORD
    );

    const progress =
        'debug' in config
            ? false
            : 'progress' in config
                ? config.progress
                : true;

    let id;
    if (progress) {
        const users = (await client.getUserInfo()).users;
        let roles;
        if (users) {
            roles = users[0].roles;
            id = users[0].id;
        }

        if (id === '123456789012345678901234') {
            // Trial user id
            const prefix =
                'You are currently running MythX in Trial mode. This mode reports only a partial analysis of your smart contracts, limited to three vulnerabilities. To get a complete analysis, sign up for a free MythX account at https://mythx.io.\n';
            config.logger.log(prefix);

            const question =
                'Would you like to continue with a partial analysis [Y/n]?';
            const r = (await inquirer.prompt([
                {
                    name: 'cont',
                    message: question,
                },
            ])).cont;

            const re = /(n|no)/i;
            if (re.exec(r)) {
                process.exit(0);
            }
            config.logger.log('\nContinuing with MythX Trial mode...\n');
        } else if (roles.includes('Premium')) {
            config.logger.log(
                'Welcome to MythX! You are currently running in Premium mode.\n'
            );
        } else if (roles.includes('Free')) {
            config.logger.log(
                'Welcome to MythX! You are currently running in Free mode.\n'
            );
        }
    }

    if (config.uuid) {
        try {
            const results = await client.getIssues(config.uuid);
            return ghettoReport(config.logger.log, results);
        } catch (err) {
            config.logger.error(err);
            return 1;
        }
    }

    // Extract list of contracts passed in cli to verify
    const selectedContracts =
        config._.length > 1 ? config._.slice(1, config._.length) : null;

    config.build_mythx_contracts = path.join(
        config.build_directory,
        'mythx',
        'contracts'
    );
    await contractsCompile(config);

    // Get list of smart contract build json files from truffle build folder
    const jsonFiles = await trufstuf.getTruffleBuildJsonFiles(
        config.build_mythx_contracts
    );

    if (!config.style) {
        config.style = 'stylish';
    }

    const allBuildObjs = await Promise.all(
        jsonFiles.map(async file => await trufstuf.parseBuildJson(file))
    );

    let objContracts = [];
    if (selectedContracts) {
        // User specified contracts; only analyze those
        await Promise.all(
            selectedContracts.map(async selectedContract => {
                const [contractFile, contractName] = selectedContract.split(
                    ':'
                );

                let fullPath = path.resolve(contractFile);
                if (path.sep === '\\') {
                    const regex = new RegExp('\\\\', 'g');
                    fullPath = fullPath.replace(regex, '/');
                }

                let buildObj = buildObjForSourcePath(allBuildObjs, fullPath);
                if (!buildObj) {
                    if (!contractName) {
                        buildObj = buildObjForContractName(
                            allBuildObjs,
                            contractFile
                        );
                    }
                    if (!buildObj) {
                        config.logger.log(
                            `Cound not find file: ${contractFile}.`.red
                        );
                        return;
                    }
                    if (progress) {
                        config.logger.log(
                            `DEPRECATION WARNING: Found contract named "${contractFile}". Analyzing contracts by name will be removed in a later version.`
                                .yellow
                        );
                    }
                }

                const contracts = mythx.newTruffleObjToOldTruffleByContracts(
                    buildObj
                );

                if (contractName) {
                    // All non-imported contracts from file with same name.
                    const foundContracts = contracts.filter(
                        contract =>
                            contract.contractName == contractName &&
                            buildObjIsCorrect(allBuildObjs, contract, buildObj)
                    );

                    foundContracts.forEach(contract => {
                        objContracts.push({
                            contractName: contractName,
                            contract: contract,
                        });
                    });

                    if (foundContracts.length == 0) {
                        config.logger.error(
                            `Contract ${contractName} not found in ${contractFile}.`
                                .red
                        );
                    }
                } else {
                    // No contractName; add all non-imported contracts from the file.
                    contracts
                        .filter(contract =>
                            buildObjIsCorrect(allBuildObjs, contract, buildObj)
                        )
                        .forEach(contract => {
                            objContracts.push({
                                contractName: contract.contractName,
                                contract: contract,
                            });
                        });
                }
            })
        );
    } else {
        // User did not specify contracts; analyze everything
        // How to avoid duplicates: From all lists of contracts that include ContractX, the shortest list is gaurenteed
        // to be the one where it was compiled in because only it and its imports are needed, and contracts that import it
        // will not be included.
        allBuildObjs.map(async buildObj => {
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(
                buildObj
            );

            contracts
                .filter(contract => {
                    const correctBuildObj = buildObjForSourcePath(
                        allBuildObjs,
                        contract.sourcePath
                    );
                    // If the length is the same and the contract is in it, they are the same object.
                    if (
                        correctBuildObj &&
                        Object.keys(correctBuildObj.sources).length ==
                            Object.keys(buildObj.sources).length
                    ) {
                        return true;
                    }
                    return false;
                })
                .forEach(contract => {
                    objContracts.push({
                        contractName: contract.contractName,
                        contract: contract,
                    });
                });
        });
    }

    if (objContracts.length == 0) {
        config.logger.error('No contracts found, aborting analysis.'.red);
        process.exit(1);
    }

    // Do login before calling `analyzeWithStatus` of `armlet` which is called in `doAnalysis`.
    // `analyzeWithStatus` does login to Mythril-API within it.
    // However `doAnalysis` calls `analyzeWithStatus` simultaneously several times,
    // as a result, it causes unnecesarry login requests to Mythril-API. (It ia a kind of race condition problem)
    // refer to https://github.com/ConsenSys/armlet/pull/64 for the detail.
    await client.login();

    const { objects, errors } = await doAnalysis(
        client,
        config,
        objContracts,
        limit
    );
    const result = doReport(config, objects, errors);
    if (progress && id === '123456789012345678901234') {
        config.logger.log(
            'You are currently running MythX in Trial mode, which returns a maximum of three vulnerabilities per contract. Sign up for a free account at https://mythx.io to run a complete report.'
        );
    }
    return result;
}

/**
 * A 2-level line-column comparison function.
 * @returns {integer} -
      zero:      line1/column1 == line2/column2
      negative:  line1/column1 < line2/column2
      positive:  line1/column1 > line2/column2
*/
function compareLineCol(line1, column1, line2, column2) {
    return line1 === line2 ? column1 - column2 : line1 - line2;
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
    const c = compareLineCol(
        mess1.line,
        mess1.column,
        mess2.line,
        mess2.column
    );
    return c != 0
        ? c
        : compareLineCol(
            mess1.endLine,
            mess1.endCol,
            mess2.endLine,
            mess2.endCol
        );
}

/**
 * Temporary function which turns eslint issues grouped by filepath
 * to eslint issues rouped by filename.

 * @param {ESLintIssue[]}
 * @returns {ESListIssue[]}
 */
const groupEslintIssuesByBasename = issues => {
    const mappedIssues = issues.reduce((accum, issue) => {
        const {
            errorCount,
            warningCount,
            fixableErrorCount,
            fixableWarningCount,
            filePath,
            messages,
        } = issue;

        const basename = filePath;
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
    setConfigSeverityLevel,
    setConfigSWCBlacklist,
    cleanAnalyzeDataEmptyProps,
    getArmletClient,
    trialEthAddress,
    trialPassword,
};
