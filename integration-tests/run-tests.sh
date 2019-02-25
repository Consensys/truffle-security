#!/bin/bash
# Run integration tests
me=$(readlink -f $0)
mydir=$(dirname $me)
TIME_OUT=${TIME_OUT:-360}  # 6 minutes

run_test() {
    set -x
    truffle run verify --no-cache-lookup --debug=1 --timeout=$TIME_OUT
    rc=$?
    set +x
    # FIXME: rc is 0 even when there is a failure - checkout output
    return $rc
}

cd $mydir
. ./mythx-prod-trial
cd truffle-project

typeset -i rc

# If an account is set, try it
if [[ -n $MYTHX_ETH_ADDRESS && -n $MYTHX_PASSWORD ]] ; then
    echo "Testing with $MYTH_ETH_ADDRESS..."
    run_test
    rc=$?
    if (($rc != 0)) ; then
	echo "Failed using with address $MYTH_ETH_ADDRESS"
    fi
fi

typeset -i rc2
echo "Testing as trial user..."
run_test
rc2=$?
((rc=rc+rc2))
exit $rc
