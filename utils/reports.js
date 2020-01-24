const yaml = require('js-yaml');
const eslintHelpers = require('../lib/eslint');
// const trufstuf = require('../lib/trufstuf');

// A stripped-down listing for issues.
// We will need this until we can beef up information in UUID retrieval
const ghettoReport = (logger, results) => {
  let issuesCount = 0;
  results.forEach(ele => {
    issuesCount += ele.issues.length;
  });

  if (issuesCount === 0) {
    logger('No issues found');
    return 0;
  }
  for (const group of results) {
    logger(group.sourceList.join(', ').underline);
    for (const issue of group.issues) {
      logger(yaml.safeDump(issue, { skipInvalid: true }));
    }
  }
  return 1;
};

const doReport = async function(objects, errors, config, group) {
  let ret = 0;
  // Return true if we shold show log.
  // Ignore logs with log.level "info" unless the "debug" flag
  // has been set.
  function showLog(log) {
    return config.debug || log.level !== 'info';
  }
  let issues = [];
  // Return 1 if some vulenrabilities were found.
  objects.forEach(obj => {
    obj.issues.forEach(ele => {
      issues.push(ele.issues);
      ret = ele.issues.length > 0 ? 1 : ret;
    });
  });

  if (config.yaml) {
    const yamlDumpObjects = objects;
    for (let i = 0; i < yamlDumpObjects.length; i++) {
      delete yamlDumpObjects[i].logger;
    }
    config.logger.log(yaml.safeDump(yamlDumpObjects, { skipInvalid: true }));
  } else if (config.json) {
    config.logger.log(JSON.stringify(objects, null, 4));

  } else {
    const spaceLimited =
      ['tap', 'markdown', 'json'].indexOf(config.style) === -1;
    const eslintIssues = objects
      .map(obj => obj.getEslintIssues(config, spaceLimited))
      .reduce((acc, curr) => acc.concat(curr), []);



    // FIXME: temporary solution until backend will return correct filepath and output.
    const eslintIssuesByBaseName = await groupEslintIssuesByBasename(
      eslintIssues
    );
    const uniqueIssues = eslintHelpers.getUniqueIssues(eslintIssuesByBaseName);

    const formatter = getFormatter(config.style);
    config.logger.log(formatter(uniqueIssues));
  }

  const logGroups = objects
    .map(obj => {
      return {
        sourcePath: obj.sourcePath,
        logs: obj.logs,
        uuid: obj.uuid,
      };
    })
    .reduce((acc, curr) => acc.concat(curr), []);

  let haveLogs = false;
  logGroups.some(logGroup => {
    logGroup.logs.some(log => {
      if (showLog(log)) {
        haveLogs = true;
        return;
      }
    });
    if (haveLogs) return;
  });

  ret = 1;

  if (config.mythxLogs) {
    config.logger.log('MythX Logs:'.yellow);

    logGroups.forEach(logGroup => {
      config.logger.log(`\n${logGroup.sourcePath}`.yellow);
      config.logger.log(`UUID: ${logGroup.uuid}`.yellow);

      config.logger.log(
        `View Report: https://dashboard.mythx.io/#/console/analyses/${logGroup.uuid}`
          .green
      );

      /*else {
        config.logger.log('Purchase Professional to view detailed MythX report: https://mythx.io/plans');
      }*/
      // if (haveLogs) {
      //   logGroup.logs.forEach(log => {
      //     if (showLog(log) && log.length > 0) {
      //       config.logger.log(`${log[0].level}: ${log[0].msg}`);
      //     }
      //   });
      // }
    });

    config.logger.log('');
    config.logger.log(`Group ID: ${group.id}`.yellow);
    config.logger.log('View analyses batch here:'.yellow);
    config.logger.log(`https://dashboard.mythx.io/#/console/analyses/groups/${group.id}`.green);

    if (errors.length > 0) {
      ret = 1;
      config.logger.error('Internal MythX errors encountered:'.red);
      errors.forEach(err => {
        config.logger.error(err.error || err);
        if (config.debug > 1 && err.stack) {
          config.logger.log(err.stack);
        }
      });
    }
  }

  return issues;
};

/**
     * Temporary function which turns eslint issues grouped by filepath
     * to eslint issues rouped by filename.

    * @param {ESLintIssue[]}
    * @returns {ESListIssue[]}
    */
const groupEslintIssuesByBasename = async function(issues) {
  const mappedIssues = issues.reduce((accum, issue) => {
    const {
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      filePath,
      messages,
    } = issue;

    const basename = filePath;
    if (!accum[basename]) {
      accum[basename] = {
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        filePath: filePath,
        messages: [],
      };
    }
    accum[basename].errorCount += errorCount;
    accum[basename].warningCount += warningCount;
    accum[basename].fixableErrorCount += fixableErrorCount;
    accum[basename].fixableWarningCount += fixableWarningCount;
    accum[basename].messages = accum[basename].messages.concat(messages);
    return accum;
  }, {});

  const issueGroups = Object.values(mappedIssues);
  // let thisUnscoped = this;

  for (const group of issueGroups) {
    group.messages = group.messages.sort(function(mess1, mess2) {
      //return thisUnscoped.compareMessLCRange(mess1, mess2);
      return compareMessLCRange(mess1, mess2);
    });
  }
  return issueGroups;
};

/**
 *
 * Loads preferred ESLint formatter for warning reports.
 *
 * @param {String} style
 * @returns ESLint formatter module
 */
const getFormatter = style => {
  const formatterName = style || 'stylish';
  try {
    if (formatterName == 'markdown') {
      return require('../compat/eslint-formatter-markdown/markdown');
    }
    return require(`eslint/lib/formatters/${formatterName}`);
  } catch (ex) {
    ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${ex.message}`;
    throw ex;
  }
};

/**
     * A 2-level line-column comparison function.
     * @returns {integer} -
         zero:      line1/column1 == line2/column2
        negative:  line1/column1 < line2/column2
        positive:  line1/column1 > line2/column2
    */
const compareLineCol = (line1, column1, line2, column2) => {
  return line1 === line2 ? column1 - column2 : line1 - line2;
};

/**
     * A 2-level comparison function for eslint message structure ranges
     * the fields off a message
     * We use the start position in the first comparison and then the
     * end position only when the start positions are the same.
     *
     * @returns {integer} -
         zero:      range(mess1) == range(mess2)
        negative:  range(mess1) <  range(mess2)
        positive:  range(mess1) > range(mess)

    */
const compareMessLCRange = (mess1, mess2) => {
  const c = compareLineCol(mess1.line, mess1.column, mess2.line, mess2.column);
  return c != 0
    ? c
    : compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
};

module.exports = {
  ghettoReport,
  doReport,
  compareLineCol,
};
