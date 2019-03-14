/*
  This code is modified from truffle-compile.

  However, on solcjs.compile we allow an import callback function to get source code text
  which is important so we populate AST information more fully.

  The other change is that we gather data on a per file basis rather than on a per contract basis.

  Note: the use of var vs let/const is a holdover from truffle-compile.
*/

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
  let stats;
  try {
    stats = fs.statSync(filepath);
  } catch (e) {
    throw new Error(`File ${filepath} not found`);
  }

  if (stats.isFile()) {
    return fs.readFileSync(filepath).toString();
  } else {
    throw new Error(`${filepath} is not file`);
  }
}


function isExplicitlyRelative(import_path) {
    return import_path.indexOf(".") === 0;
}

/**
  * resolves a path (relative, absolute, node_module) into an a
  * an absolute path
  *
  *  @param {String} p         - path to resolve
  *  @param {String} base      - where to resolve relative paths from
                                 usually the "contracts" directory
  *  @param {String} nodeBase  - where to resolve nodeJS paths from

  Converts
  NOTE:  truffle-resolver.resolve may cover the below and do more.

  If we switch to truffle-resolver.resolve it handles 3 kinds of classes
  `EPMSource`, `NPMSource`, `FSSource`

  The 2nd is probably with respect to npm source and the last is
  probably with respect to file system sources that are not npm source.

  I am not sure what the first is about other than it probably has to do
  with installed contracts.

  Right now, this code seems a little bit complex to use and it isn't all that
  well documented.
*/
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
    .catch(e => {
      throw e
    });
};

/**
 * Compiles all source files whether they need it or not
 *
 *  @param {Config} options  - truffle config option
 *  @param {function} callback  - called on every source file found
 *
 * options.contracts_directory is a directory path where .sol files can be found.
*/
compile.all = function(options, callback) {
  find_contracts(options.contracts_directory, function(err, files) {
    if (err) return callback(err);

    options.paths = files;
      compile.with_dependencies(options, callback, true);
  });
};

/**
 * Compiles only source files that need updating. We use
 * Make-style dependency check of timestamp + missing file
 *
 *  @param {Config} options  - truffle config option
 *  @param {function} callback  - called on every source file found
 *
 */
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

/**
 * Compiles a source file and all of the files that it
 * depends on.
 *
 *  @param {Config} options  - truffle config option
 *  @param {function} callback  - called on every source file found
 *  @param {boolean} compileAll  - if true compile whether or not it
 *                                 the file was deemed out of date.
 *
 */
compile.with_dependencies = function(options, callback, compileAll) {
  var self = this;

  options.logger = options.logger || console;
  options.contracts_directory = options.contracts_directory || process.cwd();

  expect.options(options, [
    "paths",
    "working_directory",
    "contracts_directory",
    // "resolver" // when we start using truffle-resolver
  ]);

  var config = Config.default().merge(options);

  Profiler.required_sources(
    config.with({
      paths: options.paths,
      base_path: options.contracts_directory,
      // resolver: options.resolver // when we start using truffle-resolver
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

/**
 * Show what file is being compiled.
 */
compile.display = function(paths, options) {
  if (options.quiet !== true) {
    if (!Array.isArray(paths)) {
      paths = Object.keys(paths);
    }

    const blacklistRegex = /^truffle\/|\/Migrations.sol$/;

    paths.sort().forEach(fileName => {
      if (path.isAbsolute(fileName)) {
        fileName =
          "." + path.sep + path.relative(options.working_directory, fileName);
      }
      if (fileName.match(blacklistRegex)) return;
      options.logger.log("Compiling " + fileName + "...");
    });
  }
};

compile.CompilerSupplier = CompilerSupplier;
module.exports = compile;
