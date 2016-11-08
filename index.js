var Contentful = require('./lib/contentful');

exports.initialize = function initializeDataSource(dataSource, callback) {

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