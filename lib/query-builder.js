var _ = require('lodash');

module.exports.build = function (model, filter){
  var query = {};
  if (filter.skip){
    query.skip = filter.skip;
  }

  if (filter.limit){
    query.limit = filter.limit;
  }

  if (filter.fields) {
    query.select = _.map(filter.fields, field => `fields.${field}`);
  }

  _.assign(query, buildWhere(model, filter.where));
  query.order = buildOrder(model, filter.order);
  return query;
}

function buildWhere(model, where) {
  var query = {};
  if (where === null || (typeof where !== 'object')) {
    return query;
  }
  Object.keys(where).forEach(function(k) {
    var cond = where[k];
    if (k === 'or' || k === 'nor') {
      // contentful search does not support or/nor operator
      return;
    }
    if (k === 'and') {
      if (Array.isArray(cond)) {
        cond = cond.map(function(c) {
          return this.buildWhere(model, c);
        });
      }
      query.push(_.flatten(cond));
      delete query[k];
      return;
    }

    var spec = false;
    var options = null;
    if (cond && cond.constructor.name === 'Object') {
      options = cond.options;
      spec = Object.keys(cond)[0];
      cond = cond[spec];
    }

    k = `fields.${k}`;
    if (spec) {
      if (spec === 'between') {
        query[k] =  { gte: cond[0], lte: cond[1] };
      } else if (spec === 'inq') {
        query[k] = { in: cond };
      } else if (spec === 'like') {
        query[k] = { match: cond };
      } else if (spec === 'neq') {
        query[k] = { ne: cond };
      } else {
        // unsupported loopback specs: maxDistance, nlike, ilike, nilike, regexp
        query[k] = {};
        query[k][spec] = cond;
      }
    } else {
      if (cond === null) {
        // null cannot be handled by contentful
      } else {
        query[k] = cond;
      }
    }
  });
  return query;
};

function buildOrder(model, order) {
  if (order) {
    var orders = [];
    var keys = order;
    if (typeof keys === 'string') {
      keys = keys.split(',');
    }
    for (var index = 0, len = keys.length; index < len; index++) {
      var m = keys[index].match(/\s+(A|DE)SC$/);
      var key = keys[index];
      key = key.replace(/\s+(A|DE)SC$/, '').trim();
      if (m && m[1] === 'DE') {
        orders.push(`-${key}`);
      } else {
        orders.push(`${key}`);
      }
    }
    return orders.join(',');
  }
}

