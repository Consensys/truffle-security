class Armlet {
    constructor(ethAddress, password, clientToolName) {

        const options = { clientToolName };

        if (password && ethAddress) {
            options.ethAddress = ethAddress;
            options.password = password;
        } else if (!password && !ethAddress) {
            options.ethAddress = trialEthAddress;
            options.password = trialPassword;
        }
    
        this.client = new armlet.Client(options);
        this.clientToolName = clientToolName;
        this.verifyOptions = options;
    }
}