const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

module.exports = (Connector) => 
class MixinMigration extends Connector {
  automigrage(models, cb) {
    this.await(this.automigrage, models, cb, (models, cb)=> {
      cb();
    });
  }

  autoupdate(models, cb) {
    this.await(this.autoupdate, models, cb, (models, cb)=> {
      Promise.all(_.map(models, model => {
          let nullable = true;
          var contentType = this.contentType(model, nullable);
          return { name: model, inContentful: !!contentType };
        }))
        .then(results => {
          var createModels = _.filter(results, result => !result.inContentful);
          var updateModels = _.filter(results, result => result.inContentful);
          return Promise.all(_.map(createModels, model => {
            return this.createTable(model.name);
          }))
          .then(done => {
            return Promise.all(_.map(updateModels, model => {
              return this.alterTable(model.name);
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
    this.await(this.isActual, models, cb, (models, cb) => {
      var checkOnly = true;
      var isActual = true;
      _.forEach(models, model => {
        if (this.alterTable(model, checkOnly)) {
          isActual = false;
          return false;
        }
      });

      if (isActual) {
        _.forEach(models, model => {
          if (this.createRelation(model, checkOnly)) {
            isActual = false;
            return false;
          }
        });
      }

      cb(null, isActual);
    });    
  };

  await(f, models, cb, exe) {
    if (this.contentful.connected) {
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

  createRelation(model, checkOnly = false) {
    var relations = this.buildRelationDefinitions(model);
    var needsUpdate = false;
    if (relations.length === 0) {
      return needsUpdate;
    }

    var contentType = this.contentType(model);
    var newFields = _.clone(contentType.fields);
    var fields = {};
    _.reduce(newFields, (fields, f, i) => {
      fields[f.id] = {index: i, def: f}; 
      return fields;
    }, fields);

    _.forEach(relations, rel => {
      var field = fields[rel.id];
      if (field) {
        if (!_.isEqual(field.def, rel)) {
          needsUpdate = true;
          newFields[field.index] = rel;
        }
      } else {
        needsUpdate = true;
        newFields.push(rel);
      }
      if (needsUpdate && checkOnly) {
        return false;
      }
    });

    if (needsUpdate && !checkOnly) {
      contentType.fields = newFields;
      return contentType.update()
        .then(contentType => contentType.publish())
        .then(contentType => {
          this.addContentType(contentType);
          return needsUpdate;
        });
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
          .then(contentType => contentType.publish())
          .then(contentType => {
            this.addContentType(contentType);
            return true;
          });
      });
  }

  alterTable(model, checkOnly = false) {
    var nullable = checkOnly;
    var needsUpdate = false;
    var contentType = this.contentType(model, nullable);
    if (checkOnly && !contentType) {
      needsUpdate = true;
      return needsUpdate;
    }

    var modelName = this.contentModelName(model);
    needsUpdate = modelName !== contentType.name;

    var settings = this.contentfulSettings(model);
    if (settings.displayField || contentType.displayField) {
      needsUpdate = settings.displayField !== contentType.displayField;
    }
    if (settings.description || contentType.description) {
      needsUpdate = settings.description !== contentType.description;
    }
    
    var fields = this.buildColumnDefinitions(model);
    var actualFieldMap = _.keyBy(contentType.fields, field => field.id);

    var newFields = [];
    _.forEach(fields, field => {
      var actualField = actualFieldMap[field.id];
      delete actualFieldMap[field.id];
      if (!needsUpdate) {
        if (!_.isEqual(field, actualField)) {
          needsUpdate = true;
        }
      }
      if (needsUpdate && checkOnly) {
        return false;
      }
      newFields.push(field);
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
      return contentType.update()
        .then(contentType => contentType.publish())
        .then(contentType => {
          this.addContentType(contentType);
          return needsUpdate;
        });
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
    var rels = definition.settings.relations;
    var idName = this.idName(model);
    var ids = _.chain(rels)
      .transform(function(result, value, key) {
        if (value.type === 'belongsTo') {
          result.push(key);
        }
      }, [])
      .map(relName => relName + 'Id')
      .value();
    ids.push(idName);

    var props = definition.properties;
    return _.chain(props)
      .keys()
      .filter(key => _.indexOf(ids, key) === -1)
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
      "validations": contentful.validations || [],
      "disabled": !!contentful.disabled,
      "omitted": !!contentful.omitted,
    };

    if (type === 'Array') {
      var items = {};
      items.type = 'Link';
      items.validations = contentful.itemValidations || [];
      addTypeValidation(items.validations);
      items.linkType = rel.model === 'Asset' ? 'Asset' : 'Entry';
      field.items = items;
    } else {
      field.linkType = rel.model === 'Asset' ? 'Asset' : 'Entry';
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