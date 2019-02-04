<!-- until coveralls is fixed for the repo change -->
<!-- [![CircleCI](https://circleci.com/gh/ConsenSys/truffle-security.svg?style=svg)](https://circleci.com/gh/ConsenSys/truffle-security)
[![Coverage Status](https://coveralls.io/repos/github/ConsenSys/truffle-security/badge.svg?branch=master)](https://coveralls.io/github/ConsenSys/truffle-security?branch=master)
-->

# Truffle Security Analysis - MythX Plugin

This plugin adds automated smart contract security analysis to the [Truffle framework](https://truffleframework.com/docs/truffle/overview). It is based on [MythX](https://mythx.io), the security analysis API for Ethereum smart contracts.

# Setup

## Install the plugin:

```console
$ npm install truffle-security
```

## Enable the plugin

In your truffle project put in `truffle.js`:

```javascript
module.exports = {
    plugins: [ "truffle-security" ]
};
```

For now `truffle.js` needs to be adjusted for each project. However, changes to truffle are planned
so that in the future you can specifiy this globally. See [truffle issue #1695](https://github.com/trufflesuite/truffle/issues/1695)

## Set `MYTHX` environment variables.

By default, the plugin is configured with a MythX trial account that
allows a limited number of requests and may lack some analysis features.
To get full access, visit the [MythX website](https://mythx.io) with a 
web3-enabled browser and create a free user account. Check out the
[MythX getting started guide](https://docs.mythx.io/en/latest/main/getting-started.html)
for detailed instructions.

After setting up an account, set the following enviromment variables to your ETH address and password:

```bash
export MYTHX_ETH_ADDRESS=0x1234567891235678900000000000000000000000
export MYTHX_PASSWORD='Put your password in here!'
```

# Using Truffle Security

```console
$ truffle run verify help

  Usage:        truffle run verify [options] [*contract-name1* [contract-name2*] ...]

Runs MythX analyses on given Solidity contracts. If no contracts are
given, all are analyzed.

  Options:
    --debug     Provide additional debug output
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

Runs MythX analyses on given Solidity contracts. If no contracts are given, all are analyzed.

Options are deliberately sparse since we want simple interaction. Most
of the complexity is hidden behind the MythX.

If you leave off a _contract-name_, we'll find one inside the
project. If you have more than one contract in the project you should
specify which one you want to use. Instead of a contract name inside a
solidity file, you can also give either a relative or absolute path
the a JSON file the `build/contracts` directory. This is useful if
you are running inside a shell that contains command completion.

Here is an example:

```console
$ truffle run verify SimpleSuicide
Compiling ./contracts/Migrations.sol...
Compiling ./contracts/SimpleDAO.sol...
Compiling ./contracts/simple_suicide.sol...
Compiling ./contracts/suicide.sol...

/tmp/github/vulnerable-truffle-project/contracts/SimpleSuicide.sol
  4:4  error  The function '_function_0xa56a3b5a' executes the SUICIDE instruction                     SWC-106
  0:0  error  Functions that do not have a function visibility type specified are 'public' by default  SWC-100

✖ 2 problems (2 errors, 0 warnings)

```

Note that in above that `verify` may invoke `compile` when sources are not up to date.

The default report style is `stylish` however you may want to experiment with other styles.
Here is an example of using the  `table` format:


```
$ truffle run verify --style table

/src/external-vcs/github/vulnerable-truffle-project/contracts/SimpleDAO.sol

║ Line     │ Column   │ Type     │ Message                                                │ Rule ID      ║
╟──────────┼──────────┼──────────┼────────────────────────────────────────────────────────┼──────────────╢
║ 12       │ 4        │ error    │ The binary subtraction can underflow.                  │ SWC-101      ║
║ 17       │ 14       │ error    │ State variable visibility is not set explictly.        │ SWC-108      ║
║ 0        │ 0        │ error    │ Contracts should be deployed with the same             │ SWC-103      ║
║          │          │          │ compiler version and flags that they have been         │              ║
║          │          │          │ tested with thoroughly.                                │              ║

╔════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ 3 Errors                                                                                               ║
╟────────────────────────────────────────────────────────────────────────────────────────────────────────╢
║ 0 Warnings                                                                                             ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════╝
```
