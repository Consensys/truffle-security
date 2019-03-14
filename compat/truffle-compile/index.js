const assert = require('assert');
const fs = require('fs');
const OS = require("os");
const path = require("path");
const Profiler = require("./profiler");
const CompileError = require("./compileerror");
const CompilerSupplier = require("./compilerSupplier");
const expect = require("truffle-expect");
const find_contracts = require("truffle-contract-sources");
const Config = require("truffle-config");
const debug = require("debug")("compile"); // eslint-disable-line no-unused-vars

let nodeDirectory;
let contractsDirectory;

function getFileContent(filepath) {
  const stats = fs.statSync(filepath);
  if (stats.isFile()) {
    return fs.readFileSync(filepath).toString();
  } else {
    throw new Error `File ${filepath} not found`;
  }
}

function isExplicitlyRelative(import_path) {
    return import_path.indexOf(".") === 0;
}

function convertToAbsolutePath(p, base, nodeBase) {
  // If it's an absolute paths, leave it alone.
  if (path.isAbsolute(p)) return p;

  // If it's not explicitly relative, must be relative to node_modules
  if (!isExplicitlyRelative(p)) {
    return path.resolve(path.join(nodeBase, p));
  }

  // Path must be explicitly relative, therefore make it absolute.
  return path.resolve(path.join(base, p));
}

const getSourceFileName = sourcePath => {
  let shortName = path.basename(sourcePath);
  if (shortName.endsWith('.sol')) {
    shortName = shortName.slice(0, -4)
  }
  return shortName;
}

function sourcePath2BuildPath(sourcePath, buildDir) {
  const shortName = getSourceFileName(sourcePath);
  return path.join(buildDir, shortName + '.json')
}

/* returns true if directory/file out of date
*/
function staleBuildContract (sourcePath, buildPath) {
    let sourcePathStat, buildPathStat;
    try {
        sourcePathStat = fs.statSync(sourcePath);
    } catch (err) {
        return true;
    }
    try {
        buildPathStat = fs.statSync(buildPath);
    } catch (err) {
        return true;
    }

    const sourceMtime = sourcePathStat.mtime;
    const buildMtime = buildPathStat.mtime;
    return sourceMtime > buildMtime;
};


// Recent versions of truffle seem to add __ to the end of the bytecode
const cleanBytecode = bytecode => {
  let cleanedBytecode = bytecode.replace(/_.+$/, '');
  cleanedBytecode = `0x${cleanedBytecode}`;
  return cleanedBytecode;
}


const normalizeJsonOutput = jsonObject => {
  const { contracts, sources, compiler, updatedAt } = jsonObject;
  const result = {
    compiler,
    updatedAt,
    sources: {},
  };

  for (const [ sourcePath, solData ] of Object.entries(contracts)) {
      if (!result.sources[sourcePath]) {
          result.sources[sourcePath] = {
              // sourcePath,
              contracts: [],
          };
      }
      for (const [ contractName, contractData ] of Object.entries(solData)) {
          const o = {
              contractName,
              bytecode: cleanBytecode(contractData.evm.bytecode.object),
              deployedBytecode: cleanBytecode(contractData.evm.deployedBytecode.object),
              sourceMap: contractData.evm.bytecode.sourceMap,
              deployedSourceMap: contractData.evm.deployedBytecode.sourceMap,
          };

          result.sources[sourcePath].contracts.push(o);
      }
  }

  for (const [ sourcePath, solData ] of Object.entries(sources)) {
    if (!result.sources[sourcePath]) {
      continue;
    }
    result.sources[sourcePath].ast = solData.ast;
    result.sources[sourcePath].legacyAST = solData.legacyAST;
    result.sources[sourcePath].id = solData.id;

    const absPathName = convertToAbsolutePath(sourcePath, contractsDirectory, nodeDirectory);
    result.sources[sourcePath].source = getFileContent(absPathName);
  }

  return result;
};

// Most basic of the compile commands. Takes a sources, where
// the keys are file or module paths and the values are the bodies of
// the contracts. Does not evaulate dependencies that aren't already given.
//
// Default options:
// {
//   strict: false,
//   quiet: false,
//   logger: console
// }
var compile = function(sourcePath, sourceText, options, callback, isStale) {
  nodeDirectory = path.join(options.working_directory, 'node_modules');
  contractsDirectory = options.contracts_directory;

  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (options.logger === undefined) options.logger = console;

  var hasTargets =
    options.compilationTargets && options.compilationTargets.length;

  expect.options(options, ["contracts_directory", "compilers"]);

  expect.options(options.compilers, ["solc"]);

  options.compilers.solc.settings.evmVersion =
    options.compilers.solc.settings.evmVersion ||
    options.compilers.solc.evmVersion ||
    {};
  options.compilers.solc.settings.optimizer =
    options.compilers.solc.settings.optimizer ||
    options.compilers.solc.optimizer ||
    {};

  // Ensure sources have operating system independent paths
  // i.e., convert backslashes to forward slashes; things like C: are left intact.
  var operatingSystemIndependentSources = {};
  var operatingSystemIndependentTargets = {};
  var originalPathMappings = {};

  var defaultSelectors = {
    "": ["legacyAST", "ast"],
    "*": [
      "abi",
      "evm.bytecode.object",
      "evm.bytecode.sourceMap",
      "evm.deployedBytecode.object",
      "evm.deployedBytecode.sourceMap",
      "userdoc",
      "devdoc"
    ]
  };

  // Specify compilation targets
  // Each target uses defaultSelectors, defaulting to single target `*` if targets are unspecified
  var outputSelection = {};
  var targets = operatingSystemIndependentTargets;
  var targetPaths = Object.keys(targets);

  targetPaths.length
    ? targetPaths.forEach(key => (outputSelection[key] = defaultSelectors))
    : (outputSelection["*"] = defaultSelectors);

  var solcStandardInput = {
    language: "Solidity",
    sources: {},
    settings: {
      evmVersion: options.compilers.solc.settings.evmVersion,
      optimizer: options.compilers.solc.settings.optimizer,
      outputSelection
    }
  };

  // Load solc module only when compilation is actually required.
  const supplier = new CompilerSupplier(options.compilers.solc);

  supplier
    .load()
    .then(solc => {

      const solcVersion = solc.version();
      solcStandardInput.sources = {
        [sourcePath]: {
          content: sourceText
        }
      };

      function findImports(pathName) {
        try {
          const absPathName = convertToAbsolutePath(pathName, contractsDirectory, nodeDirectory);
          if (fs.existsSync(absPathName)) {
            return { contents: getFileContent(absPathName) };
          } else {
            // We can't find the file, so fudge it with the empty contents, which is
            // better than throwing an error.
            return { contents: '' };
          }
        } catch (e) {
          return { error: e.message };
        }
      }

      const result = solc.compile(JSON.stringify(solcStandardInput), findImports);

      var standardOutput = JSON.parse(result);

      var errors = standardOutput.errors || [];
      var warnings = [];

      if (options.strict !== true) {
        warnings = errors.filter(function(error) {
          return error.severity === "warning";
        });

        errors = errors.filter(function(error) {
          return error.severity !== "warning";
        });

        if (options.quiet !== true && warnings.length > 0) {
          options.logger.log(
            OS.EOL + "Compilation warnings encountered:" + OS.EOL
          );
          options.logger.log(
            warnings
              .map(function(warning) {
                return warning.formattedMessage;
              })
              .join()
          );
        }
      }

      if (errors.length > 0) {
        options.logger.log("");
        return callback(
          new CompileError(
            standardOutput.errors
              .map(function(error) {
                return error.formattedMessage;
              })
              .join()
          )
        );
      }

      standardOutput.compiler =  {
        name: "solc",
        version: solcVersion
      };
      standardOutput.source = sourceText;
      standardOutput.updatedAt = new Date();

      const normalizedOutput = normalizeJsonOutput(standardOutput);

      // FIXME: the below return path is hoaky, because it is in the format that
      // the multiPromisify'd caller in workflow-compile expects.
      const shortName = getSourceFileName(sourcePath);

      callback(null, {[shortName]: normalizedOutput}, isStale);
    })
    .catch(callback);
};

/** From original truffle-compile. This is not used yet.
**/
function replaceLinkReferences(bytecode, linkReferences, libraryName) {
  var linkId = "__" + libraryName;

  while (linkId.length < 40) {
    linkId += "_";
  }

  linkReferences.forEach(function(ref) {
    // ref.start is a byte offset. Convert it to character offset.
    var start = ref.start * 2 + 2;

    bytecode =
      bytecode.substring(0, start) + linkId + bytecode.substring(start + 40);
  });

  return bytecode;
}

/** From original truffle-compile. This is not used yet.
**/
function orderABI(contract) {
  var contract_definition;
  var ordered_function_names = [];

  for (var i = 0; i < contract.legacyAST.children.length; i++) {
    var definition = contract.legacyAST.children[i];

    // AST can have multiple contract definitions, make sure we have the
    // one that matches our contract
    if (
      definition.name !== "ContractDefinition" ||
      definition.attributes.name !== contract.contract_name
    ) {
      continue;
    }

    contract_definition = definition;
    break;
  }

  if (!contract_definition) return contract.abi;
  if (!contract_definition.children) return contract.abi;

  contract_definition.children.forEach(function(child) {
    if (child.name === "FunctionDefinition") {
      ordered_function_names.push(child.attributes.name);
    }
  });

  // Put function names in a hash with their order, lowest first, for speed.
  var functions_to_remove = ordered_function_names.reduce(function(
    obj,
    value,
    index
  ) {
    obj[value] = index;
    return obj;
  },
  {});

  // Filter out functions from the abi
  var function_definitions = contract.abi.filter(function(item) {
    return functions_to_remove[item.name] !== undefined;
  });

  // Sort removed function defintions
  function_definitions = function_definitions.sort(function(item_a, item_b) {
    var a = functions_to_remove[item_a.name];
    var b = functions_to_remove[item_b.name];

    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  });

  // Create a new ABI, placing ordered functions at the end.
  var newABI = [];
  contract.abi.forEach(function(item) {
    if (functions_to_remove[item.name] !== undefined) return;
    newABI.push(item);
  });

  // Now pop the ordered functions definitions on to the end of the abi..
  Array.prototype.push.apply(newABI, function_definitions);

  return newABI;
}

// contracts_directory: String. Directory where .sol files can be found.
// quiet: Boolean. Suppress output. Defaults to false.
// strict: Boolean. Return compiler warnings as errors. Defaults to false.
compile.all = function(options, callback) {
  find_contracts(options.contracts_directory, function(err, files) {
    if (err) return callback(err);

    options.paths = files;
      compile.with_dependencies(options, callback, true);
  });
};

// contracts_directory: String. Directory where .sol files can be found.
// build_directory: String. Optional. Directory where .sol.js files can be found. Only required if `all` is false.
// all: Boolean. Compile all sources found. Defaults to true. If false, will compare sources against built files
//      in the build directory to see what needs to be compiled.
// quiet: Boolean. Suppress output. Defaults to false.
// strict: Boolean. Return compiler warnings as errors. Defaults to false.
compile.necessary = function(options, callback) {
  options.logger = options.logger || console;

  Profiler.updated(options, function(err, updated) {
    if (err) return callback(err);

    if (updated.length === 0 && options.quiet !== true) {
      return callback(null, [], {});
    }

    options.paths = updated;
    compile.with_dependencies(options, callback, false);
  });
};

compile.with_dependencies = function(options, callback, compileAll) {
  var self = this;

  options.logger = options.logger || console;
  options.contracts_directory = options.contracts_directory || process.cwd();

  expect.options(options, [
    "paths",
    "working_directory",
    "contracts_directory",
    "resolver"
  ]);

  var config = Config.default().merge(options);

  Profiler.required_sources(
    config.with({
      paths: options.paths,
      base_path: options.contracts_directory,
      resolver: options.resolver
    }),
    (err, allSources, required) => {
      if (err) return callback(err);


      // Filter out of the list of files to be compiled those for which we have a JSON that
      // is newer than the last modified time of the source file.
      const filteredRequired = [];
      for (const sourcePath of options.paths) {
        const targetJsonPath = sourcePath2BuildPath(sourcePath, options.build_mythx_contracts);
        if (compileAll || staleBuildContract(sourcePath, targetJsonPath)) {
          // Set for compilation
          filteredRequired.push(sourcePath);
        } else {
          // Pick up from existing JSON
          const buildJson = fs.readFileSync(targetJsonPath, 'utf8');
          const buildObj = JSON.parse(buildJson);
          const shortName = getSourceFileName(sourcePath);
          callback(null, {[shortName]: buildObj}, false);
          return
        }
      }
      var hasTargets = filteredRequired.length;

      hasTargets
        ? self.display(filteredRequired, options)
        : self.display(allSources, options);

      for (const sourcePath of filteredRequired) {
        if (!sourcePath.endsWith('/Migrations.sol')) {
          compile(sourcePath, allSources[sourcePath], options, callback, true);
        }
      }
    });
};

compile.display = function(paths, options) {
  if (options.quiet !== true) {
    if (!Array.isArray(paths)) {
      paths = Object.keys(paths);
    }

    const blacklistRegex = /^truffle\/|\/Migrations.sol$/;

    paths.sort().forEach(contract => {
      if (path.isAbsolute(contract)) {
        contract =
          "." + path.sep + path.relative(options.working_directory, contract);
      }
      if (contract.match(blacklistRegex)) return;
      options.logger.log("Compiling " + contract + "...");
    });
  }
};

compile.CompilerSupplier = CompilerSupplier;
module.exports = compile;
