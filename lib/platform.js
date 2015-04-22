var express = require('express');
var apphost = require('4front-apphost');
var http = require('http');
var log = require('4front-logger');
var async = require('async');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var DynamoDb = require('4front-dynamodb');
var S3Deployments = require('4front-s3-deployments')

debugger;
var program = JSON.parse(process.argv[2]);

var app = express();

// The virtual host is the domain that the platform runs, i.e. "myapphost.com"
app.settings.virtualHost = argv.virtualHost;

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

// Static assets. Can be cached for a long time since every asset is
// fingerprinted with versionId.
app.use('deployments', express.static(program.deploymentsDir, {
  maxAge: '30d'
}));

app.use("/api", require('4front-api'));
app.use("/portal", require('4front-portal'));

app.use(apphost.virtualAppLoader);
app.use(apphost.devSandbox);
app.use(apphost.virtualRouter);
app.use(apphost.errorFallback);

// Start the express server
// Assuming that SSL cert is terminated upstream by something like Apache, Ngninx, or ELB,
// so the node app only needs to listen over http.
http.createServer(app).listen(program.port, function(){
  app.settings.logger.info("4front platform running on port " + port);
});
