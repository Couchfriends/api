/**
 * Websocket server for Couchfriends.
 * Copyright (c) 2015 Mathieu de Ruiter (www.couchfriends.com / www.fellicht.nl)
 */
// http://stackoverflow.com/a/11386493/4071949
Object.defineProperty(global, '__stack', {
    get: function(){
        var orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function(_, stack){ return stack; };
        var err = new Error;
        Error.captureStackTrace(err, arguments.callee);
        var stack = err.stack;
        Error.prepareStackTrace = orig;
        return stack;
    }
});

Object.defineProperty(global, '__LINE__', {
    get: function(){
        return __stack[1].getLineNumber();
    }
});
var _ = require('underscore');
var WebSocketServer = require("websocket").server;
var http = require("http");
var mysql = require("mysql");
var fs = require('fs');

process.on('uncaughtException', function (err) {
    writeError(err);
});

function writeError(msg) {
    var dateNow = new Date();
    msg = dateNow.getFullYear() + '-' + dateNow.getMonth() + '-' + dateNow.getDate() + ' ' + dateNow.getHours() + ':' + dateNow.getMinutes() + ':' + dateNow.getSeconds() + ' - ' + msg;
    fs.appendFile("error.log", msg + "\r\n", function (err) {
    });
}

/**
 * Database connections
 */
//var db = mysql.createConnection({
//    host: 'couchfriends.com',
//    user: 'couchfrien_ws',
//    password: 'UxvjH4XC',
//    database: 'couchfrien_site'
//});
var pool = mysql.createPool({
    host: 'couchfriends.com',
    user: 'couchfrien_ws',
    password: 'UxvjH4XC',
    database: 'couchfrien_site'
});

/**
 * List with all connected clients
 * @type {Array}
 * Each client exists of the following keys:
 * @param string id The unique identifer of the client
 * @param type host|client|spectator Either host, spectator (host with only read) or client (controller/player that joined)
 * @param color string the unique color in hex for the player. Might be changed during gameplay
 * @param connection the connection object for sending and receiving data
 * @param game the current game object
 */
var clients = [];

/**
 * List with all active games. Games automatically will close when there are no more active players
 * @type {Array}
 * Each game has the following keys:
 * @param code string a unique randomly generated code that players can use to join
 * @param object host the client that hosts the game
 * @param array clients a list with clients that joined
 * @param array spectators a list with clients that are spectators (mostly hosts with read-only access)
 */
var games = [];

/**
 * Webserver and websocket initial
 */
var server = http.createServer(function (request, response) {
});
server.listen(80, function () {
});
var wsServer = new WebSocketServer({
    httpServer: server
});

/**
 * Adds a new client to the server and allow incoming messages for this client.
 * @todo use request.origin (http://127.0.0.1) as a sort of check
 */
wsServer.on("request", function (request) {
    var clientIp = request.remoteAddress;
    var client = {
        id: 0, // connection id, nothing to do with user or profile id
        playId: 0, // The current `plays`.`id` if the client joined a game
        userId: 0, // The id of the user. Updated from `connections` table
        profileId: 0,
        ip: clientIp,
        name: 'Player ' + (clients.length + 1),
        type: '',
        color: '',
        requests: 0,
        requestTime: new Date().getTime() / 1000,
        achievements: [], // List of keys that have been unlocked for this player So you don't see double achievements for guests
        connection: {},
        game: {}
    };

    pool.getConnection(function(err, connection) {
        if (err != null) {
            writeError(__LINE__ +' '+ err);
            return false;
        }
        connection.query('INSERT INTO `connections` SET `ip` = ?', [clientIp], function (err, result, fields) {
            if (err != null) {
                writeError(__LINE__ +' '+ err);
                connection.release();
                return false;
            }
            client.id = result.insertId;
            // connections property is deprecated. Use getConnections() method
            client.connection = request.accept(null, request.origin);
            client.connection.client = client;
            client.connection.on("message", function (message) {
                var message = JSON.parse(message.utf8Data);
                parseClientMessage(this.client, message);
            });
            client.connection.on("close", function (connection) {
                disconnectClient(this.client);
            });
            clients.push(client);
            connection.release();
        });
    });

});

/**
 * Disconnect client from the server and remove it from the clients array.
 * @param client object
 */
function disconnectClient(client) {

    // Add disconnect time
    pool.getConnection(function(err, connection) {
        if (err != null) {
            writeError(__LINE__ +' '+ err);
            return false;
        }
        connection.query('UPDATE `connections` SET `disconnected` = NOW() WHERE `id` = ?', [client.id], function (err) {
            if (err != null) {
                writeError(__LINE__ + ' ' + err);
            }
            connection.release();
        });
    });
    if (client.type == 'host') {
        removeGame(client.game);
    }
    disconnectClientFromGame(client);
    clients.splice(_.indexOf(clients, client, true), 1);

}

/**
 * Removes a client from a game and send a request to the server and client
 * @param client
 */
function disconnectClientFromGame(client) {

    if (client.game != null && client.game.host != null) {
        var dataJson = {
            topic: 'player',
            action: 'left',
            data: {
                id: client.id,
                name: client.name
            }
        };
        client.game.host.connection.send(JSON.stringify(dataJson));
    }

    if (client.playId != 0) {
        stopLoggingPlayer(client.playId);
    }
    client.playId = 0;
    client.game = {};
}

function stopLoggingPlayer(playId) {
    pool.getConnection(function(err, connection) {
        if (err != null) {
            writeError(__LINE__ +' '+ err);
            connection.release();
            return false;
        }
        connection.query('UPDATE `plays` SET `disconnected` = NOW() WHERE `id` = ?', [playId], function (err) {
            if (err != null) {
                writeError(__LINE__ + ' ' + err);
            }
            connection.release();
        });
    });
}

/**
 * Removes a game from the list. It also removes the generated code for that game so a unique code is available again.
 * @param game object the game object
 */
function removeGame(game) {

    _.each(game.clients, function (client) {
        disconnectClientFromGame(client);
        var dataJson = {
            topic: 'game',
            action: 'disconnect'
        };
        client.connection.send(JSON.stringify(dataJson));
    });

    _uniqueGameCodes.splice(_.indexOf(_uniqueGameCodes, game.code, true), 1);
    games.splice(_.indexOf(games, game, true), 1);

}

/**
 * Parses a messaged received from a client
 * @param client object the client that sent the message
 * @param message object the json parsed message. Message has at least the following keys:
 * topic string the topic of the message. E.g. identify
 *
 * @returns {boolean}
 */
function parseClientMessage(client, message) {
    var defaultMessage = {
        topic: '',
        action: '',
        data: {}
    };
    for (var key in defaultMessage) {
        if (message[key] == null) {
            message[key] = defaultMessage[key];
        }
    }
    if (message.topic == '') {
        return false;
    }

    // @todo the couchfriends controller should not be limited
    if (message.topic != 'player') {
        client.requests++;
        if (client.requests > 60) {
            var currentRequest = new Date().getTime() / 1000;
            var timeElapsed = currentRequest - client.requestTime;
            if (timeElapsed < 60) {
                // Maximum reached. Send error
                // @todo
                console.log('Client is spamming more than 60 messages per minute.');
                console.log(message);
            }
            else {
                client.requests -= timeElapsed;
                if (client.requests < 1) {
                    client.requests = 1;
                }
            }
        }
    }

    var data = message.data;

    switch (message.topic) {
        case 'game':
            if (message.action == 'host') {
                disconnectClientFromGame(client);
                var game = {};
                game.id = 0;
                if (data.sessionKey != null) {
                    pool.getConnection(function(err, connection) {
                        if (err != null) {
                            writeError(__LINE__ +' '+ err);
                            connection.release();
                            return false;
                        }
                        connection.query('SELECT `id`, ? as `player_id` FROM `games` WHERE `session_key` = ? LIMIT 1', [client.id, data.sessionKey], function (err, rows, fields) {
                            if (err != null) {
                                writeError(__LINE__ +' '+ err);
                                connection.release();
                                return false;
                            }
                            if (rows[0] != null && rows[0].id != null) {
                                var player = findPlayerById(rows[0].player_id);
                                if (player.game != null) {
                                    player.game.id = rows[0].id;
                                }
                            }
                            connection.release();
                        });
                    });
                }
                game.code = _generateCode(2);
                game.host = client;
                game.clients = [];
                game.spectators = [];
                client.game = game;
                client.type = 'host';
                games.push(game);
                var dataJson = {
                    topic: 'game',
                    action: 'start',
                    data: {
                        type: 'host',
                        code: game.code
                    }
                };
                client.connection.send(JSON.stringify(dataJson));
            }
            if (message.action == 'achievementUnlock') {
                if (data.key == null || data.playerId == null) {
                    return false;
                }
                var player = findPlayerById(data.playerId);
                if (player == false || player.game == null || player.game.id == 0) {
                    return false;
                }

                if (player.profileId == 0) {
                    // It's a guest, just show the achievement
                    if (client.achievements.indexOf(player.id + '_' + data.key) >= 0) {
                        return false;
                    }
                    client.achievements.push(player.id + '_' + data.key);
                    pool.getConnection(function(err, connection) {
                        if (err != null) {
                            writeError(__LINE__ + ' ' + err);
                            connection.release();
                            return false;
                        }
                        connection.query('SELECT `achievements`.`game_id`, `achievements`.`name`, `achievements`.`image`' +
                            '   FROM' +
                            '       `achievements`' +
                            '   WHERE' +
                            '   `achievements`.`key` = ? AND' +
                            '   `achievements`.`game_id` = ?' +
                            '   LIMIT 1', [data.key, player.game.id], function (err, rows, fields) {
                            if (err != null) {
                                writeError(__LINE__ + ' ' + err);
                                return false;
                            }
                            if (rows[0] == null || rows[0].name == null) {
                                return false;
                            }

                            var dataJson = {
                                topic: 'game',
                                action: 'achievementUnlock',
                                data: {
                                    name: rows[0].name,
                                    image: 'http://www.couchfriends.com/assets/achievements/' + rows[0].game_id + '/' + rows[0].image
                                }
                            };
                            client.connection.send(JSON.stringify(dataJson));
                            // Send to players phone, too
                            player.connection.send(JSON.stringify(dataJson));

                            connection.release();

                        });
                    });
                    return false;
                }

                pool.getConnection(function(err, connection) {
                    if (err != null) {
                        writeError(__LINE__ + ' ' + err);
                        connection.release();
                        return false;
                    }
                    connection.query('SELECT `achievements_profiles`.`id` as `hasAchievement`, `achievements`.`id`, `achievements`.`game_id`, `achievements`.`name`, `achievements`.`image`' +
                        '   FROM' +
                        '       `achievements`' +
                        '   INNER JOIN' +
                        '       `games` ON `games`.`id` = `achievements`.`game_id`' +
                        '   LEFT JOIN' +
                        '       `achievements_profiles` ON `achievements_profiles`.`achievement_id` = `achievements`.`id` AND `achievements_profiles`.`profile_id` = ?' +
                        '   WHERE' +
                        '   `achievements`.`key` = ? AND' +
                        '   `achievements`.`game_id` = ?' +
                        '   LIMIT 1', [player.profileId, data.key, player.game.id], function (err, rows, fields) {
                        if (err != null) {
                            writeError(__LINE__ + ' ' + err);
                            connection.release();
                            return false;
                        }
                        if (rows[0] == null || rows[0].id == null || rows[0].hasAchievement != null) {
                            connection.release();
                            return false;
                        }
                        connection.query('INSERT INTO `achievements_profiles` SET `profile_id` = ?, `achievement_id` = ?, `created` = NOW()', [player.profileId, rows[0].id], function (err, result, fields) {
                            if (err != null) {
                                writeError(__LINE__ + ' ' + err);
                                connection.release();
                                return false;
                            }
                            if (result.insertId != null) {
                                // @todo not sure row is available here. Should also send sound to players device
                                var dataJson = {
                                    topic: 'game',
                                    action: 'achievementUnlock',
                                    data: {
                                        name: rows[0].name,
                                        image: 'http://www.couchfriends.com/assets/achievements/' + rows[0].game_id + '/' + rows[0].image
                                    }
                                };
                                client.connection.send(JSON.stringify(dataJson));
                                player.connection.send(JSON.stringify(dataJson));
                            }
                            connection.release();
                        });
                    });
                });
            }
            break;
        case 'player':
            if (message.action == 'identify') {
                var identifyData = {};
                identifyData.id = data.id;
                if (data.name != null && data.name != '') {
                    identifyData.name = data.name;
                    if (client.type != 'host') {
                        client.name = data.name;
                    }
                }
                if (data.color != null && data.color != '') {
                    identifyData.color = data.color;
                    if (client.type != 'host') {
                        client.color = data.color;
                    }
                }

                if (data.sessionKey != null && data.sessionKey != '') {

                    pool.getConnection(function(err, connection) {
                        if (err != null) {
                            writeError(__LINE__ + ' ' + err);
                            connection.release();
                            return false;
                        }
                        connection.query('SELECT ? as `player_id`, `users`.`id` as `user_id`, `profiles`.`id` as `profile_id` FROM `users` INNER JOIN `profiles` ON `profiles`.`user_id` = `users`.`id` WHERE `users`.`session_key` = ? LIMIT 1', [client.id, data.sessionKey], function (err, rows, fields) {
                            if (err != null) {
                                writeError(__LINE__ + ' ' + err);
                                connection.release();
                                return false;
                            }
                            if (rows[0] != null && rows[0].user_id != null) {
                                connection.query('UPDATE `connections` SET `user_id` = ? WHERE `id` = ?', [rows[0].user_id, rows[0].player_id], function (err, result, fields) {
                                    if (err != null) {
                                        writeError(__LINE__ + ' ' + err);
                                        connection.release();
                                        return false;
                                    }
                                });
                                var playerClient = findPlayerById(rows[0].player_id);
                                if (playerClient != false) {
                                    playerClient.userId = rows[0].user_id;
                                    playerClient.profileId = rows[0].profile_id;
                                }
                            }
                            connection.release();
                        });
                    });
                }

                // @todo might move this to game.host instead of player.host?
                if (client.type == 'host') {
                    // The host changed the name / color of the player. Send it to the player.
                    var playerClient = findPlayerById(data.id);
                    if (playerClient != false) {
                        var dataJson = {
                            topic: 'player',
                            action: 'identify',
                            data: identifyData
                        };
                        playerClient.connection.send(JSON.stringify(dataJson));
                    }
                }
                else if (client.game != null && client.game.host != null) {
                    var dataJson = {
                        topic: 'player',
                        action: 'identify',
                        data: identifyData
                    };
                    client.game.host.connection.send(JSON.stringify(dataJson));
                }
            }
            else if (message.action == 'join') {
                disconnectClientFromGame(client);
                // Get game by code?
                if (data.code == null) {
                    var dataJson = {
                        topic: 'error',
                        data: {
                            topic: 'player',
                            action: 'join',
                            message: 'Game code not found in request.'
                        }
                    };
                    client.connection.send(JSON.stringify(dataJson));
                    return false;
                }
                // then join
                var game = findGameByCode(data.code);
                if (game == false) {
                    var dataJson = {
                        topic: 'error',
                        data: {
                            topic: 'player',
                            action: 'join',
                            message: 'Game with given code not found.'
                        }
                    };
                    client.connection.send(JSON.stringify(dataJson));
                    return false;
                }
                game.clients.push(client);
                if (game.id != 0) {
                    pool.getConnection(function (err, connection) {
                        if (err != null) {
                            writeError(__LINE__ + ' ' + err);
                            connection.release();
                            return false;
                        }
                        connection.query('INSERT INTO `plays` SET `user_id` = ?, `game_id` = ?, `created` = NOW()', [client.userId, game.id], function (err, result, fields) {

                            if (err != null) {
                                writeError(__LINE__ + ' ' + err);
                                connection.release();
                                return false;
                            }
                            client.playId = result.insertId;
                            connection.release();
                        });
                    });
                }

                // @todo game.start might be something else. Player.joined or something
                var dataJson = {
                    topic: 'game',
                    action: 'start',
                    data: {
                        code: game.code
                    }
                };
                client.connection.send(JSON.stringify(dataJson));
                client.game = game;

                // Send message to host that a new player has joined
                var dataJson = {
                    topic: 'player',
                    action: 'join',
                    data: {
                        id: client.id,
                        name: client.name
                    }
                };
                game.host.connection.send(JSON.stringify(dataJson));
            }
            else if (message.action == 'orientation') {
                if (client.game != null && client.game.host != null) {
                    var z = 0;
                    if (data.z != null) {
                        z = data.z;
                    }
                    var dataJson = {
                        topic: 'player',
                        action: 'orientation',
                        data: {
                            id: client.id,
                            x: data.x,
                            y: data.y,
                            z: z
                        }
                    };
                    client.game.host.connection.send(JSON.stringify(dataJson));
                }
            }
            else if (message.action == 'click') {
                if (client.game != null && client.game.host != null) {
                    var x = 0;
                    var y = 0;
                    if (data != null) {
                        if (data.x != null) {
                            x = data.x;
                        }
                        if (data.y != null) {
                            y = data.y;
                        }
                    }
                    var dataJson = {
                        topic: 'player',
                        action: 'click',
                        data: {
                            id: client.id,
                            x: data.x,
                            y: data.y
                        }
                    };
                    client.game.host.connection.send(JSON.stringify(dataJson));
                }
            }
            else if (message.action == 'clickDown') {
                if (client.game != null && client.game.host != null) {
                    var x = 0;
                    var y = 0;
                    var id = 0;
                    if (data != null) {
                        if (data.x != null) {
                            x = data.x;
                        }
                        if (data.y != null) {
                            y = data.y;
                        }
                    }
                    if (data.id != null) {
                        id = data.id;
                    }
                    var dataJson = {
                        topic: 'player',
                        action: 'clickDown',
                        data: {
                            id: id,
                            playerId: client.id,
                            x: data.x,
                            y: data.y
                        }
                    };
                    client.game.host.connection.send(JSON.stringify(dataJson));
                }
            }
            else if (message.action == 'clickUp') {
                if (client.game != null && client.game.host != null) {
                    var x = 0;
                    var y = 0;
                    if (data != null) {
                        if (data.x != null) {
                            x = data.x;
                        }
                        if (data.y != null) {
                            y = data.y;
                        }
                    }
                    if (data.id != null) {
                        id = data.id;
                    }
                    var dataJson = {
                        topic: 'player',
                        action: 'clickUp',
                        data: {
                            id: id,
                            playerId: client.id,
                            x: data.x,
                            y: data.y
                        }
                    };
                    client.game.host.connection.send(JSON.stringify(dataJson));
                }
            }
            else if (message.action == 'buttonClick') {
                if (client.game == null || client.game.host == null) {
                    break;
                }
                if (data.id == null) {
                    break;
                }
                var dataJson = {
                    topic: 'player',
                    action: 'buttonClick',
                    data: {
                        id: data.id,
                        playerId: client.id
                    }
                };
                client.game.host.connection.send(JSON.stringify(dataJson));
            }
            else if (message.action == 'buttonDown') {
                if (client.game == null || client.game.host == null) {
                    break;
                }
                if (data.id == null) {
                    break;
                }
                var dataJson = {
                    topic: 'player',
                    action: 'buttonDown',
                    data: {
                        id: data.id,
                        playerId: client.id
                    }
                };
                client.game.host.connection.send(JSON.stringify(dataJson));
            }
            else if (message.action == 'buttonUp') {
                if (client.game == null || client.game.host == null) {
                    break;
                }
                if (data.id == null) {
                    break;
                }
                var dataJson = {
                    topic: 'player',
                    action: 'buttonUp',
                    data: {
                        id: data.id,
                        playerId: client.id
                    }
                };
                client.game.host.connection.send(JSON.stringify(dataJson));
            }
            break;
        case 'interface':
            // Only hosts are allowed to send interface objects to other players
            // @todo only allow sending interface to players INSIDE their game
            if (client.type != 'host') {
                break;
            }
            if (data.playerId == null && data.id == null) {
                break;
            }
            var player = findPlayerById(data.playerId);
            if (player == false) {
                break;
            }
            if (message.action == 'buttonAdd') {
                var dataJson = {
                    topic: 'interface',
                    action: 'buttonAdd',
                    data: data
                };
                player.connection.send(JSON.stringify(dataJson));
                break;
            }
            if (message.action == 'buttonRemove') {
                var dataJson = {
                    topic: 'interface',
                    action: 'buttonRemove',
                    data: data
                };
                player.connection.send(JSON.stringify(dataJson));
                break;
            }
            if (message.action == 'vibrate') {
                if (data.duration == null || data.duration < 0 || data.duration > 1000) {
                    break;
                }
                var dataJson = {
                    topic: 'interface',
                    action: 'vibrate',
                    data: {
                        duration: data.duration
                    }
                };
                player.connection.send(JSON.stringify(dataJson));
            }
            break;
        default:
    }

    return true;
}

/**
 * Generates a unique code. If the code already exists it generates a new one until a unique code has been generated.
 * @param length number the number of characters in the code. Default will be 5
 * @returns {*}
 */
var _uniqueGameCodes = [];
function _generateCode(length) {

    length = length || 5;

    var code = '';
    var characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (var i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    if (code == '') {
        return _generateCode(length);
    }

    if (_.contains(_uniqueGameCodes, code)) {
        return _generateCode(length);
    }
    _uniqueGameCodes.push(code);
    return code;

}

/**
 * Finds a game with given code.
 * @param code string the code of the game
 * @returns {*} game object or false if game is not found
 */
function findGameByCode(code) {

    for (var i = 0; i < games.length; i++) {
        if (games[i].code == code) {
            return games[i];
        }
    }
    return false;

}

/**
 * Finds a client with the given id.
 * @param playerId int the id of the player to find
 * @todo @param gameId only allow players to be found for specific games (game.clients = [];)
 * @returns {*} player object or false if game is not found
 */
function findPlayerById(playerId) {

    for (var i = 0; i < clients.length; i++) {
        if (clients[i].id == playerId) {
            return clients[i];
        }
    }
    return false;

}