Release 1.1.1
=================


Default values have been tweaked to give better performance
--------------------------------------------------------------------------

Decrease the default pending-analysis limit to 4. (rationale: For the time being it doesn't make sense to ever queue more than 4 analyses because only 4 will be processed at a time on the MythX side).

Increase default time out to 5 minutes (rationale: Analysis times of up to 223s have been observed. While the reason for the lengthy analysis must be investigated as well, right now we need sensible default settings that don't bombard the user with errors).

Change Progress Bar changes
----------------------------------

The logic of setting the width of progress bars changed since the default timeout changed from 2 minutes to 5 minutes.

The coded was refactored and a user-friendlly log added.

Contracts which are not audited are no longer considered for `progress bars' indent`.


As before, this work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment)NRISecure.

Miscellaneous
----------------

Remove duplicate SWC issues which can occur when there are multiple projects that refer to common files.

Add experimental option: `--no-default-cache`

Some small documentation corrections were made.


Release 1.1.0
=================


Progress Bars
-----------------

This version has elaborate progress bars which track

* the contracts that have been submitted to MythX, and
* how far along each is in its allotted time.

They are on by default. To turn them off set `--no-progress`.

This work was kindly contributed by Teruhiro Tagomori at [NRI Secure Technologies](https://www.nri-secure.com/security-consulting/blockchain-assessment)NRISecure.


Changes for MythX API 1.4
-------------------------------

In version 1.4 of the MythX API, various authentication options involving an API key or an email address are no longer supported.
If you haven't registered, jobs are submitted as a trial user.


Limiting the number of simultaneous jobs
--------------------------------------------------

We noticed that there was a lot of overhead created on the back end by polling for analysis status. So, this version limits the maximum number of concurrent pending analyses, with a default of 10. You can lower this with the `--limit` option.

Miscellaneous other changes
----------------------------------

The help now includes the eslint style option `--style=json`. Thanks to tintin at Diligence who realized that this is a useful style setting. The json style is not space limited like many of the others are.

There are miscellaneous changes to the data sent to MythX in order to improve performance and to report errors in a more meaningful way.

Additional tests were added and test-code coverage has been increased. This is the work of Daniyar Chambylov at Maddevs.


Older releases
=================

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
