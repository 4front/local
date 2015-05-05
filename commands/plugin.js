var npm = require('npm');
var path = require('path');
var debug = require('debug')('4front:local:plugin');

// Command to install a plugin
module.exports = function(program, done) {
  // Run npm install to a specific directory
  debug("installing plugin %s from npm", program.package);
  npm.load(function(err) {
    if (err) return done(err);

    npm.commands.install(path.resolve(__dirname, '../plugins'), [program.package], function(err) {
      if (err) return done(err);

      done();
    });
  })
};
