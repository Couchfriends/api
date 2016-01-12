"use strict";
/**
 * Couchfriends controller api. With the Couchfriends Controller API you can connect your phone or tablet to your HTML5
 * game and use it as a controller. The Controller API uses Websockets to send and receive input.
 *
 * @copyright (c) 2015 Mathieu de Ruiter, Couchfriends, Fellicht & Editors
 * @author Mathieu de Ruiter / http://www.fellicht.nl/
 *
 * For detailed information about the development with the Couchfriends API please visit http://couchfriends.com.
 * Please do not remove the header of this file.
 */

var peerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection ||
    window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var sessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription ||
    window.webkitRTCSessionDescription || window.msRTCSessionDescription;
var iceCandidate = window.webkitRTCIceCandidate || window.mozRTCIceCandidate || window.RTCIceCandidate;

/**
 * component/emitter
 *
 * Copyright (c) 2014 Component contributors <dev@component.io>
 */
function Emitter(a) {
    return a ? mixin(a) : void 0
}
function mixin(a) {
    for (var b in Emitter.prototype)a[b] = Emitter.prototype[b];
    return a
}
Emitter.prototype.on = Emitter.prototype.addEventListener = function (a, b) {
    return this._callbacks = this._callbacks || {}, (this._callbacks["$" + a] = this._callbacks["$" + a] || []).push(b), this
}, Emitter.prototype.once = function (a, b) {
    function c() {
        this.off(a, c), b.apply(this, arguments)
    }

    return c.fn = b, this.on(a, c), this
}, Emitter.prototype.off = Emitter.prototype.removeListener = Emitter.prototype.removeAllListeners = Emitter.prototype.removeEventListener = function (a, b) {
    if (this._callbacks = this._callbacks || {}, 0 == arguments.length)return this._callbacks = {}, this;
    var c = this._callbacks["$" + a];
    if (!c)return this;
    if (1 == arguments.length)return delete this._callbacks["$" + a], this;
    for (var d, e = 0; e < c.length; e++)if (d = c[e], d === b || d.fn === b) {
        c.splice(e, 1);
        break
    }
    return this
}, Emitter.prototype.emit = function (a) {
    this._callbacks = this._callbacks || {};
    var b = [].slice.call(arguments, 1), c = this._callbacks["$" + a];
    if (c) {
        c = c.slice(0);
        for (var d = 0, e = c.length; e > d; ++d)c[d].apply(this, b)
    }
    return this
}, Emitter.prototype.listeners = function (a) {
    return this._callbacks = this._callbacks || {}, this._callbacks["$" + a] || []
}, Emitter.prototype.hasListeners = function (a) {
    return !!this.listeners(a).length
};

var COUCHFRIENDS = {
    defaultClient: {
        id: 0,
        connected: false, // Whether peer connection available
        connection: {}, // The peer connection
        dataChannel: {}, // The peer dataChannel. This is used to send and receive data
        identify: {
            type: 'client',
            name: 'New player',
            color: '#ff9900'
        }
    },
    /**
     * List with all connected clients.
     * @type {Array} list with all clients that have the following variables:
     * @param id int the unique identifier of the client
     * @param type string the type of connection: host|client
     * @param player object all identify data for the player
     * @param player.name string the name of the player
     * @param player.color string the color of the player
     * @param connection the Connection object for sending and receiving data
     */
    connections: [],
    connected: false,
    /**
     * The websocket object
     */
    connection: {},
    settings: {
        host: 'ws://localhost',
        port: 8080,
        peerConfig: {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},
        peerConnection: {
            'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true}]
        },
        peerDataChannelConfig: {
            ordered: false,
            reliable: false
        },
        sdpConstraints: {
            'offerToReceiveAudio': false,
            'offerToReceiveVideo': false
        }
    }
};

COUCHFRIENDS.error = function (error) {
    COUCHFRIENDS.emit('error', error);
};

/**
 * Creates a peer socket connection and calls the remote peer (client)
 * @returns {boolean} whether a peer connection can be established.
 */
COUCHFRIENDS.createPeerSocket = function (client) {

    if (typeof peerConnection == 'undefined') {
        COUCHFRIENDS.emit('error', 'Peer connection not available.');
        return false;
    }
    var connection = new peerConnection(
        COUCHFRIENDS.settings.peerConfig,
        COUCHFRIENDS.settings.peerConnection
    );
    connection.client = client;

    // @todo maybe need to change label to client/server to make two channels?
    var dataChannel = connection.createDataChannel('messages',
        COUCHFRIENDS.settings.peerDataChannelConfig
    );
    dataChannel.client = client;
    dataChannel.onerror = function (error) {
        COUCHFRIENDS.emit('error', 'Data channel error: ' + error);
    };

    dataChannel.onmessage = function (event) {
        console.log("Got Data Channel Message:", event.data, this.client);
    };

    dataChannel.onopen = function () {
        console.log('Peer is open for data messages!');
        this.client.connected = true;
    };

    dataChannel.onclose = function () {
        this.client.connected = false;
        console.log('Peer connection closed.');
    };

    connection.createOffer(
        function (desc) {
            connection.setLocalDescription(new sessionDescription(desc), function () {
                var data = {
                    topic: 'player',
                    action: 'call',
                    data: {
                        // @todo make up your mind what ID to use...
                        id: client.id,
                        clientId: client.id,
                        playerId: client.id,
                        peerDescription: desc
                    }
                };
                COUCHFRIENDS.send(data);
                if (typeof log == 'function') {
                    log('Peer offer created. Calling remote peer.');
                    console.log(desc);
                }
            },
            COUCHFRIENDS.error
            );
        },
        COUCHFRIENDS.error,
        COUCHFRIENDS.settings.sdpConstraints
    );

    connection.onicecandidate = function (event) {
        if (event.candidate) {
            console.log('Client exists?', event);
            var jsonData = {
                topic: 'player', // @todo make peer
                action: 'ice',
                id: this.client.id,
                // @todo set peer data in deeper variable
                data: JSON.stringify(event.candidate)
            };
            COUCHFRIENDS.send(jsonData);
        }
    };

    client.dataChannel = dataChannel;
    connection.ondatachannel = function (event) {
        var client = this.client;
        var channel = event.channel;
        channel.client = client;
        channel.onmessage = function (event) {
            var data = JSON.parse(event.data);
            data.id = this.client.id;
            log('Peer message received.');
            COUCHFRIENDS.onmessage(data);
        };
    };

    client.connection = connection;
    return true;
};

/**
 * Connects to the websocket server.
 * @returns {boolean} Returns false on errors or true if device will connect.
 *
 * @throws error on('error') will be emitted on error.
 */
COUCHFRIENDS.connect = function () {

    if (typeof WebSocket == 'undefined') {
        COUCHFRIENDS.emit('error', 'Websockets are not supported by this device.');
        return false;
    }

    if (this.connected == true) {
        return true;
    }

    var connection = new WebSocket(this.settings.host + ':' + this.settings.port);

    connection.onmessage = function (event) {
        var data = JSON.parse(event.data);
        log('Websocket message received.');
        COUCHFRIENDS.onmessage(data);
    };

    connection.onopen = function () {
        COUCHFRIENDS.connected = true;
        COUCHFRIENDS.emit('connect');
    };

    connection.onclose = function () {
        COUCHFRIENDS.connected = false;
        COUCHFRIENDS.emit('disconnect');
    };

    connection.onerror = function (error) {
        console.log(error);
        COUCHFRIENDS.emit('error', 'Unknown Websocket error.');
    };

    this.connection = connection;

};

COUCHFRIENDS.send = function (data) {

    if (data.playerId) {
        // Search for playerId
        for (var i = 0; i < this.connections.length; i++) {
            var player = this.connections[i];
            if (player.id != data.playerId) {
                continue;
            }
            if (player.connected == true) {
                // Send through peer.
                // @link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection#Example_5
                console.log('Sending data through peer.', data);
                player.dataChannel.send(JSON.stringify(data));
                return true;
            }
        }
    }
    if (this.connected == true) {
        // Send through websocket connection
        COUCHFRIENDS.connection.send(JSON.stringify(data));
        return true;
    }
    COUCHFRIENDS.emit('error', 'Message not sent. Not connected.');
    return false;
};

/**
 * Received a message from the websocket server or one of it's peers.
 * @param event object
 */
COUCHFRIENDS.onmessage = function (data) {
console.log('onmessage', data);
    var callback = '';
    if (data.topic != null) {
        callback = data.topic;
    }
    if (data.action != null) {
        callback += '.' + data.action;
    }
    if (data.id) {
        data.data.clientId = data.id; // @todo fix.
    }
    COUCHFRIENDS.emit(callback, data.data);

};

Emitter(COUCHFRIENDS);

COUCHFRIENDS.on('game.start', function (data) {
    log ('Hosting a new game with code: ' + data.code);
    console.log('New hosting game.', data);
});

COUCHFRIENDS.on('player.join', function (data) {
    console.log('Player joined', data);
    var client = JSON.parse(JSON.stringify(COUCHFRIENDS.defaultClient));
    client.id = data.id;
    COUCHFRIENDS.createPeerSocket(client);
    COUCHFRIENDS.connections.push(client);
});

// @todo move to peer.callback
COUCHFRIENDS.on('player.ice', function (data) {
    console.log('Ice server', data);
    for (var i = 0; i < COUCHFRIENDS.connections.length; i++) {
        var client = COUCHFRIENDS.connections[i];
        if (client.id == data.id) {
            console.log('Setting ice', client, data);
            var candidate = JSON.parse(data);
            client.connection.addIceCandidate(new iceCandidate(candidate));
            return;
        }
    }
});

/**
 * Callback when a client answered the peer call/offer.
 */
COUCHFRIENDS.on('player.answer', function (data) {
    console.log('Peer has answered my call!', data);
    for (var i = 0; i < COUCHFRIENDS.connections.length; i++) {
        var client = COUCHFRIENDS.connections[i];
        // @todo fix id or make up what id to use.
        if (client.id == data.id) {
            var answer = data;
            console.log(answer, client);
            client.connection.setRemoteDescription(new sessionDescription(answer),
                function () {
                    log('Peer connection made! ID ' + client.id);
                    client.connected = true;
                }, function (error) {
                    console.log(error);
                });
            return true;
        }
    }

});

/**
 * Callback when an application error happened.
 * @param error string Message with error information.
 */
COUCHFRIENDS.on('error', function (error) {
    error = error || 'Unknown error.';
    console.log('> Error: ', error);
});

/**
 * Data received from server/client
 */
COUCHFRIENDS.on('data', function (data) {
    console.log('> Received data.', data);
});