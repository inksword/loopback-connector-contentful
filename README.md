# loopback-connector-contentful
Although this project is used in a production environment, some featrues still request thoroughly testing, and some behaviors are subject to change. Since 1.0.0 it has some breaking changes.

## Table of Contents

- [NodeJS Version](#nodejs-version)

- [How to Use](#how-to-use)

  - [Installation](#installation)
  - [Auto Update](#auto-update)
  - [Datasource Definition](#datasource-definition)
    - [Locale Resolving Order](#locale-resolving-order)
  - [Model Definition](#model-definition)
    - [Model Renaming](#model-renaming)


- [LoopBack vs Contentful Data Types](#loopback-vs-contentful-data-types)
- [Model Relations](#model-relations)

- [Loopback Connector APIs](#loopback-connector-apis)
    - [Contentful API Hints](#contentful-api-hints)
    - [Contentful API Support](#contentful-api-support)
    - [Not Yet Implemented APIs](#not-yet-implemented-apis)

- [Development References](#development-references)

- [Release Notes](#release-notes)


## NodeJS Version

Developed under NodeJS 6.x with ES6 features: arrow function, class, object literals, promise, spread operator. Please find a compatible node version from [http://node.green/](http://node.green/).

## How to Use

### Installation

Install the connector for your project.

```bash
$ npm install loopback-connector-contentful --save
```

### Auto Update

```javascript
var contentful = app.datasources['contentful'];
contentful.isActual(function(err, isActual) {
  if (!isActual) {
    contentful.autoupdate(function(err, result) {

    });
  }
})
```

### Datasource Definition

Only one space can be connected with each datasource definition. Previously aimed to support multiple spaces with a single datasource, however this adds complexity to the logic.

```json
"contentful": {
  "name": "contentful",
  "connector": "contentful",
  "spaceId": "<space id>",
  "locale": "en-US",
  "respectContentfulClass": false,
  "uniqueBy": "name",
  "accessTokens": {
    "delivery": "<access token>",
    "management": "<access token>",
    "preview": "<access token>",
  }
}
```

| Property               | Options        | Default | Description                              |
| ---------------------- | -------------- | ------- | ---------------------------------------- |
| accessTokens           | string \| {}   |         | If string is provided, it will be treated as ~~management~~ delivery access token. Use object to provide delivery, preview and management access tokens. If autoupdate is used, management access token must be provided. All 3 types of access tokens can be used standalone, but some actions cannot be performed if without one or another. |
| respectContentfulClass | bool           | false   | If set to true, this module will return objects of underlying contentful library directly. It is recommended to set to false, and let this module help you do the model transformation according to loopback model definition. |
| uniqueBy               | "id" \| "name" | "id"    | Since contentful SDK starts supporting creating content type with id, now id can be used to map LoopBack models and content types, rather than by content type name. The camel case of LoopBack model name will be used as content type id implicitly, otherwise please specify id in LoopBack model definition. |

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
      "id": "<content type id>",
      "name": "Shining Product",
      "locale": "en-US",
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

Content type names and field names are automatically generated with lodash method _.startCase. You don't need to explicitly provide `"contentful"."name": "Product Description"` for property `productDescription`.

Relation model `Asset` is reserved for Contentful Asset content type, no need to define a corresponding Asset model in LoopBack.

#### Model Renaming

**!!!Caution: the following behavior is no longer needed if you use `"uniqueBy": "id"`, which is also the default behavior.**

Contentful supports duplicated model names within the same space. However this module does not support such behaviour, model names must be unique within a space.

If you just want contentful model name to be different from loopback model name, please define string value for `options.contentful.name` field:

```json
{
  "name": "Product",
  "options": {
    "contentful": {
      "name": "My Product"
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
      "name": ["New Name", "Old Name 2", "Old Name 1"]
    }
  },
  ...
}
```

1. If "Old Name 2" is found in contentful space, it will be renamed to "New Name".
2. Else If "Old Name 1" is found in contentful space, it will be renamed to "New Name".
3. If both "Old Name 2" and "Old Name 1" are not found, a new model with "New Name" will be created.

### LoopBack vs Contentful Data Types

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

For types cannot be mapped implicitly, please use contentful specific settings:

```json
"propertyName": {
  "type": "string",
  "contentful": {
  	"dataType": "Text"
  }
}
```

### Model Relations

| Loopback Relations  | Status      |
| ------------------- | ----------- |
| belongsTo           | Implemented |
| hasOne              | Implemented |
| hasMany             | Implemented |
| hasManyThrough      | N/A         |
| hasAndBelongsToMany | N/A         |

## Loopback Connector APIs

### Contentful API Hints

Delivery API should only funciton with get methods. Currently ~~`filter._contentfulApi`~~ `filter.contentful.api` is default to ~~management~~ delivery when omitted.

```
GET api/products?filter={"contentful": {"api": "preview"}, "include":["categories", "brand"]}
```

| Property       | Type   | Values                                  | Default    |
| -------------- | ------ | --------------------------------------- | ---------- |
| contentful.api | string | "delivery" \| "preview" \| "management" | "delivery" |

According to loopback document, `filter.include` must be provided to expose relation fields.

### Contentful API Support

| Connector API              | Delivery (Published) | Preview (Draft) | Management (All) |
| -------------------------- | -------------------- | --------------- | ---------------- |
| connector.autoupdate       |                      |                 | ✓                |
| connector.create           |                      |                 | ✓                |
| connector.all              | ✓                    | ✓               | ✓                |
| connector.update           |                      |                 | ✓                |
| connector.updateAttributes |                      |                 | ✓                |
| connector.count            | ✓                    | ✓               | ✓                |

### Not Yet Implemented APIs

- connector.updateOrCreate (optional, but see below)
- connector.replaceOrCreate (a new feature - work in progress)
- connector.findOrCreate (optional, but see below)
- connector.buildNearFilter
- connector.destroyAll
- connector.save
- connector.destroy
- connector.replaceById (a new feature - work in progress)

## Development References

The following references are used, while building the module:

1. [LoopBack Types](https://loopback.io/doc/en/lb3/LoopBack-types.html)
2. [LoopBack Building a Connector](http://loopback.io/doc/en/lb3/Building-a-connector.html)
3. loopback official connector [loopback-connector-mongodb](https://github.com/strongloop/loopback-connector-mongodb)
4. [contentful management API](https://contentful.github.io/contentful-management.js/contentful-management/3.10.0/index.html)
5. [contentful delivery API](https://contentful.github.io/contentful.js/contentful/4.5.0/index.html)

## Release Notes

### v1.1.1

* fix content type reference issue internally
* fix versionMissMatch issue, during create content type relations

### v1.0.0 [Breaking Changes]

* model definition keypath change `options.contentful.model` => `options.contentful.name`
* datasource definition changes, as only one space is alowed to be accessed from one datasource.
* add support for preview api
* implemented `connector.updateAttributes` method, therefore HTTP `PATCH` method is available.

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
