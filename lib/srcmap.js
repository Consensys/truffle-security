// Things involving the richer solc source map with its AST.
// We use this to filter out some MythX error messages.
//
'use strict';

const remixUtil = require('remix-lib/src/util');
const SourceMappingDecoder = require('./sourceMappingDecoder.js');
const opcodes = require('remix-lib/src/code/opcodes');

module.exports = {
    /**
     *  Return the VariableDeclaration AST node associated with instIndex
     *  if there is one. Otherwise return null.
     *  @param {instIndex} integer - bytecode offset of instruction
     *  @param {sourceMap} string  - solc srcmap used to associate the instruction
     *                               with an ast node
     *  @param {ast}               - solc root AST for contract
     *  @return {AST node or null}
     *
     */
    isVariableDeclaration: function (instIndex, sourceMap, ast) {
        const sourceMappingDecoder = new SourceMappingDecoder();
        return sourceMappingDecoder.findNodeAtInstructionIndex('VariableDeclaration',
            instIndex, sourceMap, ast);
    },

    /**
     *  Return the true is AST node is a public array.
     *  @param {node} AST node     - bytecode offset of instruction
     *  @return {boolean}
     *
     */
    isDynamicArray: function (node) {
        // FIXME: do we want to check:
        // constant: false
        // storageLocation: 'default'
        return (node.stateVariable &&
            node.visibility === 'public' &&
            node.typeName.nodeType === 'ArrayTypeName');
    },

    /**
      *  Takes a bytecode hexstring and returns a map indexed by offset
      *  that give the instruction number for that offset.
      *
      *  @param {hexstr} string     - bytecode hexstring
      *  @return {array mapping bytecode offset to an instruction number}
      *
      */
    makeOffset2InstNum: function(hexstr) {
        const bytecode = remixUtil.hexToIntArray(hexstr);
        const instMap = {};
        let j = -1;
        for (let i = 0; i < bytecode.length; i++) {
            j++;
            const opcode = opcodes(bytecode[i], true);
            if (opcode.name.slice(0, 4) === 'PUSH') {
                let length = bytecode[i] - 0x5f;
                i += length;
            }
            instMap[i] = j;
        }
        return instMap;
    },
};
