const deliveryApi = require('contentful');
const managementApi = require('contentful-management');
const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const queryBuilder = require('./query-builder');

module.exports = (Connector) =>
class MixinDAOHelper extends Connector {
  contentfulSettings(model) {
    var modelDefinition = this.getModelDefinition(model);
    if (!modelDefinition.settings || !modelDefinition.settings.contentful) {
      return {};
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
      var defaultLocale = _.find(this.contentful.management.locales[spaceId], item => item.default);
      if (defaultLocale) {
        locale = defaultLocale.code;
        settings.locale = locale;
      }
    }
    return locale;
  }

  mapSpaces(spaces) {
    var spaceIdMap = _.keyBy(this.spaceIds(), id => id);
    var spaceMap = _
      .chain(spaces.items)
      .filter(space => !!spaceIdMap[space.sys.id])
      .keyBy('sys.id')
      .value();
    this.contentful.management.spaceMap = spaceMap;
    return spaceMap;
  }

  space(model, nullable = false) {
    var spaceId = this.spaceId(model);
    if (!spaceId) {
      throw new Error('Space id is not defined in datasources.json');
    }

    var spaceMap = this.contentful.management.spaceMap;
    if (spaceMap && spaceMap[spaceId]) {
      return spaceMap[spaceId];
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
    var contentTypes = this.contentful.management.contentTypes[space.sys.id] || {};
    var modelName = _.find(modelNames, modelName => !!contentTypes[modelName]);
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
    if (!this.contentful.management.contentTypes[spaceId]) {
      this.contentful.management.contentTypes[spaceId] = {};
    }
    this.contentful.management.contentTypes[spaceId][contentType.name] = contentType;
  }


  getEntries(model, filter, options) {
    if (this.debug) {
      debug('getEntries', model, filter);
    }

    filter = filter || {};
    var idName = this.idName(model);
    var query = queryBuilder.buildFilter(model, idName, filter);
    query.content_type = this.contentType(model).sys.id;

    var contentfulApi = filter._contentfulApi || 'management';
    switch (contentfulApi) {
      case 'delivery':
        var spaceId = this.spaceId(model);
        return this.deliveryClient(spaceId).getEntries(query);
      case 'management':
      default:
        return this.space(model).getEntries(query);
    }
  }

  toLoopback(model, data, locale = null) {
    locale = locale || this.locale(model);
    var idName = model === 'Asset' ? 'id': this.idName(model);
    var rels = model === 'Asset' ? {} : this.getModelDefinition(model).settings.relations;

    var d = _.mapValues(data.fields, (field, key) => {
      var f = null;
      if (_.has(field, locale)) {
        f = field[locale];
      } else {
        f = field;
        if (rels[key]) {
          var relDefinition = rels[key];
          if (Array.isArray(f)) {
            f = _.map(f, r => {
              return this.toLoopback(relDefinition.model, r, relDefinition.model === 'Asset' ? locale : null);
            })
          } else {
            f = this.toLoopback(relDefinition.model, f, relDefinition.model === 'Asset' ? locale : null);
          }
        }
      }
      return f;
    });
    
    d[idName] = data.sys.id;
    d.createdAt = data.sys.createdAt;
    d.updatedAt = data.sys.updatedAt;
    d.publishedAt = data.sys.publishedAt;
    d._rev = data.sys.version;
    return d;
  }

  toDatabase(model, data) {
    var locale = this.locale(model);
    var d = _.mapValues(data, field => ({[locale]: field}));
    return d;
  }

  managementClient() {
    if (!this.contentful.management.client) {
      this.contentful.management.client = managementApi.createClient({
        accessToken: this.settings.accessToken.management || this.settings.accessToken
      });
    }
    return this.contentful.management.client;
  }

  deliveryClient(spaceId) {
    if (!this.contentful.delivery.clientMap[spaceId]) {
      this.contentful.delivery.clientMap[spaceId] = deliveryApi.createClient({
        accessToken: this.settings.accessToken.delivery[spaceId],
        space: spaceId
      });
    }
    return this.contentful.delivery.clientMap[spaceId];
  }
}
