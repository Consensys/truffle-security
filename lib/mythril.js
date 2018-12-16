'use strict';

const SourceMappingDecoder = require(
    'remix-lib/src/sourceMappingDecoder');
const srcmap = require('./srcmap');

exports.print = console.log;

// const SWC_PREFIX =
//       "https://smartcontractsecurity.github.io/SWC-registry/docs";

/********************************************************
Mythril messages currently needs a bit of messaging to
be able to work within the Eslint framework. Some things
we handle here:

- long messages
  Chop at sentence boundary.
- Non-ASCII characters: /[\u0001-\u001A]/ (including \n and `)
  Remove them.
**********************************************************/
function massageMessage(mess) {
    // Mythril messages are long. Strip after first period.
    let sentMatch = null;
    try {
        sentMatch = mess.match('\\.[ \t\n]');
    } catch (err) {
        return 'no message';
    }
    if (sentMatch) {
        mess = mess.slice(0, sentMatch.index + 1);
    }

    // Remove characters that mess up table formatting
    mess = mess.replace(new RegExp(/`/, 'g'), '\'');
    mess = mess.replace(new RegExp(/\n/, 'g'), ' ');
    // mess = mess.replace(new RegExp(/[\u0001-\u001A]/, 'g'), '');
    return mess;
}

/*
  Mythril seems to downplay severity. What eslint calls an "error",
  Mythril calls "warning". And what eslint calls "warning",
  Mythril calls "informational".
*/
const myth2Severity = {
    Informational: 3,
    Warning: 2,
};

const myth2EslintField = {
    type: 'severity',
    address: 'addr2lineColumn', // Not used
    line: 'lineNumberStart',
    description: 'message',
    'swc-description': 'message',
};


// FIXME figure out how to export this class.
class Info {
    constructor(issues, buildObj) {
        this.issues = issues;
        this.buildObj = buildObj;

        const contractName = buildObj.contractName;
        const contractSource = buildObj.sources[contractName];

        this.ast = buildObj.ast;
        this.sourceMap = buildObj.sourceMap;
        this.deployedSourceMap = buildObj.deployedSourceMap;
        this.sourceMappingDecoder = new SourceMappingDecoder();
        this.lineBreakPositions = this.sourceMappingDecoder
            .getLinebreakPositions(contractSource);
        this.offset2InstNum = srcmap.makeOffset2InstNum(buildObj.deployedBytecode);
    }

    // Is this an issue that should be ignored?
    isIgnorable(issue, options) {
    // FIXME: is issue.address correct or does it need to be turned into
    // an instruction number?

        const node = srcmap.isVariableDeclaration(issue.address, this.deployedSourceMap,
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
        const instNum = this.offset2InstNum[bytecodeOffset];
        const sourceLocation = this.sourceMappingDecoder.atIndex(instNum, this.deployedSourceMap);
        if (sourceLocation) {
            const loc = this.sourceMappingDecoder
                .convertOffsetToLineColumn(sourceLocation, this.lineBreakPositions);
            // FIXME: note we are lossy in that we don't return the end location
            if (loc.start) {
                // Adjust because routines starts lines at 0 rather than 1.
                loc.start.line++;
            }
            if (loc.end) {
                loc.end.line++;
            }
            return [loc.start, loc.end];
        }
        return [{line: -1, column: 0}, {}];
    }

    /*
    The eslint report format which we use, has these fields:
    line, column, severity, message, ruleId, fatal

    but a Mythril JSON report has these fields:
    address, type, description, contract, function,

    Convert a Mythril issue into an ESLint-style issue
  */
    issue2EsLint(issue) {
        const esIssue = {
            severity: myth2Severity.Warning,
        };

        let fields = ['type', 'address', 'description'];
        switch (issue.tool) {
        case 'maru':
            fields = ['type', 'line', 'swc-description'];
            break;
        case 'mythril':
            issue['swc-id'] = `SWC-${issue['swc-id']}`;
            break;
        }
        for (const field of fields) {
            const esField = myth2EslintField[field];
            const value = issue[field];
            if (field === 'address' && value !== undefined ) {
                try {
                    let [startLineCol, endLineCol] = this.byteOffset2lineColumn(value);
                    esIssue.line = startLineCol.line;
                    esIssue.column = startLineCol.column;
                    esIssue.endLine = endLineCol.line;
                    esIssue.endCol = endLineCol.column;
                } catch (err) {
                    esIssue.line = -1;
                    esIssue.column = 0;
                }
            } else if (esField === 'severity' && value !== undefined) {
                esIssue[esField] = myth2Severity[value];
            } else if (esField === 'message' && value !== undefined) {
                esIssue[esField] = massageMessage(value);
            } else if (esField === 'lineNumberStart') {
                esIssue.line = issue.lineNumberStart;
                esIssue.column = 0;
            } else if (field === 'line' && value !== undefined) {
                esIssue[field] = massageMessage(value);
                esIssue.column = 0;
                esIssue.line = issue.line;
            }
        }

        esIssue.ruleId = `${issue['swc-id']}`;

        // Alternatives:
        // switch (options.style) {
        // case 'tap':
        //     esIssue.ruleId = `${SWC_PREFIX}/${issue['swc-id']}`;
        //     break;
        // default:
        //     esIssue.ruleId = `${issue['swc-id']}`;
        //     break;
        // }
        // if (issue['swc-id'] !== undefined) {
        //     esIssue.ruleId = `${issue.tool}/${issue['swc-id']}`;
        // } else {
        //     esIssue.ruleId = `${issue.tool}`;
        // }
        esIssue.fatal = false; // Mythril doesn't give fatal messages?
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
    const esIssues = [];
    const info = new Info(issues, buildObj);
    for (const issue of issues) {
        if (!info.isIgnorable(issue, options)) {
            esIssues.push(info.issue2EsLint(issue));
        }
    }
    return esIssues;
};

// Take truffle's build/contracts/xxx.json JSON and make it
// compatible with the Mythril Platform API
exports.truffle2MythrilJSON = function(truffleJSON) {

    // Add/remap some fields because the Mythril Platform API doesn't
    // align with truffle's JSON

    truffleJSON.sourceList = [truffleJSON.ast.absolutePath];
    truffleJSON.sources = {};
    truffleJSON.sources[truffleJSON.contractName] = truffleJSON.source;

    return truffleJSON;
};
