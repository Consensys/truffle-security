'use strict';
const APIClient = require('./apiclient');
const path = require('path');

class MythXJS extends APIClient {
    constructor(config, clientToolName) {
        // Bootstrap apiclient class first with super
        super('MythXJS', config, clientToolName);
    }

    /**
     * Do mythxjs analysis
     *
     * @param {Array<String>} contracts - List of smart contract.
     * @param {string} timeout - List of smart contract.
     * @param {string} initialDelay - List of smart contract.
     * @returns {Promise} - Resolves analysis object.
     */
    async doAnalysisFromClient(analyzeOpts, timeout, initialDelay) {
        let analysisResponse = await this.client.analyze(analyzeOpts.data);
        let detectedIssues = await this.client.getDetectedIssues(
            analysisResponse.uuid
        );
        return { status: analysisResponse, issues: detectedIssues };
    }
}
module.exports = MythXJS;
