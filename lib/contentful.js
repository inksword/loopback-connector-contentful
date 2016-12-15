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
    this.locales = null;
    this.spaceMap = null;
  }

  connect(cb) {
    if (this.spaceMap) {
      process.nextTick(() => {
        cb && cb(null, this.spaceMap);
      });
    } else if (this.dataSource.connecting) {
      this.dataSource.once('connected', () => {
        process.nextTick(() => {
          cb && cb(null, this.spaceMap);
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

          var spaceIdMap = _.keyBy(this.spaceIds(), id => id);
          this.spaceMap = _
            .chain(spaces.items)
            .filter(space => !!spaceIdMap[space.sys.id])
            .keyBy('sys.id')
            .value();
          
          return Promise.all(_.map(_.values(this.spaceMap), space => 
            Promise.all([getContentTypes(space), getLocales(space)])
          ));
        })
        .then(contentTypesAndLocales => {
          _.forEach(contentTypesAndLocales, _.spread((contentTypes, locales) => {
            _.assign(this.contentTypes, contentTypes);
            _.assign(this.locales, locales);
          }));
          
          cb && cb(null, this.spaceMap);
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
