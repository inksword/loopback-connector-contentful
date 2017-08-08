const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const mixinMeta = require('./meta');
const queryHelper = require('./query');

module.exports = Connector =>
  class MixinDAO extends mixinMeta(Connector) {
    create(model, data, options, cb) {
      if (!this.contentful.space) {
        return cb(new Error('Management access token is required.'));
      }

      const contentType = this.getContentType(model);
      this.contentful.space.createEntry(contentType.sys.id, {
        fields: this.toDatabase(model, data),
      })
        .then(entry => entry.publish())
        .then((entry) => {
          const id = entry.sys.id;
          const rev = entry.sys.version;
          process.nextTick(() => cb(null, id, rev));
        })
        .catch(err => cb(err));
    }

    updateAttributes(model, id, data, cb) {
      this.updateAll(model, { id }, data, {}, cb);
    }

    update(model, where, data, options, cb) {
      this.updateAll(model, where, data, options, cb);
    }

    updateAll(model, where, data, options, cb) {
      if (!this.contentful.space) {
        cb(new Error('Management access token is required.'));
        return;
      }

      if (this.debug) {
        debug('updateAll', model, where, data);
      }
      const idName = this.idName(model);
      delete data[idName];
      data = this.toDatabase(model, data);

      this.getEntries(model, { where, contentful: { api: 'management' } })
        .then(entries => Promise.all(_.map(entries.items, (entry) => {
          _.assign(entry.fields, data);
          return entry.update();
        })))
        .then(entries => Promise.all(_.map(entries, (entry) => entry.publish())))
        .then(entries => process.nextTick(() => cb(null, { count: entries.length })))
        .catch(err => cb(err));
    }

    all(model, filter, options, cb) {
      this.getEntries(model, filter)
        .then((entries) => {
          let data = entries;
          if (!this.settings.respectContentfulClass) {
            data = entries.toPlainObject();
            data = _.map(data.items, item => this.toLoopback(model, item));
          }
          process.nextTick(() => {
            cb(null, data);
          });
        })
        .catch(err => cb(err));
    }

    count(model, filter, options, cb) {
      filter.limit = 1;
      return this.getEntries(model, filter)
        .then((entries) => {
          cb(null, entries.total);
        })
        .catch(err => cb(err));
    }

    getEntries(model, filter) {
      if (this.debug) {
        debug('getEntries', model, filter);
      }

      filter = filter || {};
      const idName = this.idName(model);
      const query = queryHelper.buildFilter(model, idName, filter);
      query.content_type = this.getContentType(model).sys.id;

      const contentful = filter.contentful || {};
      switch (contentful.api || 'delivery') {
        case 'preview':
          if (this.clients.preview) {
            return this.clients.preview.getEntries(query);
          }
          break;
        case 'management':
          if (this.contentful.space) {
            return this.contentful.space.getEntries(query);
          } else if (this.clients.management) {
            const spaceId = this.getContentfulSettings(model).spaceId;
            return this.clients.management.getSpace(spaceId).getEntries(query);
          }
          break;
        case 'delivery':
        default:
          if (this.clients.delivery) {
            return this.clients.delivery.getEntries(query);
          }
          break;
      }
      return Promise.reject(new Error('No contentful clients found.'));
    }

    toLoopback(model, data, locale = null) {
      locale = locale || this.getDefaultLocale(model);
      const idName = model === 'Asset' ? 'id' : this.idName(model);
      const rels = model === 'Asset' ? {} : this.getModelDefinition(model).settings.relations;

      const d = _.mapValues(data.fields, (field, key) => {
        let f = field;
        if (_.has(field, locale)) {
          f = field[locale];
        } else if (_.has(rels, key)) {
          const relDefinition = rels[key];
          if (Array.isArray(f)) {
            f = _.map(f, r => this.toLoopback(relDefinition.model, r, relDefinition.model === 'Asset' ? locale : null));
          } else {
            f = this.toLoopback(relDefinition.model, f, relDefinition.model === 'Asset' ? locale : null);
          }
        }
        return f;
      });

      d[idName] = data.sys.id;
      d.createdAt = data.sys.createdAt;
      d.createdBy = data.sys.createdBy;
      d.updatedAt = data.sys.updatedAt;
      d.updatedBy = data.sys.updatedBy;
      d.version = data.sys.version || data.sys.revision;
      return d;
    }

    toDatabase(model, data) {
      const locale = this.getDefaultLocale(model);
      const d = _.mapValues(data, field => ({ [locale]: field }));
      return d;
    }
  };
