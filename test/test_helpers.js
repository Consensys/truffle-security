const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
const path = require('path');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const mythxLib = require('../lib/mythx');
const util = require('util');
const yaml = require('js-yaml');
const reports = require('../utils/reports');
const apiClient = require('../classes/apiclient');
const mythxjsClient = require('../classes/mythx');


async function assertThrowsAsync(fn, message) {
    let f = () => {};
    try {
        await fn();
    } catch(e) {
        f = () => { throw e; };
    } finally {
        assert.throws(f, message);
    }
}

describe('helpers.js', function() {
    let helpers;

    function compareTest(line1, col1, line2, col2, expect) {
        const res = helpers.compareLineCol(line1, col1, line2, col2);
        if (expect === '=') {
            assert.ok(res === 0);
        } else if (expect === '<') {
            assert.ok(res < 0);
        } else if (expect === '>') {
            assert.ok(res > 0);
        } else {
            assert.throws(`invalid test expect symbol ${expect}; '=', '<', or '>' expected`);
        }
    }

    describe('test helper functions', () => {
        let stubLog;

        beforeEach(function () {
            helpers = proxyquire('../helpersRefactor', {});
            stubLog = sinon.spy(console, 'log');
        });

        afterEach(function () {
          stubLog.restore();
        });



        it('should call printVersion', async () => {
            const stubAPI = sinon.stub(armlet, 'ApiVersion').returns({ 'api': '1.0.0' });
            await helpers.printVersion();
            assert.ok(stubAPI.called);
            assert.ok(stubLog.called);
            stubLog.restore();
            stubAPI.restore();
        });

        it('should display helpMessage', async () => {
            await helpers.printHelpMessage();
            assert.ok(stubLog.called);
            stubLog.restore();
        });

        it('should sort and convert object to a string', () => {
            const res = helpers.versionJSON2String({ mythx: '1.0.1', 'solc': '0.5.0', 'api': '1.0.0' });
            assert.equal(res, 'api: 1.0.0, mythx: 1.0.1, solc: 0.5.0');
        })
    });

    describe('analyze', () => {
        let loggerStub;
        let errorStub;
        let config;
        let getTruffleBuildJsonFilesStub;
        let contractsCompileStub;
        let doAnalysisStub;
        let doReportStub;
        let ghettoReportStub;
        let getIssuesStub;
        let loginStub;
        let pathStub;

        let apiClass;
        let mythx;
        let armlet

        beforeEach(() => {
            helpers = proxyquire('../helpersRefactor', {});

            getTruffleBuildJsonFilesStub = sinon.stub(trufstuf, 'getTruffleBuildJsonFiles');
            // getTruffleBuildJsonFilesStub = sinon.stub(apiClient.prototype, 'getTruffleBuildJsonFiles').callsFake(() => {
            //   return {}
            // });
            parseBuildJsonStub = sinon.stub(trufstuf, 'parseBuildJson');
            doReportStub = sinon.stub();
            doAnalysisStub = sinon.stub();
            loggerStub = sinon.stub();
            errorStub = sinon.stub();
            ghettoReportStub = sinon.stub();
            getDetectedIssuesStub = sinon.stub();


            // getUserInfoStub = sinon.stub(armlet.Client.prototype, 'getUserInfo');
            // getIssuesStub = sinon.stub(armlet.Client.prototype, 'getIssues');
            // loginStub = sinon.stub(armlet.Client.prototype, 'login');
            contractsCompileStub = sinon.stub();
            pathStub = {
                resolve: sinon.stub(),
                join: path.join
            }

            config = {
                contracts_directory: '/contracts',
                build_directory: '/build/contracts',
                _: [],
                logger: {
                    log: loggerStub,
                    error: errorStub,
                },
                style: 'stylish',
                progress: false,
            };

            buildUtilsRewired = rewire('../utils/buildutils');
            buildUtilsRewired.contractsCompile = contractsCompileStub;
            reportsRewired = rewire('../utils/reports');
            reportsRewired.doReport = doReportStub;
            reportsRewired.ghettoReportStub = ghettoReportStub;

            let apiclient = proxyquire('../classes/apiclient', {
                path: pathStub,
                "../utils/buildutils": buildUtilsRewired,
                "../utils/reports": reportsRewired,
            });

            let mythxjsclient = proxyquire('mythxjs', {
              client: {
                getDetectedIssues: getDetectedIssuesStub,
              }
            })

            mythx = proxyquire('../classes/mythx', {
                "./apiclient": apiclient,
                client: mythxjsclient,
            });
            armlet = proxyquire('../classes/armlet', {
                "./apiclient": apiclient
            });



            helpers = rewire('../helpersRefactor');
            helpers.__set__('analyze', doAnalysisStub);
            helpers.__set__('mythxjsClass', mythx);
            helpers.__set__('armletClass', armlet);
        });

        afterEach(() => {
            getTruffleBuildJsonFilesStub.restore();
            getTruffleBuildJsonFilesStub.restore();
            parseBuildJsonStub.restore();
            doAnalysisStub.restore();
        });

        it('should return error when passed value for limit is not a number', async () => {
            config.limit = 'test';
            doAnalysisStub.resolves({ objects: 1, errors: 3 });
            await helpers.analyze(config);
            assert.equal(loggerStub.getCall(0).args[0], 'limit parameter should be a number; got test.')
        });

        it('should return error when limit is value is out of acceptible range', async () => {
            config.limit = helpers.defaultAnalyzeRateLimit + 5;
            await helpers.analyze(config);
            assert.equal(loggerStub.getCall(0).args[0], `limit should be between 0 and ${helpers.defaultAnalyzeRateLimit}; got ${helpers.defaultAnalyzeRateLimit + 5}.`)
        });

        /* TODO: Logged in messaging tests */

        it('should find and analyze the correct build object', async () => {
            config._ = ["verify", "contract.sol:Contract1"];
            const fakeBuildJson = {
                "compiler": { "name": "", "version": "" },
                "updatedAt": "",
                "sources": {
                    "/build/contracts/mythx/contracts/contract.sol": {
                        "contracts": [
                            {
                                "contractName": "Contract1",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            },
                            {
                                "contractName": "Contract2",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            }
                        ],
                        "ast": {},
                        "legacyAST": {},
                        "id": 0,
                        "source": ""
                    }
                }
            }

            getTruffleBuildJsonFilesStub.resolves(['contract.json']);
            parseBuildJsonStub.resolves(fakeBuildJson);
            pathStub.resolve.returns("/build/contracts/mythx/contracts/contract.sol")
            doAnalysisStub.resolves({ objects: 1, errors: 3 });

            await helpers.analyze(config, true);
            assert.ok(getTruffleBuildJsonFilesStub.getCall(0).args[0] === "\\build\\contracts\\mythx\\contracts");
            assert.ok(doAnalysisStub.calledWith([ { contractName: "Contract1", contract: sinon.match.any} ], helpers.defaultAnalyzeRateLimit));
            assert.ok(doReportStub.calledWith(1, 3, config, false));
        });


        it('should call doAnalysis and report issues', async () => {
            const fakeBuildJson = {
                "compiler": { "name": "", "version": "" },
                "updatedAt": "",
                "sources": {
                    "contract.sol": {
                        "contracts": [
                            {
                                "contractName": "Contract1",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            },
                            {
                                "contractName": "Contract2",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            }
                        ],
                        "ast": {},
                        "legacyAST": {},
                        "id": 0,
                        "source": ""
                    }
                }
            }
            doAnalysisStub.resolves({ objects: 1, errors: 3 });

            getTruffleBuildJsonFilesStub.resolves(['test.json']);
            parseBuildJsonStub.resolves(fakeBuildJson);

            await helpers.analyze(config);
            assert.ok(getTruffleBuildJsonFilesStub.getCall(0).args[0] === "\\build\\contracts\\mythx\\contracts");
            assert.ok(doAnalysisStub.called);
            assert.ok(doReportStub.calledWith(1, 3, config, false));

        });

        it('should call getIssues when uuid is provided', async () => {
            // getUserInfoStub.resolves({
            //   total: 1,
            //   users: [
            //     { id: '000000000000000000000002',
            //       roles: ['regular_user', 'privlidged_user'],
            //     }
            //   ]
            // });
            const fakeBuildJson = {
              "compiler": { "name": "", "version": "" },
              "updatedAt": "",
              "sources": {
                  "contract.sol": {
                      "contracts": [
                          {
                              "contractName": "Contract1",
                              "bytecode": "0x",
                              "deployedBytecode": "0x",
                              "sourceMap": "",
                              "deployedSourceMap": ""
                          },
                          {
                              "contractName": "Contract2",
                              "bytecode": "0x",
                              "deployedBytecode": "0x",
                              "sourceMap": "",
                              "deployedSourceMap": ""
                          }
                      ],
                      "ast": {},
                      "legacyAST": {},
                      "id": 0,
                      "source": ""
                  }
              }
          }
          doAnalysisStub.resolves({ objects: 1, errors: 3 });

          getTruffleBuildJsonFilesStub.resolves(['test.json']);
          parseBuildJsonStub.resolves(fakeBuildJson);

          config.uuid = 'test';

          getDetectedIssuesStub.resolves('testIssues');
          await helpers.analyze(config);
          // assert.ok(getIssuesStub.called);
          assert.ok(ghettoReportStub.called);
        });

        it('should show error when getIssues break', async () => {
            config.uuid = 'test';
            // getIssuesStub.throws('Error')
            // getUserInfoStub.resolves({
            //   total: 1,
            //   users: [
            //     { id: '000000000000000000000001',
            //       roles: ['regular_user'],
            //     }
            //   ]
            // });
            await helpers.analyze(config);
            // assert.ok(getIssuesStub.called);
            assert.ok(loggerStub.getCall(0).args[0], 'Error');
        });
    });

    describe('doAnalysis', () => {
        let armletClient, stubAnalyze, debuggerStub, pathStub, getDetectedIssuesStub, mythxjsClientInstantiated, contractsCompileStub, ghettoReportStub, doReportStub, newTruffleObjToOldTruffleByContractsStub;
        let mythx;
        let armlet;


        beforeEach(() => {
          let config = {};
          getDetectedIssuesStub = sinon.stub();

          // let mythxClient = new mythxjsClient(config, 'truffle');
          pathStub = {
            resolve: sinon.stub(),
            join: path.join
          }

          mythxjsClientInstantiated = new mythxjsClient({
            ethAddress: helpers.trialEthAddress,
            password: helpers.trialPassword
          })

          contractsCompileStub = sinon.stub();
          ghettoReportStub = sinon.stub();

          buildUtilsRewired = rewire('../utils/buildutils');
          reportsRewired = rewire('../utils/reports');
          newTruffleObjToOldTruffleByContractsStub = sinon.stub();

          let apiclient = proxyquire('../classes/apiclient', {
              path: pathStub,
              "../utils/buildutils": buildUtilsRewired,
              "../utils/reports": reportsRewired,
          });

          let mythxjsclient = proxyquire('mythxjs', {
            client: {
              getDetectedIssues: getDetectedIssuesStub,
            }
          })

          mythx = proxyquire('../classes/mythx', {
              "./apiclient": apiclient,
              client: mythxjsclient,
          });

          armlet = proxyquire('../classes/armlet', {
              "./apiclient": apiclient
          });



          stubAnalyze = sinon.stub(mythxjsClientInstantiated, 'analyze');
          debuggerStub = sinon.stub();
        });

        afterEach(() => {
            stubAnalyze.restore();
            stubAnalyze = null;
        });

        it('should return 1 mythXIssues object and no errors', async () => {
            const doAnalysis = helpers.__get__('analyze');
            // const config = {
            //     _: [],
            //     debug: true,
            //     logger: {debug: debuggerStub},
            //     style: 'test-style',
            //     progress: false,
            // }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythxLib.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const objContracts = [ { contractName: "SimpleDAO", contract: contracts[0] } ];
            const mythXInput = mythxLib.truffle2MythXJSON(objContracts[0].contract);
            stubAnalyze.resolves({
                issues: [{
                    'sourceFormat': 'evm-byzantium-bytecode',
                    'sourceList': [
                        `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`
                    ],
                    'sourceType': 'raw-bytecode',
                    'issues': [{
                        'description': {
                            'head': 'Head message',
                            'tail': 'Tail message'
                        },
                        'locations': [{
                            'sourceMap': '444:1:0'
                        }],
                        'severity': 'High',
                        'swcID': 'SWC-000',
                        'swcTitle': 'Test Title'
                    }],
                    'meta': {
                        'selected_compiler': '0.5.0',
                        'error': [],
                        'warning': []
                    }
                }],
                status: { status: 'Finished' },
            });

            const results = await mythx.doAnalysis(objContracts);
            // const results = await doAnalysis(armletClient, config, objContracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
            }, 300000, undefined));
            assert.equal(results.errors.length, 0);
            assert.equal(results.objects.length, 1);
        });

        it('should return 0 mythXIssues objects and 1 error', async () => {
            const doAnalysis = helpers.__get__('analyze');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythxLib.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const objContracts = [ { contractName: "SimpleDAO", contract: contracts[0] } ];
            const mythXInput = mythxLib.truffle2MythXJSON(objContracts[0].contract);
            stubAnalyze.resolves({
                issues: [],
                status: { status: 'Error'},
            });
            const results = await doAnalysis(armletClient, config, objContracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
            }, 300000, undefined));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 0);
        });

        it('should return 1 mythXIssues object and 1 error', async () => {
            const doAnalysis = helpers.__get__('analyze');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythxLib.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const objContracts = [ { contractName: "SimpleDAO", contract: contracts[0] }, { contractName: "SimpleDAO", contract: contracts[0] } ];
            const mythXInput = mythxLib.truffle2MythXJSON(objContracts[0].contract);
            stubAnalyze.onFirstCall().resolves({
                issues: {},
                status: { status: 'Error' },
            });
            stubAnalyze.onSecondCall().resolves({
                issues: [{
                    'sourceFormat': 'evm-byzantium-bytecode',
                    'sourceList': [
                        `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`
                    ],
                    'sourceType': 'raw-bytecode',
                    'issues': [{
                        'description': {
                            'head': 'Head message',
                            'tail': 'Tail message'
                        },
                        'locations': [{
                            'sourceMap': '444:1:0'
                        }],
                        'severity': 'High',
                        'swcID': 'SWC-000',
                        'swcTitle': 'Test Title'
                    }],
                    'meta': {
                        'selected_compiler': '0.5.0',
                        'error': [],
                        'warning': []
                    },
                }],
                status: {status: 'Pending' },
            });
            const results = await doAnalysis(armletClient, config, objContracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
            }, 300000, undefined));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 1);
        });
    });


    describe('prepareConfig', () => {
        it('should return a numeric severityThreshold', () => {
            const inputSeverity = 'error';
            const result = helpers.setConfigSeverityLevel(inputSeverity);
            assert.equal(result, 2);
        });
        it('should default to warning if no severity is supplied', () => {
            const result = helpers.setConfigSeverityLevel();
            assert.equal(result, 1);
        });
        it('should correctly format a comma separated string of swc codes', () => {
            const commaBlacklist = '103,111';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-103', 'SWC-111' ]);
        });
        it('should correctly format a single swc code', () => {
            const commaBlacklist = '103';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-103' ]);
        });
        it('should accept whitespace in the list of swc codes', () => {
            const commaBlacklist = '103, 111';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-103', 'SWC-111' ]);
        });
        it('should accept an arbitrary string as an SWC code without breaking', () => {
            const commaBlacklist = 'cat';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-cat' ]);
        });
    });

});
