const helpers = require('../helpers');

class Armlet extends APIClient {
    
    constructor(config, ethAddress, password, clientToolName) {
        super('armlet', config, ethAddress, password, clientToolName);
    }

    async function analyze() {
        let { config, defaultAnalyzeRateLimit } = this;

        const limit = config.limit || defaultAnalyzeRateLimit;
        const log = config.logger.log;

        if (isNaN(limit)) {
            log(`limit parameter should be a number; got ${limit}.`);
            return 1;
        }
        if (limit < 0 || limit > defaultAnalyzeRateLimit) {
            log(`limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`);
            return 1;
        }

        const client = getArmletClient(
            process.env.MYTHX_ETH_ADDRESS,
            process.env.MYTHX_PASSWORD
        )

        const mythxclient = getMythxJSClient(
            process.env.MYTHX_ETH_ADDRESS,
            process.env.MYTHX_PASSWORD
        );
        
        const progress = ('debug' in config) ? false : (('progress' in config) ? config.progress : true);

        let id;
        if (progress) {
        const users = (await client.getUserInfo()).users;
        let roles;
        if(users) {
            roles = users[0].roles;
            id = users[0].id
        }

        if(id === "123456789012345678901234") { // Trial user id
            const prefix = "You are currently running MythX in Trial mode. This mode reports only a partial analysis of your smart contracts, limited to three vulnerabilities. To get a complete analysis, sign up for a free MythX account at https://mythx.io.\n";
            config.logger.log(prefix);

            const question = "Would you like to continue with a partial analysis [Y/n]?";
            const r = (await inquirer.prompt([{
                "name": "cont",
                "message": question,
            }])).cont;

            const re = /(n|no)/i
            if(re.exec(r)) {
                process.exit(0);
            }
            config.logger.log("\nContinuing with MythX Trial mode...\n");
        } else if(roles.includes('privileged_user')) {
            config.logger.log("Welcome to MythX! You are currently running in Premium mode.\n");
        } else if(roles.includes('regular_user')) {
            config.logger.log("Welcome to MythX! You are currently running in Free mode.\n");
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
        await contractsCompile(config);

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


                let buildObj = buildObjForSourcePath(allBuildObjs, fullPath)
                if(!buildObj) {
                    if(!contractName) {
                        buildObj = buildObjForContractName(allBuildObjs, contractFile)
                    }
                    if(!buildObj) {
                        config.logger.log(`Cound not find file: ${contractFile}.`.red)
                        return;
                    }
                    if(progress) {
                        config.logger.log(`DEPRECATION WARNING: Found contract named "${contractFile}". Analyzing contracts by name will be removed in a later version.`.yellow)
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
                        config.logger.error(`Contract ${contractName} not found in ${contractFile}.`.red)
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
                    const correctBuildObj = buildObjForSourcePath(allBuildObjs, contract.sourcePath)
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
            config.logger.error("No contracts found, aborting analysis.".red);
            process.exit(1);
        }

        // Do login before calling `analyzeWithStatus` of `armlet` which is called in `doAnalysis`.
        // `analyzeWithStatus` does login to Mythril-API within it.
        // However `doAnalysis` calls `analyzeWithStatus` simultaneously several times,
        // as a result, it causes unnecesarry login requests to Mythril-API. (It ia a kind of race condition problem)
        // refer to https://github.com/ConsenSys/armlet/pull/64 for the detail.
        await client.login();
        const tokens = await mythxclient.login();

        const { objects, errors } = await doAnalysis(client, config, objContracts, limit);
        const result = doReport(config, objects, errors);
        if(progress && id === "123456789012345678901234") {
            config.logger.log("You are currently running MythX in Trial mode, which returns a maximum of three vulnerabilities per contract. Sign up for a free account at https://mythx.io to run a complete report.");
        }
        return result;
    }


}