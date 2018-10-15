'use strict';

const remixUtil = require('remix-lib/src/util');
const SourceMappingDecoder = require('remix-lib/src/sourceMappingDecoder.js');
const opcodes = require('remix-lib/src/code/opcodes');

const compilerInput = require('remix-lib/src/helpers/compilerHelper').compilerInput;
const compiler = require('solc');

module.exports = {
  compileContract: function (contracts) {
    const input = compilerInput(contracts);
    debugger
    const output = compiler.compileStandardWrapper();
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
