const contentful = require('contentful-management');
const Connector = require('loopback-connector').Connector;
const debug = require('debug')('loopback:connector:contentful');
const _ = require('lodash');

const mixinMigration = require('./migration');
const mixinDAO = require('./dao');

module.exports = class Contentful extends mixinDAO(mixinMigration(Connector)) {
  constructor (settings, dataSource) {
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
      });

      this.client.getSpaces()
        .then(spaces => {
          if (this.debug) {
            debug('Contentful connection is established: ' + this.settings.spaceId);
          }
          this.spaces = _.keyBy(spaces.items, 'sys.id');
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
}

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
