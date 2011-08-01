var http     = require("http"),
    util     = require("util"),
    fs       = require("fs"),
    sys      = require("sys"),
    parseUrl = require('url').parse,
    io       = require("socket.io"),
    redis    = require("redis"),
    und      = require("underscore");

/*
 * Redis configuration
 */
var redisPort,
    redisHost,
    redisPwd,
    redisUri,
    redisDb = process.env.REDIS_DB || 0;

if (process.env.REDISTOGO_URL) {
    redisUri  = parseUrl(process.env.REDISTOGO_URL);
    redisPwd  = redisUri.auth.split(':')[1];
    redisHost = redisUri.hostname;
    redisPort = redisUri.port;
} else {
    redisPort = process.env.REDIS_PORT;
    redisHost = process.env.REDIS_HOST;
}

var redisClient = redis.createClient(redisPort, redisHost),
    subscribeRedisClient = redis.createClient(redisPort, redisHost);

if (redisPwd) {
    redisClient.auth(redisPwd);
    subscribeRedisClient.auth(redisPwd);
}

/*
 * Server port
 */
var serverPort = process.env.PORT || 8080;

/*
 * Send 404 Not Found
 */
var send404 = function (res) {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.end("404 Not Found");
};

/*
 * Return first (probably random) key
 * Used to retrieve root key from deserialized JSON messages
 */
var firstKey = function (obj) {
    for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
            return k;
        }
    }
};

var Chat = function (id, token) {
    this.userAuthenticationKey = "chat:" + id + ":token:" + token;
    this.sessionsKey = "chat:" + id + ":sessions";
    this.channel = "chat:" + id;
};

Chat.prototype.authenticationSuccessedMessage = { type: "chat.authentication", status: "OK" };
Chat.prototype.authenticationFailedMessage = { type: "chat.authentication", status: "error", text: "Invalid ID or token" };

var server = http.createServer(function (req, res) {
    send404(res);
});

var socket = io.listen(server);
server.listen(serverPort);
util.log("Server started on port " + serverPort);

var PGS = {
    initialize: function () {
        PGS.username = process.env.PGS_USERNAME || "node";
        PGS.password = process.env.PGS_PASSWORD || "secret";
        PGS.host     = process.env.PGS_HOST     || "localhost";
        PGS.port     = process.env.PGS_PORT     || 3000;
    },

    auth_header: function () {
        return "Basic " + new Buffer(PGS.username + ":" + PGS.password).toString("base64");
    },

    node_supervision_member_path: function (supervisionId, memberId) {
        return "/node/supervisions/" + supervisionId + "/members/" + memberId;
    },

    request: function (path, method) {
        var options = {
            host: PGS.host,
            port: PGS.port,
            path: path,
            method: method,
            headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": PGS.auth_header()}
        },
        req = http.request(options, function (res) {
            res.setEncoding('utf8');
        });

        req.on('error', function (e) {
            console.log('problem with request: ' + e.message);
        });

        req.end();
    }
};

/*
 * Call callback for each session from Redis hash
 */
var eachSession = function (key, callback) {
    var sessionsKey = key + ":sessions";
    redisClient.hgetall(sessionsKey, function (err, replies) {
        und.each(replies, function(sessionId, userId) {
            var client = socket.clients[sessionId];
            if (client) {
                callback.call(client, client);
            } else {
                redisClient.hdel(sessionsKey, userId);
            }
        });
    });
};

var initializeClientConnections = function () {
    var supervisionStatusTimeout;
    socket.on('connection', function (client) {
        client.on("message", function (message) {
            /**
             * CHAT
             *  - authenticate
             *    message format: { type: "chat.authenticate", chatRoomId: <id>, userId: <userId>, token: <token> }
             */
            if (message.type.search(/^chat\./) === 0) {
                // on authenticate
                if (message.type === "chat.authenticate") {
                    var chatRoomId = message.data.chatRoomId,
                        token = message.data.token,
                        chat = new Chat(chatRoomId, token);
                    redisClient.get(chat.userAuthenticationKey, function (err, userId) {
                        if (userId) {

                            util.log("[chat] User:" + userId + " authenticated for chat:" + chatRoomId + " sessionId:" + client.sessionId);
                            client.send(chat.authenticationSuccessedMessage);

                            // Hash of chat session, contains: {userId: sessionId}
                            redisClient.hset(chat.sessionsKey, userId, client.sessionId);

                            redisClient.hkeys(chat.sessionsKey, function (err, resp) {
                                redisClient.publish(chat.channel, JSON.stringify({chat_presence: {user_ids: resp, user_id: userId, status: "enter"}}));
                            });

                            client.on("disconnect", function () {
                                // Remove user from chat session after 30 seconds
                                redisClient.hdel(chat.sessionsKey, userId);

                                setTimeout(function () {
                                    redisClient.hkeys(chat.sessionsKey, function (err, resp) {
                                        if (!und.include(resp, userId)) {
                                            redisClient.publish(chat.channel, JSON.stringify({chat_presence: {user_ids: resp, user_id: userId, status: "exit"}}));
                                        }
                                    });
                                }, 30000);
                            });
                        } else {
                            util.log("[chat] Invalid token:" + token + " for chat:" + chatRoomId);
                            client.send(chat.authenticationFailedMessage);
                        }
                    });
                }
            }
            /*
             * SUPERVISION SESSION
             *  - authenticate
             *    message format: { type: "supervision.authenticate", supervisionId: <id>, userId: <userId>, token: <token> }
             */
            if (message.type.search(/^supervision\./) === 0) {
                var supervisionId = message.data.supervisionId;
                // on authenticate
                if (message.type === "supervision.authenticate") {
                    var userId = String(message.data.userId),
                        token = message.data.token,
                        userAuthenticationKey = "supervision:" + supervisionId + ":users:" + userId + ":token:" + token,
                        supervisionSessionsKey = "supervision:" + supervisionId + ":sessions";

                    redisClient.exists(userAuthenticationKey, function (err, resp) {
                        if (resp) {
                            console.log("User authenticated for supervision: " + userId + " sessionId: " + client.sessionId);
                            client.send({ type: "supervision.authentication", status: "OK" });
                            redisClient.hset(supervisionSessionsKey, userId, client.sessionId);

                            client.on("disconnect", function () {
                                redisClient.hdel("supervision:" + supervisionId + ":sessions", userId);

                                // remove member from supervision after 30 seconds
                                supervisionStatusTimeout = setTimeout(function () {
                                    redisClient.hkeys(supervisionSessionsKey, function (err, resp) {
                                        if (!und.include(resp, userId)) {
                                            PGS.request(PGS.node_supervision_member_path(supervisionId, userId), "DELETE");
                                        }
                                    });
                                }, 30000);
                            });
                        } else {
                            console.log("User invalid for supervision: " + userId);
                            client.send({ type: "supervision.authentication", status: "error", text: "Invalid id or token" });
                        }
                    });
                } else if (message.type === "supervision.member_idle_status") {
                    if (message.data.status === "away") {
                        PGS.request(PGS.node_supervision_member_path(supervisionId, message.data.userId), "DELETE");
                        // hack for not sending second request on client disconnect
                        // TODO: find a better way to do this
                        setTimeout(function() {
                            clearTimeout(supervisionStatusTimeout);
                        }, 2000);
                    }
                    redisClient.publish("supervision:" + supervisionId, JSON.stringify({idle_status_changed: message.data}));
                }
            }
        });
    });
};

var subscribeToChannels = function () {
    subscribeRedisClient.on("pmessage", function (pattern, channel, pmessage) {
        var decodedMessage = JSON.parse(pmessage),
            rootKey = firstKey(decodedMessage),
            type;
        switch (pattern) {
        case "supervision:*":
            type = "supervision";
            break;
        case "chat:*":
            type = "chat";
            break;
        case "group:*":
            type = "group";
            break;
        default:
            util.log("Unknown message type: " + rootKey);
            return;
        }
        decodedMessage.type = type + "." + rootKey;
        util.log("[" + type + "] pmessage: " + decodedMessage.type);
        eachSession(channel, function (client) {
            util.log("[" + type + "] Sending message to client " + client.sessionId);
            client.send(decodedMessage);
        });
    });
    subscribeRedisClient.psubscribe("supervision:*");
    subscribeRedisClient.psubscribe("chat:*");
    subscribeRedisClient.psubscribe("group:*");
};

subscribeToChannels();

// Only select DB for redisClient, as subscribeRedisClient can work without selecting database,
// pub/sub works across db's
redisClient.select(redisDb, function (err, resp) {
    if (!err) {
        util.log("Initializing client connection support");
        initializeClientConnections();
    } else {
        util.log("[ERROR] Could not select redisDb: " + redisDb + ", exiting");
        process.exit(-1);
    }
});

var pingRedisClient = function () {
    redisClient.ping();
};
setInterval(pingRedisClient, 10000);

/*
 * Setup configuration to connect to rails application
 */
PGS.initialize();
