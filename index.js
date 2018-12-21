/* Main entry point for "truffle analyze".
   Handles option processing, kicks off armlet, and
   kicks off reporting when getting results.
*/
'use strict';


const helpers = require('./helpers');


module.exports = async (config) => {
  config.logger = config.logger || console;

  if (config.help) return await helpers.printHelpMessage();
  if (config.version) return await helpers.printVersion();

  // This can cause vyper to fail if you don't have vyper installed
  delete config.compilers.vyper;
  await helpers.contractsCompile(config);
  return await helpers.analyze(config);
}
