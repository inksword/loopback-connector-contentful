# loopback-connector-contentful
The module is still under development, and not fully tested. I am going to use it with a projects by Jan 2017, and still doing experiments with it currently.

## NodeJS Version

Developed under NodeJS 6.9.1 with ES6 in mind. Will have a compatability test for some older versions, which show obvious compatable possibilties from [http://node.green/](http://node.green/). Here is a list of ES6 features used in the module:

- arrow function
- class
- object literals
- promise
- spread operator

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
3. If spaceId is not defined above, try to look up the model from spaces, and return the id of the first space having the matching content type.

### Locale Resolving Order

Locale could be optional, but a model could only be associated with one locale currently. The locale resolving order is described as below:

1. Use locale defined in model-config.json.
2. Use locale defined in datasources.json.
3. If locale is not defined above, use the default locale of the space to save and retrieve models from contentful

## Model Relations

!! Relations are not handled in all APIs, it will be implemented in next release, since it's crucial to projects.

## Auto Update

```javascript
module.exports = function(app) {
  app.datasources['contentful'].autoupdate(function(err, result) {

  });
};
```

### LoopBack to Contentful Types

| LoopBack Type | Contentful Type |
| ------------- | --------------- |
| Text/JSON/Any | Text            |
| String        | Symbol          |
| Number        | Number          |
| Date          | Date            |
| Boolean       | Boolean         |
| GeoPoint      | Location        |
| Object        | Object          |
| ["string"]    | Array           |

### Property Definition

```json
"productDescription": {
  "type": "string",
  "required": false,
  "contentful": {
    "name": "Product Description",
    "dataType": "Symbol",
    "localized": false,
    "validations": [{
      "size": {
        "min": 20,
        "max": 200
      }
    }],
    "disabled": false,
    "omitted": false
  }
}
```

## Loopback Connector APIs

### Implemented

* connector.autoupdate


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

