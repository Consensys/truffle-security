'use strict';
const mythxjsClient = require('mythxjs').Client;
const armlet = require('armlet');
const contracts = require('../lib/wfc');
const eslintHelpers = require('../lib/eslint');
const path = require('path');
const trufstuf = require('../lib/trufstuf');
const mythx = require('../lib/mythx');

const asyncPool = require('tiny-async-pool');
const multiProgress = require('multi-progress');
const { MythXIssues } = require('../lib/issues2eslint');
const sleep = require('sleep');

/** Parent class for API interaction.
 * Stores globally relevant variables and functions for API clients.
 */
class APIClient {
    constructor(apiClientType, config, clientToolName) {

        const ethAddress = process.env.MYTHX_ETH_ADDRESS;
        const password = process.env.MYTHX_PASSWORD;

        const options = { clientToolName };

        if (password && ethAddress) {
            options.ethAddress = ethAddress;
            options.password = password;
        } else if (!password && !ethAddress) {
            options.ethAddress = trialEthAddress;
            options.password = trialPassword;
        }

        switch(apiClientType) {
            case "armlet":
                this.apiClientType = 'Armlet';
                this.client = new armlet.Client(options);
                break;
            default:
                this.apiClientType = 'MythXJS';
                this.client = new mythxjsClient(options.ethAddress, options.password);
                break;
        }

        this.clientToolName = clientToolName;
        this.verifyOptions = options;
        this.config = config;
        this.defaultAnalyzeRateLimit = 4;
        this.compareMessLCRange = this.compareMessLCRange.bind(this);

    }


    buildObjForContractName(allBuildObjs, contractName) {
        // Deprecated. Delete this for v2.0.0
        const buildObjsThatContainContract = allBuildObjs.filter(buildObj =>
            Object.keys(buildObj.sources).filter(sourceKey =>
                buildObj.sources[sourceKey].contracts.filter(contract =>
                    contract.contractName == contractName
                ).length > 0
            ).length > 0
        )
        if(buildObjsThatContainContract.length == 0) return null;
        return buildObjsThatContainContract.reduce((prev, curr) => Object.keys(prev.sources).length < Object.keys(curr.sources).length ? prev : curr)
    }

    async analyze(){
        try {
            let { client, config, defaultAnalyzeRateLimit } = this;
            const { log, error } = config.logger;

            const limit = config.limit || defaultAnalyzeRateLimit;

            if (isNaN(limit)) {
                log(`limit parameter should be a number; got ${limit}.`);
                return 1;
            }
            if (limit < 0 || limit > defaultAnalyzeRateLimit) {
                log(`limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`);
                return 1;
            }

            const progress = ('debug' in config) ? false : (('progress' in config) ? config.progress : true);

            // Only works with armlet currently
            let id;
            console.log(await client.login());
            if (progress) {
                const users = (this.apiClientType === 'MythXJS'? await client.getUsers() : await client.getUserInfo()).users;
                console.log(users);
                let roles;
            if(users) {
                roles = users[0].roles;
                id = users[0].id
            }

            if(id === "123456789012345678901234") { // Trial user id
                const prefix = "You are currently running MythX in Trial mode. This mode reports only a partial analysis of your smart contracts, limited to three vulnerabilities. To get a complete analysis, sign up for a free MythX account at https://mythx.io.\n";
                log(prefix);

                const question = "Would you like to continue with a partial analysis [Y/n]?";
                const r = (await inquirer.prompt([{
                    "name": "cont",
                    "message": question,
                }])).cont;

                const re = /(n|no)/i
                if(re.exec(r)) {
                    process.exit(0);
                }
                log("\nContinuing with MythX Trial mode...\n");
            } else if(roles.includes('privileged_user')) {
                log("Welcome to MythX! You are currently running in Premium mode.\n");
            } else if(roles.includes('regular_user')) {
                log("Welcome to MythX! You are currently running in Free mode.\n");
            }
            }

            if (config.uuid) {
                try {
                    const results = await client.getIssues(config.uuid);
                    return ghettoReport(log, results);
                } catch (err) {
                    log(err);
                    return 1;
                }
            }

            // Extract list of contracts passed in cli to verify
            const selectedContracts = config._.length > 1 ? config._.slice(1, config._.length) : null;

            config.build_mythx_contracts = path.join(config.build_directory,
                                                    "mythx", "contracts");
            await this.contractsCompile(config);

            // Get list of smart contract build json files from truffle build folder
            const jsonFiles = await trufstuf.getTruffleBuildJsonFiles(config.build_mythx_contracts);

            if (!config.style) {
                config.style = 'stylish';
            }

            const allBuildObjs = await Promise.all(jsonFiles.map(async file => await trufstuf.parseBuildJson(file)));


            let objContracts = [];
            if (selectedContracts) {
                // User specified contracts; only analyze those
                await Promise.all(selectedContracts.map(async selectedContract => {
                    const [contractFile, contractName] = selectedContract.split(':');

                    let fullPath = path.resolve(contractFile);
                    if (path.sep === '\\') {
                        const regex = new RegExp('\\\\', 'g');
                        fullPath = fullPath.replace(regex, '/');
                    }


                    let buildObj = this.buildObjForSourcePath(allBuildObjs, fullPath)
                    if(!buildObj) {
                        if(!contractName) {
                            buildObj = buildObjForContractName(allBuildObjs, contractFile)
                        }
                        if(!buildObj) {
                            log(`Cound not find file: ${contractFile}.`.red)
                            return;
                        }
                        if(progress) {
                            log(`DEPRECATION WARNING: Found contract named "${contractFile}". Analyzing contracts by name will be removed in a later version.`.yellow)
                        }
                    }

                    const contracts = mythx.newTruffleObjToOldTruffleByContracts(buildObj);

                    if (contractName) {
                        // All non-imported contracts from file with same name.
                        const foundContracts = contracts.filter(contract =>
                            contract.contractName == contractName &&
                            buildObjIsCorrect(allBuildObjs, contract, buildObj)
                        )

                        foundContracts.forEach(contract => {
                            objContracts.push({
                                contractName: contractName,
                                contract: contract
                            });
                        })

                        if(foundContracts.length == 0) {
                            error(`Contract ${contractName} not found in ${contractFile}.`.red)
                        }
                    } else {
                        // No contractName; add all non-imported contracts from the file.
                        contracts.filter(contract =>
                            buildObjIsCorrect(allBuildObjs, contract, buildObj)
                        ).forEach(contract => {
                            objContracts.push({
                                contractName: contract.contractName,
                                contract: contract
                            });
                        })
                    }
                }));
            } else {
                // User did not specify contracts; analyze everything
                // How to avoid duplicates: From all lists of contracts that include ContractX, the shortest list is gaurenteed
                // to be the one where it was compiled in because only it and its imports are needed, and contracts that import it
                // will not be included.
                allBuildObjs.map(async buildObj => {
                    const contracts = mythx.newTruffleObjToOldTruffleByContracts(buildObj);
                    contracts.filter(contract => {

                        const correctBuildObj = this.buildObjForSourcePath(allBuildObjs, contract.sourcePath)
                        // If the length is the same and the contract is in it, they are the same object.
                        if(correctBuildObj && Object.keys(correctBuildObj.sources).length == Object.keys(buildObj.sources).length) {
                            return true;
                        }
                        return false;
                    }).forEach(contract => {
                        objContracts.push({
                            contractName: contract.contractName,
                            contract: contract
                        });
                    })
                });
            }

            if(objContracts.length == 0) {
                error("No contracts found, aborting analysis.".red);
                process.exit(1);
            }

            // Do login before calling `analyzeWithStatus` of `armlet` which is called in `doAnalysis`.
            // `analyzeWithStatus` does login to Mythril-API within it.
            // However `doAnalysis` calls `analyzeWithStatus` simultaneously several times,
            // as a result, it causes unnecesarry login requests to Mythril-API. (It ia a kind of race condition problem)
            // refer to https://github.com/ConsenSys/armlet/pull/64 for the detail.
            await client.login();
            const { objects, errors } = await this.doAnalysis(objContracts, limit);
            const result = await this.doReport(objects, errors);
            if(progress && id === "123456789012345678901234") {
                config.logger.log("You are currently running MythX in Trial mode, which returns a maximum of three vulnerabilities per contract. Sign up for a free account at https://mythx.io to run a complete report.");
            }
            return result;
        }
        catch(e) {
            console.log('Error: ', e);
        }
    }


    /**
     * Runs MythX security analyses on smart contract files found
     * in truffle build folder
     *
     * @param {Array<String>} contracts - List of smart contract.

     * @returns {Promise} - Resolves array of hashmaps with issues for each contract.
     */
    async doAnalysis( contracts, limit = this.defaultAnalyzeRateLimit) {
      let { client, config } = this;
      const timeout = (config.timeout || 300) * 1000;
      const initialDelay = ('initial-delay' in config) ? config['initial-delay'] * 1000 : undefined;
      const cacheLookup = ('cache-lookup' in config) ? config['cache-lookup'] : true;

      /**
       * Prepare for progress bar
       */
      const progress = ('debug' in config) ? false : (('progress' in config) ? config.progress : true);
      let multi;
      let indent;
      if (progress) {
          multi = new multiProgress();
          const contractNames = contracts.map(({ contractName }) => contractName);
          indent = contractNames.reduce((max, next) => max > next.length ? max : next.length);
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

          analyzeOpts.data = this.cleanAnalyzeDataEmptyProps(obj.buildObj, config.debug,
                                                      config.logger.debug);
          analyzeOpts.data.analysisMode = config.mode || 'quick';
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
              // let {issues, status} = await client.analyzeWithStatus(analyzeOpts, timeout, initialDelay);
              let {issues, status} = await this.doAnalysisFromClient(analyzeOpts, timeout, initialDelay);
              issues = issues.filter(({ sourceFormat }) => sourceFormat !== 'evm-byzantium-bytecode')
              obj.uuid = status.uuid;
              if (config.debug) {
                  config.logger.debug(`${analyzeOpts.data.contractName}: UUID is ${status.uuid}`);
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
              if (errStr.includes('User or default timeout reached after')
              || errStr.includes('Timeout reached after')) {
                  if (progress) {
                      bar.tick({
                          'status': `✗ timeout`.yellow
                      });
                      bar.terminate();    // terminate since bar.complete is false at this time
                  }
                  return [(buildObj.contractName + ": ").yellow + errStr, null];
              } else {
                  if (progress) {
                      bar.tick({
                          'status': '✗ error'.red
                      });
                      bar.terminate();    // terminate since bar.complete is false at this time
                  }
                  return [(buildObj.contractName + ": ").red + errStr, null];
              }
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


    // FIXME: util.promisify breaks compile internal call to writeContracts
    // const contractsCompile = util.promisify(contracts.compile);
    contractsCompile(config) {
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


    buildObjForSourcePath(allBuildObjs, sourcePath) {
        // From all lists of contracts that include ContractX, the shortest list is gaurenteed to be the
        // one it was compiled in because only it and its imports are needed, and contracts that import it
        // will not be included.
        // Note - When an imported contract is changed, currently the parent isn't recompiled, meaning that if contracts are added to
        // an imported contract and the parent isn't modified, it is possible that an incorrect build object will be chosen.
        // The parent's build object would need to be updated with the extra contracts that were imported.

        const buildObjsThatContainFile = allBuildObjs.filter(buildObj =>
            Object.keys(buildObj.sources).includes(sourcePath)
        )
        if(buildObjsThatContainFile.length == 0) return null;
        return buildObjsThatContainFile.reduce((prev, curr) => Object.keys(prev.sources).length < Object.keys(curr.sources).length ? prev : curr)
    }


    /*

    Removes bytecode fields from analyze data input if it is empty.
    This which can as a result of minor compile problems.

    We still want to submit to get analysis which can work just on the
    source code or AST. But we want to remove the fields so we don't
    get complaints from MythX. We will manage what we want to say.
    */
    cleanAnalyzeDataEmptyProps(data, debug, logger) {
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
            logger(`${props.contractName}: Empty JSON data fields from compilation - ${unusedFields.join(', ')}`);
        }

        return result;
    }


    async doReport(objects, errors) {
        const { config } = this;
        let ret = 0;

        // Return true if we shold show log.
        // Ignore logs with log.level "info" unless the "debug" flag
        // has been set.
        function showLog(log) {
            return config.debug || (log.level !== 'info');
        }

        // Return 1 if some vulenrabilities were found.
        objects.forEach(ele => {
            ele.issues.forEach(ele => {
                ret = ele.issues.length > 0 ? 1 : ret;
            })
        })

        if (config.yaml) {
            const yamlDumpObjects = objects;
            for(let i = 0; i < yamlDumpObjects.length; i++) {
            delete yamlDumpObjects[i].logger;
            }
            config.logger.log(yaml.safeDump(yamlDumpObjects, {'skipInvalid': true}));
        } else if (config.json) {
            config.logger.log(JSON.stringify(objects, null, 4));
        } else {
            const spaceLimited = ['tap', 'markdown', 'json'].indexOf(config.style) === -1;
            const eslintIssues = objects
                .map(obj => obj.getEslintIssues(config, spaceLimited))
                .reduce((acc, curr) => acc.concat(curr), []);

            // FIXME: temporary solution until backend will return correct filepath and output.
            const eslintIssuesByBaseName = await this.groupEslintIssuesByBasename(eslintIssues);
            const uniqueIssues = eslintHelpers.getUniqueIssues(eslintIssuesByBaseName);

            const formatter = this.getFormatter(config.style);
            config.logger.log(formatter(uniqueIssues));
        }

        const logGroups = objects.map(obj => { return {'sourcePath': obj.sourcePath, 'logs': obj.logs, 'uuid': obj.uuid};})
            .reduce((acc, curr) => acc.concat(curr), []);

        let haveLogs = false;
        logGroups.some(logGroup => {
            logGroup.logs.some(log => {
                if (showLog(log)) {
                    haveLogs = true;
                    return;
                }
            });
            if(haveLogs) return;
        });

        if (haveLogs) {
            ret = 1;
            config.logger.log('MythX Logs:'.yellow);
            logGroups.forEach(logGroup => {
                config.logger.log(`\n${logGroup.sourcePath}`.yellow);
                config.logger.log(`UUID: ${logGroup.uuid}`.yellow);
                logGroup.logs.forEach(log => {
                    if (showLog(log)) {
                        config.logger.log(`${log.level}: ${log.msg}`);
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
    ghettoReport(logger, results) {
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
                logger(yaml.safeDump(issue, {'skipInvalid': true}));
            }
        }
        return 1;
    }


    /**
     * Temporary function which turns eslint issues grouped by filepath
     * to eslint issues rouped by filename.

    * @param {ESLintIssue[]}
    * @returns {ESListIssue[]}
    */
    async groupEslintIssuesByBasename(issues) {
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
        let thisUnscoped = this;

        for (const group of issueGroups) {
            group.messages = group.messages.sort(function(mess1, mess2) {
                return thisUnscoped.compareMessLCRange(mess1, mess2);
            });

        }
        return issueGroups;
    };

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
    compareMessLCRange(mess1, mess2) {
        const c = this.compareLineCol(mess1.line, mess1.column, mess2.line, mess2.column);
        return c != 0 ? c : this.compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
    }

    /**
     * A 2-level line-column comparison function.
     * @returns {integer} -
         zero:      line1/column1 == line2/column2
        negative:  line1/column1 < line2/column2
        positive:  line1/column1 > line2/column2
    */
    compareLineCol(line1, column1, line2, column2) {
        return line1 === line2 ?
            (column1 - column2) :
            (line1 - line2);
    }

    /**
     *
     * Loads preferred ESLint formatter for warning reports.
     *
     * @param {String} style
     * @returns ESLint formatter module
     */
    getFormatter(style) {
        const formatterName = style || 'stylish';
        try {
            if(formatterName == "markdown") {
                return require('../compat/eslint-formatter-markdown/markdown')
            }
            return require(`eslint/lib/formatters/${formatterName}`);
        } catch (ex) {
            ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
                ex.message
            }`;
            throw ex;
        }
    }




}

module.exports = APIClient;
