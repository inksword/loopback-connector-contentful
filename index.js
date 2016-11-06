var Contentful = require('./lib/contentful');

module.exports.initialize = function initializeDataSource(dataSource, callback) {
  if (!contentful) {
    return;
  }

  var s = dataSource.settings;

  dataSource.connector = new Contentful(s, dataSource);

  if (callback) {
    if (s.lazyConnect) {
      process.nextTick(function() {
        callback();
      });
    } else {
      dataSource.connector.connect(callback);
    }
  }
};