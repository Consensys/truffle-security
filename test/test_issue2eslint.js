const assert = require('assert');
const rewire = require('rewire');
const fs = require('fs');
const rewired = rewire('../lib/issues2eslint');

describe('issues2Eslint', function() {
    describe('Info class', () => {
        let truffleJSON;
        const InfoClass = rewired.__get__('Info');
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;

        beforeEach(done => {
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                done();
            })
        });

        it('should decode a source code location correctly', (done) => {
            const info = new InfoClass([], truffleJSON);
            assert.deepEqual(info.textSrcEntry2lineColumn('30:2:0'),
                             [ { 'line': 2, 'column': 27 }, { 'line': 2, 'column': 29 } ]);

            done()
        });
        it('should decode a bytecode offset correctly', (done) => {
            const info = new InfoClass([], truffleJSON);
            assert.deepEqual(info.byteOffset2lineColumn('100'),
			     [ { 'line': 8, 'column': 0 }, { 'line': 25, 'column': 1 } ]);
            done()
        });

        it('should convert MythX issue to Eslint style with sourceFormat: evm-byzantium-bytecode', () => {
            const issue = {
                "description": {
                    "head": "Head message",
                    "tail": "Tail message"
                },
                "locations": [{
                    "sourceMap": "444:1:0"
                }],
                "severity": "High",
                "swcID": "SWC-000",
                "swcTitle": "Test Title"
            };

            const info = new InfoClass([], truffleJSON);
            const res = info.issue2EsLintNew(issue, false, 'evm-byzantium-bytecode', [
                "0x608060405260043610610061576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168062362a95146100665780632e1a7d4d1461009c57806359f1286d146100c9578063d5d44d8014610120575b600080fd5b61009a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610177565b005b3480156100a857600080fd5b506100c7600480360381019080803590602001909291905050506101c6565b005b3480156100d557600080fd5b5061010a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610294565b6040518082815260200191505060405180910390f35b34801561012c57600080fd5b50610161600480360381019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506102dc565b6040518082815260200191505060405180910390f35b346000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254019250508190555050565b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515610291573373ffffffffffffffffffffffffffffffffffffffff168160405160006040518083038185875af192505050151561024457600080fd5b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b50565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600060205280600052604060002060009150905054815600a165627a7a72305820995dd360cfe1e03c0dded401ac885f902c03677f72bdcce6d8d845db1f313dca0029"
            ], 'raw-bytecode');
    
            assert.deepEqual({
                ruleId: "SWC-000",
                column: 4,
                line: 12,
                endCol: 27,
                endLine: 12,
                fatal: false,
                message: "Head message Tail message",
                severity: "High",
                },
            res);
        });

        it('should convert MythX issue to Eslint style with sourceFormat: text', () => {
            const issue = {
                "description": {
                    "head": "Head message",
                    "tail": "Tail message"
                },
                "locations": [{
                    "sourceMap": "310:23:1",
                    "sourceFormat": "text",
                }],
                "severity": "High",
                "swcID": "SWC-000",
                "swcTitle": "Test Title"
            };

            const info = new InfoClass([], truffleJSON);
            const res = info.issue2EsLintNew(issue, false, 'evm-byzantium-bytecode', [
                "0x608060405260043610610061576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168062362a95146100665780632e1a7d4d1461009c57806359f1286d146100c9578063d5d44d8014610120575b600080fd5b61009a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610177565b005b3480156100a857600080fd5b506100c7600480360381019080803590602001909291905050506101c6565b005b3480156100d557600080fd5b5061010a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610294565b6040518082815260200191505060405180910390f35b34801561012c57600080fd5b50610161600480360381019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506102dc565b6040518082815260200191505060405180910390f35b346000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254019250508190555050565b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515610291573373ffffffffffffffffffffffffffffffffffffffff168160405160006040518083038185875af192505050151561024457600080fd5b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b50565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600060205280600052604060002060009150905054815600a165627a7a72305820995dd360cfe1e03c0dded401ac885f902c03677f72bdcce6d8d845db1f313dca0029"
            ], 'raw-bytecode');
    
            assert.deepEqual({
                ruleId: "SWC-000",
                column: 4,
                line: 12,
                endCol: 27,
                endLine: 12,
                fatal: false,
                message: "Head message Tail message",
                severity: "High",
                },
            res);
        });
    });
});
