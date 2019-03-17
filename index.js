/* Main entry point for "truffle run analyze".
   This:
     * handles option processing
     * kicks off analysis and reporting when requested
*/
'use strict';

const helpers = require('./helpers');


/**
 *
 * Main "truffle run verify" entry point.
 *
 * @param {config} Object a `truffle-config` configuration object
 */
module.exports = async (config) => {
    config.logger = config.logger || console;

    if (config.help) return helpers.printHelpMessage();
    if (config.version) return helpers.printVersion();

    try {
        const returnCode = await helpers.analyze(config);
        if (returnCode === 0 || returnCode === undefined) {
            return 0;
        } else {
            process.exit(1);
        }
    } catch (e) {
        config.logger.error(e);
        process.exit(1);
    }
};
