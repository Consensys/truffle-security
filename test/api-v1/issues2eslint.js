'use strict';

const SourceMappingDecoder = require(
    'remix-lib/src/sourceMappingDecoder');
const srcmap = require('../../lib/srcmap');

/* listed below are fields were the is a one-to-one mapping
   of MythX field names to eslint field names.
*/
const mythX2EsLintField = {
    /* For severity values, we may decide to remap names, For example: high -> error */
    'severity': 'severity',
    'swcID' : 'ruleId',
}


// FIXME figure out how to export this class.
class Info {
    constructor(mythXresults, buildObj) {
        this.issues = mythXresults.issues;
        this.buildObj = buildObj;

        const contractName = buildObj.contractName;
        const contractSource = buildObj.source;

        this.ast = buildObj.ast;
        this.sourceMap = buildObj.sourceMap;
        this.deployedSourceMap = buildObj.deployedSourceMap;
        this.sourceMappingDecoder = new SourceMappingDecoder();
        this.lineBreakPositions = this.sourceMappingDecoder
            .getLinebreakPositions(contractSource);
        this.offset2InstNum = srcmap.makeOffset2InstNum(buildObj.deployedBytecode);
        for (const field of ['sourceFormat', 'sourceList', 'sourceType']) {
            this[field] = mythXresults[field]
        }
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
    Turn a single text srcmap entry into a loc
    */
    textSrcEntry2lineColumn(srcEntry) {
        const ary = srcEntry.split(':');
        const sourceLocation = {
            start: parseInt(ary[0], 10),
            length: parseInt(ary[1], 10),
        }
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

    /*
      Convert a MythX issue into an ESLint-style issue

      The eslint report format which we use, has these fields:

      line, column, endLine, endCol
      severity, message, ruleId, fatal

      but a MythX JSON report has these fields:

      description.head
      description.tail,
      locations
      severity
      swcId
      swcTitle
    */

    issue2EsLintNew(issue, spaceLimited, sourceFormat,
                    sourceList, sourceType) {
        const esIssue = {
            line: -1,
            column: 0,
            endLine: -1,
            endCol: 0,
            severity: '?',
            message: '?',
            ruleId: '?',

            // No MythX messages are fatal.
            fatal: false,
        };

        for (const field of Object.keys(issue)) {
            const value = issue[field]
            if (field in mythX2EsLintField) {
                esIssue[mythX2EsLintField[field]] = value;
                continue;
            }

            if (field === 'description') {
                esIssue.message = issue.description.head
                if (!spaceLimited) {
                    esIssue.message += ' ' + issue.description.tail;
                }
            } else if (field === 'locations') {
                for (let location of issue.locations) {
                    let startLineCol = null;
                    let endLineCol = null;
                    if (issue.locations.sourceFormat) {
                        sourceFormat = issue.locations.sourceFormat;
                    }
                    if (sourceFormat === 'evm-byzantium-bytecode') {
                        // Pick out first byteCode offset value
                        const offset = parseInt(location.sourceMap.split(':')[0], 10);
                        [startLineCol, endLineCol] = this.byteOffset2lineColumn(offset);
                    } else if (sourceFormat === 'text') {
                        // Pick out first srcEntry value
                        const srcEntry = location.sourceMap.split(';')[0];
                        [startLineCol, endLineCol] = this.textSrcEntry2lineColumn(srcEntry);
                    }
                    if (startLineCol) {
                        esIssue.line = startLineCol.line;
                        esIssue.column = startLineCol.column;
                        esIssue.endLine = endLineCol.line;
                        esIssue.endCol = endLineCol.column;
                        // FIXME: what do we do about several locations?
                        break;
                    }
                }
            }
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

function mythXresults2Eslint(mythXresults, buildObj, options) {
    const esIssues = [];
    const info = new Info(mythXresults, buildObj);

    const sourceFormat = mythXresults.sourceFormat;
    const sourceList = mythXresults.sourceList;
    const sourceType = mythXresults.sourceType;

    // FIXME: adjust based on options.style.
    const spaceLimited = true;

    for (const issue of mythXresults.issues) {
        if (!info.isIgnorable(issue, options)) {
            esIssues.push(info.issue2EsLintNew(issue, spaceLimited,
                                               sourceFormat,
                                               sourceList, sourceType
                                              ));
        }
    }
    return esIssues;
};

const fs = require('fs');
const mythXresults = JSON.parse(fs.readFileSync('./MythXResults.json', 'utf-8'));
const buildObj = JSON.parse(fs.readFileSync('./Over.json', 'utf-8'));
const util = require('util');
let results = mythXresults2Eslint(mythXresults, buildObj, {});
console.log(util.inspect(results));

const maruResults = JSON.parse(fs.readFileSync('./MaruResults.json', 'utf-8'));
results = mythXresults2Eslint(maruResults, buildObj, {});
console.log(util.inspect(results));
