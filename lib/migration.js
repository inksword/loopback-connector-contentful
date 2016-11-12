const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

module.exports = (Connector) => 
class MixinMigration extends Connector {
  autoupdate(models, cb) {
    var nullable = true;
    if (this.spaces) {
      if (this.debug) {
        debug('autoupdate');
      }

      if ((!cb) && ('function' === typeof models)) {
        cb = models;
        models = undefined;
      }
      // First argument is a model name
      if ('string' === typeof models) {
        models = [models];
      }

      models = models || Object.keys(this._models);

      Promise.all(_.map(models, model => {
        return this.contentType(model, nullable)
          .then(contentType => {
            if (contentType) {
              return this.alterTable(model, contentType);
            } else {
              return this.createTable(model, contentType);
            }
          })
        }))
        .then(contentTypes => _.compact(contentTypes))
        .then(contentTypes => {
          _.forEach(contentTypes, contentType => {
              var spaceId = contentType.sys.space.sys.id;
              var contentTypeMap = this.contentTypes[spaceId] || {};
              contentTypeMap[contentType.name] = contentType;
              this.contentTypes[spaceId] = contentTypeMap;          
            });

          cb(null, contentTypes)
        })
        .catch(err => cb(err));
    } else {
      this.dataSource.once('connected', function() {
        this.autoupdate(models, cb);
      });
    }
  }

  createTable(model) {
    var fields = this.buildColumnDefinitions(model);
    var contentType = {
      name: model,
      displayField: this._models[model].settings.displayField,
      fields: fields,
    }
    return this.space(model)
      .then(space => {
        return space
          .createContentType(contentType)
          .then(contentType => {
            return contentType.publish();
          });
      });
  }

  isActual(models, cb) {
    var ok = true;
    var checkOnly = true;
    var nullable = true;

    if ((!cb) && ('function' === typeof models)) {
      cb = models;
      models = undefined;
    }
    // First argument is a model name
    if ('string' === typeof models) {
      models = [models];
    }

    models = models || Object.keys(this._models);

    Promise.all(_.map(models, model => {
      return this.contentType(model, nullable)
        .then(contentType => {
          if (contentType) {
            return this.alterTable(model, contentType, checkOnly);
          } else {
            return ok;
          }
        })
      }))
      .then(oks => {
         cb(null, _.compact(oks).length !== 0);
      })
      .catch(err => cb(err));
  };

  alterTable(model, contentType, checkOnly) {
    var fields = this.buildColumnDefinitions(model);
    var actualFieldMap = _.keyBy(contentType.fields, field => field.id);
    
    var needsUpdate = false;
    var newFields = _.map(fields, field => {
      var actualField = actualFieldMap[field.id];
      delete actualFieldMap[field.id];
      if (!needsUpdate) {
        if (!_.isEqual(field, actualField)) {
          needsUpdate = true;
        }
      }
      return field;
    });
    
    _.forEach(_.values(actualFieldMap), actualField => {
      newFields.push(actualField);
    })

    if (needsUpdate && !checkOnly) {
      contentType.fields = newFields;
      return contentType.update();
    }
    return needsUpdate;
  };

  buildColumnDefinitions(model) {
    var definition = this.getModelDefinition(model);
    var props = definition.properties;
    var idName = this.idName(model);
    return _.chain(props)
      .keys()
      .filter(key => key !== idName)
      .map(propName => this.buildColumnDefinition(model, propName))
      .value();
  }

  buildColumnDefinition(model, propName) {
    var prop = this.getPropertyDefinition(model, propName);
    var contentful = prop.contentful || {}; 
    var type = contentful.dataType || this.buildColumnType(prop);
  
    var field = {
      "id": propName,
      "name": contentful.name || (propName.charAt(0).toUpperCase() + propName.slice(1))
        .replace(/([A-Z])/g, ' $1').trim(),
      "type": type,
      "localized": !!contentful.localized,
      "required": !!prop.required,
      "validations": contentful.validations || [],
      "disabled": !!contentful.disabled,
      "omitted": !!contentful.omitted,
    };

    if (type === 'Array') {
      var items = {};
      items.type = this.buildColumnType({type: prop.type[0]});
      items.validations = (prop.options || {}).validations || [];
      field.items = items;
    }

    return field;
  }

  buildColumnType(propertyDefinition) {
    var dt = '';
    var p = propertyDefinition;

    //'link': 'Link',
    //'integer': 'Integer',

    switch (p.type.name) {
      default:
        if (Array.isArray(p.type)) {
          dt = columnType(p, 'Array');
          break;
        }
      case 'JSON':
      case 'Any':
      case 'Text':
        dt = columnType(p, 'Text');
        break;
      case 'Object':
        dt = columnType(p, 'Object');
        break;
      case 'String':
        dt = columnType(p, 'Symbol');
        break;
      case 'Number':
        dt = columnType(p, 'Number');
        break;
      case 'Date':
        dt = columnType(p, 'Date');
        break;
      case 'Boolean':
        dt = 'Boolean';
        break;
      case 'GeoPoint':
        dt = 'Location';
        break;
    }
    return dt;
  };
}

function columnType(p, defaultType) {
  var dt = defaultType;
  if (p.dataType) {
    dt = String(p.dataType);
  }
  return dt;
}