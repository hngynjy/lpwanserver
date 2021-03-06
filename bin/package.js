const path = require('path')
const component =require('../component.json')
const { execSync } = require('child_process')

const atPath = (...args) => path.join(__dirname, ...args)

const image = `${component.registry}/${component.name}:${component.version}-${component.build}-rc`
const latestImage = `${component.registry}/${component.name}:latest`

const cwd = atPath('..')

async function package () {
  execSync(`docker build -f docker/Dockerfile -t ${image} -t ${latestImage} .`, { cwd, stdio: 'inherit' })
  console.info('The container was successfully built.')
}

package().catch(console.error)