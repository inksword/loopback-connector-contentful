const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

module.exports = (Connector) => 
class MixinMigration extends Connector {

  automigrage(models, cb) {
    this.await(this.automigrage, models, cb, (models, cb)=> {
      var nullable = true;
    });
  }

  autoupdate(models, cb) {
    this.await(this.autoupdate, models, cb, (models, cb)=> {
      var nullable = true;
      
      Promise.all(_.map(models, model => {
          var contentType = this.contentType(model, nullable);
          return { name: model, contentType: contentType };
        }))
        .then(results => {
          var createModels = _.filter(results, result => !result.contentType);
          var updateModels = _.filter(results, result => !!result.contentType);
          return Promise.all(_.map(createModels, model => {
            return this.createTable(model.name)
              .then(contentType => {
                this.addContentType(contentType);
              });
          }))
          .then(done => {
            return Promise.all(_.map(updateModels, model => {
              return this.alterTable(model.name, model.contentType);
            }))
          })
          .then(done => {
            return Promise.all(_.map(models, model => {
              return this.createRelation(model);
            }))
          })
        })
        .then(done => {
          cb();
        })
        .catch(err => cb(err)); 
    });
  }

  isActual(models, cb) {
    this.await(this.isActual, models, cb, (models, cb)=> {
      var needsUdate = true;
      var checkOnly = true;
      var nullable = true;
      Promise.all(_.map(models, model => {
        var contentType = this.contentType(model, nullable);
        if (contentType) {
          return this.alterTable(model, contentType, checkOnly);
        } else {
          return needsUdate;
        }
      }))
      .then(oks => {
         cb(null, _.compact(oks).length !== 0);
      })
      .catch(err => cb(err));
    });    
  };

  await(f, models, cb, exe) {
    if (this.spaceMap) {
      if (this.debug) {
        debug('autoupdate or automigrage');
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

      exe(models, cb);
    } else {
      this.dataSource.once('connected', () => f.bind(this)(models, cb));
    }
  }

  createRelation(model) {
    var relations = this.buildRelationDefinitions(model);
    var needsUpdate = false;
    if (relations.length === 0) {
      return;
    }

    var contentType = this.contentType(model);
    var fields = {};
    _.reduce(contentType.fields, (fields, f, i) => {
      fields[f.id] = {index: i, def: f}; 
      return fields;
    }, fields);

    _.forEach(relations, rel => {
      var field = fields[rel.id];
      if (field) {
        if (!_.isEqual(field.def, rel)) {
          needsUpdate = true;
          contentType.fields[field.index] = rel;
        }
      } else {
        needsUpdate = true;
        contentType.fields.push(rel);
      }
    });

    if (needsUpdate) {
      return contentType.update();
    }
    return needsUpdate;
  }

  createTable(model) {
    var modelName = this.contentModelName(model);
    var settings = this.contentfulSettings(model);
    var fields = this.buildColumnDefinitions(model);
    var contentType = {
      name: modelName,
      displayField: settings.displayField,
      description: settings.description,
      fields: fields,
    }

    return Promise.resolve(this.space(model)) 
      .then(space => {
        return space
          .createContentType(contentType)
          .then(contentType => {
            return contentType.publish();
          });
      });
  }

  alterTable(model, contentType, checkOnly = false) {
    var fields = this.buildColumnDefinitions(model);
    var actualFieldMap = _.keyBy(contentType.fields, field => field.id);
    
    var needsUpdate = false;
    var modelName = this.contentModelName(model);
    needsUpdate = modelName !== contentType.name;

    var settings = this.contentfulSettings(model);
    if (settings.displayField || contentType.displayField) {
      needsUpdate = settings.displayField !== contentType.displayField;
    }
    if (settings.description || contentType.description) {
      needsUpdate = settings.description !== contentType.description;
    }
    
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

    if (needsUpdate && !checkOnly) {
      // append excess contentful fileds.
      _.forEach(_.values(actualFieldMap), actualField => {
        newFields.push(actualField);
      })
      contentType.name = modelName;
      contentType.description = settings.description;
      contentType.displayField = settings.displayField;
      contentType.fields = newFields;
      return contentType.update();
    }
    return needsUpdate;
  };

  buildRelationDefinitions(model) {
    var definition = this.getModelDefinition(model);
    var rels = definition.settings.relations;
    return _.chain(rels)
      .keys()
      .map(relName => this.buildRelationDefinition(model, relName))
      .value();
  }

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

  getRelationDefinition(model, relName) {
    var model = this.getModelDefinition(model);
    return model && model.settings.relations[relName];
  }

  buildRelationDefinition(model, relName) {
    var rel = this.getRelationDefinition(model, relName);
    var contentful = rel.contentful || {}; 
    var type = this.buildRelationType(rel);
    var addTypeValidation = (validations) => {
      if (rel.model !== 'Asset'){
        var contentType = this.contentType(rel.model);
        validations[0] = validations[0] || {};
        validations[0].linkContentType = contentType.sys.id;
      }
    }

    var field = {
      "id": relName,
      "name": contentful.name || (relName.charAt(0).toUpperCase() + relName.slice(1))
        .replace(/([A-Z])/g, ' $1').trim(),
      "type": type,
      "localized": !!contentful.localized,
      "required": !!rel.required,
      "disabled": !!contentful.disabled,
      "omitted": !!contentful.omitted,
    };

    if (type === 'Array') {
      var items = {};
      items.type = 'Link';
      items.linkType = rel.model === 'Asset' ? 'Asset' : 'Entry';
      items.validations = contentful.itemValidations || [];
      addTypeValidation(items.validations);
      field.items = items;
    } else {
      field.linkType = rel.model === 'Asset' ? 'Asset' : 'Entry';
      field.validations = contentful.validations || [],
      addTypeValidation(field.validations);
    }

    return field;
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
      items.validations = contentful.itemValidations || [];
      field.items = items;
    }

    return field;
  }

  buildRelationType(relationDefinition) {
    var dt = '';
    var r = relationDefinition;
    switch (r.type) {
      default:
      case 'belongsTo':
      case 'hasOne':
        dt = 'Link';
        break;
      case 'hasMany':
        dt = 'Array';
        break;
    }
    return dt;
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