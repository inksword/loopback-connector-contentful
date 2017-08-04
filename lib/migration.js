const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

module.exports = Connector =>
  class MixinMigration extends Connector {
    automigrage(models, cb) {
      this.await(this.automigrage, models, cb, (models, cb) => {
        cb();
      });
    }

    autoupdate(models, cb) {
      this.await(this.autoupdate, models, cb, (models, cb) => {
        if (!this.clients.management) {
          cb(new Error('Management access token is required.'));
        }
        Promise.resolve(_.reduce(models, (result, model) => {
          if (this.hasContentType(model)) {
            result.updateModels.push(model);
          } else {
            result.createModels.push(model);
          }
          return result;
        }, { createModels: [], updateModels: [] }))
          .then(({ createModels, updateModels }) => {
            const createRequests = _.chain(createModels)
              .map(modelName => this.createTable(modelName))
              .value();
            const updateRequests = _.chain(updateModels)
              .map(modelName => this.alterTable(modelName))
              .value();
            return Promise.all([]
              .concat(createRequests)
              .concat(updateRequests));
          })
          .then(() => Promise.all(_.map(models, model => this.createRelation(model))))
          .then(() => cb())
          .catch(cb);
      });
    }

    isActual(models, cb) {
      this.await(this.isActual, models, cb, (models, cb) => {
        const checkOnly = true;
        let isActual = true;
        _.forEach(models, (model) => {
          if (this.alterTable(model, checkOnly)) {
            isActual = false;
            return false;
          }
        });

        if (isActual) {
          _.forEach(models, (model) => {
            if (this.createRelation(model, checkOnly)) {
              isActual = false;
              return false;
            }
          });
        }

        cb(null, isActual);
      });
    }

    await(f, models, cb, exe) {
      if (this.contentful.connected) {
        if (this.debug) {
          debug('autoupdate or automigrage');
        }

        if ((!cb) && (typeof models === 'function')) {
          cb = models;
          models = undefined;
        }
        // First argument is a model name
        if (typeof models === 'string') {
          models = [models];
        }

        models = models || Object.keys(this._models);

        exe(models, cb);
      } else {
        this.dataSource.once('connected', () => f.bind(this)(models, cb));
      }
    }

    createRelation(model, checkOnly = false) {
      const relations = this.buildRelationDefinitions(model);
      let needsUpdate = false;
      if (relations.length === 0) {
        return needsUpdate;
      }

      const contentType = this.getContentType(model);
      const newFields = _.clone(contentType.fields);
      const fields = _.reduce(newFields, (result, f, i) => {
        result[f.id] = { index: i, def: f };
        return result;
      }, {});

      _.forEach(relations, (rel) => {
        const field = fields[rel.id];
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
        return true;
      });

      if (needsUpdate && !checkOnly) {
        contentType.fields = newFields;
        return contentType.update()
          .then(contentType => contentType.publish())
          .then(contentType => this.setContentType(contentType) )
          .catch(err => {
            console.log(err);
          });
      }
      return needsUpdate;
    }

    createTable(model) {
      const name = this.getModelName(model);
      const { displayField, description, id } = this.getContentfulSettings(model);
      const fields = this.buildColumnDefinitions(model);
      const contentType = {
        name,
        displayField,
        description,
        fields,
      };

      return this.contentful.space.createContentTypeWithId(id, contentType)
        .then(contentType => contentType.publish())
        //.then(contentType => this.contentful.space.getContentType(contentType.sys.id))
        .then((contentType) => {
          this.setContentType(contentType);
          return true;
        });
    }

    alterTable(model, checkOnly = false) {
      const nullable = checkOnly;
      let needsUpdate = false;
      const contentType = this.getContentType(model);
      if (checkOnly && !contentType) {
        needsUpdate = true;
        return needsUpdate;
      }

      const modelName = this.getModelName(model);
      needsUpdate = modelName !== contentType.name;

      const settings = this.getContentfulSettings(model);
      if (settings.displayField) {
        needsUpdate = settings.displayField !== contentType.displayField;
      }
      if (settings.description) {
        needsUpdate = settings.description !== contentType.description;
      }

      const fields = this.buildColumnDefinitions(model);
      const actualFieldMap = _.keyBy(contentType.fields, field => field.id);

      const newFields = [];
      _.forEach(fields, (field) => {
        const actualField = actualFieldMap[field.id];
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
        _.forEach(_.values(actualFieldMap), (actualField) => {
          newFields.push(actualField);
        });

        contentType.name = modelName;
        contentType.description = settings.description;
        contentType.displayField = settings.displayField;
        contentType.fields = newFields;
        return contentType.update()
          .then((contentType) => {
            this.setContentType(contentType);
            return needsUpdate;
          });
      }
      return needsUpdate;
    }

    buildRelationDefinitions(model) {
      const definition = this.getModelDefinition(model);
      const rels = definition.settings.relations;
      return _.chain(rels)
        .keys()
        .map(relName => this.buildRelationDefinition(model, relName))
        .value();
    }

    buildColumnDefinitions(model) {
      const definition = this.getModelDefinition(model);
      const rels = definition.settings.relations;
      const idName = this.idName(model);
      const ids = _.chain(rels)
        .transform((result, value, key) => {
          if (value.type === 'belongsTo') {
            result.push(key);
          }
        }, [])
        .map(relName => `${relName}Id`)
        .value();
      ids.push(idName);

      const props = definition.properties;
      return _.chain(props)
        .keys()
        .filter(key => _.indexOf(ids, key) === -1)
        .map(propName => this.buildColumnDefinition(model, propName))
        .value();
    }

    buildRelationDefinition(modelName, relName) {
      const model = this.getModelDefinition(modelName);
      const relation = model && model.settings.relations[relName];
      const settings = relation.contentful || {};
      const type = this.buildRelationType(relation);
      const addTypeValidation = (validations) => {
        if (relation.model !== 'Asset') {
          const contentType = this.getContentType(relation.model);
          validations[0] = validations[0] || {};
          validations[0].linkContentType = contentType.sys.id;
        }
      };

      const field = {
        id: relName,
        name: settings.name || _.startCase(relName),
        type,
        localized: !!settings.localized,
        required: !!relation.required,
        validations: settings.validations || [],
        disabled: !!settings.disabled,
        omitted: !!settings.omitted,
      };

      if (type === 'Array') {
        const items = {};
        items.type = 'Link';
        items.validations = settings.itemValidations || [];
        addTypeValidation(items.validations);
        items.linkType = relation.model === 'Asset' ? 'Asset' : 'Entry';
        field.items = items;
      } else {
        field.linkType = relation.model === 'Asset' ? 'Asset' : 'Entry';
        addTypeValidation(field.validations);
      }

      return field;
    }

    buildColumnDefinition(model, propName) {
      const prop = this.getPropertyDefinition(model, propName);
      const settings = prop.contentful || {};
      const type = settings.dataType || this.buildColumnType(prop);

      const field = {
        id: propName,
        name: settings.name || _.startCase(propName),
        type,
        localized: !!settings.localized,
        required: !!prop.required,
        validations: settings.validations || [],
        disabled: !!settings.disabled,
        omitted: !!settings.omitted,
      };

      if (type === 'Array') {
        const items = {};
        items.type = this.buildColumnType({ type: prop.type[0] });
        items.validations = settings.itemValidations || [];
        field.items = items;
      }

      return field;
    }

    buildRelationType(relationDefinition) {
      let dt = '';
      const r = relationDefinition;
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
      let dt = '';
      const p = propertyDefinition;

      // 'link': 'Link',
      // 'integer': 'Integer',

      switch (p.type.name) {
        default:
          if (Array.isArray(p.type)) {
            dt = columnType(p, 'Array');
            break;
          }
        case 'Any':
        case 'JSON':
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
    }
  };

function columnType(p, defaultType) {
  let dt = defaultType;
  if (p.dataType) {
    dt = String(p.dataType);
  }
  return dt;
}
