const assert = require('assert');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');


describe('trufstuf', () => {
    let trufstuf;
    const statStub = sinon.stub();
    const readdirStub = sinon.stub();

    beforeEach(() => {
        trufstuf = proxyquire('../lib/trufstuf', {
            fs: {
                readdir: readdirStub,
                readFile: (filePath, encoding, cb) => cb(null, '{"content": "content"}'),
                stat: statStub,
            }
        });
    });

    afterEach(() => {
        statStub.reset();
        readdirStub.reset();
    })

    it('should return paths to solidity file from smart contract json object', async () => {
        const obj = {
            'contractName': 'Contract',
            'abi': [],
            'bytecode': '0x6080604052602060405190810160405280600060010260001916600019168152506000906001610030929190610043565b5034801561003d57600080fd5b506100bb565b828054828255906000526020600020908101928215610085579160200282015b82811115610084578251829060001916905591602001919060010190610063565b5b5090506100929190610096565b5090565b6100b891905b808211156100b457600081600090555060010161009c565b5090565b90565b60d8806100c96000396000f300608060405260043610603f576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168063017a9105146044575b600080fd5b348015604f57600080fd5b50606c60048036038101908080359060200190929190505050608a565b60405180826000191660001916815260200191505060405180910390f35b600081815481101515609857fe5b9060005260206000200160009150905054815600a165627a7a72305820d1c4ab8874b5f3cc139613c225a5908ed916e813f5ccdf9a9de97ce28420ca090029',
            'deployedBytecode': '0x608060405260043610603f576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168063017a9105146044575b600080fd5b348015604f57600080fd5b50606c60048036038101908080359060200190929190505050608a565b60405180826000191660001916815260200191505060405180910390f35b600081815481101515609857fe5b9060005260206000200160009150905054815600a165627a7a72305820d1c4ab8874b5f3cc139613c225a5908ed916e813f5ccdf9a9de97ce28420ca090029',
            'sourceMap': '26:75:1:-;;;60:38;;;;;;;;;95:1;87:10;;60:38;;;;;;;;;;;;;;;;;:::i;:::-;;26:75;8:9:-1;5:2;;;30:1;27;20:12;5:2;26:75:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;:::o;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o;:::-;;;;;;;',
            'deployedSourceMap': '26:75:1:-;;;;;;;;;;;;;;;;;;;;;;;;60:38;;8:9:-1;5:2;;;30:1;27;20:12;5:2;60:38:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::o',
            'source': 'pragma solidity ^0.4.22;\n\ncontract Contract {\n    bytes32[] public states = [bytes32(0)];\n}\n',
            'sourcePath': 'test/truffle-analyze/contracts/Contract.sol',
            'ast': {}
        };
        const solFile = trufstuf.getSolidityFileFromJson(obj);
        assert.equal(solFile, 'test/truffle-analyze/contracts/Contract.sol');
    });

    it('should read and parse JSON File', async () => {
        const result = await trufstuf.parseBuildJson('filePath');
        assert.deepEqual(result, { content: 'content' });
    });

    it('should return paths of filtered JSON files', async () => {
        statStub.yields(null, { mtime: 1000000 });
        statStub.onCall(2).yields('error');
        

        readdirStub.yields(null, [
            'Contract.json',
            'Migrations.json',
            'OtherContract.json',
        ]);

        const files = await trufstuf.getTruffleBuildJsonFiles('/test/build/contracts');
        assert.deepEqual(files, [
            '/test/build/contracts/Contract.json',
            '/test/build/contracts/OtherContract.json',
        ]);
    });
});
