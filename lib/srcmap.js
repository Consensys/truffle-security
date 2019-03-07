// Things involving the richer solc source map with its AST.
// We use this to filter out some MythX error messages.
//
'use strict';

const assert  = require('assert');
const remixUtil = require('remix-lib/src/util');
const SourceMappingDecoder = require('../compat/remix-lib/sourceMappingDecoder.js');
const opcodes = require('remix-lib/src/code/opcodes');

module.exports = {
    /**
     *  Return the VariableDeclaration AST node associated with instIndex
     *  if there is one. Otherwise return null.
     *  @param {sourceLocation} string  - solc srcmap used to associate the instruction
     *                                    with an ast node
     *  @param {ast}                    - solc root AST for contract
     *  @return {AST node or null}
     *
     */
    isVariableDeclaration: function (srcmap, ast) {
        const sourceMappingDecoder = new SourceMappingDecoder();
        const sourceLocation = sourceMappingDecoder.decode(srcmap);
        return sourceMappingDecoder.findNodeAtSourceLocation('VariableDeclaration',
            sourceLocation, ast);
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

    // FIXME: seenIndices is not being used. Remove it?
    /**
     *  @param {String} sourceMap     - solc-type sourceMap
     *  @return {Set} a set containing the "file" indices seen in a sourceMap
    */
    seenIndices: function(sourceMap) {
        const seen = new Set();
        const srcArray = sourceMap.split(';');
        for (const src of srcArray) {
            const fields = src.split(':');
            if (fields.length >= 3) {
                const index = fields[2];
                // File index -1 means no file exists.
                // Value '' means that the field is empty but present
                // to be able to give a 4th value.
                // Skip either of these.
                if (index !== '-1' && index !== '') {
                    seen.add(index);
                }
            }
        }
        return seen;
    },

    // FIXME: this is just a stopgap measure.
    // The caller in mythx should be fixed to we don't need this.
    /**
     *  @param {String} sourceMap     - solc-type sourceMap
     *  @return take sourceMap entries and turn them into file index 0
    */
    zeroedSourceMap: function(sourceMap) {
        const srcArray = sourceMap.split(';');
        let modArray = [];
        let indexSeen = -2;
        for (const src of srcArray) {
            const fields = src.split(':');
            if (fields.length >= 3) {
                const index = fields[2];
                if (index !== '-1' && index !== '') {
                    if (indexSeen !== -2) {
                        assert(indexSeen === index,
                            `assuming only one index ${indexSeen} needs moving; saw ${index} as well`);
                    }
                    fields[2] = '0';
                }
            }
            const modFields = fields.join(':');
            modArray.push(modFields);
        }
        return modArray.join(';');
    },
};
