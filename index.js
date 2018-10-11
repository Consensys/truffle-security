/* Main entry point for "truffle analyze".
   Handles option processing, kicks off armlet, and
   kicks off reporting when getting results.
*/
'use strict';

const path = require('path');
const fs = require('fs');
const armlet = require('armlet');
const mythril = require('./lib/mythril');
const trufstuf = require('./lib/trufstuf');
const esReporter = require('./lib/es-reporter');

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

const Analyze = {
  run: function(options, callback) {
    var Config = require("truffle-config");
    var config = Config.detect(options);
    const root_dir = config.working_directory;
    const buildDir = config.contracts_build_directory;

    // FIXME: use truffle library routine
    const contractsDir = trufstuf.getContractsDir(root_dir);
    const buildJson = trufstuf.guessTruffleBuildJson(buildDir);

    // const expect = require("truffle-expect");
    // FIXME: expect things

    var solidityFileBase;
    let solidityFile;
    let buildJsonPath;

    try {
      if (options._.length === 0) {
        solidityFileBase = path.basename(buildJson, '.json');
      } else {
        solidityFileBase = options._[0];
      }

      if (! solidityFileBase.endsWith('.sol')) {
        solidityFileBase += '.sol';
      }

      solidityFile = path.join(contractsDir, solidityFileBase);
      if (options.debug) {
        console.log(`Solidity file used: ${solidityFile}`);
      }
      buildJsonPath = path.join(buildDir, buildJson);

    } catch (err) {
      callback(err);
    }

    // console.log(`Reading ${buildJsonPath}`);
    let client = new armlet.Client(
      {
        apiKey: process.env.MYTHRIL_API_KEY,
        userEmail: process.env.MYTHRIL_API_KEY || 'bogus@example.com'
      });

    const buildObj = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));

    client.analyze({bytecode: buildObj.deployedBytecode})
      .then(issues => {
        const formatter = getFormatter(options.style);
        let esIssues = mythril.issues2Eslint(issues, buildObj, options);
        // console.log(esIssues); // debug
        esReporter.printReport(esIssues, solidityFile, formatter, console.log);
        callback(null, [], []);
      }).catch(err => {
        callback(err);
      });
  }
}

module.exports = Analyze;
