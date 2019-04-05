'use strict';

const fs = require('fs')
let truffleConfig;
let truffleConfigPath;

const cwd = process.env.INIT_CWD;
if(!cwd) {
  console.error("Not in npm install.");
  process.exit();
}

try {
  truffleConfigPath = `${cwd}/truffle.js`
  truffleConfig = fs.readFileSync(truffleConfigPath)
} catch(e) {
  try {
    truffleConfigPath = `${cwd}/truffle-config.js`
    truffleConfig = fs.readFileSync(truffleConfigPath)
  } catch(e) {
    process.exit();
  }
}

let configString = truffleConfig.toString('utf8');

const re = /plugins:\s*\[[^\]]*\]/g;

let matches = [];
let m;
while (m = re.exec(configString)) {
  matches.push(m);
}

try {
  // Make sure truffle-config.js meets expectations
  if(matches.length == 1) {
    let m = /\[[^]*$/.exec(matches[0][0])
    if(!m) {
      process.exit();
    }

    let plugins = JSON.parse(m[0])
    if (plugins.indexOf("truffle-security") > -1) {
      // truffle-security is already there. Quit.
      process.exit();
    }

    plugins.push("truffle-security");

    const pluginString = JSON.stringify(plugins).split(',').join(', ');
    configString = configString.replace(re, `plugins: ${pluginString}`)
  } else if(matches.length == 0) {
    // No plugins yet, add a line
    let moduleExportsRe = /module\.exports[^\{]*\s*=\s*\{/g
    let m = moduleExportsRe.exec(configString);
    if(!m) {
      process.exit();
    }

    configString = configString.replace(moduleExportsRe, 'module.exports = {\n\n  plugins: ["truffle-security"],\n');
  } else {
    process.exit();
  }
} catch(e) {
  // Do nothing and fail silently
  process.exit();
}

// Make sure code is still valid, just in case something happened.
try {
  new Function(configString);
} catch (e) {
  process.exit();
}

fs.writeFileSync(truffleConfigPath, configString);
