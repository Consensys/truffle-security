const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
// const path = require('path');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
// const mythx = require('../lib/mythx');
// const util = require('util');
// const yaml = require('js-yaml');
const rewiredBuild = rewire('../utils/buildutils');
const rewiredHelpers = rewire('../helpers');

describe('Build Utilities', function() {
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
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
            assert.ok(!stub.called);
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit bytecode when bytecode is empty', () => {
            const stub = sinon.stub();
            truffleJSON.bytecode = '';
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
            assert.ok(stub.called);
            delete truffleJSON.bytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit bytecode when bytecode is 0x', () => {
            const stub = sinon.stub();
            truffleJSON.bytecode = '0x';
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
            assert.ok(stub.called);
            delete truffleJSON.bytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedBytecode when deployedBytecode is empty', () => {
            const stub = sinon.stub();
            truffleJSON.deployedBytecode = '';
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
            assert.ok(stub.called);
            delete truffleJSON.deployedBytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedBytecode when deployedBytecode is 0x', () => {
            const stub = sinon.stub();
            truffleJSON.deployedBytecode = '0x';
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
            assert.ok(stub.called);
            delete truffleJSON.deployedBytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit sourceMap when sourceMap is empty', () => {
            const stub = sinon.stub();
            truffleJSON.sourceMap = '';
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
            assert.ok(stub.called);
            delete truffleJSON.sourceMap;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedSourceMap when deployedSourceMap is empty', () => {
            const stub = sinon.stub();
            truffleJSON.deployedSourceMap = '';
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                true,
                stub
            );
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
            const result = rewiredBuild.cleanAnalyzeDataEmptyProps(
                truffleJSON,
                false,
                stub
            );
            delete truffleJSON.sourceMap;
            delete truffleJSON.deployedSourceMap;
            delete truffleJSON.bytecode;
            delete truffleJSON.deployedBytecode;
            assert.ok(!stub.called);
            assert.deepEqual(result, truffleJSON);
        });
    });
});
