// Modified version of https://github.com/rxaviers/async-pool/blob/master/lib/es7.js
// It receives optional parameter limitHitFn.
// limitHitFn should be called for debug purposes. As notification when pool limit is reached
async function asyncPool(poolLimit, array, iteratorFn, limitHitFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);
    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    if (executing.length >= poolLimit) {
      limitHitFn();
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

module.exports = asyncPool;
