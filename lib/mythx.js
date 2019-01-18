'use strict';

const path = require('path');

// Take truffle's build/contracts/xxx.json JSON and make it
// compatible with the Mythril Platform API
const truffle2MythXJSON = function(truffleJSON, toolId = 'truffle-analyze') {
    const {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourcePath,
        source,
        ast,
        compiler: { version },
    } = truffleJSON;

    const sourcesKey = path.basename(sourcePath);

    return {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourceList: [sourcePath ],
        sources: {
            [sourcesKey]: {
                source,
                ast,
            },
        },
        toolId,
        version,
    };
};


const remapMythXOutput = mythObject => {
    const mapped = mythObject.sourceList.map(source => ({
        source,
        sourceType: mythObject.sourceType,
        sourceFormat: mythObject.sourceFormat,
        issues: [],
    }));
  
    mythObject.issues.forEach(issue => {
        issue.locations.forEach(({ sourceMap }) => {
            const location = sourceMap.split(':')[2];
            mapped[location].issues.push({
                swcID: issue.swcID,
                swcTitle: issue.swcTitle,
                description: issue.description,
                extra: issue.description,
                severity: issue.severity,
                sourceMap,
            });
        });
    });
  
    return mapped;
};

module.exports = {
    truffle2MythXJSON,
    remapMythXOutput,
};