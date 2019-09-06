const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
const path = require('path');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const mythx = require('../lib/mythx');
const rewiredHelpers = rewire('../helpersRefactor');
const util = require('util');
const yaml = require('js-yaml');
const armletClass = require('../classes/armlet');
const mythxjsClass = require('../classes/mythx');

describe('API Client Classes', function() {
    describe('Shared API Client Functionality', () => {
        beforeEach(function() {
            let configJSON = {
                contracts_directory: '/contracts',
                build_directory: '/build/contracts',
                _: [],
                logger: {
                    log: loggerStub,
                    error: errorStub,
                },
                style: 'stylish',
                progress: false,
                apiClient: 'armlet',
            };

            let config = rewiredHelpers.prepareConfig(configJSON);
            let client = new armletClass(config);
        });

        afterEach(function() {});
    });
});
