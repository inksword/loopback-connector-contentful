# loopback-connector-contentful
The module is still under development, and not fully tested. I am going to use it with a projects by Jan 2017, and still doing experiments with it currently.

## How to Use

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
  "dataSource": "ds_contentful",
  "options": {
    "spaceId": "<space id>",
    "locale": "en-US"
  }
}
```

### SpaceId Resolving Order

Space id could be optional, when your model name is unique across spaces in your contentful organization.  Anyway, the space id resolving order is described as below:

1. Use spaceId defined in model-config.json. could be different from the one defined in datasources.json. 
2. Use spaceId defined in datasources.json.
3. If cannot find the model on the spaces defined above, try to look up the model from other spaces, and return the first match.

### Locale Resolving Order

Locale could be optional, but only one local could be associated with a model currently. The locale resolving order is described as below:

1. Use locale defined in model-config.json.
2. Use locale defined in datasources.json.
3. Use the default locale of the space to save and retrieve models from contentful

### Map Content Type Name

Not implemented yet, map mode name to a different content type name will be supported soon.

## Loopback Connector APIs

### Implemented

* connector.create
* connector.all
* connector.update

### Not Implemented Yet

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

## References

The following references are used, while building the module:

1. loopback guide on [building a connector](http://loopback.io/doc/en/lb2/Building-a-connector.html)
2. loopback official connector [loopback-connector-mongodb](https://github.com/strongloop/loopback-connector-mongodb)
3. [contentful management API](https://contentful.github.io/contentful-management.js/contentful-management/1.2.1/index.html)
4. [contentful delivery API](https://contentful.github.io/contentful.js/contentful/3.7.0/index.html)

