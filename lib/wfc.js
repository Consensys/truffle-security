/*
   This is largely a cut and paste of truffle-workflow-compile

   We have modified it though to save additional information per contract
   to assist MythX analysis.

   In particular we add:
     sourceList[]  - a list of the sources that can be used in a sourceMap.
     sources       - a dict whose key is an entry of sourceList and whose value contains
         source: string
         ast: ast
         legacyAst: ast
*/
const mkdirp = require('mkdirp');
const path = require('path');
const fs = require('fs-extra');
const { callbackify, promisify } = require('util');
const Config = require('@truffle/config');
const solcCompile = require('../compat/truffle-compile');
const vyperCompile = require('@truffle/compile-vyper');
const externalCompile = require('@truffle/external-compile');
const expect = require('@truffle/expect');
const Resolver = require('@truffle/resolver');
const OS = require('os');

const SUPPORTED_COMPILERS = {
    'solc': solcCompile,
    'vyper': vyperCompile,
    'external': externalCompile,
};

/* FIXME: if truffle-worflow-compile added a parameter, a directory name
   under "build", we wouldn't have to change this.
*/
function prepareConfig(options) {
    expect.options(options, [
        'build_mythx_contracts'
    ]);

    // Use a config object to ensure we get the default sources.
    const config = Config.default().merge(options);

    config.compilersInfo = {};

    if (!config.resolver) {
        config.resolver = new Resolver(config);
    }

    return config;
}

/*
  This function is not modified from truffle-workflow-compile.
*/
function multiPromisify (func) {
    // FIXME: accumulating this to a list is weird.
    const resultList = [];
    return (...args) => new Promise( (accept, reject) => {
        const callback = (err, ...results) => {
            if (err) reject(err);
            resultList.push(results);
            //FROM truffle-workflow-compile
            accept(resultList);
        };

        func(...args, callback);
    });
}

const Contracts = {
    collectCompilations: async compilations => {
        let result = { outputs: {}, basenames: {} };

        for (let compilation of await Promise.all(compilations)) {
            let { compiler, artifacts } = compilation;

            if (artifacts) {
                result.outputs[compiler] = artifacts;

                for (const artifact of artifacts) {
                    for (let [ basename, abstraction ] of Object.entries(artifact)) {
                        result.basenames[basename] = abstraction;
                    }

                }
            }
        }

        return result;
    },

    // contracts_directory: String. Directory where .sol files can be found.
    // contracts_build_mythx_contracts: String. Directory where .sol.js files can be found and written to.
    // all: Boolean. Compile all sources found. Defaults to true. If false, will compare sources against built files
    //      in the build directory to see what needs to be compiled.
    // quiet: Boolean. Suppress output. Defaults to false.
    // strict: Boolean. Return compiler warnings as errors. Defaults to false.
    compile: callbackify(async function(options) {
        const config = prepareConfig(options);

        // FIXME: Simplify by removing vyper right now.
        delete config.compilers.vyper;

        const compilers = (config.compiler)
            ? [config.compiler]
            : Object.keys(config.compilers);


        // convert to promise to compile+write
        const compilations = await this.compileSources(config, compilers);
        return await this.collectCompilations(compilations);
    }),

    compileSources: async function(config, compilers) {
        return Promise.all(
            compilers.map(async (compiler) => {
                const compile = SUPPORTED_COMPILERS[compiler];
                if (!compile) throw new Error('Unsupported compiler: ' + compiler);

                const compileFunc = (config.all === true || config.compileAll === true)
                    ? compile.all
                    : compile.necessary;

                let results;
                try {
                    results = await multiPromisify(compileFunc)(config);
                } catch (e) {
                    if(config.debug) {
                        console.error(e);
                    } else {
                        console.error(e.message);
                    }
                    process.exit(1);
                }

                if (results && results.length > 0) {
                    let seenStale = false;
                    for (const result of results) {
                        const [artifact, stale] = result;
                        if (stale) {
                            if (config.quiet != true && config.quietWrite != true && !seenStale) {
                                const relPath = path.relative(config.working_directory, config.build_mythx_contracts);
                                config.logger.log(`Writing artifacts to .${path.sep}${relPath}${OS.EOL}`);
                                seenStale = true;
                            }
                            await this.writeContracts(artifact, config);
                        }
                    }
                }
                return { compiler, results };
            })
        );
    },

    writeContracts: async function(artifact, options) {
        await promisify(mkdirp)(options.build_mythx_contracts);

        const shortNames = Object.keys(artifact);
        await Promise.all(shortNames.map(async (shortName) => {
            const jsonData = JSON.stringify(artifact[shortName], null, 4);
            const jsonPath = path.join(options.build_mythx_contracts, shortName + '.json');
            return await promisify(fs.writeFile)(jsonPath, jsonData);
        }));
    }
};

module.exports = Contracts;
