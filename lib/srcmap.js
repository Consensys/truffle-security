'use strict';

const remixUtil = require('remix-lib/src/util');
const SourceMappingDecoder = require('remix-lib/src/sourceMappingDecoder.js');
const opcodes = require('remix-lib/src/code/opcodes');

const compilerInput = require('remix-lib/src/helpers/compilerHelper').compilerInput;
const compiler = require('solc');

module.exports = {
    /* FIXME: truffle uses solc-js in a way that doesn't give
       as precise output as is obtained using a straight solc-js compile
       or as you get which you run solc directly. Until we have this
       sorted out, we use a remix library routine which gets the
       better information out of solc-js.
    */
    compileContract: function (contractSource) {
        var output = compiler.compileStandardWrapper(compilerInput(contractSource));
        return JSON.parse(output);
    },

    isVariableDeclaration: function (instIndex, sourceMap, ast) {
        const sourceMappingDecoder = new SourceMappingDecoder();
        return sourceMappingDecoder.findNodeAtInstructionIndex('VariableDeclaration',
            instIndex, sourceMap, ast);
    },

    isDynamicArray: function (node) {
        var attrib = node.attributes;
        // FIXME: do we want to check:
        // constant: false
        // storageLocation: 'default'
        return (attrib.stateVariable &&
            attrib.visibility === 'public' &&
            node.children && node.children[0].name === 'ArrayTypeName');
    },

    /* Create a mapping from bytecode offset to instruction number */
    makeOffset2InstNum: function(hexstr) {
        let bytecode = remixUtil.hexToIntArray(hexstr);
        let instMap = {};
        let j = -1;
        for (let i = 0; i < bytecode.length; i++) {
            j++;
            let opcode = opcodes(bytecode[i], true);
            if (opcode.name.slice(0, 4) === 'PUSH') {
                let length = bytecode[i] - 0x5f;
                i += length;
            }
            instMap[i] = j;
        }
        return instMap;
    },
};
