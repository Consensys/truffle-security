'use strict';
const mythxjsClient = require('mythxjs').Client;
const armlet = require('armlet');

const { ghettoReport, doReport } = require('../utils/reports');
const {
    cleanAnalyzeDataEmptyProps,
    buildObjForContractName,
    buildObjForSourcePath,
    buildObjIsCorrect,
    contractsCompile,
} = require('../utils/buildutils');

const path = require('path');
const trufstuf = require('../lib/trufstuf');
const mythx = require('../lib/mythx');
const util = require('util');
const asyncPool = require('tiny-async-pool');
const multiProgress = require('multi-progress');
const { MythXIssues } = require('../lib/issues2eslint');
const sleep = require('sleep');
const inquirer = require('inquirer');
const uuid = require('uuid/v4');

const trialEthAddress = '0x0000000000000000000000000000000000000000';
const trialPassword = 'trial';
const defaultAnalyzeRateLimit = 4;

/** Parent class for API interaction.
 * Stores globally relevant variables and functions for API clients.
 */
class APIClient {
    constructor(apiClientType, config, clientToolName, test) {
        const ethAddress = process.env.MYTHX_ETH_ADDRESS;
        const password = process.env.MYTHX_PASSWORD;
        let apiUrl = process.env.MYTHX_API_URL;
        if (!apiUrl) {
          apiUrl = 'https://api.mythx.io/v1'
        }


        const options = { clientToolName };

        if (password && ethAddress) {
            options.ethAddress = ethAddress;
            options.password = password;
        } else if (!password && !ethAddress) {
            options.ethAddress = trialEthAddress;
            options.password = trialPassword;
        }
        switch (apiClientType) {
        case 'armlet':
            this.apiClientType = 'Armlet';
            this.client = new armlet.Client(options);
            break;
        default:
            this.apiClientType = 'MythXJS';
            this.client = new mythxjsClient(
                options.ethAddress,
                options.password,
                'truffle',
                apiUrl,
                config.apiKey ? config.apiKey : '',
            );
            break;
        }

        this.clientToolName = clientToolName;
        this.verifyOptions = options;
        this.config = config;
        this.defaultAnalyzeRateLimit = defaultAnalyzeRateLimit;
        this.group = undefined;
    }

    async analyze() {
        try {
            let { client, config, defaultAnalyzeRateLimit, group } = this;
            const { log, error } = config.logger;

            const limit = config.limit || defaultAnalyzeRateLimit;
            if (isNaN(limit)) {
                log(`limit parameter should be a number; got ${limit}.`);
                return 1;
            }
            if (limit < 0 || limit > defaultAnalyzeRateLimit) {
                log(
                    `limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`
                );
                return 1;
            }
            const progress =
                'debug' in config
                    ? false
                    : 'progress' in config
                        ? config.progress
                        : true;
            let id;

            if (!config.apiKey) {
              await client.login();
            }

            if (progress) {
                const users = (this.apiClientType === 'MythXJS'
                    ? await client.getUsers()
                    : await client.getUserInfo()
                ).users;
                let roles;
                if (users) {
                    roles = users[0].roles;
                    id = users[0].id;
                }

                if (id === '123456789012345678901234') {
                    // Trial user id
                    const prefix =
                        'You are currently running MythX in Trial mode. This mode reports only a partial analysis of your smart contracts, limited to three vulnerabilities. To get a complete analysis, sign up for a free MythX account at https://mythx.io.\n';
                    log(prefix);

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
                    log('\nContinuing with MythX Trial mode...\n');
                  } else {
                    let mode = 'Free';
                    if (roles.includes('admin')) mode = 'Admin';
                    else if (roles.includes('Professional')) mode = 'Professional';
                    // config.logger.log(
                    //     `Welcome to MythX! You are currently running in ${mode} mode.\n`,
                    // );
                    if (roles.includes('beta_user')) {
                        config.logger.log(
                            'You are recognized as a Beta user, who adopted MythX prior to its offical production release. We are very grateful for this!\n'
                        );
                  }
                }
            }
            if (config.uuid) {
                try {
                  let results;
                    if (this.apiClientType === 'MythXJS') {
                      results = await client.getDetectedIssues(config.uuid);
                    }
                    else {
                      results = await client.getIssues(config.uuid);
                    }
                    return ghettoReport(log, results);
                } catch (err) {
                    log(err);
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
                        const [
                            contractFile,
                            contractName,
                        ] = selectedContract.split(':');
                        let fullPath;
                        fullPath = path.resolve(contractFile);


                        if (path.sep === '\\') {
                            const regex = new RegExp('\\\\', 'g');
                            fullPath = fullPath.replace(regex, '/');
                        }

                        let buildObj = buildObjForSourcePath(
                            allBuildObjs,
                            fullPath
                        );

                        if (!buildObj) {
                            if (!contractName) {
                                buildObj = buildObjForContractName(
                                    allBuildObjs,
                                    contractFile
                                );
                            }
                            if (!buildObj) {
                                log(
                                    `Cound not find file: ${contractFile}.`.red
                                );

                                return 1;
                            }
                            if (progress) {
                                log(
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
                                    buildObjIsCorrect(
                                        allBuildObjs,
                                        contract,
                                        buildObj
                                    )
                            );

                            foundContracts.forEach(contract => {
                                objContracts.push({
                                    contractName: contractName,
                                    contract: contract,
                                });
                            });

                            if (foundContracts.length == 0) {
                                error(
                                    `Contract ${contractName} not found in ${contractFile}.`
                                        .red
                                );
                            }
                        } else {
                            // No contractName; add all non-imported contracts from the file.
                            contracts
                                .filter(contract =>
                                    buildObjIsCorrect(
                                        allBuildObjs,
                                        contract,
                                        buildObj
                                    )
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
                error('No contracts found, aborting analysis.'.red);
                process.exit(1);
            }
            // Do login before calling `analyzeWithStatus` of `armlet` which is called in `doAnalysis`.
            // `analyzeWithStatus` does login to Mythril-API within it.
            // However `doAnalysis` calls `analyzeWithStatus` simultaneously several times,
            // as a result, it causes unnecesarry login requests to Mythril-API. (It ia a kind of race condition problem)
            // refer to https://github.com/ConsenSys/armlet/pull/64 for the detail.

            const { objects, errors } = await this.doAnalysis(
                objContracts,
                limit
            );
            let isTrial = false;

            if (id === '123456789012345678901234') {
              isTrial = true;
            }

            const issues = await doReport(objects, errors, config, isTrial, this.group);
            if (progress && isTrial) {
                config.logger.log(
                    'You are currently running MythX in Trial mode, which returns a maximum of three vulnerabilities per contract. Sign up for a free account at https://mythx.io to run a complete analysis and view online reports.'
                );
            }

            let { ci, ciWhitelist } = config;


            if (ci) {
              let swcIds = [];
              issues.map(issueGroup=> {
                issueGroup.forEach(issue => {
                  swcIds.push(issue.swcID.replace('SWC-', ''));
                })
              })

              if (ciWhitelist) {
                ciWhitelist = ciWhitelist.split(',');
                ciWhitelist.forEach(ciSwcId => {
                  swcIds= swcIds.filter(swcId => swcId !== ciSwcId);
                })
              }


              swcIds= swcIds.filter(swcId => swcId !== '-1');

              if (swcIds.length > 0) {
                return 1;
              }

            }


            return 0;
        } catch (e) {
            console.log('Error: ', e);
        }
    }

    filterIssuesAndLocations(issues) {
        issues.filter(({ sourceFormat }) => {
            return sourceFormat !== 'evm-byzantium-bytecode';
        });

        if (issues && issues[0] && issues[0].issues) {
            issues[0].issues.map(issue => {
                if (issue.locations) {
                    issue.locations = issue.locations.filter(location => {
                        return (
                            location.sourceFormat !== 'evm-byzantium-bytecode'
                        );
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
        return issues;

    }

    sigintFunction(config, groupId) {
      config.logger.log('\n Truffle Security has been cancelled early, you can view your reports here:'.red);
      config.logger.log(`https://dashboard.mythx.io/#/console/analyses/groups/${groupId}`.green);
      process.exit(0);
    }

    /**
     * Runs MythX security analyses on smart contract files found
     * in truffle build folder
     *
     * @param {Array<String>} contracts - List of smart contract.

     * @returns {Promise} - Resolves array of hashmaps with issues for each contract.
     */
    async doAnalysis(contracts, limit = this.defaultAnalyzeRateLimit) {
        const { client, config } = this;
        const timeout =
            config.timeout ||
            (config.mode === 'full' ? 125 * 60000 : 5 * 60000);
        const initialDelay =
            'initial-delay' in config
                ? config['initial-delay'] * 1000
                : undefined;
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
            const contractNames = contracts.map(
                ({ contractName }) => contractName
            );
            indent = contractNames.reduce((max, next) =>
                max > next.length ? max : next.length
            );
        }

        /* Create Group for analysis batch */
        this.group = await client.createGroup();
        const groupId = this.group.id;

        if (config.mythxLogs && config.mode === 'full') {
          config.logger.log('\n Full analyses may take a while to complete, you can view progress here:'.yellow);
          config.logger.log(`https://dashboard.mythx.io/#/console/analyses/groups/${groupId}`.green);
        }

        let sigintFunction = this.sigintFunction;
        if (config.mode === 'full') {
          process.on('SIGINT', function () {
            sigintFunction(config, groupId);

          });
          process.on('SIGTERM', function () {
            sigintFunction(config, groupId);

          });
        }

        const results = await asyncPool(limit, contracts, async buildObj => {
            /**
             * If contractNames have been passed then skip analyze for unwanted ones.
             */

            const obj = new MythXIssues(buildObj.contract, config);
            let analyzeOpts = {
                clientToolName: 'truffle',
                toolName: 'truffle',
                noCacheLookup: !cacheLookup,
            };

            obj.buildObj.groupId = groupId;

            analyzeOpts.data = cleanAnalyzeDataEmptyProps(
                obj.buildObj,
                config.debug,
                config.logger.debug
            );
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
                            Math.min(
                                parseInt((timeout / 1000 / 300) * 100),
                                100
                            ),
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

            try {
                // let {issues, status} = await client.analyzeWithStatus(analyzeOpts, timeout, initialDelay);
                let { issues, status } = await this.doAnalysisFromClient(
                    analyzeOpts,
                    timeout,
                    initialDelay
                );
                issues = this.filterIssuesAndLocations(issues, obj.sourcePath);

                obj.uuid = status.uuid;
                if (config.debug) {
                    config.logger.debug(
                        `${analyzeOpts.data.contractName}: UUID is ${
                            status.uuid
                        }`
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
                    return [
                        (buildObj.contractName + ': ').yellow + errStr,
                        null,
                    ];
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

        // Close the group after posting
        this.group = await client.groupOperation(groupId, 'seal_group');

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
    }
}

module.exports = APIClient;
