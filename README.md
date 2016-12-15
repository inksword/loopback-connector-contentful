# loopback-connector-contentful
The module is still under development, and not fully tested. I am going to use it with a project by Jan 2017, and still doing experiments with it currently.

## 0.0.8 & 0.0.9 Release Notes

* move all contentful specific options directly under `options: {...}` to `options: { contentful: {...} }`, such as spaceId and locale etc.
* contentful model name can be different from loopback model name now.
* model display field and description can also be updated now.

## NodeJS Version

Developed under NodeJS 6.9.1 with ES6. Will have a compatability test for some older versions, which show obvious compatable possibilties from [http://node.green/](http://node.green/). Here is a list of ES6 features used in the module:

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
  "dataSource": "ds_contentful"
}
```

Model Definition

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "spaceId": "<space id>",
      "locale": "en-US"
      "model": ["New Product", "Old Product"],
      "displayField": "productName",
      "description": "model description for product"
    }
  },
  "properties": {
    "productName": "text",
    "productDescription": {
      "type": "text",
      "required": false,
      "contentful": {
        "name": "Product Description",
        "dataType": "Text"
        "localized": false,
        "validations": [{"size": {"min": 20, "max": 200}}],
        "disabled": false,
        "omitted": false
      }
    },
    "tags": {
      "type": [
        "string"
      ]
    }
  },
  "relations": {
    "categories": {
      "type": "hasMany",
      "model": "Category",
      "contentful": {
        "name": "Product Categories",
        "localized": false,
        "validations": [],
        "disabled": false,
        "omitted": false
      }
    },
    "brand": {
      "type": "belongsTo",
      "model": "Brand"
    }
  }
}
```

### Model Name Updating

Contentful supports duplicated model names within the same space. However this module does not support such behaviour, model names must be unique within a space.

If you just want contentful model name to be different from loopback model name, please define:

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "model": "My Product"
    }
  }
  ...
}
```

If you want to rename the model, an array of names must be provided to `options.contentful.model`, such as:

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "model": ["New Name", "Old Name 2", "Old Name 1"]
    }
  }
  ...
}
```

1. If "Old Name 2" is found in contentful space, it will be renamed to "New Name".
2. Else If "Old Name 1" is found in contentful space, it will be renamed to "New Name".
3. If both "Old Name 2" and "Old Name 1" are not found, a new model with "New Name" will be created.

### Space Resolving Order

SpaceId **MUST** be defined in datasources.json file. When saving or retrieving a model, its space is resolved in the following order:

1. Use spaceId defined in model-config.json. Raise error if no matching content type within the space. 
2. Use spaceId defined in datasources.json. Raise error if no matching content type within the space. 
3. Raise error if spaceId is not defined above.

### Locale Resolving Order

When saving or retrieving a model, its local is resolved in the following order:

1. Use locale defined in model-config.json.
2. Use locale defined in datasources.json.
3. If locale is not defined above, use the default locale of the space to save and retrieve models from contentful

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

### Model Relations

The following relations can be automatically created during autoupdate phase:

| Loopback Relations  | Status            |
| ------------------- | ----------------- |
| belongsTo           | Supported         |
| hasMany             | Supported         |
| hasManyThrough      | Not supported yet |
| hasAndBelongsToMany | Not supported yet |

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

