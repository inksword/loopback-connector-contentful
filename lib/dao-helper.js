const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const queryBuilder = require('./query-builder');

module.exports = (Connector) =>
class MixinDAOHelper extends Connector {
  contentModelName(model) {
    var modelDefinition = this.getModelDefinition(model);
    var contentful =  modelDefinition.settings.contentful || {};
    if (Array.isArray(contentful.model)) {
      return contentful.model[0] || model;
    } else {
      return contentful.model || model;
    }
  }

  contentModelNames(model) {
    var modelDefinition = this.getModelDefinition(model);
    var contentful =  modelDefinition.settings.contentful || {};
    if (Array.isArray(contentful.model)) {
      return contentful.model || [model];
    } else {
      return contentful.model ? [contentful.model] : [model];
    }
  }

  spaceId(model) {
    var modelDefinition = this.getModelDefinition(model);
    var contentfulModel =  modelDefinition.settings.contentful || {};
    return contentfulModel.spaceId || this.settings.spaceId;
  }

  spaceIds(){
    var spaceIds = _
      .chain(this._models)
      .map(model => model.settings.spaceId)
      .push(this.settings.spaceId)
      .compact()
      .uniq()
      .value();
    return spaceIds;
  }

  locale(model) {
    var modelSettings = this.getModelDefinition(model).settings;
    var locale = modelSettings.locale || this.settings.locale;
    if (!locale) {
      var spaceId = this.spaceId(model);
      var defaultLocale = _.find(this.locales[spaceId], item => item.default);
      if (defaultLocale) {
        locale = defaultLocale.code;
        modelSettings.locale = locale;
      }
    }
    return locale;
  }

  space(model, nullable = false) {
    var spaceId = this.spaceId(model);
    if (!spaceId) {
      return Promise.reject(new Error('Space id is not defined in datasources.json'));
    }

    return new Promise((resolve, reject) => {
      if (this.spaceMap && this.spaceMap[spaceId]) {
        resolve(this.spaceMap[spaceId]);
      } else {
        if(nullable) {
          resolve(null);
        } else {
          reject(new Error('Cannot resolve space for model ' + model));
        }
      }
    });
  }

  addContentType(contentType) {
    var spaceId = contentType.sys.space.sys.id;
    var contentTypes = this.contentTypes[spaceId] || {};
    contentTypes[contentType.name] = contentType;
    this.contentTypes[spaceId] = contentTypes;
  }

  contentType(model, nullable = false) {
    return this.space(model)
      .then(space => {
        var modelNames = this.contentModelNames(model);
        var contentTypes = this.contentTypes[space.sys.id] || {};
        var modelName = _.find(modelNames, modelName => contentTypes[modelName]);
        var contentType = contentTypes[modelName];

        return new Promise((resolve, reject) => {
          if (!!contentType) {
            resolve(contentType);
          } else {
            if (nullable) {
              resolve(null);
            } else {
              reject(new Error('Cannot find content type id for model ' + model));
            }
          }
        });
      });
  }

  allEntries(model, filter, options){
    if (this.debug) {
      debug('all', model, filter);
    }
    filter = filter || {};
    var idName = this.idName(model);
    var query = queryBuilder.buildFilter(model, idName, filter);

    return this.contentType(model)
      .then(contentType => {
        query.content_type = contentType.sys.id;
        return this.space(model);
      })
      .then(space => space.getEntries(query));
  }

  toDatabase(model, data) {
    var locale = this.locale(model);
    var d = _.mapValues(data, field => ({[locale]: field}));
    return d;
  }
}