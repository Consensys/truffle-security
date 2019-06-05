const helpers = require('../helpers');

class APIClient {
    constructor(apiClientType, config, clientToolName) {

        let ethAddress = process.env.MYTHX_ETH_ADDRESS;
        let password = process.env.MYTHX_PASSWORD;
        
        const options = { clientToolName };

        if (password && ethAddress) {
            options.ethAddress = ethAddress;
            options.password = password;
        } else if (!password && !ethAddress) {
            options.ethAddress = trialEthAddress;
            options.password = trialPassword;
        }

        switch(apiClientType) {
            case "mythxjs":
                this.client = new mythxJSClient(options.ethAddress, options.password);
                break;
            case "armlet":
                this.client = new mythxJSClient(options.ethAddress, options.password);
                break;
            default:
                this.client = new mythxJSClient(options.ethAddress, options.password);         
                break;                
        }
        
        this.clientToolName = clientToolName;
        this.verifyOptions = options;
        this.config = helpers.prepareConfig(unpreparedConfig);
        this.defaultAnalyzeRateLimit = 4;
        
    }

}