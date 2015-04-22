var S3rver = require('s3rver');
var async = require('async');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var forever = require('forever-monitor');
var ChildProcess = require('child_process');

module.exports = function(program, done) {
  debugger;
  initialize(program, function(err) {
    if (err) return done(err);

    debugger;
    var child = new (forever.Monitor)(path.resolve(__dirname, '../lib/platform.js'), {
      max: 3,
      silent: false,
      args: [JSON.stringify(program)]
    });

    child.on('exit', function () {
      console.log('4front platform has exited after 3 restarts');
      return done();
    });

    child.start();
  });
};

function initialize(program, callback) {
  async.parallel([
    function(cb) {
      // Start the fake S3 server
      var s3rver = new S3rver();
      s3rver.setHostname('localhost')
        .setPort(4658)
        .setDirectory(program.deploymentsDir)
        .run(cb);
    },
    function(cb) {
      // Not worrying about checking on windows for the time being.
      if (process.platform.indexOf('win32') !== -1)
        return cb();

      // Verify that DynamoDBLocal and redis-server are both running
      ChildProcess.exec('ps -A', function( err, stdout, stderr) {
        if (err || stderr)
          return cb(err || new Error(stderr.toString()));

        var dump = stdout.toString();
        if (dump.indexOf('DynamoDBLocal') === -1)
          return cb(new Error("DynamoDBLocal does not appear to be running."));

        if (dump.indexOf('redis-server') === -1)
          return cb(new Error("redis-server does not appear to be running"));

        cb();
      });
    }
  ], callback);
}
