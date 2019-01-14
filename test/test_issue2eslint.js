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
    });
});
