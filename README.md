[![CircleCI](https://circleci.com/gh/ConsenSys/truffle-security.svg?style=svg)](https://circleci.com/gh/ConsenSys/truffle-security)
[![Coverage Status](https://coveralls.io/repos/github/ConsenSys/truffle-security/badge.svg?branch=master)](https://coveralls.io/github/ConsenSys/truffle-security?branch=master)


# MythX Security Analysis Plugin for Truffle Framework

This plugin adds automated smart contract security analysis to the [Truffle framework](https://truffleframework.com/docs/truffle/overview). It is based on [MythX](https://mythx.io), the security analysis API for Ethereum smart contracts. The plugin is compatible with Truffle 5.0 or higher.

## Installing the Plugin

```console
$ npm install truffle-security
```

## Configuration

Currently, the plugin must be activated on a per-project basis. Add the following to `truffle.js` in the root directory of your Truffle project:

```javascript
module.exports = {
    plugins: [ "truffle-security" ]
};
```

By default, the plugin is configured with a MythX trial account that allows a limited number of requests. You can set up a free account on the [MythX website](https://mythx.io) to get full access.

After setting up an account, set the following enviromment variables to your ETH address and password (add this to your `.bashrc` or `.bash_profile` for added convenience):

```bash
export MYTHX_ETH_ADDRESS=0x1234567891235678900000000000000000000000
export MYTHX_PASSWORD='Put your password in here!'
```

## Running Security Analyses

Once the plugin is installed the `truffle run verify` becomes available. You can either analyze a specific contract by running `truffle run verify <contract-name>` or the entire project leaving out the contract name.

**Your project must compile successfully for the security analysis to work.** Note that the `verify` command invokes `truffle compile` automatically if the build files are not up to date.

Here is the output of `truffle verify` for an [example](https://github.com/ConsenSys/mythx-playground/tree/master/exercise2) from the [DevCon4 MythX Workshop](https://github.com/ConsenSys/mythx-workshop):

```console
$ truffle run verify

/Projects/mythx-playground/exercise2/contracts/Migrations.sol
  1:0  warning  A floating pragma is set  SWC-103

/Users/bernhardmueller/Projects/mythx-playground/exercise2/contracts/Tokensale.sol
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

## Advanced Configuration

Run `truffle run verify --help` to show advanced configuration options.

```console
$ truffle run verify --help

  Usage:        truffle run verify [options] [*contract-name1* [contract-name2*] ...]

Runs MythX analyses on given Solidity contracts. If no contracts are
given, all are analyzed.

  Options:
    --debug     Provide additional debug output. Use --debug=2 for more
                verbose output
    --uuid *UUID*
                Print JSON results from a prior run having *UUID*
                Note: this is still a bit raw and will be improved
    --mode { quick | full }
                Perform quick or or in-depth (full) analysis
    --style {stylish | unix | visualstudio | table | tap | ...}
                Output reort in the given es-lint style.
                See https://eslint.org/docs/user-guide/formatters/ for a full list.
    --timeout *seconds* ,
                Limit MythX analysis time to *s* seconds.
                The default is 120 seconds (two minutes).
    --version  Show package and MythX version information.
```
