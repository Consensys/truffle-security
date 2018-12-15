const assert = require('assert');
const SrcMap = require('../lib/srcmap');
/**
const sinon = require('sinon');
const solc = require('solc');
**/

describe('srcmap', function() {
    /****
    it('should compile solidity file', () => {
        const solcStub = sinon.stub(solc, 'compileStandardWrapper');
        solcStub.returns('{"foo": "bar"}');
        SrcMap.compileContract('');
        assert.ok(solcStub.called);
        solcStub.restore();
    });

    it('should give back an AST we can use', () =>  {
        const soliditySource = 'pragma solidity ^0.4.22;\ncontract Simple { }\n';

        const solJSON = SrcMap.compileContract(soliditySource);
        assert.ok('test.sol' in solJSON.sources,
            'JSON contract name is there');
        const sources = solJSON.sources;
        assert.ok('legacyAST' in sources['test.sol'],
            'have legacyAST object');
        const ast = sources['test.sol'].legacyAST;
        assert.ok(ast, 'Have an AST');
        assert.ok('children' in ast);
    }).timeout(4000);

       const fs = require('fs');
       it("should give find an AST we can use", () =>  {
       fs.readFile('./data/storage.json', 'utf8', function (err, data) {
       if (err) throw err;
       const obj = JSON.parse(data);
       });
       });
  ***/

    it('should map bytecode offsets to instructions', () =>  {
        assert.deepEqual(SrcMap.makeOffset2InstNum('60806040526020604051'),
            { '1': 0, '3': 1, '4': 2, '6': 3, '8': 4, '9': 5 });
    });
});
