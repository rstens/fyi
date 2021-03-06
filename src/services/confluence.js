const CNVault = require('../scripts/vault')
const rp = require('request-promise-native')
const config = require('config')
const confluenceHostname = config.get('confluence.hostname')
const slugify = require('@sindresorhus/slugify')

module.exports = {
  createNewPage,
  doForEachFYIFromConfluence,
  get,
  isFyiWritten,
  getFyiLink
}

async function get (url) {
  const secrets = await CNVault

  const options = {
    url,
    json: true
  }
  return rp.get(options).auth(secrets['confluence-username'], secrets['confluence-access-token'])
}

async function createNewPage (pageTitle, pageContent = '') {
  const secrets = await CNVault

  const options = {
    url: `https://${confluenceHostname}.atlassian.net/wiki/rest/api/content/`,
    json: true,
    body: {
      'type': 'page',
      'title': pageTitle,
      'ancestors': [{
        'id': config.get('confluence.fyiPageId')
      }],
      'space': {
        'key': config.get('confluence.spaceKey')
      },
      'body': {
        'storage': {
          'value': pageContent,
          'representation': 'storage'
        }
      }
    }
  }
  return rp.post(options).auth(secrets['confluence-username'], secrets['confluence-access-token'])
}

async function doForEachFYIFromConfluence (handleFyi) {
  let promises = []
  let parentPageId = config.get('confluence.fyiPageId')
  let data = await get(`https://${confluenceHostname}.atlassian.net/wiki/rest/api/content/${parentPageId}/child/page?expand=body.view&limit=20`)
  promises = promises.concat(data.results.map(handleFyi))

  while (data._links.next) {
    data = await get(`https://${confluenceHostname}.atlassian.net/wiki` + data._links.next)
    promises = promises.concat(data.results.map(handleFyi))
  }
  return Promise.all(promises)
}

async function getAllFyisFromConfluence () {
  return doForEachFYIFromConfluence(async function (res) {
    return res
  })
}

async function isFyiWritten (fyiName) {
  let pages = await getAllFyisFromConfluence()
  let fyiNameSlug = slugify(fyiName)
  let page = pages.filter(p => slugify(p.title) === fyiNameSlug)[0]
  return page && page.body.view.value.length !== 0
}

async function getFyiLink (fyiName) {
  let parentPageId = config.get('confluence.fyiPageId')
  let parentSpaceKey = config.get('confluence.spaceKey')
  let pages = await getAllFyisFromConfluence()
  let fyiNameSlug = slugify(fyiName)
  pages.forEach(p => console.log(p.title))
  let page = pages.filter(p => slugify(p.title) === fyiNameSlug)[0]
  if (page) {
    return `https://${confluenceHostname}.atlassian.net/wiki${page._links.webui}`
  }
  return `https://${confluenceHostname}.atlassian.net/wiki/spaces/${parentSpaceKey}/pages/${parentPageId}/FYIs`
}
