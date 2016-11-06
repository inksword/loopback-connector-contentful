var contentful = require('contentful-management');
var Connector = require('loopback-connector').Connector;
var debug = require('debug')('loopback:connector:mongodb');
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

  connect(callback){
    if (this.space) {
      process.nextTick(() => {
        callback && callback(null, this.space);
      });
    } else if (this.dataSource.connecting) {
      this.dataSource.once('connected', () => {
        process.nextTick(() => {
          callback && callback(null, this.space);
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
          callback && callback(null, space);
        })
        .catch(err => {
          if (this.debug) {
            debug('Contentful connection is failed: %s %s', this.settings.spaceId, err);
          }
          callback && callback(err, null);
        });
    }
  }

  disconnect(callback){
    if (this.debug) {
      debug('disconnect');
    }
    if (callback) {
      callback();
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

  toDatabase(model, data){
    return _.mapValues(data, o => {
      return {'en-US': o};
    });
  }

  contentTypeId(model){
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

  create(model, data, options, callback) {
    var idName = this.idName(model);
    
    this.contentTypeId(model)
      .then(contentTypeId => {
        return this.space.createEntry(contentTypeId, {
          fields: this.toDatabase(model, data)
        })
      })
      .then(entry => {
        process.nextTick(() => {
          callback(null, entry.sys.id, entry.sys.version);
        });
      })
      .catch(err => callback(err));
  };

  all(model, filter, options, callback){
    if (this.debug) {
      debug('all', model, filter);
    }
    filter = filter || {};
    var idName = this.idName(model);
    var query = queryBuilder.build(model, filter)

    this.contentTypeId(model)
      .then(contentTypeId => {
        query.content_type = contentTypeId;
        return this.space.getEntries(query);
      })
      .then(entries => {
        var data = _.map(entries.items, item => {
          var d = _.mapValues(item.fields, field => field['en-US']);
          d.sys = item.sys;
          return d;
        });        
        callback(null, data);
      })
      .catch(err => callback(err));
  }
}