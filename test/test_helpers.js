const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const rewiredHelpers = rewire('../helpers');


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

        it('it should group eslint issues by filenames', () => {
            const issues = [{
                errorCount: 1,
                warningCount: 1,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: '/tmp/contracts/contract.sol',
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
                filePath: 'contract2.sol',
                messages: [
                    'message 3'
                ]
            }]);
        });
    });
});
