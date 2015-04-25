var express = require('express');
var http = require('http');
var S3rver = require('s3rver');
var async = require('async');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('4front:local:start');
var _ = require('lodash');
var ChildProcess = require('child_process');
var DynamoDb = require('4front-dynamodb');
var S3Deployments = require('4front-s3-deployments');
var log = require('4front-logger');
var apphost = require('4front-apphost');
var memoryCache = require('memory-cache-stream');

module.exports = function(program, callback) {
  initialize(program, function(err) {
    if (err) return callback(err);

    startExpressApp(program, function(err, server) {
      if (err) return callback(err);

      callback(null, function() {
        server.stop();
      });
    });
  });
};

function startExpressApp(program, callback) {
  var app = express();

  try {
    // The virtual host is the domain that the platform runs, i.e. "myapphost.com"
    app.settings.virtualHost = program.virtualHost;
    app.settings.jwtTokenSecret = program.jwtTokenSecret;
    app.settings.localInstance = true;

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
    app.settings.cache = memoryCache();

    // For local development, just using a naive identity provider that
    // echos back the username. In a production deployment you would use
    // something like 4front-active-directory.
    app.settings.identityProvider = {
      name: 'local',
      authenticate: function(username, password, callback) {
        debug("authenticate user %s with local identity provider", username);
        callback(null, {
          userId: username,
          username: username
        });
      }
    };

    // Configure the login provider
    app.settings.login = require('4front-login')({
      database: app.settings.database,
      identityProvider: app.settings.identityProvider,
      jwtTokenSecret: program.jwtTokenSecret
    });

    app.settings.virtualAppRegistry = require('4front-app-registry')({
      cache: app.settings.cache,
      database: app.settings.database,
      virtualHost: app.settings.virtualHost
    });

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

    // Static assets. Can be cached for a long time since every asset is
    // fingerprinted with versionId.
    app.use('deployments', express.static(path.resolve(__dirname, "../deployments"), {
      maxAge: '30d'
    }));

    app.use(app.settings.logger.request());

    app.get('/', function(req, res) {
      res.send("4front Local Platform");
    });

    app.use("/api", require('4front-api')({
      verifyJwtSignature: false
    }));

    app.use("/portal", require('4front-portal')({
      basePath: '/portal',
      localInstance: true
    }));

    app.use(apphost.virtualAppLoader);
    app.use(apphost.devSandbox);
    app.use(apphost.virtualRouter);
    app.use(apphost.errorFallback);


    // Start the express server
    // Assuming that SSL cert is terminated upstream by something like Apache, Ngninx, or ELB,
    // so the node app only needs to listen over http.
    var server = http.createServer(app);
    return server.listen(program.port, function(err){
      if (err) return callback(err);

      app.settings.logger.info("4front platform running on port " + program.port);
      callback(null, server);
    });
  }
  catch (err) {
    callback(err);
  }
}

function initialize(program, callback) {
  async.parallel([
    // TODO: dig the virtual host and make sure it resolves to 127.0.0.1

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

        cb();
      });
    }
  ], callback);
}
