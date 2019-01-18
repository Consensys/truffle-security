'use strict';

const path = require('path');
const assert = require('assert');
const SourceMappingDecoder = require(
    'remix-lib/src/sourceMappingDecoder');
const srcmap = require('./srcmap');

class Info {
    constructor(buildObj) {
        // const contractSource = buildObj.source;
        this.sourceMap = buildObj.sourceMap;
        this.deployedSourceMap = buildObj.deployedSourceMap;
        this.offset2InstNum = srcmap.makeOffset2InstNum(buildObj.deployedBytecode);

        this.sourceMappingDecoder = new SourceMappingDecoder();

        this.asts = this.mapAsts(buildObj.sources);
        // this.lineBreakPositionsOld = this.sourceMappingDecoder
        //     .getLinebreakPositions(contractSource);
        this.lineBreakPositions = this.mapLineBreakPositions(this.sourceMappingDecoder, buildObj.sources);
    }

    mapLineBreakPositions(decoder, sources) {
        const result = {};

        Object.entries(sources).forEach(([ sourcePath, { source } ]) => {
            result[sourcePath] = decoder.getLinebreakPositions(source);

        });

        return result;
    }

    mapAsts (sources) {
        const result = {};
        Object.entries(sources).forEach((sourcePath, { ast }) => {
            result[sourcePath] = ast;
        });
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
    byteOffset2lineColumn(bytecodeOffset, lineBreakPositions) {
        const instNum = this.offset2InstNum[bytecodeOffset];
        const sourceLocation = this.sourceMappingDecoder.atIndex(instNum, this.deployedSourceMap);
        assert(sourceLocation, 'sourceMappingDecoder.atIndex() should not return null');
        const loc = this.sourceMappingDecoder
            .convertOffsetToLineColumn(sourceLocation, lineBreakPositions);

        // FIXME: note we are lossy in that we don't return the end location
        if (loc.start) {
            // Adjust because routines starts lines at 0 rather than 1.
            loc.start.line++;
        }
        if (loc.end) {
            loc.end.line++;
        }

        // FIXME: Note from discussion with Rocky we agreed
        // that byteOffset2LineColumn should always return
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
    textSrcEntry2lineColumn(srcEntry, lineBreakPositions) {
        const ary = srcEntry.split(':');
        const sourceLocation = {
            length: parseInt(ary[1], 10),
            start: parseInt(ary[0], 10),
        };
        const loc = this.sourceMappingDecoder
            .convertOffsetToLineColumn(sourceLocation, lineBreakPositions);
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
    issue2EsLintNew(issue, spaceLimited, sourceFormat, sourceName) {
        const esIssue = {
            fatal: false,
            ruleId: issue.swcID,
            message: spaceLimited ? issue.description.head : `${issue.description.head} ${issue.description.tail}`,
            severity: issue.severity,
            line: -1,
            column: 0,
            endLine: -1,
            endCol: 0,
        };
        let startLineCol,  endLineCol;
        const lineBreakPositions = this.lineBreakPositions[sourceName];

        if (sourceFormat === 'evm-byzantium-bytecode') {
            // Pick out first byteCode offset value
            const offset = parseInt(issue.sourceMap.split(':')[0], 10);
            [startLineCol, endLineCol] = this.byteOffset2lineColumn(offset, lineBreakPositions);
        } else if (sourceFormat === 'text') {
            // Pick out first srcEntry value
            const srcEntry = issue.sourceMap.split(';')[0];
            [startLineCol, endLineCol] = this.textSrcEntry2lineColumn(srcEntry, lineBreakPositions);
        }
        if (startLineCol) {
            esIssue.line = startLineCol.line;
            esIssue.column = startLineCol.column;
            esIssue.endLine = endLineCol.line;
            esIssue.endCol = endLineCol.column;
        }

        return esIssue;
    }

    convertMythXReport2EsIssues(report, spaceLimited) {
        const { issues, sourceFormat, source } = report;
        const result = {
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            filePath: source,
        };
        const sourceName =  path.basename(source);
        result.messages = issues.map(issue => this.issue2EsLintNew(issue, spaceLimited, sourceFormat, sourceName));
    
        result.warningCount = result.messages.reduce((acc,  { fatal }) => { 
            if (!fatal) acc += 1;
            return acc;
        }, 0);
    
        result.errorCount = result.messages.reduce((acc,  { fatal }) => { 
            if (fatal) acc += 1;
            return acc;
        }, 0);

        return result;
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
    Info,
};
