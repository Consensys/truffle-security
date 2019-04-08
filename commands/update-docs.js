#!usr/bin/env node
const fetch = require('node-fetch')
const { URLSearchParams } = require('url');

const repository = 'ConsenSys/truffle-security'

async function run (repoName, done) {
    const params = new URLSearchParams();

    params.append('gitUrl', `git@github.com:${repoName}.git`);

    try {
        const response = await fetch('https://doc.esdoc.org/api/create', { method: 'post', body: params })
        if (response.status !== 200) {
            throw new Error(`Status: ${response.status}`)
        }
        const result = await response.json()
        if (!result.success) {
            throw new Error(`Could not generate documentation. Payload: ${result}`)
        }
        done(null, result)
    } catch(err) {
        return done(err)
    }
}

run(repository, (err) => {
    if (err) throw err
    console.log('OK!')
})
