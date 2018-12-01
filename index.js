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

    const Config = require("truffle-config");
    const config = Config.detect(options);
    const rootDir = config.working_directory;
    const buildDir = config.contracts_build_directory;
    options.logger = options.logger || console;


    // Run Mythril Platform analyze after we have
    // ensured via compile that JSON data is there and
    // up to date.
    // Parameters "options", and "done" are implicitly passed in.
    function analyzeWithBuildDir() {
      // FIXME: use truffle library routine
      const contractsDir = trufstuf.getContractsDir(rootDir);

      // const expect = require("truffle-expect");
      // FIXME: expect things

      var solidityFileBase;
      let solidityFile;
      let buildJsonPath;
      let buildJson;

      try {
        if (options._.length === 0) {
          buildJson = trufstuf.guessTruffleBuildJson(buildDir);
        } else {
          buildJson = path.basename(options._[0]);
        }
        solidityFileBase = path.basename(buildJson, '.json');

        if (! solidityFileBase.endsWith('.sol')) {
          solidityFileBase += '.sol';
        }

        solidityFile = path.join(contractsDir, solidityFileBase);
        if (options.debug) {
          options.logger.log(`Solidity file used: ${solidityFile}`);
        }

        buildJsonPath = path.join(buildDir, buildJson);
        if (! buildJsonPath.endsWith('.json')) {
          buildJsonPath += '.json';
        }

      } catch (err) {
        done(err);
      }

      let mythril_api_key = null;
      let mythril_password = null;

      if (process.env.MYTHRIL_PASSWORD === undefined) {
        if (process.env.MYTHRIL_API_KEY === undefined) {
          options.logger.log('You need to set environment variable '
                             + 'MYTHRIL_PASSWORD or MYTHRIL_API_KEY to run analyze.');
          done(null, [], []);
          return
        }
      } else if (process.env.MYTHRIL_ETH_ADDRESS === undefined) {
        options.logger.log('You need to set environment variable '
                           + 'MYTHRIL_ETH_ADDRESS when MYTHRIL_PASSWORD is set to run analyze.');
        done(null, [], []);
      }

      let armletOptions = {
        email: process.env.MYTHRIL_EMAIL,
        apiKey: process.env.MYTHRIL_API_KEY,
        ethAddress: process.env.MYTHRIL_ETH_ADDRESS,
        password: process.env.MYTHRIL_PASSWORD,
        platforms: ['truffle']  // client chargeback
      }

      let client = new armlet.Client(armletOptions);

      if (!fs.existsSync(buildJsonPath)) {
        options.logger.log("Can't read build/contract JSON file: " +
                           `${buildJsonPath}`);
        done(null, [], []);
        return;
      }

      let buildObj;
      try {
        buildObj = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));
      } catch (err) {
        options.logger.log("Error parsing JSON file: " +
                           `${buildJsonPath}`);
        done(null, [], []);
        return;
      }

      let analyzeOpts = {
        _: options._,
        debug: options.debug,
        logger: options.logger,
        mode: options.mode,
        style: options.style,
        timeout: (options.timeout || 120) * 1000,

        // FIXME: The below "partners" will change when
        // https://github.com/ConsenSys/mythril-api/issues/59
        // is resolved.
        partners: ['truffle']
      };

      // const util = require('util');
      // console.log(`XXX1 ${util.inspect(analyzeOpts)}`);
      // console.log(`XXX2 buildObj ${util.inspect(buildObj)}`);
      analyzeOpts.data = mythril.truffle2MythrilJSON(buildObj);
      // console.log(`XXX3 JSON ${util.inspect(analyzeOpts.data)}`);

      analyzeOpts.data.analysisMode = analyzeOpts.mode || 'full';

      client.analyze(analyzeOpts)
        .then(issues => {
          const formatter = getFormatter(analyzeOpts.style);
          let esIssues = mythril.issues2Eslint(issues, buildObj, analyzeOpts);
          // console.log(esIssues); // debug
          esReporter.printReport(esIssues, solidityFile, formatter, analyzeOpts.logger.log);
          done(null, [], []);
        }).catch(err => {
          done(err);
        });
    }

    const Contracts = require("truffle-workflow-compile");

    Contracts.compile(config,
                      function(arg) {
                        if (arg !== null) {
                          options.logger.log(`compile returns ${arg}`);
                        } else {
                          analyzeWithBuildDir();
                        }
                  });
  }
}

module.exports = Analyze;
