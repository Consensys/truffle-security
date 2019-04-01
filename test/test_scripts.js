const fs = require('fs');
const { execSync } = require('child_process');
const assert = require('assert');
const sinon = require('sinon');

function truffleConfigContainsTruffleSecurity(configPath) {
  try {
    const truffleConfigOld = require(configPath + '.bak');
    const truffleConfig = require(configPath);
    return truffleConfig.plugins.includes("truffle-security") &&
      (!truffleConfigOld.plugins ||
        truffleConfigOld.plugins.every(plugin => truffleConfig.plugins.includes(plugin)));
  } catch(e) {
    // Invalid file or plugins is undefined
    return false;
  }
}

describe('scripts/install-to-truffle.js', function() {

    let savedWorkingDirectory = process.cwd();
    let analyzeStub;
    let errorStub;
    let config;

    afterEach(() => {
      execSync('node scripts/install-to-truffle.js')
      const result = truffleConfigContainsTruffleSecurity(process.env.INIT_CWD + "/truffle-config.js");
      fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js.bak", process.env.INIT_CWD + "/truffle-config.js");
      fs.unlinkSync(process.env.INIT_CWD + "/truffle-config.js.bak");
      delete process.env.INIT_CWD

      assert.ok(result);
    });

    it('should add truffle-security to empty truffle config', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test1";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

    it('should add truffle-security to empty plugins array with comma', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test2";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

    it('should add truffle-security to empty plugins array without comma', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test3";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

    it('should add truffle-security to empty plugins array without comma and with a newline', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test4";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

    it('should add truffle-security to empty plugins array with comma and with a newline', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test5";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

    it('should add truffle-security to the default truffle config', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test6";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

    it('should add truffle-security to a truffle config with an existing plugin', async () => {
        process.env.INIT_CWD = __dirname + "/insert-into-truffle-configs/test7";
        fs.copyFileSync(process.env.INIT_CWD + "/truffle-config.js", process.env.INIT_CWD + "/truffle-config.js.bak");
    });

});
