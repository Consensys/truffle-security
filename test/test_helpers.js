const assert = require('assert');
const proxyquire = require('proxyquire');
const fs = require('fs');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const esReporter = require('../lib/es-reporter');


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

        it('should throw exception when no password or API key privided', async () => {
            await assertThrowsAsync(
                async () => {
                    await helpers.analyze({
                        _: ['analyze'],
                        working_drectory: '/tests',
                        contracts_build_directory: '/tests/build/contracts',
                    });
                }, /You need to set environment variable MYTHX_PASSWORD to run analyze./);
        });

        it('should throw exception when neither email or ethAddress are provided', async () => {
            process.env.MYTHX_PASSWORD = 'password';
            await assertThrowsAsync(
                async () => {
                    await helpers.analyze({
                        _: ['analyze'],
                        working_drectory: '/tests',
                        contracts_build_directory: '/tests/build/contracts',
                    });
                }, /You need to set either environment variable MYTHX_ETH_ADDRESS or MYTHX_EMAIL to run analyze./);
            delete process.env.MYTHX_PASSWORD;
        });
    });
});
