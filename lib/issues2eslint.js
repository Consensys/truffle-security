'use strict';

const SourceMappingDecoder = require(
    'remix-lib/src/sourceMappingDecoder');
const srcmap = require('./srcmap');

/* listed below are fields were the is a one-to-one mapping
   of MythX field names to eslint field names.
*/
const mythX2EsLintField = {
    /* For severity values, we may decide to remap names, For example: high -> error */
    'severity': 'severity',
    'swcID' : 'ruleId',
};

class Info {
    constructor(mythXresults, buildObj) {
        this.issues = mythXresults.issues;
        this.buildObj = buildObj;

        // const contractName = buildObj.contractName;
        const contractSource = buildObj.source;

        this.ast = buildObj.ast;
        this.sourceMap = buildObj.sourceMap;
        this.deployedSourceMap = buildObj.deployedSourceMap;
        this.sourceMappingDecoder = new SourceMappingDecoder();
        this.lineBreakPositions = this.sourceMappingDecoder
            .getLinebreakPositions(contractSource);
        this.offset2InstNum = srcmap.makeOffset2InstNum(buildObj.deployedBytecode);
        for (const field of ['sourceFormat', 'sourceList', 'sourceType']) {
            this[field] = mythXresults[field];
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
                // this might brealk if logger is none.
                const logger = options.logger || console;
                logger.log('**debug: Ignoring Mythril issue around ' +
                      'dynamically-allocated array.');
            }
            return true;
        } else {
            return false;
        }
    }

    /**
      * Turn a bytecode offset into a line and column location.
      * We make use of this.sourceMappingDecoder of this class to make
      * the conversion.
      *
      * @param {integer} bytecodeOffset - the offset we want to convert
      * @returns {line: number, column: number}
      */
    byteOffset2lineColumn(bytecodeOffset) {
        const instNum = this.offset2InstNum[bytecodeOffset];
        const sourceLocation = this.sourceMappingDecoder.atIndex(instNum, this.deployedSourceMap);
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

        // FIXME: Note from discussion with Rocky we agreed
        // that byteOffset2LineColumn shoud always return
        // data even when line/column can't be found.
        // Default is { start: {line: -1, column: 0}, end: {}}
        const start = loc.start || { line: -1, column: 0 }; 
        const end = loc.end || {};

        return [start, end];
    }


    /**
      * Turn a srcmap entry (the thing between semicolons) into a line and
      * column location.
      * We make use of this.sourceMappingDecoder of this class to make
      * the conversion.
      *
      * @param {string} srcEntry - a single entry of solc sourceMap
      * @returns {line: number, column: number}
    */
    textSrcEntry2lineColumn(srcEntry) {
        const ary = srcEntry.split(':');
        const sourceLocation = {
            length: parseInt(ary[1], 10),
            start: parseInt(ary[0], 10),
        };
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

    /**
      * Convert a MythX issue into an ESLint-style issue.
      * The eslint report format which we use, has these fields:
      *
      * - column,
      * - endCol,
      * - endLine,
      * - fatal,
      * - line,
      * - message,
      * - ruleId,
      * - severity
      *
      * but a MythX JSON report has these fields:
      *
      * - description.head
      * - description.tail,
      * - locations
      * - severity
      * - swcId
      * - swcTitle
      *
      * @param {MythXIssue} issue - the MythX issue we want to convert
      * @param {boolean} spaceLimited - true if we have a space-limited report format
      * @param {string} sourceFormat - the kind of location we have, e.g. evm-bytecode or source text
      * @param {Array<string>} sourceList - a list container objects (e.g. bytecode, source code) that
      *                                     holds the locations that are referred to
      * @returns eslint-issue object
    */
    issue2EsLintNew(issue, spaceLimited, sourceFormat,
        sourceList, sourceType) {
        this.sourceList = sourceList;
        this.sourceType = sourceType;
        this.sourceFormat = sourceFormat;
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
            const value = issue[field];
            if (field in mythX2EsLintField) {
                esIssue[mythX2EsLintField[field]] = value;
                continue;
            }

            if (field === 'description') {
                esIssue.message = issue.description.head;
                if (!spaceLimited) {
                    esIssue.message += ' ' + issue.description.tail;
                }
            } else if (field === 'locations') {
                for (let location of issue.locations) {
                    let startLineCol = null;
                    let endLineCol = null;
                    if (location.sourceFormat) {
                        sourceFormat = location.sourceFormat;
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

/**
 * Turn Mythril Issues, into eslint-format issues.
 *
 * @param {object} mythXresults - MythX result object
 * @param {object} buildObj - truffle build artifacts
 * @param {object} options - command options
 * @returns Array<eslintIssue>
 */

const mythXresults2Eslint = function(mythXresults, buildObj, options) {
    const esIssues = [];
    const info = new Info(mythXresults, buildObj);

    // FIXME: adjust based on options.style.
    const spaceLimited = true;

    for (const mythXresult of mythXresults) {
        const sourceFormat = mythXresult.sourceFormat;
        const sourceList = mythXresult.sourceList;
        const sourceType = mythXresult.sourceType;

        for (const issue of mythXresult.issues) {
            if (!info.isIgnorable(issue, options)) {
                esIssues.push(info.issue2EsLintNew(issue, spaceLimited,
                    sourceFormat,
                    sourceList, sourceType
                ));
            }
        }
    }
    return esIssues;
};

module.exports = {
    mythXresults2Eslint,
};
