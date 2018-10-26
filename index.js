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
          buildJson = options._[0];
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

      // console.log(`Reading ${buildJsonPath}`);

      let client = new armlet.Client(
        {
          // NOTE: authentication is changing in the next API release
          apiKey: process.env.MYTHRIL_API_KEY,
          userEmail: process.env.MYTHRIL_API_KEY || 'bogus@example.com'
        });

      const buildObj = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));

      // console.log(JSON.stringify(buildObj, null, 4));
      options.data = mythril.truffle2MythrilJSON(buildObj);
      options.data.analysisMode = options.mode || 'full';

      // FIXME: The below "partners" will change when
      // https://github.com/ConsenSys/mythril-api/issues/59
      // is resolved.
      options.partners = ['truffle'];

      client.analyze(options)
        .then(issues => {
          const formatter = getFormatter(options.style);
          let esIssues = mythril.issues2Eslint(issues, buildObj, options);
          // console.log(esIssues); // debug
          esReporter.printReport(esIssues, solidityFile, formatter, options.logger.log);
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
                        }
                        analyzeWithBuildDir();
                  });
  }
}

module.exports = Analyze;
