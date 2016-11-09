var contentful = require('contentful-management');
var Connector = require('loopback-connector').Connector;
var debug = require('debug')('loopback:connector:contentful');
var util = require('util');
var _ = require('lodash');
var queryBuilder = require('./query-builder');

module.exports = class Contentful extends Connector {
  constructor(settings, dataSource) {
    super();
    Connector.call(this, 'contentful', settings);
    this.debug = settings.debug || debug.enabled;
    if (this.debug) {
      debug('Settings: %j', settings);
    }

    this.settings = settings;
    this.dataSource = dataSource;
    this.contentTypes = {};
    this.locales = {};
  }

  connect(cb) {
    if (this.spaces) {
      process.nextTick(() => {
        cb && cb(null, this.spaces);
      });
    } else if (this.dataSource.connecting) {
      this.dataSource.once('connected', () => {
        process.nextTick(() => {
          cb && cb(null, this.spaces);
        });
      });
    } else {
      this.client = contentful.createClient({
        accessToken: this.settings.accessToken
      })
      this.client.getSpaces()
        .then(spaces => {
          if (this.debug) {
            debug('Contentful connection is established: ' + this.settings.spaceId);
          }
          this.spaces = _.keyBy(spaces.items, 'sys.id');

          function getContentTypes(space) {
            return space
              .getContentTypes()
              .then(contentTypes => {
                var contentTypes = _.keyBy(contentTypes.items, 'name');
                return {[space.sys.id]: contentTypes};
              });
          }
          function getLocales(space){
            return space
              .getLocales()
              .then(locales => {
                return {[space.sys.id]: locales.toPlainObject().items};
              });
          }

          return Promise.all(_.map(spaces.items, space => 
            Promise.all([getContentTypes(space), getLocales(space)])
          ));
        })
        .then(contentTypesLocales => {
          _.forEach(contentTypesLocales, _.spread((contentTypes, locales) => {
              _.assign(this.contentTypes, contentTypes);
              _.assign(this.locales, locales);
          }));
          cb && cb(null, this.spaces);
        })
        .catch(err => {
          if (this.debug) {
            debug('Contentful connection is failed: %s %s', this.settings.spaceId, err);
          }
          cb && cb(err, null);
        });
    }
  }

  disconnect(cb) {
    if (this.debug) {
      debug('disconnect');
    }
    if (cb) {
      cb();
    }
  }

  ping(cb) {
    if (this.spaces && this.spaces.length > 0) {
      this.spaces[0].getLocales()
        .then(locales => cb())
        .catch(err => cb(err));
    } else {
      this.dataSource.once('connected', function() {
        this.ping(cb);
      });
      this.dataSource.once('error', function(err) {
        cb(err);
      });
      this.connect(function() {});
    }
  };

  spaceId(model) {
    var modelSettings = this._models[model].settings;
    var spaceId = modelSettings.spaceId || this.settings.spaceId;
    if (!spaceId) {
      spaceId = _.findKey(this.contentTypes, contentTypes => !!contentTypes[model]);
      if (!!spaceId) {
        modelSettings.spaceId = spaceId;
      }
    }
    return spaceId;
  }

  space(model) {
    var spaceId = this.spaceId(model);
    if (!spaceId) {
      return Promise.reject(new Error('Cannot resolve space id for model ' + model));
    }

    if (this.spaces && this.spaces[spaceId]) {
      return Promise.resolve(this.spaces[spaceId]);
    } else {
      return Promise.reject(new Error('Cannot resolve space for model ' + model));
    }
  }

  locale(model) {
    var modelSettings = this._models[model].settings;
    var locale = modelSettings.locale || this.settings.locale;
    if (!locale) {
      var spaceId = this.spaceId(model);
      _.map(this.locales[spaceId], lcl => {
        if (lcl.default) {
          locale = lcl.code;
          return false;
        }
      });
      modelSettings.locale = locale;
    }
    return  locale;
  }

  contentType(model) {
    return this.space(model)
      .then(space => {
        var spaceId = space.sys.id;
        var contentType = null;
        if (this.contentTypes && this.contentTypes[spaceId] && this.contentTypes[spaceId][model]) {
          contentType = this.contentTypes[spaceId][model];
        }
        if (!contentType) {
          return Promise.reject(new Error('Cannot find content type id for model ' + model));
        } else {
          return Promise.resolve(contentType);
        }
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

        return this.space(model)
          .then(space => space.getEntries(query));
      });
  }

  toDatabase(model, data) {
    var locale = this.locale(model);
    var d = _.mapValues(data, field => ({[locale]: field}));
    return d;
  }

  create(model, data, options, cb) {
    var idName = this.idName(model);
    
    this.contentType(model)
      .then(contentType => {
        var contentTypeId = contentType.sys.id;
        return this.space(model)
          .then(space => 
            space.createEntry(contentTypeId, {
              fields: this.toDatabase(model, data)
            })
          );
      })
      .then(entry => {
        var id = entry.sys.id;
        var rev = entry.sys.version;
        process.nextTick(() => cb(null, id, rev));
      })
      .catch(err => cb(err));
  };

  update(model, where, data, options, cb) {
    this.updateAll(model, where, data, options, cb);
  }
  
  updateAll(model, where, data, options, cb) {
    if (this.debug) {
      debug('updateAll', model, where, data);
    }
    var idName = this.idName(model);

    delete data[idName];

    data = this.toDatabase(model, data);

    this.allEntries(model, {where:where}, {})
      .then(entries => {
        return Promise.all(_.map(entries.items, item => {
          _.assign(item.fields, data);
          return item.update();
        }))
      })
      .then(entries => {
        process.nextTick(() => cb(null, { count: entries.length}));
      })
      .catch(err => cb(err));
  };

  all(model, filter, options, cb){
    var idName = this.idName(model);
    this.allEntries(model, filter, options)
      .then(entries => {
        var locale = this.locale(model);
        var data = _.map(entries.items, item => {
          var d = _.mapValues(item.fields, field => field[locale]);
          if (d != null) {
            d[idName] = item.sys.id;
            d.createdAt = item.sys.createdAt;
            d.updatedAt = item.sys.updatedAt;
            d.publishedAt = item.sys.publishedAt;
            d._rev = item.sys.version;
          }

          return d;
        });
        process.nextTick(() => {
          cb(null, data);
        });
      })
      .catch(err => cb(err));
  }
}