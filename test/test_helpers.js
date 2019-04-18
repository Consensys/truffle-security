const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const mythx = require('../lib/mythx');
const rewiredHelpers = rewire('../helpers');
const util = require('util');
const yaml = require('js-yaml');


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
        beforeEach(function () {
            helpers = proxyquire('../helpers', {});
        });

        it('should call printVersion', async () => {
            const stubAPI = sinon.stub(armlet, 'ApiVersion').returns({ 'api': '1.0.0' });
            const stubLog = sinon.stub(console, 'log');
            await helpers.printVersion();
            assert.ok(stubAPI.called);
            assert.ok(stubLog.called);
            stubLog.restore();
            stubAPI.restore();
        });

        it('should display helpMessage', async () => {
            const stubLog = sinon.stub(console, 'log');
            await helpers.printHelpMessage();
            assert.ok(stubLog.called);
            stubLog.restore();
        });

        it('should compare two line/column pairs properly', () => {
            const expected = [
                [1, 5, 1, 5, '='],
                [1, 4, 1, 5, '<'],
                [2, 4, 1, 5, '>'],
                [1, 6, 1, 5, '>'],
                [1, 6, 2, 4, '<']];
            for (const t of expected) {
                compareTest(t[0], t[1], t[2], t[3], t[4]);
            }
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
        let doReportStub;
        let getNotAnalyzedContractsStub;
        let getNotFoundContractsStub;
        let getFoundContractNamesStub;
        let doAnalysisStub;
        let ghettoReportStub;
        let getIssues;
        let loginStub;


        beforeEach(() => {
            getTruffleBuildJsonFilesStub = sinon.stub(trufstuf, 'getTruffleBuildJsonFiles');
            parseBuildJsonStub = sinon.stub(trufstuf, 'parseBuildJson');
            contractsCompileStub = sinon.stub();
            doReportStub = sinon.stub();
            getNotAnalyzedContractsStub = sinon.stub();
            getNotFoundContractsStub = sinon.stub();
            getFoundContractNamesStub = sinon.stub();
            doAnalysisStub = sinon.stub();
            loggerStub = sinon.stub();
            errorStub = sinon.stub();
            ghettoReportStub = sinon.stub();
            getUserInfoStub = sinon.stub(armlet.Client.prototype, 'getUserInfo');
            getIssues = sinon.stub(armlet.Client.prototype, 'getIssues');
            loginStub = sinon.stub(armlet.Client.prototype, 'login');

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

            helpers = rewire('../helpers');
            helpers.__set__('doAnalysis', doAnalysisStub);
            helpers.__set__('getNotAnalyzedContracts', getNotAnalyzedContractsStub);
            helpers.__set__('getNotFoundContracts', getNotFoundContractsStub);
            helpers.__set__('getFoundContractNames', getFoundContractNamesStub);
            helpers.__set__('contractsCompile', contractsCompileStub);
            helpers.__set__('doReport', doReportStub);
            helpers.__set__('ghettoReport', ghettoReportStub);
        });

        afterEach(() => {
            getTruffleBuildJsonFilesStub.restore();
            getIssues.restore();
            getUserInfoStub.restore();
            parseBuildJsonStub.restore();
            loginStub.restore();
        });

        it('should return error when passed value for limit is not a number', async () => {
            config.limit = 'test';
            await rewiredHelpers.analyze(config);
            assert.equal(loggerStub.getCall(0).args[0], 'limit parameter should be a number; got test.')
        });

        it('should return error when limit is value is out of acceptible range', async () => {
            config.limit = rewiredHelpers.defaultAnalyzeRateLimit + 5;
            await rewiredHelpers.analyze(config);
            assert.equal(loggerStub.getCall(0).args[0], `limit should be between 0 and ${rewiredHelpers.defaultAnalyzeRateLimit}; got ${rewiredHelpers.defaultAnalyzeRateLimit + 5}.`)
        });

        it('should call doAnalyze and report issues', async () => {
            const fakeJson = {
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
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000001',
                  roles: ['regular_user'],
                }
              ]
            });
            getTruffleBuildJsonFilesStub.resolves(['test.json']);
            parseBuildJsonStub.resolves(fakeJson);
            getNotAnalyzedContractsStub.returns(['Contract1']);
            getFoundContractNamesStub.returns(['Contract2']);
            getNotFoundContractsStub.returns(['Contract3']);

            await helpers.analyze(config);
            assert.ok(getTruffleBuildJsonFilesStub.calledWith('/build/contracts/mythx/contracts'));
            assert.ok(config.logger.error.called);
            assert.ok(doAnalysisStub.called);
            assert.ok(getNotAnalyzedContractsStub.calledWith(1, ['Contract2']));
            assert.ok(doReportStub.calledWith(config, 1, 3, ['Contract1']));
        });

        it('should call getIssues when uuid is provided', async () => {
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000002',
                  roles: ['regular_user', 'privlidged_user'],
                }
              ]
            });
            config.uuid = 'test';
            await helpers.analyze(config);
            assert.ok(getIssues.called);
            assert.ok(ghettoReportStub.called);
        });

        it('should show error when getIssues break', async () => {
            config.uuid = 'test';
            getIssues.throws('Error')
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000001',
                  roles: ['regular_user'],
                }
              ]
            });
            await helpers.analyze(config);
            assert.ok(getIssues.called);
            assert.ok(loggerStub.getCall(0).args[0], 'Error');
        });
    });

    describe('Armlet authentication analyze', () => {
        let readFileStub;
        let getTruffleBuildJsonFilesStub;
        let initialEnVars;

        const buildJson = JSON.stringify({
            contractName: 'TestContract',
            ast: {
                absolutePath: '/test/build/contracts/TestContract.json'
            },
            deployedBytecode: '0x6080604052',
            sourcePath: '/test/contracts/TestContract/TestContract.sol',
        });

        const buildJson2 = JSON.stringify({
            contractName: 'OtherContract',
            ast: {
                absolutePath: '/test/build/contracts/OtherContract.json'
            },
            deployedBytecode: '0x6080604052',
            sourcePath: '/test/contracts/OtherContract/OtherContract.sol',
        });

        beforeEach(function () {
            // Store initial environment variables
            initialEnVars = {
                MYTHX_PASSWORD: process.env.MYTHX_PASSWORD,
                MYTHX_API_KEY: process.env.MYTHX_API_KEY,
                MYTHX_EMAIL: process.env.MYTHX_EMAIL,
                MYTHX_ETH_ADDRESS: process.env.MYTHX_ETH_ADDRESS,
            };

            // clear envronment variables for tests
            delete process.env.MYTHX_PASSWORD;
            delete process.env.MYTHX_API_KEY;
            delete process.env.MYTHX_EMAIL;
            delete process.env.MYTHX_ETH_ADDRESS;

            getTruffleBuildJsonFilesStub = sinon
                .stub(trufstuf, 'getTruffleBuildJsonFiles')
                .resolves(['/test/build/contracts/TestContract.json', '/test/build/contracts/OtherContract.json']);

            readFileStub = sinon.stub(fs, 'readFile');
            readFileStub.onFirstCall().yields(null, buildJson);
            readFileStub.onSecondCall().yields(null, buildJson2);

            helpers = proxyquire('../helpers', {
                fs: {
                    readFile: readFileStub,
                },
                trufstuf: {
                    getTruffleBuildJsonFiles: getTruffleBuildJsonFilesStub,
                }
            });
        });

        afterEach(function () {
            process.env.MYTHX_PASSWORD = initialEnVars.MYTHX_PASSWORD;
            process.env.MYTHX_API_KEY = initialEnVars.MYTHX_API_KEY;
            process.env.MYTHX_EMAIL = initialEnVars.MYTHX_EMAIL;
            process.env.MYTHX_ETH_ADDRESS = initialEnVars.MYTHX_ETH_ADDRESS;
            initialEnVars = null;
            readFileStub.restore();
            getTruffleBuildJsonFilesStub.restore();
        });

        it('it should group eslint issues by filenames', () => {
            const issues = [{
                errorCount: 1,
                warningCount: 1,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: 'contract.sol',
                messages: [
                    'message 1',
                    'message 2',
                ]
            }, {
                errorCount: 0,
                warningCount: 1,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: '/tmp/test_dir/contract2.sol',
                messages: [
                    'message 3'
                ]
            }, {
                errorCount: 0,
                warningCount: 1,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: '/tmp/test_dir/contract.sol',
                messages: [
                    'message 4'
                ]
            }];

            const result = rewiredHelpers.__get__('groupEslintIssuesByBasename')(issues);
            assert.deepEqual(result, [{
                errorCount: 1,
                warningCount: 2,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: 'contract.sol',
                messages: [
                    'message 1',
                    'message 2',
                    'message 4',
                ]
            }, {
                errorCount: 0,
                warningCount: 1,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: '/tmp/test_dir/contract2.sol',
                messages: [
                    'message 3'
                ]
            }]);
        });
    });

    describe('doAnalysis', () => {
        let armletClient, stubAnalyze, debuggerStub;

        beforeEach(() => {
            armletClient = new armlet.Client({
                ethAddress: rewiredHelpers.trialEthAddress,
                password: rewiredHelpers.trialPassword
            });
            stubAnalyze = sinon.stub(armletClient, 'analyzeWithStatus');
            debuggerStub = sinon.stub();
        });

        afterEach(() => {
            stubAnalyze.restore();
            stubAnalyze = null;
        });

        it('should return 1 mythXIssues object and no errors', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const mythXInput = mythx.truffle2MythXJSON(contracts[0]);
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
            const results = await doAnalysis(armletClient, config, contracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
                timeout: 300000,
                initialDelay: undefined,
            }));
            assert.equal(results.errors.length, 0);
            assert.equal(results.objects.length, 1);
        });

        it('should return 0 mythXIssues objects and 1 error', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const mythXInput = mythx.truffle2MythXJSON(contracts[0]);
            stubAnalyze.resolves({
                issues: [],
                status: { status: 'Error'},
            });
            const results = await doAnalysis(armletClient, config, contracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
                timeout: 300000,
                initialDelay: undefined,
            }));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 0);
        });

        it('should return 1 mythXIssues object and 1 error', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const mythXInput = mythx.truffle2MythXJSON(contracts[0]);
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
            const results = await doAnalysis(armletClient, config, contracts.concat(contracts));
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
                timeout: 300000,
                initialDelay: undefined,
            }));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 1);
        });

        it('should skip unwanted smart contract', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {},
                style: 'test-style',
                progress: false,
            }
            const jsonFiles = [
                `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`,
            ];

            const results = await doAnalysis(armletClient, config, jsonFiles, ['UnkonwnContract']);
            assert.ok(!stubAnalyze.called);
            assert.equal(results.errors.length, 0);
            assert.equal(results.objects.length, 0);
        });
    });

    describe('cleanAnalyzeDataEmptyProps', () => {
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        let truffleJSON;

        beforeEach(done => {
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                done();
            });
        });

        it('should return complete input data when all fields are present', () => {
            const stub = sinon.stub();
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(!stub.called);
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit bytecode when bytecode is empty', () => {
            const stub = sinon.stub();
            truffleJSON.bytecode = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.bytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit bytecode when bytecode is 0x', () => {
            const stub = sinon.stub();
            truffleJSON.bytecode = '0x';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.bytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedBytecode when deployedBytecode is empty', () => {
            const stub = sinon.stub();
            truffleJSON.deployedBytecode = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.deployedBytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedBytecode when deployedBytecode is 0x', () => {
            const stub = sinon.stub();
            truffleJSON.deployedBytecode = '0x';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.deployedBytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit sourceMap when sourceMap is empty', () => {
            const stub = sinon.stub();
            truffleJSON.sourceMap = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.sourceMap;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedSourceMap when deployedSourceMap is empty', () => {
            const stub = sinon.stub();
            truffleJSON.deployedSourceMap = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.deployedSourceMap;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit empty fields but not log  when debug is false', () => {
            const stub = sinon.stub();
            truffleJSON.deployedSourceMap = '';
            truffleJSON.sourceMap = null;
            truffleJSON.bytecode = '0x';
            delete truffleJSON.deployedBytecode;
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, false, stub);
            delete truffleJSON.sourceMap;
            delete truffleJSON.deployedSourceMap;
            delete truffleJSON.bytecode;
            delete truffleJSON.deployedBytecode;
            assert.ok(!stub.called);
            assert.deepEqual(result, truffleJSON);
        });
    });

    describe('doReport', () => {
        let loggerStub;
        let errorStub;
        let config;

        beforeEach(() => {
            loggerStub = sinon.stub();
            errorStub = sinon.stub();

            config = {
                logger: {
                    log: loggerStub,
                    error: errorStub,
                },
                json: true,
            };
        });

        it('should return 0 when no errors, no issues, and no logs', async () => {
            const results = {
                "errors": [],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const notAnalyzedContracts = [];
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors, notAnalyzedContracts);
            assert.ok(!errorStub.calledWith(`These smart contracts were unable to be analyzed: ${notAnalyzedContracts.join(', ')}`));
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 0);
        });

        it('should return 1 when errors is 1 or more', async () => {
            const results = {
                "errors": [
                    {
                      "status": "Error"
                    }
                ],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const notAnalyzedContracts = [];
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors, notAnalyzedContracts);
            assert.ok(!errorStub.calledWith(`These smart contracts were unable to be analyzed: ${notAnalyzedContracts.join(', ')}`));
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });

        it('should return 1 when issues is 1 or more', () => {
            const results = {
                "errors": [],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [{
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
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const notAnalyzedContracts = [];
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors, notAnalyzedContracts);
            assert.ok(!errorStub.calledWith(`These smart contracts were unable to be analyzed: ${notAnalyzedContracts.join(', ')}`));
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });

        it('should return 1 when notAnalyzedContracts is 1 or more', async () => {
            const results = {
                "errors": [],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const notAnalyzedContracts = ['Contract1', 'Contract2'];
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors, notAnalyzedContracts);
            assert.ok(errorStub.calledWith(`These smart contracts were unable to be analyzed: ${notAnalyzedContracts.join(', ')}`));
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });

        it('should return 0 when logs is 1 or more with debug', async () => {
            config.debug = true;
            const results = {
                errors: [],
                objects: [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: [
                            {
                                level : 'info',
                                msg: 'message1',
                            }
                        ]
                    },
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const notAnalyzedContracts = [];
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors, notAnalyzedContracts);
            assert.ok(!errorStub.calledWith(`These smart contracts were unable to be analyzed: ${notAnalyzedContracts.join(', ')}`));
            assert.ok(loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });
    });

    describe('ghettoReport', () => {
        let loggerStub = sinon.stub();
        beforeEach(() => {
            loggerStub = sinon.stub();
        });

        it('should return 0 when issues count is 0', () => {
            const results = [{
                "issues": [],
            }];
            const ret = rewiredHelpers.__get__('ghettoReport')(loggerStub, results);
            assert.ok(loggerStub.calledWith('No issues found'));
            assert.equal(ret, 0);
        });

        it('should return 1 when issues count is 1 or more', () => {
            const results = [{
                'sourceFormat': 'evm-byzantium-bytecode',
                'sourceList': [
                    'list1', 'list2'
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
            }];

            const ret = rewiredHelpers.__get__('ghettoReport')(loggerStub, results);
            assert.ok(!loggerStub.calledWith('No issues found'));
            assert.ok(loggerStub.calledWith('list1, list2'.underline));
            assert.ok(loggerStub.calledWith(yaml.safeDump(results[0].issues[0], {'skipInvalid': true})));
            assert.equal(ret, 1);
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

    describe('getNotFoundContracts', () => {
        it('should return a list containing the not found contracts', () => {
            const allContractNames = ['Contract1', 'Contract2', 'Contract3', 'Contract4'];
            const foundContractNames = ['Contract1', 'Contract3'];

            const result = helpers.getNotFoundContracts(allContractNames, foundContractNames);
            assert.equal(result.length, 2);
        });
    });

    describe('getNotAnalyzedContracts', () => {
        it('should collect contract names which are not analyzed in truffle build contracts directory', () => {
            const objects = [
                { contractName: 'Contract1' },
                { contractName: 'Contract2' },
            ];

            const result = rewiredHelpers.getNotAnalyzedContracts(objects, ['Contract2', 'NotFoundContract']);
            assert.deepEqual(result, ['NotFoundContract']);
        });

        it('should return empty array when contracts parameter is not passed', () => {
            const objects = [
                { contractName: 'Contract1' },
                { contractName: 'Contract2' },
            ];

            const result = rewiredHelpers.getNotAnalyzedContracts(objects, null);
            assert.deepEqual(result, []);
        });

        it('should return empty array when contracts parameter is empty array', () => {
            const objects = [
                { contractName: 'Contract1' },
                { contractName: 'Contract2' },
            ];

            const result = rewiredHelpers.getNotAnalyzedContracts(objects, []);
            assert.deepEqual(result, []);
        });
    });

    describe('getArmletClient', () => {
        it('should instantiate as trial user if nothing is passed', () => {
            const client = rewiredHelpers.getArmletClient();
            assert.equal(client.ethAddress, rewiredHelpers.trialEthAddress);
            assert.equal(client.password, rewiredHelpers.trialPassword);
        });

        it('should create client instance with ethAddress and password', () => {
            const client = rewiredHelpers.getArmletClient('0x123456789012345678901234', 'password');
            assert.equal(client.ethAddress, '0x123456789012345678901234');
            assert.equal(client.password, 'password');
        });

        it('should throw error if password is missing', () => {
            assert.throws(() => {
                rewiredHelpers.getArmletClient(undefined, '0x123456789012345678901234')
            });
        });

        it('should throw error if ethAddress is missing', () => {
            assert.throws(() => {
                rewiredHelpers.getArmletClient('password', undefined)
            });
        });
    });

});
