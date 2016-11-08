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
  }

  connect(cb) {
    if (this.space) {
      process.nextTick(() => {
        cb && cb(null, this.space);
      });
    } else if (this.dataSource.connecting) {
      this.dataSource.once('connected', () => {
        process.nextTick(() => {
          cb && cb(null, this.space);
        });
      });
    } else {
      this.client = contentful.createClient({
        accessToken: this.settings.accessToken
      })
      this.client.getSpace(this.settings.spaceId)
        .then(space => {
          if (this.debug) {
            debug('Contentful connection is established: ' + this.settings.spaceId);
          }
          this.space = space;
          cb && cb(null, space);
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
    if (this.space) {
      this.space.getLocales()
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

  toDatabase(model, data) {
    var locale = this.settings.locale;
    var d = _.mapValues(data, field => ({[locale]: field}));
    return d;
  }

  contentTypeId(model) {
    var contentType = this.contentTypes == null ? null : this.contentTypes[model];
    if(contentType){
      return Promise.resolve(contentType.sys.id);
    }

    return this.space.getContentTypes()
      .then(contentTypes => {
        contentTypes = _.keyBy(contentTypes.items, 'name');
        this.contentTypes = contentTypes;
        contentType = contentTypes[model];

        if(contentType == null){
          return Promise.reject(new Error('Cannot find content type with name ' + model));
        }
        return contentType.sys.id;
      });
  }

  create(model, data, options, cb) {
    var idName = this.idName(model);
    
    this.contentTypeId(model)
      .then(contentTypeId => {
        return this.space.createEntry(contentTypeId, {
          fields: this.toDatabase(model, data)
        })
      })
      .then(entry => {
        process.nextTick(() => {
          cb(null, entry.sys.id, entry.sys.version);
        });
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
        cb(null, { count: entries.length});
      })
      .catch(err => cb(err));
  };

  allEntries(model, filter, options){
    if (this.debug) {
      debug('all', model, filter);
    }
    filter = filter || {};
    var idName = this.idName(model);
    var query = queryBuilder.buildFilter(model, idName, filter);

    return this.contentTypeId(model)
      .then(contentTypeId => {
        query.content_type = contentTypeId;
        return this.space.getEntries(query);
      });
  }

  all(model, filter, options, cb){
    this.allEntries(model, filter, options)
      .then(entries => {
        var locale = this.settings.locale;
        var data = _.map(entries.items, item => {
          var d = _.mapValues(item.fields, field => field[locale]);
          d[idName] = item.sys.id;
          d.createdAt = item.sys.createdAt;
          d.updatedAt = item.sys.updatedAt;
          d.publishedAt = item.sys.publishedAt;
          d._rev = item.sys.version;
          return d;
        });
        process.nextTick(() => {
          cb(null, data);
        });
      })
      .catch(err => cb(err));
  }
}