#!/usr/bin/env node

var program = require('commander');
var async = require('async');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var forever = require('forever-monitor');
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
	.option('--virtual-host [virtualHost]', "The virtual host")
  .option('--https', "Whether https is enabled on the virtual host")
  .option('--deployments-dir', "The directory where deployments should be stored.", path.resolve(__dirname, "../deployments"))
	.command('start')
	.description("Start the 4front platform")
	.action(require('../commands/start.js')(program, done));

program
  .option('--name [name]', "The name of the npm package of the plugin")
  .command('--install-plugin')
  .description('Install a middleware plugin')
  .action(require('../commands/plugin.js')(program, done));

program.parse(process.argv);
