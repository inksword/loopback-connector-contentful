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

    this.isRelational = false;
    this.settings = settings;
    this.dataSource = dataSource;

    this.contentful = {
      connected: false,
      management: {
        client: null,
        spaceMap: null, // {spaceId: space, ...}
        contentTypes: {}, // {spaceId: {modelName: contentType, ...}, ...}
        locales: null // {spaceId: [locale, ...], ...}
      },
      delivery: {
        clientMap: {} //{spaceId: client, ...}
      }
    };
  }

  connect(cb) {
    if (this.contentful.connected) {
      process.nextTick(() => {
        cb && cb(null, this.contentful);
      });
    } else if (this.dataSource.connecting) {
      this.dataSource.once('connected', () => {
        process.nextTick(() => {
          cb && cb(null, this.spaceMap);
        });
      });
    } else {
      this.managementClient().getSpaces()
        .then(spaces => {
          if (this.debug) {
            debug('Contentful connection is established: ' + this.settings.spaceId);
          }

          this.contentful.connected = true;
          var spaceMap = this.mapSpaces(spaces);

          return Promise.all(_.map(_.values(spaceMap), space => 
            Promise.all([getContentTypes(space), getLocales(space)])
          ));
        })
        .then(contentTypesAndLocales => {
          _.forEach(contentTypesAndLocales, _.spread((contentTypes, locales) => {
            _.assign(this.contentful.management.contentTypes, contentTypes);
            _.assign(this.contentful.management.locales, locales);
          }));
          
          cb && cb(null, this.managementClient());
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
