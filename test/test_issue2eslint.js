const assert = require('assert');
const sinon = require('sinon');
const rewire = require('rewire');
const fs = require('fs');
const srcmap = require('../lib/srcmap');
const mythx = require('../lib/mythx');
const rewired = rewire('../lib/issues2eslint');
const issues2eslint = require('../lib/issues2eslint');

describe('issues2Eslint', function() {
    describe('MythXIssues class', () => {
        let truffleJSON;
        const MythXIssues = rewired.__get__('MythXIssues');
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
        const sourceName = 'simple_dao.sol';

	const config = {
	    debug: false,
	    logger: console
	}

	function newIssueObject(options) {
        if (!options) options = config;
	    return new MythXIssues(truffleJSON, options);
	}

        beforeEach(done => {
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                const parsed = JSON.parse(data);
                truffleJSON = mythx.newTruffleObjToOldTruffleByContracts(parsed)[0];
                done();
            });
        });

        it('should decode a source code location correctly', (done) => {
            const issuesObject = newIssueObject();
            assert.deepEqual(issuesObject.textSrcEntry2lineColumn('30:2:0', issuesObject.lineBreakPositions[sourceName]),
                [ { 'line': 2, 'column': 27 }, { 'line': 2, 'column': 29 } ]);

            done();
        });

        it('should decode a bytecode offset correctly', (done) => {
            const issuesObject = newIssueObject();
            assert.deepEqual(issuesObject.byteOffset2lineColumn('100', issuesObject.lineBreakPositions[sourceName]),
                             [ { 'line': 8, 'column': 0 }, { 'line': 25, 'column': 1 } ]);
            done();
        });

        it('should decode a bytecode offset to empty result', (done) => {
            const issuesObject = newIssueObject();
            assert.deepEqual(issuesObject.byteOffset2lineColumn('50', issuesObject.lineBreakPositions[sourceName]),
                             [ { 'line': -1, 'column': 0 }, { } ]);
            done();
        });

        it('should convert MythX issue to Eslint style with sourceFormat: evm-byzantium-bytecode', () => {
            const mythXOutput = {
                'sourceFormat': 'evm-byzantium-bytecode',
                'sourceList': [
                    `/tmp/contracts/${sourceName}`
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
            };

            const remappedMythXOutput = mythx.remapMythXOutput(mythXOutput);
            const issuesObject = newIssueObject();
            const res = issuesObject.issue2EsLint(remappedMythXOutput[0].issues[0], false, 'evm-byzantium-bytecode', sourceName);

            assert.deepEqual({
                ruleId: 'SWC-000',
                column: 4,
                line: 12,
                endCol: 27,
                endLine: 12,
                fatal: false,
                message: 'Head message Tail message',
                mythXseverity: 'High',
                severity: 2,
            },
            res);
        });

        it('should convert MythX issue to Eslint style with sourceFormat: text', () => {
            const mythXOutput = {
                'sourceType': 'solidity-file',
                'sourceFormat': 'text',
                'sourceList': [
                    `/tmp/contracts/${sourceName}`,
                ],
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'locations': [{
                        'sourceMap': '310:23:0'
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
            };

            const remappedMythXOutput = mythx.remapMythXOutput(mythXOutput);
            const issuesObject = newIssueObject();
            const res = issuesObject.issue2EsLint(remappedMythXOutput[0].issues[0], false, 'text', sourceName);

            assert.deepEqual({
                ruleId: 'SWC-000',
                column: 4,
                line: 12,
                endCol: 27,
                endLine: 12,
                fatal: false,
                message: 'Head message Tail message',
                mythXseverity: 'High',
                severity: 2,
            }, res);
        });


        it('should call isIgnorable correctly', () => {
            const spyIsVariableDeclaration = sinon.spy(srcmap, 'isVariableDeclaration');
            const spyIsDynamicArray = sinon.spy(srcmap, 'isDynamicArray');
            const issuesObject = newIssueObject();
            const res = issuesObject.isIgnorable('218:39:0');
            assert.ok(spyIsVariableDeclaration.called);
            assert.ok(spyIsDynamicArray.called);
            assert.ok(spyIsDynamicArray.returned(false));
            assert.equal(res, false);

            spyIsVariableDeclaration.restore();
            spyIsDynamicArray.restore();
        });

        it('should call isIgnorable correctly when issue is ignored', () => {
            const spyIsVariableDeclaration = sinon.spy(srcmap, 'isVariableDeclaration');
            const spyIsDynamicArray = sinon.stub(srcmap, 'isDynamicArray');
            spyIsDynamicArray.returns(true);
            const issuesObject = newIssueObject();
            const res = issuesObject.isIgnorable('218:39:0');
            assert.ok(spyIsVariableDeclaration.called);
            assert.ok(spyIsDynamicArray.called);
            assert.ok(res);
            spyIsVariableDeclaration.restore();
            spyIsDynamicArray.restore();
        });

        it('should call isIgnorable correctly when issue is ignored in debug mode', () => {
            const spyIsVariableDeclaration = sinon.spy(srcmap, 'isVariableDeclaration');
            const spyIsDynamicArray = sinon.stub(srcmap, 'isDynamicArray');
            const loggerStub = sinon.stub();
            spyIsDynamicArray.returns(true);
            const debugConfig = {
                debug: true,
                logger: { log: loggerStub }
            }
            const issuesObject = newIssueObject(debugConfig);
            const res = issuesObject.isIgnorable('218:39:0');
            assert.ok(spyIsVariableDeclaration.called);
            assert.ok(spyIsDynamicArray.called);
            assert.ok(loggerStub.called);
            assert.ok(res);
            spyIsVariableDeclaration.restore();
            spyIsDynamicArray.restore();
        });

        it('should convert mythX report to Eslint issues', () => {
            const mythXOutput = {
                'sourceType': 'solidity-file',
                'sourceFormat': 'text',
                'sourceList': [
                    `/tmp/contracts/${sourceName}`,
                ],
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'locations': [{
                        'sourceMap': '310:23:0'
                    }],
                    'severity': 'High',
                    'swcID': 'SWC-000',
                    'swcTitle': 'Test Title'
                }],
                'meta': {
                    'selected_compiler': '0.5.0',
                    'error': [],
                    'warning': [],
                }
            };

            const issuesObject = newIssueObject();
            const remappedMythXOutput = mythx.remapMythXOutput(mythXOutput);
            const result = remappedMythXOutput.map(output => issuesObject.convertMythXReport2EsIssue(output, {}, true));

            assert.deepEqual(result, [{
                errorCount: 1,
                warningCount: 0,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: '/tmp/contracts/simple_dao.sol',
                messages: [{
                    column: 4,
                    endCol: 27,
                    endLine: 12,
                    fatal: false,
                    line: 12,
                    message: 'Head message',
                    ruleId: 'SWC-000',
                    mythXseverity: 'High',
                    severity: 2,
                }],
            }]);
        });

	      it('should not filter my issue if the project config is left empty', () => {
            const issuesObject = newIssueObject();
            const issues = [issuesObject];
            const filteredIssues = issues.filter(issue => issues2eslint.keepIssueInResults(issue, {}));
            assert.deepEqual(issues, filteredIssues);
        });

        it('It normalize and store mythX API output', () => {
            const issuesObject = newIssueObject();
            const mythXOutput = [{
                'sourceType': 'solidity-file',
                'sourceFormat': 'text',
                'sourceList': [
                    `/tmp/contracts/${sourceName}`,
                ],
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'locations': [{
                        'sourceMap': '310:23:0'
                    }],
                    'severity': 'High',
                    'swcID': 'SWC-000',
                    'swcTitle': 'Test Title'
                }],
                'meta': {
                    'selected_compiler': '0.5.0',
                    'error': [],
                    'warning': [],
                    'logs': [{'level': 'info', 'msg': 'log message one'}, {'level': 'debug', 'msg': 'log message two'}]
                }
            }];

            issuesObject.setIssues(mythXOutput);

            assert.deepEqual(issuesObject.logs, [{'level': 'info', 'msg': 'log message one'}, {'level': 'debug', 'msg': 'log message two'}]);
            assert.deepEqual(issuesObject.issues, [{
                'sourceType': 'solidity-file',
                'sourceFormat': 'text',
                'source': '/tmp/contracts/simple_dao.sol',
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'sourceMap': '310:23:0',
                    'severity': 'High',
                    'swcID': 'SWC-000',
                    'swcTitle': 'Test Title',
                    'extra': undefined,
                }],
            }]);
        });

        it('It stores an empty array of logs when no logs object is in mythXOutput', () => {
            const issuesObject = new MythXIssues(truffleJSON, config);
            const mythXOutput = [{
                'sourceType': 'solidity-file',
                'sourceFormat': 'text',
                'sourceList': [
                    `/tmp/contracts/${sourceName}`,
                ],
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'locations': [{
                        'sourceMap': '310:23:0'
                    }],
                    'severity': 'High',
                    'swcID': 'SWC-000',
                    'swcTitle': 'Test Title'
                }],
                'meta': {
                    'selected_compiler': '0.5.0',
                    'error': [],
                    'warning': [],
                }
            }];

            issuesObject.setIssues(mythXOutput);
            assert.deepEqual(issuesObject.logs, []);
        });

        it('It converts mythX issues to ESLint issues output format', () => {
            const issuesObject = newIssueObject();
            const mythXOutput = [{
                'sourceType': 'solidity-file',
                'sourceFormat': 'text',
                'sourceList': [
                    `/tmp/contracts/${sourceName}`,
                ],
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'locations': [{
                        'sourceMap': '310:23:0'
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
            issuesObject.setIssues(mythXOutput);
            const result = issuesObject.getEslintIssues({}, true);
            assert.deepEqual(result, [{
                errorCount: 1,
                warningCount: 0,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: '/tmp/contracts/simple_dao.sol',
                messages: [{
                    ruleId: 'SWC-000',
                    line: 12,
                    column: 4,
                    endCol: 27,
                    endLine: 12,
                    message: 'Head message',
                    mythXseverity: 'High',
                    severity: 2,
                    fatal: false,
                }],
            }])
        });
    });
});
