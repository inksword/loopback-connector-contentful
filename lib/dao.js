const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const queryBuilder = require('./query-builder');

module.exports = (Connector) =>
class MixinDAO extends Connector {
  create(model, data, options, cb) {
    var idName = this.idName(model);
    
    this.contentType(model)
      .then(contentType => {
        var contentTypeId = contentType.sys.id;
        return this.space(model);
      })
      .then(space => 
        space.createEntry(contentTypeId, {
          fields: this.toDatabase(model, data)
        })
      )
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

  all(model, filter, options, cb) {
    var idName = this.idName(model);
    this.allEntries(model, filter, options)
      .then(entries => {
        var locale = this.locale(model);
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

  spaceId(model) {
    var modelSettings = this._models[model].settings;
    return modelSettings.spaceId || this.settings.spaceId;
  }

  spaceIds(){
    var spaceIds = _
      .chain(this._models)
      .map(model => {
        return model.settings.spaceId;
      })
      .compact()
      .uniq()
      .value();
    spaceIds.push(this.settings.spaceId);
    return spaceIds;
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
    return locale;
  }

  space(model, nullable) {
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

  contentType(model, nullable) {
    return this.space(model)
      .then(space => {
        var spaceId = space.sys.id;
        var contentType = null;
        if (this.contentTypes && this.contentTypes[spaceId] && this.contentTypes[spaceId][model]) {
          contentType = this.contentTypes[spaceId][model];
        }

        return new Promise((resolve, reject) => {
          if (!contentType) {
            if (nullable) {
              resolve(null);
            } else {
              reject(new Error('Cannot find content type id for model ' + model));
            }
          } else {
            resolve(contentType);
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