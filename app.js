var express = require('express');
var apphost = require('4front-apphost');
var http = require('http');
var log = require('4front-logger');
var S3rver = require('s3rver');
var async = require('async');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var DynamoDb = require('4front-dynamodb');
var S3Deployments = require('4front-s3-deployments')
var ChildProcess = require('child_process');

var app = express();

initialize(function(err) {
  if (err) {
    console.error("Could not start the 4front server. " + err.message);
    return process.exit();
  }

  try {
    // The virtual host is the domain that the platform runs, i.e. "myapphost.com"
    app.settings.virtualHost = process.env['FF_VIRTUAL_HOST'];

    app.settings.database = new DynamoDb({
      // Leave these values as-is since they are the same values
      // used by the create-test-tables script.
      region: 'us-west-2',
      accessKeyId: '4front',
      secretAccessKey: '4front',

      // By default DynamoDbLocal runs on port 8000. It is possible to override
      // that with the -port option passed in the dynamo startup command or to the brew command.
      // http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Tools.DynamoDBLocal.html
      endpoint: 'http://localhost:8000'
    });

    // Assuming redis is listening on default port
    app.settings.cache = require('redis').createClient(6379, '127.0.0.1');

    // For local development, just using a naive identity provider that
    // echos back the username. In a production deployment you would use
    // something like 4front-active-directory.
    app.settings.identityProvider = {
      name: 'local',
      login: function(username, password, callback) {
        callback({
          userId: username,
          username: username
        });
      }
    };

    app.settings.deployments = new S3Deployments({
  		bucket: "4front-deployments",
      // These values don't actually matter for the fake S3 server
  		accessKeyId: "123",
  		secretAccessKey: "abc",
  		endpoint: "localhost:4658",
  		sslEnabled: false,
  		s3ForcePathStyle: true
    });

    app.settings.logger = require('4front-logger')({
      logger: '4front-logger',
      levels: {
        error: process.stderr,
        warn: process.stderr
      }
    });

    app.use("/api", require('4front-api'));
    // app.use("/portal", require('4front-portal'));

    app.use(apphost.virtualAppLoader);
    app.use(apphost.devSandbox);
    app.use(apphost.virtualRouter);
    app.use(apphost.errorFallback);
  }
  catch (err) {
    console.error(err.stack);
    return process.exit();
  }

  // Start the express server
  // Assuming that SSL cert is terminated upstream by something like Apache, Ngninx, or ELB,
  // so the node app only needs to listen over http.
  var port = app.settings.port || process.env.PORT || '1903';
  http.createServer(app).listen(port, function(){
    app.settings.logger.info("4front platform running on port " + port);
  });
});

function initialize(callback) {
  // Verify environment variables
  var envVars = ['FF_VIRTUAL_HOST'];
  for (var i=0; i<envVars.length; i++) {
    if (!process.env[envVars[i]])
      return callback(new Error("Environment variable " + envVars[i] + " is not set."));
  }

  async.parallel([
    function(cb) {
      // Start the fake S3 server
      var s3rver = new S3rver();
      s3rver.setHostname('localhost')
        .setPort(4658)
        .setDirectory(process.env['FF_DEPLOYMENTS_DIR'] || path.join(__dirname, './deployments'))
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
