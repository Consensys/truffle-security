Release 1.3.6
================

We now send the complete AST and sources, including imports to the api, resulting in fewer errors and providing more meaningful output.

Fixed a bug that caused incorrect line numbers to be reported when contracts imported a vulnerable contract.

Fixed an issue that caused the compiler to fail silently or with a confusing error message.

Improved the messaging regarding a missing config file.

Other minor bugfixes.

Release 1.3.5
================

We now prompt users to sign up when they are using the trial account, and provide warnings that not all issues are reported. In addition, we identify whether an account is a Free or Premium account.

We added the `mainSource` field to the data sent to the api, allowing Maru to return better analysis and fewer errors.

Documentation improvements, especially for Windows installation.

Merged in some fixes from the `truffle-compile` repository.

Fixed a regression that caused the compiler to download once for every contract analyzed again.

Fixed an issue that prevented tracebacks from being printed when there are bugs during compilation.

Release 1.3.4
================

Fix a serious bug involving resolve/reject params being swapped.

Release 1.3.3
================

Display the issue warning that the Trial version is being used.

Fixed a bug that prevented analysis of multiple contracts with the same name.

Fixed a bug that downloaded the compiler for every contract analyzed.

Much of this work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment).

Release 1.3.2
================

We now automatically install truffle-security to the truffle project it is being installed to.

Support for EthPM packages was added.

Bugs in the `--yaml` output format have been fixed.

Minor logging improvements.

Fixed a bug with a "No issues found" response.

A lot of this work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment).

Release 1.3.1
================

We now handle imports from locally-installed NPM packages, such as is how openzepplin is usually installed.

In future releases we start handling:
* EthPM packages
* globally installed NPM packages
* EIP 82

The `--debug` flag now turns off the progress bar. The two, debug information and the progress bar, are incompatible.

MythX log "info" log-level messages are now ignored unless `--debug` is set.

Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment) contributed on every aspect of this release.

Release 1.3.0
================

MythX-specific Artifacts
-----------------------------

Split off the way we handle MythX JSON artifacts from the way truffle handles its JSON artifacts. This allows us to organize information in a way that makes more sense for MythX. Specifically, information is organized by file since that's the unit by which MythX analyzes them. It also gives us more control over compilation so we get more AST information from Solidity smart contracts which use "import".

These files are saved in directory `build/mythx`. Underneath we still use truffle libraries, hooked in at a lower level.

Reinstated false-positive removal in public dynamic arrays. (It was accidentally broken in the last release.)

Fixed a bug in the way sourceMaps were sent. You should no longer see the error message `Analysis fails: source list index of of range`

Improved Error Reporting
------------------------------

As with the last release, more errors from various interactions with armlet and MythX have come up. So we have been more aggressive in error handling and reporting, and in a more robust way.

A lot of this work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment).


Miscellaneous
----------------

Added option `--all`, which works the same as in `truffle compile`: all sources are compiled whether or not we think they need to be. The default behavior is to compile only when we think there is a need, such as when the source is newer than the corresponding JSON artifact.

Added option `--initial-delay`. It specifies the minimum amount of time to wait before attempting a first status poll to MythX when a result hasn't already been cached.

Right _now_ new analysis completes in less that 45 seconds. You can't set this value to less than that, however if you know from experience that the expected analysis time is longer you can adjust it upwards.

This work was again kindly contributed by Teruhiro Tagomori.

Armlet 2.2.0 or greater required, so refresh errors on long jobs should no longer occur.

Release 1.2.0
=============


Reduced MythX login calls
-------------------------

`truffle-security` can perform analyses on multiple contracts in a project, including
the all of those in a truffle project,

Rather than issue a login request for each contract, only a single
login now issued to MythX.


This work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment).

Improved Error Reporting
------------------------

We now separate MythX internal error messages by contract, and give a summary list
of all those where an error was encountered.

Similar but separate are errors that come from the MythX API, e.g.
server overloaded, invalid input, invalid login.

These messages too are tagged with the Smart Contract name where these errors first start occurring.

New Options --json and --yaml.
------------------------------

Two options provide showing data as it comes back from MythX without processing. For the cat-like curious, You might find information there that isn't in any report.

When these options are given es-lint-style report generation is omitted.

Note that:

```
truffle run --json
```

is different from:

```
truffle run --type=json
```

The later still processes the returned JSON into eslnt-style JSON,
while the former is more verbose and does not attempt to correlate and
piece together sections of the JSON returned.


Miscellaneous
-------------

When a contract errors, the timeout value is displayed rather than the word error.

The previously undocumented `--colors`, `--no-colors` is displayed.

Release 1.1.1
=================


Default values have been tweaked to give better performance
-----------------------------------------------------------

Decrease the default pending-analysis limit to 4. (rationale: For the time being it doesn't make sense to ever queue more than 4 analyses because only 4 will be processed at a time on the MythX side).

Increase default time out to 5 minutes (rationale: Analysis times of up to 223s have been observed. While the reason for the lengthy analysis must be investigated as well, right now we need sensible default settings that don't bombard the user with errors).

Change Progress Bar changes
---------------------------

The logic of setting the width of progress bars changed since the default timeout changed from 2 minutes to 5 minutes.

The coded was refactored and a user-friendly log added.

Contracts which are not audited are no longer considered for `progress bars' indent`.


As before, this work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment)NRISecure.

Miscellaneous
-------------

Remove duplicate SWC issues which can occur when there are multiple projects that refer to common files.

Add experimental option: `--no-default-cache`

Some small documentation corrections were made.


Release 1.1.0
=================


Progress Bars
-------------

This version has elaborate progress bars which track

* the contracts that have been submitted to MythX, and
* how far along each is in its allotted time.

They are on by default. To turn them off set `--no-progress`.

This work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment)NRISecure.


Changes for MythX API 1.4
-------------------------

In version 1.4 of the MythX API, various authentication options involving an API key or an email address are no longer supported.
If you haven't registered, jobs are submitted as a trial user.


Limiting the number of simultaneous jobs
----------------------------------------

We noticed that there was a lot of overhead created on the back end by polling for analysis status. So, this version limits the maximum number of concurrent pending analyses, with a default of 10. You can lower this with the `--limit` option.

Miscellaneous other changes
---------------------------

The help now includes the eslint style option `--style=json`. Thanks to tintin at Diligence who realized that this is a useful style setting. The json style is not space limited like many of the others are.

There are miscellaneous changes to the data sent to MythX in order to improve performance and to report errors in a more meaningful way.

Additional tests were added and test-code coverage has been increased. This is the work of Daniyar Chambylov at Maddevs.


Older releases
==============

v1.0.1 - 2019-02-06
-----------------------

- doc fixes
  * note we work on truffle 5.0.0 or greater
  * note --debug=2 option
  * truffle-analyze -> truffle-security
- fix recent versions of truffle mangling bytecode
- fix bux introduced in 1.0.0 to filter migrations
- severity levels have been lowered over 1.0.0

v1.0.0 - 2019-02-04
-----------------------

- Name change: change the package name and git repo from `truffle-analyze` to
  `truffle-security` and the invocation changes from `truffle run analyze` to
  `truffle run verify`
- We new support a trial user when no credentials are
  given. (Requires armlet 1.2.0 or greater)
- Better error messaging, especially on timeouts
- new option `--uuid` to look at results of previous runs.
  This is pretty basic right now -- beefing up may require
  work in conjunction with changes on the backend.
- `--debug` will show the UUID in play. `--debug=1` (or greater) will
  show the JSON MythX responses
- remove extraneous fields in analysis request
- default analysis mode is "quick"
- Update docs
