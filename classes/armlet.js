"use strict";

const APIClient = require("./apiclient");

class Armlet extends APIClient {
  constructor(config, clientToolName) {
    // Bootstrap apiclient class first with super
    super("armlet", config, clientToolName);
  }

  /**
     * Do armlet analysis
     *
     * @param {Array<String>} contracts - List of smart contract.
     * @param {string} timeout - List of smart contract.
     * @param {string} initialDelay - List of smart contract.

     * @returns {Promise} - Resolves analysis object.
     */
  async doAnalysisFromClient(analyzeOpts, timeout, initialDelay) {
    return await this.client.analyzeWithStatus(
      analyzeOpts,
      timeout,
      initialDelay
    );
  }
}

module.exports = Armlet;
