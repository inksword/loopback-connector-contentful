# loopback-connector-contentful
The module is still under development, and not fully tested. I am going to use it with a project by Jan 2017, and still doing experiments with it currently.

## Table of Contents

- [NodeJS Version](#nodejs-version)
- [How to Use](#how-to-use)
  - [Datasource Definition](#datasource-definition)
    - [Space Resolving Order](#space-resolving-order)
    - [Locale Resolving Order](#locale-resolving-order)
  - [Model Definition](#model-definition)
    - [Model Renaming](#model-renaming)
- [Auto Update](#auto-update)
  - [LoopBack to Contentful Types](#loopback-to-contentful-types)
  - [Model Relations](#model-relations)
- [Loopback Connector APIs](#loopback-connector-apis)
  - [Delivery API](#delivery-api)
  - [Implemented APIs](#implemented-apis)
  - [Not Yet Implemented APIs](#not-yet-implemented-apis)
- [Development References](#development-references)
- [Release Notes](#release-notes)


## NodeJS Version

Developed under NodeJS 6.9.1 with ES6. Will have a compatability test for some older versions, which show obvious compatable possibilties from [http://node.green/](http://node.green/). Here is a list of ES6 features used in the module: arrow function, class, object literals, promise, spread operator.

## How to Use

Install the connector for your project.

```bash
$ npm install loopback-connector-contentful --save
```

### Datasource Definition

```json
"ds_contentful": {
  "name": "ds_contentful",
  "connector": "contentful",
  "accessToken": {
    "delivery": {
      "<space id>": "<access token>"
    },
    "management": "<access token>"
  },
  "spaceId": "<space id>",
  "locale": "en-US",
  "respectContentfulClass": false
}
```

| Property               | Type         | Default | Description                              |
| ---------------------- | ------------ | ------- | ---------------------------------------- |
| accessToken            | string \| {} |         | If string is provided, it will be treated as management api access token. Use object to provide delivery access tokens and management access token. |
| respectContentfulClass | bool         | false   | If set to true, this module will return objects of underlying contentful library directly. It is recommended to set to false, and let this module help you do the model transformation according to loopback model definition. |

#### Space Resolving Order

SpaceId **MUST** be defined in datasources.json file. When saving or retrieving a model, its space is resolved in the following order:

1. Use spaceId defined in model-config.json. Raise error if no matching content type within the space. 
2. Use spaceId defined in datasources.json. Raise error if no matching content type within the space. 
3. Raise error if spaceId is not defined above.

#### Locale Resolving Order

When saving or retrieving a model, its local is resolved in the following order:

1. Use locale defined in model-config.json.
2. Use locale defined in datasources.json.
3. If locale is not defined above, use the default locale of the space to save and retrieve models from contentful

### Model Definition

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "spaceId": "<space id>",
      "locale": "en-US",
      "model": ["New Product Name", "Old Product Name"],
      "displayField": "productName",
      "description": "model description for product"
    }
  },
  "properties": {
    "productName": "string",
    "productDescription": {
      "type": "string",
      "required": false,
      "contentful": {
        "name": "Product Description",
        "dataType": "Text",
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
        "itemValidations": [],
        "disabled": false,
        "omitted": false
      }
    },
    "brand": {
      "type": "belongsTo",
      "model": "Brand"
    },
    "image": {
      "type": "hasMany",
      "model": "Asset"
    },
  }
}
```

#### Model Renaming

Contentful supports duplicated model names within the same space. However this module does not support such behaviour, model names must be unique within a space.

If you just want contentful model name to be different from loopback model name, please define string value for `options.contentful.model` field:

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "model": "My Product"
    }
  },
  ...
}
```

If you want to rename the model, an array of names should be provided to `options.contentful.model`, such as:

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "model": ["New Name", "Old Name 2", "Old Name 1"]
    }
  },
  ...
}
```

1. If "Old Name 2" is found in contentful space, it will be renamed to "New Name".
2. Else If "Old Name 1" is found in contentful space, it will be renamed to "New Name".
3. If both "Old Name 2" and "Old Name 1" are not found, a new model with "New Name" will be created.

## Auto Update

```javascript
var contentful = app.datasources['contentful'];
contentful.isActual(function(err, isActual) {
  if (!isActual) {
    contentful.autoupdate(function(err, result) {

    });
  }
})
```

### LoopBack to Contentful Types

| LoopBack Data Type | Contentful Data Type |
| ------------------ | -------------------- |
| any                | Text                 |
| string             | Symbol               |
| number             | Number               |
| date               | Date                 |
| boolean            | Boolean              |
| geopoint           | Location             |
| object             | Object               |
| ["string"]         | Array                |

### Model Relations

The following relations can be automatically created during autoupdate phase:

| Loopback Relations  | Status              |
| ------------------- | ------------------- |
| belongsTo           | Implemented         |
| hasOne              | Implemented         |
| hasMany             | Implemented         |
| hasManyThrough      | Not Implemented yet |
| hasAndBelongsToMany | Not Implemented yet |

## Loopback Connector APIs

### Delivery API

Delivery API should only funciton with get methods. Currently `filter._contentfulApi` is default to management when omitted. This API is subject to change in future.

```
GET /products?filter={"_contentfulApi": "delivery", "include":["categories", "brand"]}
```

| Property       | Type   | Values                     | Default      | Description                          |
| -------------- | ------ | -------------------------- | ------------ | ------------------------------------ |
| _contentfulApi | string | "management" \| "delivery" | "management" | This may be not an elegant approach. |

According to loopback document, `filter.include` must be provided to expose relation fields.

### Implemented APIs

* connector.autoupdate
* connector.create
* connector.all
* connector.update
* connector.count

### Not Yet Implemented APIs

- connector.updateOrCreate (optional, but see below)
- connector.replaceOrCreate (a new feature - work in progress)
- connector.findOrCreate (optional, but see below)
- connector.buildNearFilter
- connector.destroyAll
- connector.save
- connector.destroy
- connector.replaceById (a new feature - work in progress)
- connector.updateAttributes 

## Development References

The following references are used, while building the module:

1. loopback guide on [building a connector](http://loopback.io/doc/en/lb2/Building-a-connector.html)
2. loopback official connector [loopback-connector-mongodb](https://github.com/strongloop/loopback-connector-mongodb)
3. [contentful management API](https://contentful.github.io/contentful-management.js/contentful-management/1.3.0/index.html)
4. [contentful delivery API](https://contentful.github.io/contentful.js/contentful/3.8.0/index.html)

## Release Notes

### v0.0.12

* significant change on datasource.json definition file, to support both delivery API and management API. 
* Relations can also be returned when fetch data with delivery API, please check [Delivery API](#delivery-api).
* fix isActual API bugs, which always return isActual to false when relations are defined for models.

### v0.0.11 

* expose original contentful entries directly without transform, by adding `respectContentfulClass: true` in datasources.json.
* fix version missmatch issue, when both properties and relations need to be updated for a content type.
* added isActual API to skip autoupdate, when no changes detected.
* prevent belongsTo relations to automatically add foreign keys to content types, such as brandId. 

### v0.0.10

- loopback does not recoganize text data type, and will prompt error message `Swagger: skipping unknown type "text".`. Although it can be ignored, it is recommended to write as below for text:

  ```json
  "productDescription": {
    "type": "string",
    "contentful": {
      "dataType": "Text"
    }
  }
  ```

- added hasOne relation. Note: hasOne and belongsTo have the same implementation in contentful, they can be treated as alias.

- Relations now support Asset as model type.

- relation definitions will implicitly add the specified models to type validations. Categories field can only contains Category model object now:

  ```json
  "categories": {
    "type": "hasMany",
    "model": "Category"
  }
  ```

### v0.0.9

- move all contentful specific options directly under `options: {...}` to `options: { contentful: {...} }`, such as spaceId and locale etc.
- contentful model name can be different from loopback model name now.
- model display field and description can also be updated now.
