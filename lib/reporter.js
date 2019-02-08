/**
 *
 * Loads preferred ESLint formatter for warning reports.
 *
 * @param {String} config
 * @returns ESLint formatter module
 */
function getFormatter(style) {
  const formatterName = style || 'stylish';
  try {
      return require(`eslint/lib/formatters/${formatterName}`);
  } catch (ex) {
      ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
          ex.message
      }`;
      throw ex;
  }
}

module.exports = {
  getFormatter,
}