const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');
const mixinDAOHelper = require('./dao-helper');
const queryBuilder = require('./query-builder');


module.exports = (Connector) =>
class MixinDAO extends mixinDAOHelper(Connector) {
  create(model, data, options, cb) {
    var idName = this.idName(model);
    var contentType = this.contentType(model);
    var space = this.space(model);
    
    space.createEntry(contentType.sys.id, {
        fields: this.toDatabase(model, data)
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
    
    this.getEntries(model, {where:where}, {})
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
    this.getEntries(model, filter, options)
      .then(entries => {
        var data = entries;
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

  count(model, where, options, cb) {
    var idName = this.idName(model);
    if (this.debug) {
      debug('count', model, where);
    }

    var query = queryBuilder.buildWhere(model, idName, where);
    query.limit = 1;
    query.content_type = this.contentType(model).sys.id;
    return this.space(model).getEntries(query)
      .then(entries => {
        cb(null, entries.total);
      })
      .catch(err => cb(err));
  };
}