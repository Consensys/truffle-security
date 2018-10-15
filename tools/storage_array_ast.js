#!/usr/bin/env node
/* This program creates AST of the right kind
   In srcmap testing */
const SrcMap = require("../lib/srcmap");

const soliditySource = `pragma solidity ^0.4.22;

contract PublicStorageArray {
    bytes32[] public states = [bytes32(0)];
}`

const solJSON = SrcMap.compileContract(soliditySource);
const ast = solJSON.sources.legacyAST
const fs = require('fs');
fs.writeFile('../test/data/storage.json', JSON.stringify(solJSON, null, 4));
