/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Couchfriends
 * www.couchfriends.com
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// @link http://websockets.github.io/ws/
// @link https://github.com/websockets/ws
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 8080});
var _ = require('underscore');

/**
 * Object with all default values for new messages received from either client
 * or host.
 *
 * @param string topic The category of the message
 * @param string action The sub category or action of the category
 * @param object data A list with all data to be send to the other side.
 */
var defaultMessage = {
    id: null, // Specific client id to send data to. New since 12 jan 2016
    topic: '',
    action: '',
    data: {

    }
};

/**
 * Object with all default values for new connections.
 *
 * @param number id Auto increment id for the clients. This will be automatically
 * updated
 * @param object connection The websocket connection to communicate through.
 * @param object identity List with properties that holds information about the
 * client/player.
 * @param string identify.type Either 'client' or 'host'.
 * @param string identify.name The name of the player.
 * @param string identify.color The color of the player.
 *
 */
var defaultClient = {
    id: 0,
    connection: {},
    game: {}, // Reference to the game object
    identify: {
        type: 'client',
        name: 'New player',
        color: '#ff9900'
    }
};

/**
 * List with all connected clients.
 * @type {Array}
 */
var connections = [];

/**
 * Object with all default values for new games.
 * @type {{}}
 */
var defaultGame = {
    code: '',
    host: {},
    clients: [

    ]
};

/**
 * List with all games. Each game has on 'host' object and a array with clients.
 * @type {Array}
 */
var games = [];

/**
 * Callback when a new client connected to the websocket server. Creates a new
 * client and add it to the connections array.
 *
 * @return void
 */
wss.on('connection', function connection(ws) {

    defaultClient.id++;

    ws.on('message', function(data) {
        // @todo parse message and send it where it belongs.
        var message = _.extend(defaultMessage, JSON.parse(data));
        var client = this.client;
        console.log('Received data.', data);
        /**
         * Check topic and optional action and execute additional actions for
         * this request.
         * E.g. Add a playerId or update the client information in the global
         * connections list.
         * @todo check the message.data for valid variables and remove the prohibited ones.
         */
        switch (message.topic) {
            case 'player':
                if (message.action == 'call') {
                    for (var i = 0; i < connections.length; i++) {
                        var client = connections[i];
                        if (client.id == message.data.id) {
                            var jsonData = {
                                topic: 'player',
                                action: 'call',
                                data: message.data
                            };
                            client.connection.send(JSON.stringify(jsonData));
                            break;
                        }
                    }
                }
                else if (message.action == 'answer') {
                    message.data.id = client.id;
                    var host = client.game.host;
                    var jsonData = {
                        topic: 'player',
                        action: 'answer',
                        data: message.data
                    };
                    host.connection.send(JSON.stringify(jsonData));
                }
                else if (message.action == 'ice') {

                    var jsonData = {
                        topic: 'player',
                        action: 'ice',
                        data: message.data
                    };

                    var connection = null;
                    if (client.identify.type == 'client') {
                        try {
                            connection = client.game.host.connection;
                        }
                        catch (e) {

                        }
                        jsonData.id = client.id; // @todo make this general function
                    }
                    else if (message.id != null) {
                        // @todo make function getConnectionById();
                        for (var i = 0; i < connections.length; i++) {
                            if (connections[i].id == message.id) {
                                connection = connections[i].connection;
                                jsonData.id = connections[i].id;
                                break;
                            }
                        }
                    }
                    if (connection == null) {
                        break;
                    }
                    connection.send(JSON.stringify(jsonData));
                }
            break;
            case 'identify':
                client.identify = _.extend(client.identify, message.data);
            break;
            case 'game':
                // Connection would like to host a game.
                if (message.action == 'host') {
                    createGame(client);
                }
                else if (message.action == 'join') {
                    var code = message.data.code || '';
                    joinGame(code, client);
                }
            break;
            default:
                // @todo fix this :)
                if (client.identify.type == 'client') {
                    // Send to host
                    if (client.game.host != null) {
                        client.game.host.connection.send(JSON.stringify(message));
                    }
                }

        }
    });

    ws.on('close', function(code, message) {
        var client = this.client;
        disconnectClient(client);
    });

    // Clone the default client
    var client = JSON.parse(JSON.stringify(defaultClient));
    // Add and edit additional properties
    ws.client = client;
    client.connection = ws;
    // Add this new client to the global connections
    connections.push(client);
});

/**
 * Disconnect the client from the websocket server.
 * @param client
 * @todo save the disconnect date to the connections table.
 */
function disconnectClient(client) {

    if (client.type == 'host') {
        removeGame(client.game);
    }
    disconnectClientFromGame(client);
    connections.splice(_.indexOf(connections, client, true), 1);

}

function createGame(client) {

    client.identify.type = 'host';
    var game = {
        host: client,
        code: generateCode()
    };
    var game = _.extend(defaultGame, game);
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

function joinGame(code, client) {
    code = code || '';
    if (code == '') {
        return false;
    }
    _.each(games, function(game) {
        if (game.code == code) {
            client.game = game;
            game.clients.push(client);
            // @todo send message back to client and host
            var dataJson = {
                topic: 'game',
                action: 'start',
                data: {
                    code: game.code,
                    host: game.host.identify
                }
            };
            client.connection.send(JSON.stringify(dataJson));
            // Send message to host that a new player has joined
            var dataJson = {
                topic: 'player',
                action: 'join',
                data: {
                    playerId: client.id,
                    id: client.id, // @todo id is deprecated
                    name: client.name
                }
            };
            game.host.connection.send(JSON.stringify(dataJson));

            return true;
        }
    });
}

function removeGame(game) {

    _.each(game.clients, disconnectClientFromGame);
    games.splice(_.indexOf(games, game, true), 1);
    _uniqueGameCodes.splice(_.indexOf(_uniqueGameCodes, game.code, true), 1);
}

function disconnectClientFromGame(client) {

    if (client.game == null || _.indexOf(games, client.game, true) < 0) {
        return;
    }
    var game = client.game;
    game.clients.splice(_.indexOf(game.clients, client, true));

    var dataJson = {
        topic: 'player',
        action: 'left',
        data: {
            id: client.id,
            name: client.name
        }
    };
    game.host.connection.send(JSON.stringify(dataJson));
}

/**
 * Generates a unique code. If the code already exists it generates a new one
 * until a unique code has been generated.
 * @param length number the number of characters in the code. Default will be 2.
 * This number will be automatically increased once a code has been found.
 * @returns string unique code
 * @todo move this to external object
 */
var _uniqueGameCodes = [];
function generateCode(length) {

    length = length || 2;

    var code = '';
    var characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (var i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    if (code == '') {
        length++;
        return generateCode(length);
    }

    if (_.contains(_uniqueGameCodes, code)) {
        length++;
        return generateCode(length);
    }
    _uniqueGameCodes.push(code);
    return code;

}