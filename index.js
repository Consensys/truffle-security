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
  run: function(options, done) {
    var Config = require("truffle-config");
    var config = Config.detect(options);
    const rootDir = config.working_directory;
    const buildDir = config.contracts_build_directory;

    // FIXME: use truffle library routine
    const contractsDir = trufstuf.getContractsDir(rootDir);
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
      done(err);
    }

    // console.log(`Reading ${buildJsonPath}`);
    let client = new armlet.Client(
      {
        apiKey: process.env.MYTHRIL_API_KEY,
        userEmail: process.env.MYTHRIL_API_KEY || 'bogus@example.com'
      });

    const buildObj = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));

    buildObj.analysisMode = 'full';

    // Add/remap some fields because the Mythril Platform API doesn't
    // align with truffle's JSON

    buildObj.sourceList = [buildObj.contractName]
    buildObj.sources = {}
    buildObj.sources[buildObj.contractName] = [buildObj.source]
    for (let field of ['source', 'compiler', 'networks', 'schemaVersion', 'updatedAt']) {
      delete buildObj[field]
    }

    // console.log(JSON.stringify(buildObj, null, 4));
    options.data = buildObj;

    client.analyze(options)
      .then(issues => {
        const formatter = getFormatter(options.style);
        let esIssues = mythril.issues2Eslint(issues, buildObj, options);
        // console.log(esIssues); // debug
        esReporter.printReport(esIssues, solidityFile, formatter, console.log);
        done(null, [], []);
      }).catch(err => {
        done(err);
      });
  }
}

module.exports = Analyze;
