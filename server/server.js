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
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 8080});
var _ = require('underscore');

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
    identify: {
        type: 'client',
        name: 'New player',
        color: '#ff9900'
    }
};

/**
 * Object with all default values for new messages received from either client
 * or host.
 *
 * @param string topic The category of the message
 * @param string action The sub category or action of the category
 * @param object data A list with all data to be send to the other side.
 */
var defaultMessage = {
    topic: '',
    action: '',
    data: {

    }
};

/**
 * List with all connected clients.
 * @type {Array}
 */
var connections = [];

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

        /**
         * Check topic and optional action and execute additional actions for
         * this request.
         * E.g. Add a playerId or update the client information in the global
         * connections list.
         */
        switch (message.topic) {
            case 'identify':
                client.identify = _.extend(client.identify, message.data);
            break;
        }
        console.log(client);
    });

    // Clone the default client
    var client = JSON.parse(JSON.stringify(defaultClient));
    // Add and edit additional properties
    ws.client = client;
    client.connection = ws;
    // Add this new client to the global connections
    connections.push(client);
});