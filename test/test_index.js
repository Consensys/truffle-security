const assert = require('assert');
const sinon = require('sinon');
const helpers = require('../helpers');
const rewire = require('rewire');

describe('index.js', function() {
    
    const pluginAnalyze = require('../index');
    const rewiredIndex = rewire('../index');

    let analyzeStub;
    let errorStub;
    let config;
    
    beforeEach(() =>  {
        errorStub = sinon.stub();
        analyzeStub = sinon.stub(helpers, 'analyze');
        exitStub = sinon.stub();
        rewiredIndex.__set__('exit', exitStub);

        config = {
            logger: {
                error: errorStub,
            }
        };
    });

    afterEach(() => {
        analyzeStub.restore();
    });

    it('should call plugin successfully', async () => {
        analyzeStub.returns(0);
        await pluginAnalyze({ compilers: {}});
        assert.ok(analyzeStub.called);
    });

    it('should display help message', async () => {
        const stub = sinon.stub(helpers, 'printHelpMessage');
        await pluginAnalyze({ compilers: {}, help: true });
        assert.ok(stub.called);
    });

    it('should display version information', async () => {
        const stub = sinon.stub(helpers, 'printVersion');
        await pluginAnalyze({ compilers: {}, version: true });
        assert.ok(stub.called);
    });

    it('should terminate with return code 0 when analyze returns 0', async () => {
        const returnCode = 0;
        analyzeStub.returns(returnCode);
        
        await rewiredIndex(config);
        
        assert.ok(analyzeStub.called);
        assert.ok(!errorStub.calledWith('Unexpected Error occured. return value of analyze should be either 0 or 1'));
        assert.ok(!exitStub.callled);
    });

    it('should terminate with return code 1 when analyze returns 1', async () => {
        analyzeStub.returns(1);
        
        await rewiredIndex(config);
        
        assert.ok(analyzeStub.called);
        assert.ok(!errorStub.calledWith('Unexpected Error occured. return value of analyze should be either 0 or 1'));
        assert.ok(exitStub.calledWith(1));
    });

    it('should terminate with return code 1 when analyze returns neither 0 nor 1', async () => {
        analyzeStub.returns(2)
        
        await rewiredIndex(config);
        
        assert.ok(analyzeStub.called);
        assert.ok(errorStub.calledWith('Unexpected Error occured. return value of analyze should be either 0 or 1'));
        assert.ok(exitStub.calledWith(1));
    });
});
