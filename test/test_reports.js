const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
// const path = require('path');
// const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
// const mythx = require('../lib/mythx');
// const util = require('util');
// const yaml = require('js-yaml');
const rewiredReports = rewire('../utils/reports');

describe('Reporting Utilities', function() {
    let reports;

    beforeEach(function() {
        reports = proxyquire('../utils/reports', {});
    });

    function compareTest(line1, col1, line2, col2, expect) {
        const res = reports.compareLineCol(line1, col1, line2, col2);
        if (expect === '=') {
            assert.ok(res === 0);
        } else if (expect === '<') {
            assert.ok(res < 0);
        } else if (expect === '>') {
            assert.ok(res > 0);
        } else {
            assert.throws(
                `invalid test expect symbol ${expect}; '=', '<', or '>' expected`
            );
        }
    }

    it('should compare two line/column pairs properly', () => {
        const expected = [
            [1, 5, 1, 5, '='],
            [1, 4, 1, 5, '<'],
            [2, 4, 1, 5, '>'],
            [1, 6, 1, 5, '>'],
            [1, 6, 2, 4, '<'],
        ];
        for (const t of expected) {
            compareTest(t[0], t[1], t[2], t[3], t[4]);
        }
    });

    describe('Armlet authentication analyze', () => {
        let readFileStub;
        let getTruffleBuildJsonFilesStub;
        let initialEnVars;
        let helpers;

        const buildJson = JSON.stringify({
            contractName: 'TestContract',
            ast: {
                absolutePath: '/test/build/contracts/TestContract.json',
            },
            deployedBytecode: '0x6080604052',
            sourcePath: '/test/contracts/TestContract/TestContract.sol',
        });

        const buildJson2 = JSON.stringify({
            contractName: 'OtherContract',
            ast: {
                absolutePath: '/test/build/contracts/OtherContract.json',
            },
            deployedBytecode: '0x6080604052',
            sourcePath: '/test/contracts/OtherContract/OtherContract.sol',
        });

        beforeEach(function() {
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
                .resolves([
                    '/test/build/contracts/TestContract.json',
                    '/test/build/contracts/OtherContract.json',
                ]);

            readFileStub = sinon.stub(fs, 'readFile');
            readFileStub.onFirstCall().yields(null, buildJson);
            readFileStub.onSecondCall().yields(null, buildJson2);

            helpers = proxyquire('../utils/reports', {
                fs: {
                    readFile: readFileStub,
                },
                trufstuf: {
                    getTruffleBuildJsonFiles: getTruffleBuildJsonFilesStub,
                },
            });
        });

        afterEach(function() {
            process.env.MYTHX_PASSWORD = initialEnVars.MYTHX_PASSWORD;
            process.env.MYTHX_API_KEY = initialEnVars.MYTHX_API_KEY;
            process.env.MYTHX_EMAIL = initialEnVars.MYTHX_EMAIL;
            process.env.MYTHX_ETH_ADDRESS = initialEnVars.MYTHX_ETH_ADDRESS;
            initialEnVars = null;
            readFileStub.restore();
            getTruffleBuildJsonFilesStub.restore();
        });

        it('it should group eslint issues by filenames', () => {
            const issues = [
                {
                    errorCount: 1,
                    warningCount: 1,
                    fixableErrorCount: 0,
                    fixableWarningCount: 0,
                    filePath: '/tmp/test_dir/contract.sol',
                    messages: ['message 1', 'message 2'],
                },
                {
                    errorCount: 0,
                    warningCount: 1,
                    fixableErrorCount: 0,
                    fixableWarningCount: 0,
                    filePath: '/tmp/test_dir/contract2.sol',
                    messages: ['message 3'],
                },
                {
                    errorCount: 0,
                    warningCount: 1,
                    fixableErrorCount: 0,
                    fixableWarningCount: 0,
                    filePath: '/tmp/test_dir/contract.sol',
                    messages: ['message 4'],
                },
            ];

            let result = rewiredReports.__get__('groupEslintIssuesByBasename')(
                issues
            );
            console.log(result);
            console.log([
                {
                    errorCount: 1,
                    warningCount: 2,
                    fixableErrorCount: 0,
                    fixableWarningCount: 0,
                    filePath: '/tmp/test_dir/contract.sol',
                    messages: ['message 1', 'message 2', 'message 4'],
                },
                {
                    errorCount: 0,
                    warningCount: 1,
                    fixableErrorCount: 0,
                    fixableWarningCount: 0,
                    filePath: '/tmp/test_dir/contract2.sol',
                    messages: ['message 3'],
                },
            ]);
            result.then(resultAfterPromise => {
                assert.deepEqual(resultAfterPromise, [
                    {
                        errorCount: 1,
                        warningCount: 2,
                        fixableErrorCount: 0,
                        fixableWarningCount: 0,
                        filePath: '/tmp/test_dir/contract.sol',
                        messages: ['message 1', 'message 2', 'message 4'],
                    },
                    {
                        errorCount: 0,
                        warningCount: 1,
                        fixableErrorCount: 0,
                        fixableWarningCount: 0,
                        filePath: '/tmp/test_dir/contract2.sol',
                        messages: ['message 3'],
                    },
                ]);

                return;
            });
        });
    });
});
