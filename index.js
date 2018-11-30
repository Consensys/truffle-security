/* Main entry point for "truffle analyze".
   Handles option processing, kicks off armlet, and
   kicks off reporting when getting results.
*/
'use strict';


/* This stuff is for testing only.... */
const request = require('request')
const util = require('util')

function fakeAnalyzeWithBuildDir() {
  const ethAddress = process.env.MYTHRIL_ETH_ADDRESS
  const password =  process.env.MYTHRIL_PASSWORD
  const email = null

  let options = {form: {email, ethAddress, password}}
  let url = `https://staging.api.mythril.ai/v1/auth/login`
  debugger

  request
    .post(url, options, (err, res, body) => {
      if (err) {
        console.log(err)
        return
      }
      if (res.statusCode !== 200) {
        console.log(`Invalid status code ${res.statusCode}, ${body}`)
      }

      url = `https://staging.api.mythril.ai/v1/analyses`
      const result = JSON.parse(body)
      options = {
        url: url,
        json: true,
        headers: {
        'Authorization': `Bearer ${result.access}`,
        'Content-type': 'application/json',
        }
      }
      request(options, (error, res, body) => {
        if (error) {
          console.log(error)
          return
        }
        if (res.statusCode !== 200) {
          console.log('Invalid status code, expected 200')
          return
        }
        if (options.json) {
          console.log(`${JSON.stringify(body, null, 4)}`);
        }
      });
    });
}
/* This stuff is for testing only.... */


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

module.exports = (config) => {

    const rootDir = config.working_directory;
    const buildDir = config.contracts_build_directory;
    config.logger = config.logger || console;


    // Run Mythril Platform analyze after we have
    // ensured via compile that JSON data is there and
    // up to date.
    // Parameters "config", and "done" are implicitly passed in.
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
        if (config._.length === 0) {
          buildJson = trufstuf.guessTruffleBuildJson(buildDir);
        } else {
          buildJson = path.basename(config._[0]);
        }
        solidityFileBase = path.basename(buildJson, '.json');

        if (! solidityFileBase.endsWith('.sol')) {
          solidityFileBase += '.sol';
        }

        solidityFile = path.join(contractsDir, solidityFileBase);
        if (config.debug) {
          config.logger.log(`Solidity file used: ${solidityFile}`);
        }

        buildJsonPath = path.join(buildDir, buildJson);
        if (! buildJsonPath.endsWith('.json')) {
          buildJsonPath += '.json';
        }

      } catch (err) {
        done(err);
      }

      // console.log(`Reading ${buildJsonPath}`);

      let armletOptions = {
        // ethAddress: process.env.MYTHRIL_ETH_ADDRESS,
        password: process.env.MYTHRIL_PASSWORD,
        platforms: ['truffle']  // client chargeback
      }

      if (process.env.MYTHRIL_PASSWORD === undefined) {
        config.logger.log('You need to set environment variable '
                           + 'MYTHRIL_PASSWORD to run analyze.');
        done(null, [], []);
        return;
      }

      if (process.env.MYTHRIL_ETH_ADDRESS) {
        armletOptions.ethAddress = process.env.MYTHRIL_ETH_ADDRESS
      } else if (process.env.MYTHRIL_EMAIL) {
        armletOptions.email = process.env.MYTHRIL_EMAIL
      } else {
        config.logger.log('You need to set either environment variable '
                           + 'MYTHRIL_ETH_ADDRESS or MYTHRIL_EMAIL to run analyze.');
      }

      let client = new armlet.Client(armletOptions);

      if (!fs.existsSync(buildJsonPath)) {
        config.logger.log("Can't read build/contract JSON file: " +
                           `${buildJsonPath}`);
        done(null, [], []);
        return;
      }

      let buildObj;
      try {
        buildObj = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));
      } catch (err) {
        config.logger.log("Error parsing JSON file: " +
                           `${buildJsonPath}`);
        done(null, [], []);
        return;
      }

      let analyzeOpts = {
        _: config._,
        debug: config.debug,
        logger: config.logger,
        mode: config.mode,
        style: config.style,
        timeout: (config.timeout || 120) * 1000,

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

    fakeAnalyzeWithBuildDir();
    // Contracts.compile(config,
    //                   function(arg) {
    //                     if (arg !== null) {
    //                       config.logger.log(`compile returns ${arg}`);
    //                     } else {
    //                       fakeAnalyzeWithBuildDir();
    //                     }
    //               });
}
