const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const queryBuilder = require('./query-builder');

module.exports = (Connector) =>
class MixinDAOHelper extends Connector {
  contentfulSettings(model) {
    var modelDefinition = this.getModelDefinition(model);
    if (!modelDefinition.settings) {
      modelDefinition.settings = {};
    }
    if (!modelDefinition.settings.contentful) {
      modelDefinition.settings.contentful = {};
    }
    return modelDefinition.settings.contentful;
  }

  contentModelName(model) {
    var settings = this.contentfulSettings(model);
    if (Array.isArray(settings.model)) {
      return settings.model[0] || model;
    } else {
      return settings.model || model;
    }
  }

  contentModelNames(model) {
    var settings = this.contentfulSettings(model);
    if (Array.isArray(settings.model)) {
      return settings.model || [model];
    } else {
      return settings.model ? [settings.model] : [model];
    }
  }

  spaceId(model) {
    var settings = this.contentfulSettings(model);
    return settings.spaceId || this.settings.spaceId;
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
    var settings = this.contentfulSettings(model);
    var locale = settings.locale || this.settings.locale;
    if (!locale) {
      var spaceId = this.spaceId(model);
      var defaultLocale = _.find(this.locales[spaceId], item => item.default);
      if (defaultLocale) {
        locale = defaultLocale.code;
        settings.locale = locale;
      }
    }
    return locale;
  }

  space(model, nullable = false) {
    var spaceId = this.spaceId(model);
    if (!spaceId) {
      throw new Error('Space id is not defined in datasources.json');
    }

    if (this.spaceMap && this.spaceMap[spaceId]) {
      return this.spaceMap[spaceId];
    } else {
      if(nullable) {
        return null;
      } else {
        throw new Error('Cannot resolve space for model ' + model);
      }
    }
  }

  contentType(model, nullable = false) {
    var space = this.space(model);
    var modelNames = this.contentModelNames(model);
    var contentTypes = this.contentTypes[space.sys.id] || {};
    var modelName = _.find(modelNames, modelName => contentTypes[modelName]);
    var contentType = contentTypes[modelName];

    if (!!contentType) {
      return contentType;
    } else {
      if (nullable) {
        return null;
      } else {
        throw new Error('Cannot find content type for model ' + model);
      }
    }
  }

  addContentType(contentType) {
    var spaceId = contentType.sys.space.sys.id;
    var contentTypes = this.contentTypes[spaceId] || {};
    contentTypes[contentType.name] = contentType;
    this.contentTypes[spaceId] = contentTypes;
  }

  allEntries(model, filter, options){
    if (this.debug) {
      debug('all', model, filter);
    }
    filter = filter || {};
    var idName = this.idName(model);
    var query = queryBuilder.buildFilter(model, idName, filter);
    query.content_type = this.contentType(model).sys.id;
    return this.space(model).getEntries(query);
  }

  toDatabase(model, data) {
    var locale = this.locale(model);
    var d = _.mapValues(data, field => ({[locale]: field}));
    return d;
  }
}