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
            helpers = proxyquire('../helpers', {});
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
        let pathStub;

        let mythx;
        let armlet

        beforeEach(() => {
            helpers = proxyquire('../helpers', {});

            getTruffleBuildJsonFilesStub = sinon.stub(trufstuf, 'getTruffleBuildJsonFiles');
            parseBuildJsonStub = sinon.stub(trufstuf, 'parseBuildJson');
            doReportStub = sinon.stub();
            loggerStub = sinon.stub();
            errorStub = sinon.stub();
            ghettoReportStub = sinon.stub();
            getDetectedIssuesStub = sinon.stub();

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
            reportsRewired.ghettoReport = ghettoReportStub;

            let mythxjsRewired = rewire('mythxjs');
            let armletRewired = rewire('armlet');

            getDetectedIssuesStub = sinon.stub(mythxjsRewired.Client.prototype, "getDetectedIssues");
            getIssuesStub = sinon.stub(armletRewired.Client.prototype, "getIssues");

            let apiclient = proxyquire('../classes/apiclient', {
                path: pathStub,
                "../utils/buildutils": buildUtilsRewired,
                "../utils/reports": reportsRewired,
                "mythxjs": mythxjsRewired,
                "armlet": armletRewired,
            });
            doAnalysisStub = sinon.stub(apiclient.prototype, "doAnalysis");

            mythx = proxyquire('../classes/mythx', {
                "./apiclient": apiclient,
            });

            armlet = proxyquire('../classes/armlet', {
                "./apiclient": apiclient
            });

            helpers = rewire('../helpers');
            helpers.__set__('mythxjsClass', mythx);
            helpers.__set__('armletClass', armlet);
        });

        afterEach(() => {
            getTruffleBuildJsonFilesStub.restore();
            getTruffleBuildJsonFilesStub.restore();
            parseBuildJsonStub.restore();
            doAnalysisStub.restore();
            getDetectedIssuesStub.restore();
            getIssuesStub.restore();
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
            let buildPathBool = false;
            if (getTruffleBuildJsonFilesStub.getCall(0).args[0] === "/build/contracts/mythx/contracts" ||  getTruffleBuildJsonFilesStub.getCall(0).args[0] === "\\build\\contracts\\mythx\\contracts" ) {
              buildPathBool = true;
            }
            assert.ok(buildPathBool);
            assert.ok(doAnalysisStub.calledWith([ { contractName: "Contract1", contract: sinon.match.any} ], helpers.defaultAnalyzeRateLimit));
            assert.ok(doReportStub.calledWith(1, 3, config));
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
            let buildPathBool = false;
            if (getTruffleBuildJsonFilesStub.getCall(0).args[0] === "/build/contracts/mythx/contracts" ||  getTruffleBuildJsonFilesStub.getCall(0).args[0] === "\\build\\contracts\\mythx\\contracts" ) {
              buildPathBool = true;
            }
            assert.ok(buildPathBool);
            assert.ok(doAnalysisStub.called);
            assert.ok(doReportStub.calledWith(1, 3, config));

        });

        it('should call getDetectedIssues when uuid is provided', async () => {
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

          getDetectedIssuesStub.resolves({})
          getIssuesStub.resolves({})

          config.uuid = 'test';

          getDetectedIssuesStub.resolves('testIssues');
          await helpers.analyze(config);
          assert.ok(getDetectedIssuesStub.called);
          assert.ok(ghettoReportStub.called);
        });

        it('should show error when getDetectedIssues break', async () => {
            config.uuid = 'test';
            getDetectedIssuesStub.throws('Error');
            await helpers.analyze(config);
            assert.ok(getDetectedIssuesStub.called);
            assert.ok(loggerStub.getCall(0).args[0], 'Error');
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
