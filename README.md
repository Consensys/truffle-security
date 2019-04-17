[![CircleCI](https://circleci.com/gh/ConsenSys/truffle-security.svg?style=svg)](https://circleci.com/gh/ConsenSys/truffle-security)
[![Coverage Status](https://coveralls.io/repos/github/ConsenSys/truffle-security/badge.svg?branch=master)](https://coveralls.io/github/ConsenSys/truffle-security?branch=master)
[![ESDoc](https://doc.esdoc.org/github.com/ConsenSys/truffle-security/badge.svg)](https://doc.esdoc.org/github.com/ConsenSys/truffle-security)


# MythX Security Analysis Plugin for Truffle Framework

This plugin adds automated smart contract security analysis to the [Truffle framework](https://truffleframework.com/docs/truffle/overview). It is based on [MythX](https://mythx.io), the security analysis API for Ethereum smart contracts. The plugin is compatible with Truffle 5.0 or higher.

## Installing the Plugin

To install the latest stable version from NPM:

```console
$ npm install -g truffle-security
```

If you're feeling adventurous, you can also install the from the master branch:

```
$ npm install -g git+https://git@github.com/ConsenSys/truffle-security.git
```
### Windows only
On Windows `node-gyp` dependency requires `windows-build-tools` to be installed from an elevated PowerShell or CMD.exe (run as Administrator).
```console
npm install --global --production windows-build-tools
```
For more details refer to [node-gyp installation guide](https://github.com/nodejs/node-gyp#option-1).

## Configuration

Currently, the plugin must be activated on a per-project basis. If `truffle-security` was installed to the Truffle project root, it will try to automatically install itself to `truffle-config.js`. If you installed `truffle-security` globally, add the following to `truffle-config.js` in the root directory of your Truffle project to enable the plugin:

```javascript
module.exports = {
    plugins: [ "truffle-security" ]
};
```

### MythX Account

By default, the plugin is configured with a MythX trial account that allows a limited number of requests. You can set up a free account on the [MythX website](https://mythx.io) to get full access.

After setting up an account, set the following enviromment variables to your ETH address and password (add this to your `.bashrc` or `.bash_profile` for added convenience):

```bash
export MYTHX_ETH_ADDRESS=0x1234567891235678900000000000000000000000
export MYTHX_PASSWORD='Put your password in here!'
```

And if you're using Windows OS with PowerShell:
```bash
$env:MYTHX_ETH_ADDRESS="0x1234567891235678900000000000000000000000"
$env:MYTHX_PASSWORD="Put your password in here!"
```

### Solc Version

You can specify which version of solc to use in `truffle-config.js` as explained in [truffle's documentation](https://truffleframework.com/docs/truffle/reference/configuration#solc). MythX for Truffle will use the same version of solc that Truffle uses to compile and analyze your contracts.

```
module.exports = {
  plugins: [ "truffle-security" ],
  networks: {
    ... etc ...
  },
  compilers: {
     solc: {
       version: <string>  // ex:  "0.4.20". (Default: Truffle's installed solc)
     }
  }
};
```


## Running Security Analyses

Once the plugin is installed the `truffle run verify` becomes available. You can either analyze a specific contract by running `truffle run verify <contract-name>` or the entire project leaving out the contract name.

**Your project must compile successfully for the security analysis to work.** Note that the `verify` command invokes `truffle compile` automatically if the build files are not up to date.

Here is the output of `truffle verify` for an [example](https://github.com/ConsenSys/mythx-playground/tree/master/exercise2) from the [DevCon4 MythX Workshop](https://github.com/ConsenSys/mythx-workshop):

```console
$ truffle run verify

/Projects/mythx-playground/exercise2/contracts/Tokensale.sol
   1:0   warning  A floating pragma is set                SWC-103
  16:29  warning  The binary multiplication can overflow  SWC-101
  18:8   warning  The binary addition can overflow        SWC-101

✖ 4 problems (0 errors, 4 warnings)
```

Here is an example of analyzing a single contract and using the `table` report style:

```
$ truffle run verify --style table

/Projects/mythx-playground/exercise2/contracts/Tokensale.sol

║ Line     │ Column   │ Type     │ Message                                                │ Rule ID              ║
╟──────────┼──────────┼──────────┼────────────────────────────────────────────────────────┼──────────────────────╢
║ 1        │ 0        │ warning  │ A floating pragma is set.                              │ SWC-103              ║
║ 16       │ 29       │ warning  │ The binary multiplication can overflow.                │ SWC-101              ║
║ 18       │ 8        │ warning  │ The binary addition can overflow.                      │ SWC-101              ║

╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ 0 Errors                                                                                                       ║
╟────────────────────────────────────────────────────────────────────────────────────────────────────────────────╢
║ 4 Warnings                                                                                                     ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝

```

## Advanced Options

Run `truffle run verify --help` to show advanced configuration options.

```console
$ truffle run verify --help

Usage: truffle run verify [options] [*contract-name1* [*contract-name2*] ...]

Runs MythX analyses on given Solidity contracts. If no contracts are
given, all are analyzed.

Options:
  --all      Compile all contracts instead of only the contracts changed since last compile.
  --mode { quick | full }
             Perform quick or in-depth (full) analysis.
  --style { stylish | json | table | tap | unix | ... },
             Output report in the given es-lint style style.
             See https://eslint.org/docs/user-guide/formatters/ for a full list.
  --json | --yaml
             Dump results in unprocessed JSON or YAML format as it comes back from MythX.
             Note: this disables providing any es-lint style reports, and that
             --style=json is processed for eslint, while --json is not.
  --timeout *secs*
             Limit MythX analyses time to *secs* seconds.
             The default is 300 seconds (five minutes).
  --initial-delay *secs*
             Minimum amount of time to wait before attempting a first status poll to MythX.
             The default is 45 seconds.
             See https://github.com/ConsenSys/armlet#improving-polling-response
  --limit *N*
             Have no more than *N* analysis requests pending at a time.
             As results come back, remaining contracts are submitted.
             The default is 4 contracts, the maximum value, but you can
             set this lower.
  --debug    Provide additional debug output. Use --debug=2 for more
             verbose output
  --min-severity { warning | error }
             Ignore SWCs below the designated level
  --swc-blacklist { 101 | 103,111,115 | ... }
             Ignore a specific SWC or list of SWCs.
  --uuid *UUID*
             Print in YAML results from a prior run having *UUID*
             Note: this is still a bit raw and will be improved.
  --version  Show package and MythX version information.
  --progress, --no-progress
             Enable/disable progress bars during analysis. The default is enabled.
  --color, --no-color
             Enable/disable output coloring. The default is enabled.


```
Configuration options can also be stored as json in `truffle-security.json` at the truffle project root. i.e. : 
```
{
    "style": "table",
    "mode": "quick",
    "min-severity": "warning",
    "swc-blacklist": [103,111]
}
```
