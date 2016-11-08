## loopback-connector-contentful
The module is still under development, and not fully tested. I am going to use it with a projects by Jan 2017, and still doing experiments with it currently.

### How to Use

Install the connector for your project.

```bash
$ npm install loopback-connector-contentful --save
```

Add the following configuration to the datasources.json.

```json
"ds_contentful": {
  "name": "ds_contentful",
  "connector": "contentful",
  "accessToken": "<access token>",
  "spaceId": "<space id>",
  "locale": "en-US",
  "debug": true | false
}
```

Specify the datasource for your model in model-config.json.

```json
"Product": {
  "dataSource": "ds_contentful"
}
```

### Loopback Connector Methods

#### Implemented

* connector.create
* connector.all
* connector.update

#### Not Implemented Yet

- connector.updateOrCreate (optional, but see below)
- connector.replaceOrCreate (a new feature - work in progress)
- connector.findOrCreate (optional, but see below)
- connector.buildNearFilter
- connector.destroyAll
- connector.count
- connector.save
- connector.destroy
- connector.replaceById (a new feature - work in progress)
- connector.updateAttributes 

### References

The following references are used, while building the module:

1. loopback guide on [building a connector](http://loopback.io/doc/en/lb2/Building-a-connector.html)
2. loopback official connector [loopback-connector-mongodb](https://github.com/strongloop/loopback-connector-mongodb)
3. [contentful management API](https://contentful.github.io/contentful-management.js/contentful-management/1.2.1/index.html)
4. [contentful delivery API](https://contentful.github.io/contentful.js/contentful/3.7.0/index.html)

