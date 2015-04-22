# 4front-local-template

![http://www.4front.io](https://s3-us-west-2.amazonaws.com/4front-media/4front-logo.png)

Template for running the 4front multi-tenant platform locally. Learn more at: [www.4front.io](http://www.4front.io)

## Prerequisites

### Dnsmasq
A common local development setup is to use [Dnsmasq](http://www.thekelleys.org.uk/dnsmasq/doc.html) to resolve any `.dev` HTTP request to the local IP `127.0.0.1`. Follow the simple steps outlined in the following article to install and configure Dnsmasq on OSX:

[Using Dnsmasq for local development on OS X](http://passingcuriosity.com/2013/dnsmasq-dev-osx/)

### Apache
Apache is used as a reverse proxy that sits in front of the 4front node app. It is used to translate incoming URLs in the form `*.mywebapps.dev` to the port where the node app is listening, i.e. `localhost:1903`. Apache comes pre-installed on OSX, but it is also possible to use Nginx.

### DynamoDBLocal
The production version of 4front is designed to run on AWS using DynamoDB as a metadata store. Fortunately for local development there exists [DynamoDbLocal](http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Tools.DynamoDBLocal.html). If you're on OSX, I recommend installing it with Homebrew using the command:

```
brew install dynamodb-local
```

Follow the instructions to automatically launch it upon startup with `launchctl`.

### Redis
Install [redis](http://redis.io/topics/quickstart). If you're on OSX, once again Homebrew is your friend: `brew install redis` and follow the `launchctl` instructions to launch on startup.

## Installation

### Clone Repo
Clone this repo (https://github.com/4front/local-template.git) locally. Then open a command prompt at the root of the repo and run:

```
npm install
```

### Create DynamoDB Tables
Run the following node script to create the 4front DynamoDB tables:

```
node ./node_modules/4front-dynamodb/scripts/create-local-tables.js
```

### Virtual App Host
Choose a top level hostname that will serve as the URL of your platform. For example: `mywebapps.dev`. Virtual apps deployed to the platform are accessed via a URL in the form: `appname.mywebapps.dev`.

### Configure Reverse Proxy
This step describes how to setup an [Apache vhost](http://httpd.apache.org/docs/2.2/vhosts/) that acts as the reverse proxy for all 4front requests. These instructions are specific to Apache, but if you prefer Nginx, this [Digital Ocean tutorial](https://www.digitalocean.com/community/tutorials/how-to-set-up-nginx-virtual-hosts-server-blocks-on-ubuntu-12-04-lts--3) is a good place to start.

First you'll need to ensure that Apache is setup to allow vhosts. Open the file `/etc/apache2/httpd.conf` and ensure the "Include /private..." line shown below is uncommented:

```
# Virtual hosts

Include /private/etc/apache2/extra/httpd-vhosts.conf
```

Also ensure the following line is uncommented:

```
LoadModule vhost_alias_module libexec/apache2/mod_vhost_alias.so
```

Now edit `/etc/apache2/extra/httpd-vhosts.conf` and insert the following block (making sure to change `ServerName` and `ServerAlias` to your virtual app host):

```xml
<VirtualHost *:80>
  RequestHeader set X-Forwarded-Proto "http"
  ServerName mywebapps.dev
  ServerAlias *.mywebapps.dev
  ProxyPreserveHost  on
  ProxyPass / http://localhost:1903/
  ProxyPassReverse / http://localhost:1903
</VirtualHost>
```
After saving your changes, restart Apache:

```
sudo apachectl restart
```

#### Enabling SSL
__Production 4front instances should always use SSL, but for local development, this step is optional.__

If you want to SSL enable the 4front platform, you'll need to create a self-signed certificate. Follow the steps described in this article:

[How to Create and Install an Apache Self Signed Certificate](https://www.sslshopper.com/article-how-to-create-and-install-an-apache-self-signed-certificate.html)

When OpenSSL prompts you for a common name, enter your virtual host name as a wildcard, i.e. `*.mywebapps.dev`. Once your certificate keys have been created, add an additional `VirtualHost` section to `/etc/apache2/extra/httpd-vhosts.conf` like so:

```
<VirtualHost *:443>
  RequestHeader set X-Forwarded-Proto "https"
  ServerName myapphost.dev
  ServerAlias *.mywebapps.dev
  ProxyPreserveHost  on
  ProxyPass / http://localhost:1903/
  ProxyPassReverse / http://localhost:1903
  SSLEngine on
  SSLCertificateFile "/etc/apache2/ssl/server.crt"
  SSLCertificateKeyFile "/etc/apache2/ssl/host.nopass.key"
</VirtualHost>
```

Once again, restart Apache:

```
$ sudo apachectl restart
```

### Starting the 4front Platform
Now you are ready to fire up the server:

```
$ FF_VIRTUAL_HOST=mywebapps.dev node app.js
```

You should be able to load the 4front portal in your browser at `http://mywebapps.dev/portal`. You'll also want to install the 4front CLI and add your new local instance as a profile:

```
$ npm install -g 4front-cli
$ 4front add-profile --name local --url http://mywebapps.dev
```
_If SSL was configured, you'd pass in https://mywebapps.dev_

Finally go ahead and create your first app!

```
$ 4front create-app
```

## License
Licensed under the Apache License, Version 2.0. See (http://www.apache.org/licenses/LICENSE-2.0).