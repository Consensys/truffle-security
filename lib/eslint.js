const isFatal = (fatal, severity) => fatal || severity === 2;

const getUniqueMessages = messages => {
  const jsonValues = messages.map(m => JSON.stringify(m));
  const uniuqeValues = jsonValues.reduce((accum, curr) => {
      if (accum.indexOf(curr) === -1) {
          accum.push(curr);
      }
      return accum;
  }, []);

  return uniuqeValues.map(v => JSON.parse(v));
}

const calculateErrors = messages =>
  messages.reduce((acc,  { fatal, severity }) => isFatal(fatal , severity) ? acc + 1: acc, 0);

const calculateWarnings = messages =>
  messages.reduce((acc,  { fatal, severity }) => !isFatal(fatal , severity) ? acc + 1: acc, 0);


const getUniqueIssues = issues => 
  issues.map(({ messages, ...restProps }) => {
    const uniqueMessages = getUniqueMessages(messages);
    const warningCount = calculateWarnings(uniqueMessages);
    const errorCount = calculateErrors(uniqueMessages);

    return {
        ...restProps,
        messages: uniqueMessages,
        errorCount,
        warningCount,
    };
  }
);

/**
 *
 * Loads preferred ESLint formatter for warning reports.
 *
 * @param {String} formatterName
 * @returns ESLint formatter module
 */
const getFormatter = (formatterName = 'stylish') => {
  try {
      return require(`eslint/lib/formatters/${formatterName}`);
  } catch (ex) {
      ex.message = `\nThere was a problem loading formatter option: ${formatterName} \nError: ${
          ex.message
      }`;
      throw ex;
  }
}


const sortMessages = messages => {
  /**
   * A 2-level line-column comparison function.
   * @returns {integer} -
       zero:      line1/column1 == line2/column2
       negative:  line1/column1 < line2/column2
       positive:  line1/column1 > line2/column2
    */
  const compareLineCol = (line1, column1, line2, column2) => {
    return line1 === line2 ? (column1 - column2) : (line1 - line2);
  }

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
      return c != 0 ? c : compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
  }

  return messages.sort((mess1, mess2) => compareMessLCRange(mess1, mess2))
}


/**
 * Groups multiple eslint issues by filepath
 * 
 * @param {ESLintIssue[]}
 * @returns {ESListIssue[]}
 */
const groupEslintIssuesByFilePath = issues => {
  const mappedIssues = issues.reduce((accum, issue) => {
    const {
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
      filePath,
      messages,
    } = issue;

    if (!accum[filePath]) {
        accum[filePath] = {
            errorCount: 0,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            filePath,
            messages: [],
        };
    }
    accum[filePath].errorCount += errorCount;
    accum[filePath].warningCount += warningCount;
    accum[filePath].fixableErrorCount += fixableErrorCount;
    accum[filePath].fixableWarningCount += fixableWarningCount;
    accum[filePath].messages = accum[filePath].messages.concat(messages);
    return accum;
  }, {});

  return Object.values(mappedIssues);
};

module.exports = {
  getUniqueIssues,
  getUniqueMessages,
  isFatal,
  getFormatter,
  groupEslintIssuesByFilePath,
  sortMessages,
}
