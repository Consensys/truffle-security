/*
   This is largely a cut and paste of truffle's workflow-compile

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
const Config = require('truffle-config');
const solcCompile = require('truffle-compile');
const vyperCompile = require('truffle-compile-vyper');
const externalCompile = require('truffle-external-compile');
const expect = require('truffle-expect');
const Resolver = require('truffle-resolver');
const Artifactor = require('truffle-artifactor');
const OS = require('os');

const SUPPORTED_COMPILERS = {
    'solc': solcCompile,
    'vyper': vyperCompile,
    'external': externalCompile,
};

/* A replacement for truffe-artifacts.save, that
   puts in only MythX-needed fields.
*/
const mythXsave = function(object) {
    var self = this;

    return new Promise(function(accept, reject) {

        if (object.contractName == null) {
            return reject(new Error('You must specify a contract name.'));
        }

        delete object.contract_name;

        var outputPath = object.contractName;

        // Create new path off of destination.
        outputPath = path.join(self.destination, outputPath);
        outputPath = path.resolve(outputPath);

        // Add json extension.
        outputPath = outputPath + '.json';

        fs.readFile(outputPath, {encoding: 'utf8'}, function(err, json) {
            // No need to handle the error. If the file doesn't exist then we'll start afresh
            // with a new object.

            const finalObject = object;

            if (!err) {
                try {
                    JSON.parse(json);
                } catch (e) {
                    reject(e);
                }

                /*
                // normalize existing and merge into final
                finalObject = Schema.normalize(existingObjDirty);

                // merge networks
                var finalNetworks = {};
                _.merge(finalNetworks, finalObject.networks, object.networks);

                // update existing with new
                _.assign(finalObject, object);
                finalObject.networks = finalNetworks;
                */
            }

            // update timestamp
            finalObject.updatedAt = new Date().toISOString();

            // output object
            fs.outputFile(outputPath, JSON.stringify(finalObject, null, 2), 'utf8', function(err) {
                if (err) return reject(err);
                accept();
            });
        });
    });
};

function mythXify(contracts) {
    const sourceList = [];
    const sources = {};

    for (const contractName of Object.keys(contracts)) {
        const contract = contracts[contractName];
        sourceList.push(contract.sourcePath);
        sources[contract.sourcePath] = {
            ast: contract.ast,
            legacyAST: contract.legacyAST,
            source: contract.source,
        };
    }

    for (const contractName of Object.keys(contracts)) {
        const contract = contracts[contractName];
        contract.sourceList = sourceList;
        contract.sources = sources;
    }

    return contracts;
}

/* FIXME: if truffle-worflow-compile added a parameter, a directory name
   under "build", we wouldn't have to change this.
*/
function prepareConfig(options) {
    expect.options(options, [
        'build_mythx_snapshots'
    ]);

    // Use a config object to ensure we get the default sources.
    const config = Config.default().merge(options);

    if (!config.resolver) {
        config.resolver = new Resolver(config);
    }

    if (!config.artifactor) {
        config.artifactor = new Artifactor(config.build_mythx_snapshots);
        config.artifactor.save = mythXsave;
    }

    return config;
}

/* FIXME: this function is not modified from truffle-workflow-compile
   we could use it directly if it were exported
*/
function multiPromisify (func) {
    return (...args) => new Promise( (accept, reject) => {
        const callback = (err, ...results) => {
            if (err) reject(err);

            accept(results);
        };

        func(...args, callback);
    });
}

const Contracts = {

    // contracts_directory: String. Directory where .sol files can be found.
    // contracts_build_mythx_snapshots: String. Directory where .sol.js files can be found and written to.
    // all: Boolean. Compile all sources found. Defaults to true. If false, will compare sources against built files
    //      in the build directory to see what needs to be compiled.
    // network_id: network id to link saved contract artifacts.
    // quiet: Boolean. Suppress output. Defaults to false.
    // strict: Boolean. Return compiler warnings as errors. Defaults to false.
    compile: callbackify(async function(options) {
        const config = prepareConfig(options);

        const compilers = (config.compiler)
            ? [config.compiler]
            : Object.keys(config.compilers);

        // convert to promise to compile+write
        const compilations = compilers.map(async (compiler) => {
            const compile = SUPPORTED_COMPILERS[compiler];
            if (!compile) throw new Error('Unsupported compiler: ' + compiler);

            const compileFunc = (config.all === true || config.compileAll === true)
                ? compile.all
                : compile.necessary;

            let [contracts, output] = await multiPromisify(compileFunc)(config);

            if (contracts && Object.keys(contracts).length > 0) {
                await this.writeContracts(contracts, config);
            }

            return { compiler, contracts, output };
        });

        const collect = async (compilations) => {
            let result = {
                outputs: {},
                contracts: {}
            };

            for (let compilation of await Promise.all(compilations)) {
                let { compiler, output, contracts } = compilation;

                result.outputs[compiler] = output;

                for (let [ name, abstraction ] of Object.entries(contracts)) {
                    result.contracts[name] = abstraction;
                }

            }

            return result;
        };

        return await collect(compilations);
    }),

    writeContracts: async function(contracts, options) {
        const logger = options.logger || console;
        await promisify(mkdirp)(options.build_mythx_snapshots);

        if (options.quiet != true && options.quietWrite != true) {
            const relPath = path.relative(options.working_directory, options.build_mythx_snapshots);
            logger.log(`Writing artifacts to .${path.sep}${relPath}${OS.EOL}`);
        }

        const extra_opts = {
            network_id: options.network_id
        };

        contracts = mythXify(contracts);
        await options.artifactor.saveAll(contracts, extra_opts);
    }
};

module.exports = Contracts;
