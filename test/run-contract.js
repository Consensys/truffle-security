#!/usr/bin/env node
// FIXME: Does not work
const armlet = require('armlet');

function getFormatter(style) {
    const formatterName = style || 'stylish';
    try {
        return require(`eslint/lib/formatters/${formatterName}`);
    } catch (ex) {
        ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
            ex.message
        }`;
        throw ex;
    }
}

let armletOptions = {
    // ethAddress: process.env.MYTHX_ETH_ADDRESS,
    password: process.env.MYTHX_PASSWORD,
    platforms: ['truffle']  // client chargeback
};

if (process.env.MYTHX_PASSWORD === undefined) {
    console.log('You need to set environment variable '
                       + 'MYTHX_PASSWORD to run analyze.');
    return;
}

if (process.env.MYTHX_ETH_ADDRESS) {
    armletOptions.ethAddress = process.env.MYTHX_ETH_ADDRESS;
} else if (process.env.MYTHX_EMAIL) {
    armletOptions.email = process.env.MYTHX_EMAIL;
} else {
    console.log('You need to set either environment variable '
                       + 'MYTHX_ETH_ADDRESS or MYTHX_EMAIL to run analyze.');
}

var client = new armlet.Client(armletOptions);

var buildObj = {
    'contractName': 'SimpleDAO',
    'analysisMode': 'full',
    'abi': [
        {'constant':true,
            'inputs':[{'name':'',
                'type':'address'}]}],
    'bytecode':'0x608060405234801561001057600080fd5b50610320806100206000396000f300608060405260043610610061576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168062362a95146100665780632e1a7d4d1461009c57806359f1286d146100c9578063d5d44d8014610120575b600080fd5b61009a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610177565b005b3480156100a857600080fd5b506100c7600480360381019080803590602001909291905050506101c6565b005b3480156100d557600080fd5b5061010a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610294565b6040518082815260200191505060405180910390f35b34801561012c57600080fd5b50610161600480360381019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506102dc565b6040518082815260200191505060405180910390f35b346000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254019250508190555050565b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515610291573373ffffffffffffffffffffffffffffffffffffffff168160405160006040518083038185875af192505050151561024457600080fd5b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b50565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600060205280600052604060002060009150905054815600a165627a7a72305820682f37da4d79d535733d236127bfb99bc8e8214b575c4ef2521accae7e6b4e330029',
    'deployedBytecode':'0x608060405260043610610061576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff168062362a95146100665780632e1a7d4d1461009c57806359f1286d146100c9578063d5d44d8014610120575b600080fd5b61009a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610177565b005b3480156100a857600080fd5b506100c7600480360381019080803590602001909291905050506101c6565b005b3480156100d557600080fd5b5061010a600480360381019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610294565b6040518082815260200191505060405180910390f35b34801561012c57600080fd5b50610161600480360381019080803573ffffffffffffffffffffffffffffffffffffffff1690602001909291905050506102dc565b6040518082815260200191505060405180910390f35b346000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254019250508190555050565b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515610291573373ffffffffffffffffffffffffffffffffffffffff168160405160006040518083038185875af192505050151561024457600080fd5b806000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b50565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b600060205280600052604060002060009150905054815600a165627a7a72305820682f37da4d79d535733d236127bfb99bc8e8214b575c4ef2521accae7e6b4e330029',
    'sourceMap': '195:408:1:-;;;;8:9:-1;5:2;;;30:1;27;20:12;5:2;195:408:1;;;;;;;',
    'deployedSourceMap': '195:408:1:-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;262:76;;;;;;;;;;;;;;;;;;;;;;;;;;;;342:169;;8:9:-1;5:2;;;30:1;27;20:12;5:2;342:169:1;;;;;;;;;;;;;;;;;;;;;;;;;;515:86;;8:9:-1;5:2;;;30:1;27;20:12;5:2;515:86:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;218:39;;8:9:-1;5:2;;;30:1;27;20:12;5:2;218:39:1;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;262:76;324:9;310:6;:10;317:2;310:10;;;;;;;;;;;;;;;;:23;;;;;;;;;;;262:76;:::o;342:169::-;410:6;389;:18;396:10;389:18;;;;;;;;;;;;;;;;:27;;385:122;;;434:10;:15;;456:6;434:31;;;;;;;;;;;;;;;;;426:40;;;;;;;;494:6;474;:18;481:10;474:18;;;;;;;;;;;;;;;;:26;;;;;;;;;;;385:122;342:169;:::o;515:86::-;568:4;586:6;:10;593:2;586:10;;;;;;;;;;;;;;;;579:17;;515:86;;;:::o;218:39::-;;;;;;;;;;;;;;;;;:::o',
    'sourceList': ['SimpleDAO'],
    'sources': {
        'SimpleDAO':['/*\n * @source: http://blockchain.unica.it/projects/ethereum-survey/attacks.html#simpledao\n * @author: Atzei N., Bartoletti M., Cimoli T\n * Modified by Josselin Feist\n */\npragma solidity 0.4.25;\n\ncontract SimpleDAO {\n  mapping (address => uint) public credit;\n\n  function donate(address to) payable public{\n    credit[to] += msg.value;\n  }\n\n  function withdraw(uint amount) public{\n    if (credit[msg.sender]>= amount) {\n      require(msg.sender.call.value(amount)());\n      credit[msg.sender]-=amount;\n    }\n  }\n\n  function queryCredit(address to) view public returns(uint){\n    return credit[to];\n  }\n}\n']
    }
};

const options = {
    debug: true,
    data: buildObj
};

const solidityFile = 'SimpleDAO.sol';
client.analyze(options)
    .then(issues => {
        const formatter = getFormatter('stylish');
        let esIssues = mythx.issues2Eslint(issues, buildObj, options);
        // console.log(esIssues); // debug
        // esReporter.printReport(esIssues, solidityFile, formatter, console.log);
    }).catch(err => {
        console.log(err);
    });
