const debug = require('debug')('loopback:connector:contentful');
const Connector = require('loopback-connector').Connector;
const _ = require('lodash');
const contentful = require('contentful');
const management = require('contentful-management');

const mixinMigration = require('../migration');
const mixinDAO = require('./dao');

module.exports = class Contentful extends mixinDAO(mixinMigration(Connector)) {
  constructor(settings, dataSource) {
    super();
    Connector.call(this, 'contentful', settings);
    this.debug = settings.debug || debug.enabled;
    if (this.debug) {
      debug('Settings: %j', settings);
    }

    this.isRelational = false;
    this.settings = settings;
    this.dataSource = dataSource;

    this.clients = {
      delivery: null,
      management: null,
      preview: null,
    };

    this.contentful = {
      connected: false,
      space: null,
      contentTypes: {}, // {modelName: contentType, ...}
      locales: [],
    };
  }

  connect(cb) {
    if (this.contentful.connected) {
      process.nextTick(() => (cb && cb(null, this.contentful)));
    } else if (this.dataSource.connecting) {
      this.dataSource.once('connected', () => {
        process.nextTick(() => (cb && cb(null, this.clients)));
      });
    } else {
      if (!this.settings.spaceId) {
        return cb(new Error('spaceId is required'));
      }

      if (!this.settings.accessTokens) {
        return cb(new Error('accessTokens is required'));
      }

      if (typeof this.settings.accessTokens === 'string') {
        this.settings.accessTokens = { delivery: this.settings.accessTokens };
      }

      if (this.settings.accessTokens.management) {
        this.clients.management = management.createClient({
          accessToken: this.settings.accessTokens.management,
        });
      }

      if (this.settings.accessTokens.delivery) {
        this.clients.delivery = contentful.createClient({
          accessToken: this.settings.accessTokens.delivery,
          space: this.settings.spaceId,
        });
      }

      if (this.settings.accessTokens.preview) {
        this.clients.preview = contentful.createClient({
          accessToken: this.settings.accessTokens.preview,
          space: this.settings.spaceId,
          host: 'preview.contentful.com'
        })
      }

      let promise;
      if (this.clients.management) {
        promise = this.clients.management.getSpace(this.settings.spaceId)
          .then((space) => {
            if (this.debug) {
              debug(`Contentful connection is established: ${this.settings.spaceId}`);
            }
            this.contentful.space = space;
            return Promise.all([
              space.getContentTypes(),
              space.getLocales().then(response => response.toPlainObject().items),
            ]);
          });
      } else if (this.clients.delivery) {
        promise = Promise.all([
          this.clients.delivery.getContentTypes(),
          Promise.resolve([{
            default: true,
            code: this.settings.locale,
          }]),
        ]);
      }

      if (!promise) {
        return cb(new Error('accessTokens is required'));
      }

      promise.then(([contentTypes, locales]) => {
        this.contentful.connected = true;

        this.contentful.contentTypes = this.settings.uniqueBy === 'name' ?
          _.keyBy(contentTypes.items, 'name'):
          _.keyBy(contentTypes.items, 'sys.id');
        this.contentful.locales = locales;
        cb && cb(null, this.clients);
      })
        .catch((err) => {
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
};
