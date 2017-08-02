const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

const sysKeys = { id: 1, createdAt: 1, updatedAt: 1, publishedAt: 1 };

function buildFilter(model, idName, filter) {
  const query = {};

  _.assign(query, buildSelect(model, idName, filter.fields));
  _.assign(query, buildWhere(model, idName, filter.where));
  _.assign(query, buildOrder(model, idName, filter.order));

  if (filter.skip) {
    query.skip = filter.skip;
  }

  if (filter.limit) {
    query.limit = filter.limit;
  }
  return query;
}

function buildSelect(model, idName, fields) {
  const query = {};
  const keys = fields;
  if (keys && keys.length > 0) {
    query.select = _.map(keys, key => fieldName(key, idName));
  }
  return query;
}

function buildWhere(model, idName, where) {
  const query = {};
  if (where === null || (typeof where !== 'object')) {
    return query;
  }
  Object.keys(where).forEach((k) => {
    let cond = where[k];
    if (k === 'or' || k === 'nor') {
      // contentful search does not support or/nor operator
      return;
    }
    if (k === 'and') {
      if (Array.isArray(cond)) {
        cond = cond.map(function (c) {
          return this.buildWhere(model, c);
        });
      }
      query.push(_.flatten(cond));
      delete query[k];
      return;
    }

    let spec = false;
    let options = null;
    if (cond && cond.constructor.name === 'Object') {
      options = cond.options;
      spec = Object.keys(cond)[0];
      cond = cond[spec];
    }

    k = fieldName(k, idName);

    if (spec) {
      if (spec === 'between') {
        query[k] = { gte: cond[0], lte: cond[1] };
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
    } else if (cond === null) {
      // null cannot be handled by contentful
    } else {
      query[k] = cond;
    }
  });
  return query;
}

function buildOrder(model, idName, order) {
  const query = {};
  if (order) {
    const orders = [];
    let keys = order;

    if (typeof keys === 'string') {
      keys = keys.split(',');
    }
    for (let index = 0, len = keys.length; index < len; index++) {
      const m = keys[index].match(/\s+(A|DE)SC$/);
      let key = keys[index];
      key = key.replace(/\s+(A|DE)SC$/, '').trim();

      key = fieldName(key, idName);

      if (m && m[1] === 'DE') {
        orders.push(`-${key}`);
      } else {
        orders.push(`${key}`);
      }
    }
    query.order = orders.join(',');
  }
  return query;
}

function fieldName(name, idName) {
  let key = name;
  if (key === idName) {
    key = 'id';
  }

  if (sysKeys[key]) {
    return `sys.${key}`;
  }
  return `fields.${key}`;
}

module.exports.buildFilter = buildFilter;
module.exports.buildWhere = buildWhere;
