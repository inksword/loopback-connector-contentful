const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const mixinDAOHelper = require('./dao-helper');

module.exports = (Connector) =>
class MixinDAO extends mixinDAOHelper(Connector) {
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
}