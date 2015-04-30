#!/usr/bin/env node

var program = require('commander');
var async = require('async');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var updateNotifier = require('update-notifier');
var pkg = require('../package.json');

updateNotifier({
	packageName: pkg.name,
	packageVersion: pkg.version,
	updateCheckInterval: 1000 * 60 * 60 * 2 // Check for updates every 2 hours
}).notify();

function done(err) {
  if (err)
    console.error(err.stack);
  process.exit();
}

// Use commander to allow for multiple commands like run, install-plugin, etc.
program.version(pkg.version)
	.option('--debug', 'Emit debug messages')

program
	.option('--port [port]', "The port the process should run on", 1903)
	.option('--virtual-host [virtualHost]', "The virtual host", "4front.dev")
  .option('--https', "Whether https is enabled on the virtual host")
	.option('--jwt-token-secret [jwtTokenSecret]', 'The secret token used to generate JWT for authorization.', '4front_jwt_token_secret')
	.command('start')
	.description("Start the 4front platform")
	.action(runCommand('start'));

program
  .option('--name [name]', "The name of the npm package of the plugin")
  .command('--install-plugin')
  .description('Install a middleware plugin')
  .action(runCommand('plugin'));

program.parse(process.argv);

function runCommand(command) {
	return function() {
		require('../commands/' + command)(program, function(err, done) {
	    if (err) {
	      if (err instanceof Error)
	        console.error(err.stack || err.toString());
	      else if (_.isString(err))
					console.error(err);

	      process.exit();
	    }

	    if (!_.isFunction(done))
	      process.exit();
	    else {
	      // Wait for SIGINT to cleanup the command
	      process.on('exit', function() {
	        done();
	      });
	    }
	  });
	};
}
