const assert = require('assert');
const sinon = require('sinon');
const helpers = require('../helpers');


describe('index.js', function() {
    it('should call plugin successfully', async () => {
        const stubCompile = sinon.stub(helpers, 'contractsCompile');
        const stubAnalyzeWithBuildDir = sinon.stub(helpers, 'analyze');
        const pluginAnalyze = require('../index');
        await pluginAnalyze({ compilers: {}});
        assert.ok(stubCompile.called);
        assert.ok(stubAnalyzeWithBuildDir.called);
    });

    it('should display help message', async () => {
        const stub = sinon.stub(helpers, 'printHelpMessage');
        const pluginAnalyze = require('../index');
        await pluginAnalyze({ compilers: {}, help: true });
        assert.ok(stub.called);
    });

    it('should display version information', async () => {
        const stub = sinon.stub(helpers, 'printVersion');
        const pluginAnalyze = require('../index');
        await pluginAnalyze({ compilers: {}, version: true });
        assert.ok(stub.called);
    });


});
