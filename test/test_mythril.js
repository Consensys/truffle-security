const assert = require('assert');
const rewire = require('rewire');
const fs = require('fs');

const mythrilRewired = rewire('../lib/mythril');

describe('mythril', function() {
    describe('messageMessage', function() {
        const massageMessage = mythrilRewired.__get__('massageMessage');

        it('should display empty message', () => {
            const mess = massageMessage('');
            assert.equal(mess, '');
        });

        it('should display "no message"', () => {
            const mess = massageMessage();
            assert.equal(mess, 'no message');
        });

        it('should display first sentence', () => {
            const testMessage = 'Test string. This will not be shown.';
            const mess = massageMessage(testMessage);
            assert.equal(mess, 'Test string.');
        });

        it('should remove illegal characters', () => {
            const testMessage = '`Test`\n`string`.';
            const mess = massageMessage(testMessage);
            assert.equal(mess, '\'Test\' \'string\'.');
        });
    });
    describe('truffle2MythrilJSON', () => {
        let trufflJSON;
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        
        beforeEach(done => { 
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                trufflJSON = JSON.parse(data);
                done();
            })
        });

        it('should not mutate truffleJSON', (done) => {
            const newJSON = mythrilRewired.truffle2MythrilJSON(trufflJSON);
            assert.notEqual(trufflJSON, newJSON);
            assert.equal(newJSON.sourceList[0], trufflJSON.ast.absolutePath);
            assert.equal(newJSON.sources[trufflJSON.contractName], trufflJSON.source);
            done();
        });
    })
});
