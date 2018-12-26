// An eslint Reporter class. Objects of the Reporter class need
// to have the methods listed below...

'use strict';

class Reporter {
    constructor(reports, rootPath, contractName) {
        this.reports = reports;
        this.rootPath = rootPath;
        this.contractName = contractName;
    }

    get errorCount() {
        return this._countReportsWith(Reporter.SEVERITY.ERROR);
    }

    get warningCount() {
        return this._countReportsWith(Reporter.SEVERITY.WARN);
    }

    _countReportsWith(severity) {
        return this.reports.filter(i => i.severity === severity).length;
    }


    get messages() {
        return this.reports.sort(function(x1, x2) {
            return x1.line === x2.line ?
                (x1.column - x2.column) :
                (x1.line - x2.line);
        });
    }

    get filePath() {
        return `${this.rootPath}:${this.contractName}`;
    }

}

Reporter.SEVERITY = Object.freeze({ ERROR: 2, WARN: 3 });

exports.printReport = function(issues, rootPath, contractName, formatter, printFn) {
    if (issues.length === 0) {
        printFn('No issues found.');
        return;
    }
    const reports = new Reporter(issues, rootPath, contractName);
    printFn(formatter([reports]));
};
