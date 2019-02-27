'use strict';

const path = require('path');

// Take truffle's build/contracts/xxx.json JSON and make it
// compatible with the Mythril Platform API
const truffle2MythXJSON = function(truffleJSON, toolId = 'truffle-security') {
    const {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourcePath,
        source,
        legacyAST,
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
        sourceList: [ sourcePath ],
        sources: {
            [sourcesKey]: {
                source,
                ast,
                legacyAST,
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

    if (mythObject.issues) {
        mythObject.issues.forEach(issue => {
            issue.locations.forEach(({ sourceMap }) => {
                let sourceListIndex = sourceMap.split(':')[2];
		if (sourceListIndex === -1) {
		    // FIXME: We need to decide where to attach issues
		    // that don't have any file associated with them.
		    // For now we'll pick 0 which is probably the main starting point
		    sourceListIndex = 0;
		}
                mapped[0].issues.push({
                    swcID: issue.swcID,
                    swcTitle: issue.swcTitle,
                    description: issue.description,
                    extra: issue.extra,
                    severity: issue.severity,
                    sourceMap,
                });
            });
        });
    }

    return mapped;
};

module.exports = {
    truffle2MythXJSON,
    remapMythXOutput,
};
