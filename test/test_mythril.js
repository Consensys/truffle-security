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
        let truffleJSON;
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        
        beforeEach(done => { 
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                done();
            })
        });

        it('should not mutate truffleJSON', (done) => {
            const newJSON = mythrilRewired.truffle2MythrilJSON(truffleJSON);
            assert.notEqual(truffleJSON, newJSON);
            assert.deepEqual(newJSON.sourceList, [truffleJSON.ast.absolutePath]);
            assert.equal(newJSON.sources[truffleJSON.contractName], truffleJSON.source);
            done();
        });
    });

    describe('issues2Eslint', () => {
        let truffleJSON;
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        
        beforeEach(done => { 
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                done();
            })
        });

        it('calling issues2Eslint with truffleJSON should not break', (done) => {
            const res = mythrilRewired.issues2Eslint([], truffleJSON, {});
            assert.deepEqual(res, []);
            done();
        });
    });

    describe('Info class', () => {
        let truffleJSON;
        const InfoClass = mythrilRewired.__get__('Info');
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        
        beforeEach(done => { 
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                done();
            })
        });

        it('should instantiate correctly', (done) => {
            const info = new InfoClass([], truffleJSON);
            assert.deepEqual(info.issues, []);
            assert.deepEqual(info.buildObj, truffleJSON);
            assert.deepEqual(info.ast, truffleJSON.ast);
            assert.deepEqual(info.sourceMap, truffleJSON.sourceMap);
            assert.deepEqual(info.deployedSourceMap, truffleJSON.deployedSourceMap);
            done();
        });
    
        it('should instantiate correctly after truffle2MythrilJSON was called', (done) => {
            mythrilRewired.truffle2MythrilJSON(truffleJSON);
    
            const info = new InfoClass([], truffleJSON);
            assert.deepEqual(info.issues, []);
            assert.deepEqual(info.buildObj, truffleJSON);
            assert.deepEqual(info.ast, truffleJSON.ast);
            assert.deepEqual(info.sourceMap, truffleJSON.sourceMap);
            assert.deepEqual(info.deployedSourceMap, truffleJSON.deployedSourceMap);
            done();
        });
    });
});
