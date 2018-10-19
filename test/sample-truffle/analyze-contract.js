#!/usr/bin/env node
const Analyze = require('../../index');

const options = {
    debug: true,
    _: []
};

Analyze.run(options, function(result) {
    console.log(result);
});
