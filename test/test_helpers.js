const assert = require('assert');
const armlet = require('armlet');
const sinon = require('sinon');
const contracts = require("truffle-workflow-compile");
const helpers = require('../helpers');
const trufstuf = require('../lib/trufstuf');


describe('helpers.js', function() {
  it('should call printVersion', async () => {
    const stubAPI = sinon.stub(armlet, 'ApiVersion').returns('1.0.0');
    const stubLog = sinon.stub(console, 'log');
    const version = await helpers.printVersion();
    assert.equal(version, '1.0.0')
    assert.ok(stubAPI.called);
    assert.ok(stubLog.called);
    stubLog.restore();
  });

  it('should get contract json and sol locations', async () => {
    sinon
      .stub(trufstuf, 'getContractsDir')
      .returns('/tests/contracts/TestContract');
    sinon
      .stub(trufstuf, 'guessTruffleBuildJson')
      .returns('TestContract.json');

    const details = await helpers.getSolidityDetails({
      _: ['/tests.json'],
      working_drectory: '/tests',
      contracts_build_directory: '/tests/build/contracts',
    });
    assert.equal(details.solidityFile, '/tests/contracts/TestContract/TestContract.sol')
    assert.equal(details.buildJsonPath, '/tests/build/contracts/TestContract.json')
  });
});
