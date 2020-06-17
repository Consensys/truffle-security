const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
const path = require('path');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const mythx = require('../lib/mythx');
const rewiredHelpers = rewire('../helpers');
const util = require('util');
const yaml = require('js-yaml');
const armletClass = require('../classes/armlet');
const mythxjsClass = require('../classes/mythx');

describe('API Client Classes', function() {
    describe('Shared API Client Functionality', () => {
        beforeEach(function() {
            let configJSON = {
                contracts_directory: '/contracts',
                build_directory: '/build/contracts',
                _: [],
                logger: {
                    log: loggerStub,
                    error: errorStub,
                },
                style: 'stylish',
                progress: false,
                apiClient: 'armlet',
            };

            let config = rewiredHelpers.prepareConfig(configJSON);
            let client = new armletClass(config);
        });

        afterEach(function() {});
    });

    describe('analyze', () => {
        let APIClient;
        let doAnalysisFromClientStub;
        let createGroupStub;

        beforeEach(function() {
            debuggerStub = sinon.stub();

            APIClient = require('../classes/mythx');
            doAnalysisFromClientStub = sinon.stub(APIClient.prototype, 'doAnalysisFromClient');

        });

        afterEach(function() {
            doAnalysisFromClientStub.restore();
        });

        it('should return 1 mythXIssues object and no errors', async function() {
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
            const objContracts = [ { contractName: 'SimpleDAO', contract: contracts[0] } ];
            const mythXInput = mythx.truffle2MythXJSON(objContracts[0].contract);

            doAnalysisFromClientStub.resolves({
                issues: [{
                    'sourceFormat': 'evm-byzantium-bytecode',
                    'sourceList': [
                        '/test/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json'
                    ],
                    'sourceType': 'raw-bytecode',
                    'issues': [{
                        'description': {
                            'head': 'Head message',
                            'tail': 'Tail message'
                        },
                        'locations': [{
                            'sourceMap': '444:1:0',
                            'sourceList': [
                                '/test/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json'
                            ]
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

            //pathStub.resolve.returns("/build/contracts/mythx/contracts/contract.sol");
            apiClient = new APIClient(config, 'truffle');

            const group = { id: '5dd7fd009a44e30011e177d8',
            name: '',
            createdAt: '2019-11-22T15:21:36.432Z',
            createdBy: '5d6fca19f78f5a0011109b65',
            completedAt: null,
            progress: 100,
            status: 'opened',
            mainSourceFiles: [],
            numAnalyses: { total: 0, queued: 0, running: 0, failed: 0, finished: 0 },
            numVulnerabilities: { high: 0, medium: 0, low: 0, none: 0 } };

            createGroupStub = sinon.stub(apiClient.client, 'createGroup');
            createGroupStub.resolves(group);

            groupOperationStub = sinon.stub(apiClient.client, 'groupOperation');



            const results = await apiClient.doAnalysis(objContracts);
            mythXInput.analysisMode = 'quick';
            mythXInput.groupId = group.id;
            // assert.ok(doAnalysisFromClientStub.calledWith({
            //     clientToolName: 'truffle',
            //     toolName: 'truffle',
            //     noCacheLookup: false,
            //     data: mythXInput,
            // }, 300000, undefined));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 0);
        });

        it('should return 0 mythXIssues objects and 1 error', async function() {
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
          const objContracts = [ { contractName: 'SimpleDAO', contract: contracts[0] } ];
          const mythXInput = mythx.truffle2MythXJSON(objContracts[0].contract);
          doAnalysisFromClientStub.resolves({
            issues: [],
            status: { status: 'Error'},
          });

          //pathStub.resolve.returns("/build/contracts/mythx/contracts/contract.sol");
          apiClient = new APIClient(config, 'truffle');

          const group = { id: '5dd7fd009a44e30011e177d8',
          name: '',
          createdAt: '2019-11-22T15:21:36.432Z',
          createdBy: '5d6fca19f78f5a0011109b65',
          completedAt: null,
          progress: 100,
          status: 'opened',
          mainSourceFiles: [],
          numAnalyses: { total: 0, queued: 0, running: 0, failed: 0, finished: 0 },
          numVulnerabilities: { high: 0, medium: 0, low: 0, none: 0 } };

          createGroupStub = sinon.stub(apiClient.client, 'createGroup');
          createGroupStub.resolves(group);

          groupOperationStub = sinon.stub(apiClient.client, 'groupOperation');

          const results = await apiClient.doAnalysis(objContracts);


          mythXInput.analysisMode = 'quick';
          mythXInput.groupId = group.id;

          // assert.ok(doAnalysisFromClientStub.calledWith({
          //     clientToolName: 'truffle',
          //     toolName: 'truffle',
          //     noCacheLookup: false,
          //     data: mythXInput,
          // }, 300000, undefined));
          assert.equal(results.errors.length, 1);
          assert.equal(results.objects.length, 0);
      });


      it('should return 1 mythXIssues object and 1 error', async function() {
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
        const objContracts = [ { contractName: 'SimpleDAO', contract: contracts[0] } ];
        const mythXInput = mythx.truffle2MythXJSON(objContracts[0].contract);
        doAnalysisFromClientStub.onFirstCall().resolves({
            issues: {},
            status: { status: 'Error' },
        });
        doAnalysisFromClientStub.onSecondCall().resolves({
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
        //pathStub.resolve.returns("/build/contracts/mythx/contracts/contract.sol");
        apiClient = new APIClient(config, 'truffle');

        const group = { id: '5dd7fd009a44e30011e177d8',
        name: '',
        createdAt: '2019-11-22T15:21:36.432Z',
        createdBy: '5d6fca19f78f5a0011109b65',
        completedAt: null,
        progress: 100,
        status: 'opened',
        mainSourceFiles: [],
        numAnalyses: { total: 0, queued: 0, running: 0, failed: 0, finished: 0 },
        numVulnerabilities: { high: 0, medium: 0, low: 0, none: 0 } };

        createGroupStub = sinon.stub(apiClient.client, 'createGroup');
        createGroupStub.resolves(group);

        groupOperationStub = sinon.stub(apiClient.client, 'groupOperation');

        const results = await apiClient.doAnalysis(objContracts);
        mythXInput.analysisMode = 'quick';
        mythXInput.groupId = group.id;

        // assert.ok(doAnalysisFromClientStub.calledWith({
        //     clientToolName: 'truffle',
        //     toolName: 'truffle',
        //     noCacheLookup: false,
        //     data: mythXInput,
        // }, 300000, undefined));
        assert.equal(results.errors.length, 1);
        assert.equal(results.objects.length, 0);
    });


    })
});
