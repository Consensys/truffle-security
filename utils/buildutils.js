const contracts = require('../lib/wfc');

/*

    Removes bytecode fields from analyze data input if it is empty.
    This which can as a result of minor compile problems.

    We still want to submit to get analysis which can work just on the
    source code or AST. But we want to remove the fields so we don't
    get complaints from MythX. We will manage what we want to say.
    */
const cleanAnalyzeDataEmptyProps = (data, debug, logger) => {
    const {
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        ...props
    } = data;
    const result = { ...props };

    const unusedFields = [];

    if (bytecode && bytecode !== '0x') {
        result.bytecode = bytecode;
    } else {
        unusedFields.push('bytecode');
    }

    if (deployedBytecode && deployedBytecode !== '0x') {
        result.deployedBytecode = deployedBytecode;
    } else {
        unusedFields.push('deployedBytecode');
    }

    if (sourceMap) {
        result.sourceMap = sourceMap;
    } else {
        unusedFields.push('sourceMap');
    }

    if (deployedSourceMap) {
        result.deployedSourceMap = deployedSourceMap;
    } else {
        unusedFields.push('deployedSourceMap');
    }

    if (debug && unusedFields.length > 0) {
        logger(
            `${
                props.contractName
            }: Empty JSON data fields from compilation - ${unusedFields.join(
                ', '
            )}`
        );
    }

    return result;
};

const buildObjForContractName = (allBuildObjs, contractName) => {
    // Deprecated. Delete this for v2.0.0
    const buildObjsThatContainContract = allBuildObjs.filter(
        buildObj =>
            Object.keys(buildObj.sources).filter(
                sourceKey =>
                    buildObj.sources[sourceKey].contracts.filter(
                        contract => contract.contractName == contractName
                    ).length > 0
            ).length > 0
    );
    if (buildObjsThatContainContract.length == 0) return null;
    return buildObjsThatContainContract.reduce((prev, curr) =>
        Object.keys(prev.sources).length < Object.keys(curr.sources).length
            ? prev
            : curr
    );
};

const buildObjForSourcePath = (allBuildObjs, sourcePath) => {
    // From all lists of contracts that include ContractX, the shortest list is gaurenteed to be the
    // one it was compiled in because only it and its imports are needed, and contracts that import it
    // will not be included.
    // Note - When an imported contract is changed, currently the parent isn't recompiled, meaning that if contracts are added to
    // an imported contract and the parent isn't modified, it is possible that an incorrect build object will be chosen.
    // The parent's build object would need to be updated with the extra contracts that were imported.

    const buildObjsThatContainFile = allBuildObjs.filter(buildObj =>
        Object.keys(buildObj.sources).includes(sourcePath)
    );
    if (buildObjsThatContainFile.length == 0) return null;
    return buildObjsThatContainFile.reduce((prev, curr) =>
        Object.keys(prev.sources).length < Object.keys(curr.sources).length
            ? prev
            : curr
    );
};

const buildObjIsCorrect = (allBuildObjs, contract, buildObj) => {
    // Whether or not the given build object is the one where the given contract was compiled to.
    // false if the contract is not in the build object or if it was an import

    const correctBuildObj = buildObjForSourcePath(
        allBuildObjs,
        contract.sourcePath
    );
    // If the length is the same and the contract is in it, they are the same object and it is not an import.
    if (
        correctBuildObj &&
        Object.keys(correctBuildObj.sources).length ==
            Object.keys(buildObj.sources).length
    ) {
        return true;
    }
    return false;
};

// FIXME: util.promisify breaks compile internal call to writeContracts
// const contractsCompile = util.promisify(contracts.compile);
const contractsCompile = config => {
    return new Promise((resolve, reject) => {
        contracts.compile(config, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
};

module.exports = {
    cleanAnalyzeDataEmptyProps,
    buildObjForContractName,
    buildObjForSourcePath,
    buildObjIsCorrect,
    contractsCompile
};
