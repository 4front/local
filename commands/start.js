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
var memoryCache = require('memory-cache-stream');
var redis = require('redis');
var AWS = require('aws-sdk');
var cookieParser = require('cookie-parser');

require('redis-streams')(redis);

var s3Options = {
  bucket: "deployments",
  // These values don't actually matter for the fake S3 server
  accessKeyId: "4front",
  secretAccessKey: "4front",
  endpoint: "localhost:4658",
  sslEnabled: false,
  s3ForcePathStyle: true
}

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
    // All 4front config settings are set on the app settings object
    _.extend(app.settings, {
      // The virtual host is the domain that the platform runs, i.e. "myapphost.com"
      virtualHost: program.virtualHost,
      pluginsDir: path.resolve(__dirname, "../plugins"),
      localInstance: true,
      jwtTokenSecret: program.jwtTokenSecret,
      defaultVirtualEnvironment: 'production',
      // Normally this would be an absolute S3 url or a CDN whose origin is set to
      // the S3 bucket, but for 4front local just serving static assets out of
      // the same Express app.
      staticAssetPath: '/deployments/'
    });
    // other settings: sessionUserKey


    app.settings.database = new DynamoDb({
      // Leave these values as-is since they are the same values
      // used by the create-test-tables script.
      region: 'us-west-2',
      accessKeyId: '4front',
      secretAccessKey: '4front',

      // By default DynamoDbLocal runs on port 8000. It is possible to override
      // that with the -port option passed in the dynamo startup command or to the brew command.
      // http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Tools.DynamoDBLocal.html
      endpoint: 'http://localhost:8000',
      tablePrefix: '4front_',

      // Used to encrypt/decrypt sensitive values. Currently used for environment variables that
      // were specified as enrypted.
      cryptoPassword: '4front_crypto_password'
    });

    // Assuming redis is listening on default port
    // app.settings.cache = memoryCache();
    app.settings.cache = redis.createClient();

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

    app.settings.deployments = new S3Deployments(s3Options);

    app.settings.logger = require('4front-logger')({
      logger: '4front-logger',
      levels: {
        error: process.stderr,
        warn: process.stderr
      }
    });

    // Static assets. Can be cached for a long time since every asset is
    // fingerprinted with versionId.
    app.get('/deployments/:appId/:versionId/*', function(req, res, next) {
      var filePath = req.params[0];

      var readStream = app.settings.deployments.readFileStream(
        req.params.appId, req.params.versionId, filePath);

      readStream.on('missing', function() {
        return res.status(404).send("Page not found");
      });

      res.set('Content-Encoding', 'gzip');
      res.set('Cache-Control', 'max-age=' + (60 * 60 * 24 * 30));
      readStream.pipe(res);
    });

    app.use(app.settings.logger.request());

    app.use(cookieParser());

    // The virtual app host
    app.use(require('4front-apphost')());

    app.get('/', function(req, res) {
      res.send("4front Local Platform");
    });

    app.use("/api", require('4front-api')({
      verifyJwtSignature: false
    }));

    app.use("/portal", require('4front-portal')({
      basePath: '/portal',
      apiUrl: '/api',
      localInstance: true
    }));

    // app.use('/debug', require('4front-debug'));
    // app.use('/debug', function(req, res, next) {
    //   res.json(app.settings.cache.keys);
    // });

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
        .setDirectory(path.resolve(__dirname, '../'))
        .run(cb);
    },
    // function(cb) {
    //   // Ensure the bucket exists
    //   var bucket = s3Options.bucket;
    //   var s3 = new AWS.S3(_.omit(s3Options, 'bucket'));
    //   s3.createBucket({ACL: 'public-read', Bucket: bucket}, function(err) {
    //   	if (err && err.code !== 'BucketAlreadyExists')
    //   		return cb(err);
    //
    //   	cb();
    //   });
    // },
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
