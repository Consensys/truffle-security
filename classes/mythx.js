class MythXJS {
    constructor(config, ethAddress, password, clientToolName) {
        
        const options = { clientToolName };

        if (password && ethAddress) {
            options.ethAddress = ethAddress;
            options.password = password;
        } else if (!password && !ethAddress) {
            options.ethAddress = trialEthAddress;
            options.password = trialPassword;
        }
    
        this.client = new mythxJSClient(options.ethAddress, options.password);
        this.clientToolName = clientToolName;
        this.verifyOptions = options;
        this.config = helpers.prepareConfig(unpreparedConfig);
    }

}