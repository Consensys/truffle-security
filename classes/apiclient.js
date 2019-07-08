'use strict';
const mythxjsClient = require('mythxjs').Client;
const armlet = require('armlet');
const contracts = require('../lib/wfc');
const eslintHelpers = require('../lib/eslint');


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
                this.client = new mythxJSClient(options.ethAddress, options.password);
                break;                
        }
        
        this.clientToolName = clientToolName;
        this.verifyOptions = options;
        this.config = config;
        this.defaultAnalyzeRateLimit = 4;
        this.compareMessLCRange = this.compareMessLCRange.bind(this);
        
    }

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