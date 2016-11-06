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

#### Not Implemented Yet

- connector.updateOrCreate (optional, but see below)
- connector.replaceOrCreate (a new feature - work in progress)
- connector.findOrCreate (optional, but see below)
- connector.buildNearFilter
- connector.destroyAll
- connector.count
- connector.save
- connector.update
- connector.destroy
- connector.replaceById (a new feature - work in progress)
- connector.updateAttributes 

### References

There are two references used, while building the module:

1. [building a connector](http://loopback.io/doc/en/lb2/Building-a-connector.html)
2. [loopback-connector-mongodb](https://github.com/strongloop/loopback-connector-mongodb)