# Peergroup Supervision node server #

Node server for [rails application](https://github.com/wolfgangihloff/peergroup)

## Development ##

Install [node.js](http://nodejs.org/).
You can use [Node Version Manger](https://github.com/creationix/nvm) for this.

Next install [Node Package Manager](http://npmjs.org/)

Install required packages:

```
npm install
```

Run node server:

```
node server.js
```

Tip: You can run node as root user (sudo node ...) or with `authbind` (authbind node ...), so socket.io could bind to low port to serve xml policy file for Flash.

## Test ##

To run specs from rails app you need to run node:

```
REDIS_DB=1 PGS_PORT=3666 node server.js
```

This task is available via rake:

```
rake spec_node
```

REDIS_DB should be number that you specified in config/redis.yml in rails app test group.

You can update node packages by changing versions in package.json file and running:

```
npm update
```

## Deploying ##

### Heroku ###

It's possible to run node server on heroku.

To have your own instance on heroku:

1. Install heroku client

  ```
  gem install heroku
  ```

2. Create application

  ```
  heroku create --stack cedar my-peergroup-node-app-name
  ```

3. Setup configuration variables

  ```
  heroku config:add PGS_HOST=example.com PGS_PORT=80 PGS_USERNAME=node PGS_PASSWORD=secret REDISTOGO_URL=redis.url
  ```

  * PGS\_HOST - address of rails application
  * PGS\_USERNAME/PGS\_PASSWORD - credentials for connecting to rails app
  * REDISTOGO\_URL - redis url taken from rails app

4. Deploy code

  ```
  git push heroku master
  ```

5. Run web process

  ```
  heroku ps:scale web=1
  ```

Refer to heroku [docs](http://devcenter.heroku.com/articles/node-js) for more informations.
