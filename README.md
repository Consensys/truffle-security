# Introduction

The NPM package behind "truffle run analyze".

_This is alpha code. You won't be able to use this without a MythX account,
and will be more generally distributed in the December to January time period._

This package is intended to be used as submodule inside
`truffle/packages` and is not useful without further patches to
the `truffle-core` package.

A prelmiminary version was (based on truffle 4) was demo'd at
[trufflecon2018](https://truffleframework.com/trufflecon2018).

It also was shown at [devcon4](https://devcon4.ethereum.org/)
where it was been updated to use truffle `5.0-beta` along with
a more advanced [MythX](mythril.ai).

We expect to get this integrated into the new external plugin system
that truffle expects to provide in in version 5.0.0.

# Usage

And here are the options for `run analyze`:

```console
$ truffle run analyze help

  Usage:        truffle+analyze analyze [--mode={full|quick}] [--debug] [--style *eslint-style-name*] [*contract-name*]
  Description:  Run Mythril Platform analyses on a contract
  Options:
                --mode {
                    Set analysis mode to be either quick (fast) or full (in depth)
                --debug
                    Provide additional debug output
                --style {stylish | unix | visualstudio | table | tap | ...}
                    Set output format in the given es-lint style format the migration file. See https://eslint.org/docs/user-guide/formatters/ for a full list.
				 --version
				    Show package and MythX version information
```

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
$ truffle run analyze SimpleSuicide
Compiling ./contracts/Migrations.sol...
Compiling ./contracts/SimpleDAO.sol...
Compiling ./contracts/simple_suicide.sol...
Compiling ./contracts/suicide.sol...

/tmp/github/vulnerable-truffle-project/contracts/SimpleSuicide.sol
  4:4  error  The function '_function_0xa56a3b5a' executes the SUICIDE instruction                     mythril/SWC-106
  0:0  error  Functions that do not have a function visibility type specified are 'public' by default  maru/SWC-100

✖ 2 problems (2 errors, 0 warnings)

```

Note that in above that `analyze` may invoke `compile` when sources are not up to date.

The default report style is `stylish` however you may want to experiment with other styles.
Here is an example of using the  `table` format:


```
$ truffle+analyze analyze --style table

/src/external-vcs/github/vulnerable-truffle-project/contracts/SimpleDAO.sol

║ Line     │ Column   │ Type     │ Message                                                │ Rule ID              ║
╟──────────┼──────────┼──────────┼────────────────────────────────────────────────────────┼──────────────────────╢
║ 12       │ 4        │ error    │ A possible integer overflow exists in the function     │ mythril/SWC-101      ║
║          │          │          │ '_function_0x00362a95'.                                │                      ║
║ 17       │ 14       │ error    │ This contract executes a message call to the           │ mythril/SWC-107      ║
║          │          │          │ address of the transaction sender.                     │                      ║
║ 0        │ 0        │ error    │ Contracts should be deployed with the same             │ maru/SWC-103         ║
║          │          │          │ compiler version and flags that they have been         │                      ║
║          │          │          │ tested with thoroughly.                                │                      ║

╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ 3 Errors                                                                                                       ║
╟────────────────────────────────────────────────────────────────────────────────────────────────────────────────╢
║ 0 Warnings                                                                                                     ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
```
