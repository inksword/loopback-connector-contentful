const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

module.exports = Connector =>
  class MixinMeta extends Connector {
    getContentfulSettings(modelName) {
      const model = this.getModelDefinition(modelName);
      const modelSettings = (model.settings && model.settings.contentful) || {};
      return _.assign({}, {
        locale: this.settings.locale,
        id: _.camelCase(modelName),
      }, modelSettings, {
        paceId: this.settings.spaceId,
      });
    }

    getModelName(modelName) {
      const settings = this.getContentfulSettings(modelName);
      if (typeof settings.name === 'string') {
        return settings.name;
      }
      if (Array.isArray(settings.name) && settings.name.length > 0) {
        return settings.name[0];
      }
      return _.startCase(modelName);
    }

    getModelNames(modelName) {
      const settings = this.getContentfulSettings(modelName);
      if (typeof settings.name === 'string') {
        return [settings.name];
      }
      if (Array.isArray(settings.name) && settings.name.length > 0) {
        return settings.name;
      }
      return [_.startCase(modelName)];
    }

    getDefaultLocale(modelName) {
      const settings = this.getContentfulSettings(modelName);
      let locale = settings.locale || this.settings.locale;
      if (!locale) {
        const defaultLocale = _.find(this.contentful.locales, item => item.default);
        if (defaultLocale) {
          locale = defaultLocale.code;
          settings.locale = locale;
        }
      }
      return locale;
    }

    hasContentType(modelName) {
      if (this.settings.uniqueBy === 'name') {
        const modelNames = this.getModelNames(modelName);
        const contentTypes = this.contentful.contentTypes || {};
        return !!_.find(contentTypes, (type, name) => modelNames.includes(name));
      }
      const modelId = this.getContentfulSettings(modelName).id;
      return _.has(this.contentful.contentTypes, modelId);
    }

    getContentType(modelName) {
      let contentType = null;
      if (this.settings.uniqueBy === 'name') {
        const modelNames = this.getModelNames(modelName);
        const contentTypes = this.contentful.contentTypes || {};
        contentType = _.find(contentTypes, (type, name) => modelNames.includes(name));
      } else {
        const modelId = this.getContentfulSettings(modelName).id;
        const contentTypes = this.contentful.contentTypes || {};
        contentType = _.find(contentTypes, (type, id) => id === modelId);
      }

      return contentType;
    }

    setContentType(contentType) {
      this.contentful.contentTypes[contentType.name] = contentType;
    }
  };
