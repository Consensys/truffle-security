'use strict';

// FIXME: Temporary solution, creates an array of objects
// Each can be passed to MythXIssues constructor
const newTruffleObjToOldTruffleByContracts = buildObj => {
    const { sources, compiler } = buildObj;
    let allContracts = [];

    const allSources = Object.entries(sources).reduce((accum, [sourcePath, data]) => {
        const { source, ast, legacyAST, id } = data;
        accum[sourcePath] = { ast, legacyAST, source, id };
        return accum;
    }, {});

    for (const [sourcePath, data] of Object.entries(sources)) {
        const contracts = data.contracts.map(contract => ({
            contractName: contract.contractName,
            bytecode: contract.bytecode,
            deployedBytecode: contract.deployedBytecode,
            sourceMap: contract.sourceMap,
            deployedSourceMap: contract.deployedSourceMap,
            sources: allSources,
            compiler,
            sourcePath,
        }));

        allContracts = allContracts.concat(contracts);
    }

    return allContracts;
};

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
        sources,
        compiler: { version },
    } = truffleJSON;

    const sourceList = Object.keys(sources).sort((key1, key2) => sources[key1].id - sources[key2].id);

    return {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        mainSource: sourcePath,
        sourceList: sourceList,
        sources,
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

    // On trial mode sourceList can be empty.
    if (mythObject.issues && mythObject.issues.length > 0  && mapped.length === 0) {
        mapped.push({
            source: mythObject.source || 'N/A',
            sourceType: mythObject.sourceType,
            sourceFormat: mythObject.sourceFormat,
            issues: [],
        });
    }

    if (mythObject.issues) {
        mythObject.issues.forEach(issue => {
            issue.locations.forEach(({ sourceMap }) => {
                let sourceListIndex = sourceMap.split(':')[2];
                if (sourceListIndex === '-1') {
                    // FIXME: We need to decide where to attach issues
                    // that don't have any file associated with them.
                    // For now we'll pick 0 which is probably the main starting point
                    sourceListIndex = 0;
                }
                mapped[sourceListIndex].issues.push({
                    swcID: issue.swcID || 'N/A',
                    swcTitle: issue.swcTitle || 'N/A',
                    description: issue.description,
                    extra: issue.extra,
                    severity: issue.severity,
                    sourceMap,
                });
            });
            if (!issue.locations || issue.locations.length === 0) {
                mapped[0].issues.push({
                    swcID: issue.swcID || 'N/A',
                    swcTitle: issue.swcTitle || 'N/A',
                    description: issue.description,
                    extra: issue.extra,
                    severity: issue.severity,
                });
            }
        });
    }


    return mapped;
};

module.exports = {
    truffle2MythXJSON,
    remapMythXOutput,
    newTruffleObjToOldTruffleByContracts,
};
