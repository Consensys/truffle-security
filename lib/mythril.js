const SourceMappingDecoder = require('remix-lib/src/sourceMappingDecoder.js');
const srcmap = require('./srcmap.js');

exports.print = console.log;

/********************************************************
Mythril messages currently needs a bit of messaging to
be able to work within the Eslint framework. Some things
we handle here:

- long messages
  Chop at sentence boundary.
- Non-ASCII characters: /[\u0001-\u001A]/ (including \n)
  Remove them.
**********************************************************/
function massageMessage(mess) {
    // Mythril messages are long. Strip after first period.
    let sentMatch = mess.match('\\.[ \t\n]');
    if (sentMatch) {
        mess = mess.slice(0, sentMatch.index + 1);
    }

    // Remove characters that mess up table formatting
    // mess.replace(/[\u0001-\u001A]/, '');
    return mess;
}

/*
  Mythril seems to downplay severity. What eslint calls an "error",
  Mythril calls "warning". And what eslint calls "warning",
  Mythril calls "informational".
*/
const myth2Severity = {
    Informational: 3,
    Information: 3,  // Not needed as of commit #7b4fe76
    Warning: 2,
};

const myth2EslintField = {
    type: 'severity',
    address: 'addr2lineColumn', // Not used
    description: 'message',
};


// FIXME figure out how to export this class.
class Info {
    constructor(issues, buildObj) {
        this.issues = issues;
        this.buildObj = buildObj;

        // FIXME: we are using remix for parsing which uses
        // a different AST format than truffle's JSON.
        // For now we'll compile the contract.

        const contractName = buildObj.contractName;
        // FIXME: we take only the first contract.
        const contractSource = buildObj.sources[contractName][0];

        // Note compileContract slams in 'test.sol' as the contact name
        let output = srcmap.compileContract(contractSource);
        this.ast = output.sources['test.sol'];

        this.legacyAST = buildObj.legacyAST;
        // console.log(this.legacyAST);
        this.sourceMap = buildObj.sourceMap;
        this.deployedSourceMap = buildObj.deployedSourceMap;
        this.sourceMappingDecoder = new SourceMappingDecoder();
        this.lineBreakPositions = this.sourceMappingDecoder
            .getLinebreakPositions(contractSource);
        this.offset2InstNum =
      srcmap.makeOffset2InstNum(buildObj.deployedBytecode);
    }

    // Is this an issue that should be ignored?
    isIgnorable(issue, options) {
    // FIXME: is issue.address correct or does it need to be turned into
    // an instruction number?
        let node = srcmap.isVariableDeclaration(issue.address, this.deployedSourceMap,
            this.ast);
        if (node && srcmap.isDynamicArray(node)) {
            if (options.debug) {
                exports.print('**debug: Ignoring Mythril issue around ' +
                      'dynamically-allocated array.');
            }
            return true;
        } else {
            return false;
        }
    }

    /*
    Turn an bytecode offset into a line and column.
    We are lossy here because we don't keep the end location.
  */
    byteOffset2lineColumn(bytecodeOffset) {
        let instNum = this.offset2InstNum[bytecodeOffset];
        let sourceLocation = this.sourceMappingDecoder
            .atIndex(instNum, this.deployedSourceMap);
        if (sourceLocation) {
            const loc = this.sourceMappingDecoder
                .convertOffsetToLineColumn(sourceLocation, this.lineBreakPositions);
            // FIXME: note we are lossy in that we don't return the end location
            if (loc.start) {
                // Adjust because routines starts lines at 0 rather than 1.
                loc.start.line++;
            }
            return loc.start;
        }
        return {line: -1, column: 0};
    }

    /*
    The eslint report format which we use, has these fields:
    line, column, severity, message, ruleId, fatal

    but a Mythril JSON report has these fields:
    address, type, description, contract, function,

    Convert a Mythril issue into an ESLint-style issue
  */
    issue2EsLint(issue) {
        let esIssue = {};
        for (let field of ['type', 'address', 'description']) {
            let esField = myth2EslintField[field];
            let value = issue[field];
            if (field === 'address') {
                let lineCol = this.byteOffset2lineColumn(value);
                esIssue.line = lineCol.line;
                esIssue.column = lineCol.column;
            } else if (esField === 'severity') {
                esIssue[esField] = myth2Severity[value];
            } else if (esField === 'message') {
                esIssue[esField] = massageMessage(value);
            }
            esIssue.ruleId = 'Mythril';
            esIssue.fatal = false; // Mythril doesn't give fatal messages?
        }
        return esIssue;
    }
}

/* FIXME: since I don't know how to export Info as a class we have
   this function which does everything and creates the an instance
   object internally. This may or may not be what we want to do in the
   future.
*/
// Turn Mythril Issues, into eslint-format issues.
exports.issues2Eslint = function (issues, buildObj, options) {
    let esIssues = [];
    let info = new Info(issues, buildObj);
    for (let issue of issues) {
        if (!info.isIgnorable(issue, options)) {
            esIssues.push(info.issue2EsLint(issue));
        }
    }
    return esIssues;
};

// A debug routine
exports.printIssues = function(issues) {
    for (let issue of issues) {
        for (let field of
            ['type', 'contract', 'function', 'code', 'address', 'description']) {
            if (issue[field]) {
                exports.print(`${field}: ${issue[field]}`);
            }
        }
    }
};
