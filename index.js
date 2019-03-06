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

    return await helpers.analyze(config);
};
