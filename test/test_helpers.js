const assert = require('assert');
const proxyquire = require('proxyquire');
const fs = require('fs');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const mythril = require('../lib/mythril');
const esReporter = require('../lib/es-reporter');


async function assertThrowsAsync(fn, message) {
  let f = () => {};
  try {
    await fn();
  } catch(e) {
    f = () => { throw e };
  } finally {
    assert.throws(f, message);
  }
}

describe('helpers.js', function() {
  let helpers;

  describe('test helper functions', () => {
    beforeEach(function () {
      helpers = proxyquire('../helpers', {});
    });

    it('should call printVersion', async () => {
      const stubAPI = sinon.stub(armlet, 'ApiVersion').returns('1.0.0');
      const stubLog = sinon.stub(console, 'log');
      await helpers.printVersion();
      assert.ok(stubAPI.called);
      assert.ok(stubLog.called);
      stubLog.restore();
    });

    it('should display helpMessage', async () => {
      const stubLog = sinon.stub(console, 'log');
      await helpers.printHelpMessage();
      assert.ok(stubLog.called);
      stubLog.restore();
    });
  });

  describe('Armlet authentication analyze', () => {
    let helpers;
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
        MYTHRIL_PASSWORD: process.env.MYTHRIL_PASSWORD,
        MYTHRIL_API_KEY: process.env.MYTHRIL_API_KEY,
        MYTHRIL_EMAIL: process.env.MYTHRIL_EMAIL,
        MYTHRIL_ETH_ADDRESS: process.env.MYTHRIL_ETH_ADDRESS,
      }

      // clear envronment variables for tests
      delete process.env.MYTHRIL_PASSWORD;
      delete process.env.MYTHRIL_API_KEY;
      delete process.env.MYTHRIL_EMAIL;
      delete process.env.MYTHRIL_ETH_ADDRESS;
     
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
      process.env.MYTHRIL_PASSWORD = initialEnVars.MYTHRIL_PASSWORD;
      process.env.MYTHRIL_API_KEY = initialEnVars.MYTHRIL_API_KEY;
      process.env.MYTHRIL_EMAIL = initialEnVars.MYTHRIL_EMAIL;
      process.env.MYTHRIL_ETH_ADDRESS = initialEnVars.MYTHRIL_ETH_ADDRESS;
      initialEnVars = null;
      readFileStub.restore();
      getTruffleBuildJsonFilesStub.restore();
    });

    it('should throw exception when no password or API key privided', async () => {
      await assertThrowsAsync(
        async () => {
          await helpers.analyze({
            _: ['TestContract.json'],
            working_drectory: '/tests',
            contracts_build_directory: '/tests/build/contracts',
        })
      }, /You need to set environment variable MYTHRIL_PASSWORD to run analyze./);
    });

    it('should throw exception when neither email or ethAddress are provided', async () => {
      process.env.MYTHRIL_PASSWORD = 'password'
      await assertThrowsAsync(
        async () => {
          await helpers.analyze({
            _: ['TestContract.json'],
            working_drectory: '/tests',
            contracts_build_directory: '/tests/build/contracts',
        })
      }, /You need to set either environment variable MYTHRIL_ETH_ADDRESS or MYTHRIL_EMAIL to run analyze./);
      delete process.env.MYTHRIL_PASSWORD;
    });

    it('should execute successfully with api key', async () => {
      process.env.MYTHRIL_API_KEY = 'api-key'
      const armletAnalyzeStub = sinon.stub(armlet.Client.prototype, 'analyze').resolves([]);
      const issues2EslintStub = sinon.stub(mythril, 'issues2Eslint').returns([]);
      const esReporterSpy = sinon.spy(esReporter, 'printReport');
      await helpers.analyze({
        _: ['TestContract.json'],
        debug: true,
        working_drectory: '/tests',
        contracts_build_directory: '/tests/build/contracts',
        logger: console,
        data: {},
      })
      delete process.env.MYTHRIL_API_KEY;
      assert.ok(armletAnalyzeStub.called);
      assert.ok(issues2EslintStub.called);
      assert.ok(esReporterSpy.called);
      armletAnalyzeStub.restore();
      issues2EslintStub.restore();
      esReporterSpy.restore();
    });

    it('should execute successfully with password and email', async () => {
      process.env.MYTHRIL_PASSWORD = 'password'
      process.env.MYTHRIL_EMAIL = 'test@test.com'
      const armletAnalyzeStub = sinon.stub(armlet.Client.prototype, 'analyze').resolves([]);
      const issues2EslintStub = sinon.stub(mythril, 'issues2Eslint').returns([]);
      const esReporterSpy = sinon.spy(esReporter, 'printReport');
      await helpers.analyze({
        _: ['TestContract.json'],
        debug: true,
        working_drectory: '/tests',
        contracts_build_directory: '/tests/build/contracts',
        logger: console,
        data: {},
      })
      delete process.env.MYTHRIL_API_KEY;
      delete process.env.MYTHRIL_EMAIL;
      assert.ok(armletAnalyzeStub.called);
      assert.ok(issues2EslintStub.called);
      assert.ok(esReporterSpy.called);
      armletAnalyzeStub.restore();
      issues2EslintStub.restore();
      esReporterSpy.restore();
    });

    it('should execute successfully with password and ethAddress', async () => {
      process.env.MYTHRIL_PASSWORD = 'password'
      process.env.MYTHRIL_ETH_ADDRESS = '0x1234567890'
      const armletAnalyzeStub = sinon.stub(armlet.Client.prototype, 'analyze').resolves([]);
      const issues2EslintStub = sinon.stub(mythril, 'issues2Eslint').returns([]);
      const esReporterSpy = sinon.spy(esReporter, 'printReport');
      await helpers.analyze({
        _: ['TestContract.json'],
        debug: true,
        working_drectory: '/tests',
        contracts_build_directory: '/tests/build/contracts',
        logger: console,
        data: {},
      })
      delete process.env.MYTHRIL_API_KEY;
      delete process.env.MYTHRIL_ETH_ADDRESS;
      assert.ok(armletAnalyzeStub.calledTwice);
      assert.ok(issues2EslintStub.calledTwice);
      assert.ok(esReporterSpy.calledTwice);
      armletAnalyzeStub.restore();
      issues2EslintStub.restore();
      esReporterSpy.restore();
    });
  });
});
