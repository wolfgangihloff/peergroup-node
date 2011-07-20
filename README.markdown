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

## Test ##

To run specs from rails app you need to run node:

```
REDIS_DB=1 PGS_PORT=3666 node server.js
```

REDIS_DB should be number that you specified in config/redis.yml in rails app test group.

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

PGS_HOST - address of rails application
PGS_USERNAME/PGS_PASSWORD - credentials for connecting to rails app
REDISTOGO_URL - redis url taken from rails app

4. Deploy code

```
git push heroku master
```

5. Run web process

```
heroku ps:scale web=1
```

Refer to heroku [docs](http://devcenter.heroku.com/articles/node-js) for more informations.
