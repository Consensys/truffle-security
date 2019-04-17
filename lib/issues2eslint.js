'use strict';

const path = require('path');
const assert = require('assert');
const SourceMappingDecoder = require(
    'remix-lib/src/sourceMappingDecoder');
const srcmap = require('./srcmap');
const mythx = require('./mythx');

/*
  Mythril seems to downplay severity. What eslint calls an "error",
  Mythril calls "warning". And what eslint calls "warning",
  Mythril calls "informational".
*/
const mythx2Severity = {
    High: 2,
    Medium: 1,
};

const isFatal = (fatal, severity) => fatal || severity === 2;

const keepIssueInResults = function (issue, config) {

    // omit this issue if its severity is below the config threshold
    if (config.severityThreshold  && issue.severity < config.severityThreshold) {
        return false;
    }

    // omit this if its swc code is included in the blacklist
    if (config.swcBlacklist && config.swcBlacklist.includes(issue.ruleId)) {
        return false;
    }

    // if an issue hasn't been filtered out by severity or blacklist, then keep it
    return true;

};


class MythXIssues {
    /**
     *
     * @param {object} buildObj - Truffle smart contract build object
     */
    constructor(buildObj, config) {
        this.issues = [];
        this.logs = [];
        this.buildObj = mythx.truffle2MythXJSON(buildObj);
        this.debug = config.debug;
        this.logger = config.logger;
        this.sourceMap = this.buildObj.sourceMap;
        this.sourcePath = buildObj.sourcePath;
        this.deployedSourceMap = this.buildObj.deployedSourceMap;
        this.offset2InstNum = srcmap.makeOffset2InstNum(this.buildObj.deployedBytecode);
        this.contractName = buildObj.contractName;
        this.sourceMappingDecoder = new SourceMappingDecoder();
        this.asts = this.mapAsts(this.buildObj.sources);
        this.lineBreakPositions = this.mapLineBreakPositions(this.sourceMappingDecoder, this.buildObj.sources);
    }

    /**
     * Accepts analyze result issues and groups issues by sourceList
     *
     * @param {object[]} issues - MythX analyze API output result issues
     */
    setIssues(issueGroups) {
        for (let issueGroup of issueGroups) {
            if (issueGroup.sourceType === 'solidity-file' &&
                issueGroup.sourceFormat === 'text') {
                const filteredIssues = [];
                for (const issue of issueGroup.issues) {
                    if (issue.locations.length > 0) {
                        for (const location of issue.locations) {
                            if (!this.isIgnorable(location.sourceMap)) {
                                filteredIssues.push(issue);
                            }
                        }
                    } else {
                        filteredIssues.push(issue);
                    }
                }
                issueGroup.issues = filteredIssues;
            }
        }
        const remappedIssues = issueGroups.map(mythx.remapMythXOutput);
        this.issues = remappedIssues
            .reduce((acc, curr) => acc.concat(curr), []);

        issueGroups.forEach(issueGroup => {
            this.logs = this.logs.concat((issueGroup.meta && issueGroup.meta.logs) || []);
        });
    }

    /**
     * Maps linebreak positions of a source to its solidity file from the array of sources
     *
     * @param {object} decoder -  SourceMappingDecoder object
     * @param {object[]} sources - Collection of MythX API output sources property.
     * @returns {object} - linebreak positions grouped by soliduty file paths
     */
    mapLineBreakPositions(decoder, sources) {
        const result = {};

        Object.entries(sources).forEach(([ sourcePath, { source } ]) => {
            if (source) {
                result[sourcePath] = decoder.getLinebreakPositions(source);
            }
        });

        return result;
    }

    /**
     * Maps ast objects to its solidity file from the array of sources
     *
     * @param {object[]} sources - Collection of MythX API output sources property.
     * @returns {object} - ast objects grouped by soliduty file paths
     */
    mapAsts (sources) {
        const result = {};
        Object.entries(sources).forEach(([ sourcePath, { ast } ]) => {
            result[sourcePath] = ast;
        });

        return result;
    }

    // Is this an issue that should be ignored?
    isIgnorable(sourceMapLocation) {
        const basename = path.basename(this.sourcePath);
        if (!( basename in this.asts)) {
            return false;
        }
        const ast = this.asts[basename];
        const node = srcmap.isVariableDeclaration(sourceMapLocation, ast);
        if (node && srcmap.isDynamicArray(node)) {
            if (this.debug) {
                // this might brealk if logger is none.
                const logger = this.logger || console;
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
    issue2EsLint(issue, spaceLimited, sourceFormat, sourceName) {
        const esIssue = {
            fatal: false,
            ruleId: issue.swcID || 'N/A' ,
            message: spaceLimited ? issue.description.head : `${issue.description.head} ${issue.description.tail}`,
            severity: mythx2Severity[issue.severity] || 1,
            mythXseverity: issue.severity,
            line: -1,
            column: 0,
            endLine: -1,
            endCol: 0,
        };

        let startLineCol,  endLineCol;
        let lineBreakPositions = this.lineBreakPositions[sourceName];

        /*
            If lineBreakPositions is undefined use first available.
            It may happen when API returns bytecode instead of source file name.
            FIXME: find better way to detect correct source name
        */
        if (!lineBreakPositions) {
            const defaultSourceName = Object.keys(this.lineBreakPositions)[0];
            lineBreakPositions = this.lineBreakPositions[defaultSourceName];
        }

        if (issue.sourceMap) {
            if (sourceFormat === 'evm-byzantium-bytecode') {
                // Pick out first byteCode offset value
                const offset = parseInt(issue.sourceMap.split(':')[0], 10);
                [startLineCol, endLineCol] = this.byteOffset2lineColumn(offset, lineBreakPositions);
            } else if (sourceFormat === 'text') {
                // Pick out first srcEntry value
                const srcEntry = issue.sourceMap.split(';')[0];
                [startLineCol, endLineCol] = this.textSrcEntry2lineColumn(srcEntry, lineBreakPositions);
            }
        } else {
            startLineCol = { line: -1, column: 0 };
            endLineCol = { line: -1, column: 0 };
        }
        if (startLineCol) {
            esIssue.line = startLineCol.line;
            esIssue.column = startLineCol.column;
            esIssue.endLine = endLineCol.line;
            esIssue.endCol = endLineCol.column;
        }

        return esIssue;
    }

    /**
     * Converts MythX analyze API output item to Eslint compatible object
     * @param {object} report - issue item from the collection MythX analyze API output
     * @param {boolean} spaceLimited
     * @returns {object}
     */
    convertMythXReport2EsIssue(report, config, spaceLimited) {
        const { issues, sourceFormat, source } = report;
        const result = {
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            filePath: source,
        };
        const sourceName = path.basename(source);
        result.messages = issues
            .map(issue => this.issue2EsLint(issue, spaceLimited, sourceFormat, sourceName))
            .filter(issue => keepIssueInResults(issue, config));

        result.warningCount = result.messages.reduce((acc,  { fatal, severity }) =>
            !isFatal(fatal , severity) ? acc + 1: acc, 0);

        result.errorCount = result.messages.reduce((acc,  { fatal, severity }) =>
            isFatal(fatal , severity) ? acc + 1: acc, 0);

        return result;
    }
    /**
     * Transforms array of MythX Issues into Eslint issues
     *
     * @param {boolean} spaceLimited
     * @returns {object[]}
     */
    getEslintIssues(config, spaceLimited = false) {
        return this.issues.map(report => this.convertMythXReport2EsIssue(report, config, spaceLimited));
    }
}

module.exports = {
    MythXIssues,
    keepIssueInResults
};
