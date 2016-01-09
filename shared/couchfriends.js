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
(function() {

    var peerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection ||
        window.webkitRTCPeerConnection || window.msRTCPeerConnection;
    var sessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription ||
        window.webkitRTCSessionDescription || window.msRTCSessionDescription;

    /**
     * component/emitter
     *
     * Copyright (c) 2014 Component contributors <dev@component.io>
     */
    function Emitter(a){return a?mixin(a):void 0}function mixin(a){for(var b in Emitter.prototype)a[b]=Emitter.prototype[b];return a}Emitter.prototype.on=Emitter.prototype.addEventListener=function(a,b){return this._callbacks=this._callbacks||{},(this._callbacks["$"+a]=this._callbacks["$"+a]||[]).push(b),this},Emitter.prototype.once=function(a,b){function c(){this.off(a,c),b.apply(this,arguments)}return c.fn=b,this.on(a,c),this},Emitter.prototype.off=Emitter.prototype.removeListener=Emitter.prototype.removeAllListeners=Emitter.prototype.removeEventListener=function(a,b){if(this._callbacks=this._callbacks||{},0==arguments.length)return this._callbacks={},this;var c=this._callbacks["$"+a];if(!c)return this;if(1==arguments.length)return delete this._callbacks["$"+a],this;for(var d,e=0;e<c.length;e++)if(d=c[e],d===b||d.fn===b){c.splice(e,1);break}return this},Emitter.prototype.emit=function(a){this._callbacks=this._callbacks||{};var b=[].slice.call(arguments,1),c=this._callbacks["$"+a];if(c){c=c.slice(0);for(var d=0,e=c.length;e>d;++d)c[d].apply(this,b)}return this},Emitter.prototype.listeners=function(a){return this._callbacks=this._callbacks||{},this._callbacks["$"+a]||[]},Emitter.prototype.hasListeners=function(a){return!!this.listeners(a).length};

    var COUCHFRIENDS = {
        _defaultPlayers: {
            id: 0,
            player: {
                name: 'Guest',
                color: '#ff9900'
            },
            connection: {},
            host: {}
        },
        /**
         * List with all connected devices; hosts and clients.
         * @type {Array} list with all clients that have the following variables:
         * @param id int the unique identifier of the client
         * @param type string the type of connection: host|client
         * @param player object all identify data for the player
         * @param player.name string the name of the player
         * @param player.color string the color of the player
         * @param connection the Connection object for sending and receiving data
         */
        players: [],
        socketConnected: false,
        peerConnected: false,
        /**
         * The websocket object
         */
        socket: {},
        /**
         * The peer object
         */
        socketPeer: {},
        /**
         * Object where data is through transmitted.
         */
        peerDataChannel: {},
        settings: {
            peerOffer: {},
            host: 'ws://localhost',
            port: 8080
        }
    };

    COUCHFRIENDS.foo = function foo() {
        console.log('fooed');
    };

    COUCHFRIENDS._connectPeersocket = function() {

        if (typeof peerConnection == 'undefined') {
            COUCHFRIENDS.emit('error', 'Peer connection not available.');
            return false;
        }
        COUCHFRIENDS.socketPeer = new peerConnection({});
        COUCHFRIENDS.peerDataChannel = COUCHFRIENDS.socketPeer.createDataChannel('Couchfriends');
        console.log(COUCHFRIENDS.socketPeer);
        COUCHFRIENDS.socketPeer.createOffer(function(offer) {
            COUCHFRIENDS.settings.peerOffer = offer;
            console.log(offer);
            // Not sure what to do with this yet...
            //COUCHFRIENDS.socketPeer.setLocalDescription(new sessionDescription(offer), function() {
            //    console.log(offer);
            //});
        },
        function (error) {
            COUCHFRIENDS.emit('error', error);
        });
        //this.socketPeer.createDataChannel('Couchfriends', {
        //    ordered: false
        //});

        COUCHFRIENDS.socketPeer.onerror = function (error) {
            COUCHFRIENDS.emit('error', 'Data channel error: ' + error);
        };

        COUCHFRIENDS.socketPeer.onmessage = function (event) {
            console.log("Got Data Channel Message:", event.data);
        };

        COUCHFRIENDS.socketPeer.onopen = function () {
            console.log('Peer is open for connections.');
            COUCHFRIENDS.peerConnected = true;
        };

        COUCHFRIENDS.socketPeer.onclose = function () {
            console.log('Peer connection closed.');
            COUCHFRIENDS.peerConnected = false;
        };
    };

    /**
     * Connects to the websocket server.
     * @returns {boolean} Returns false on errors or true if device will connect.
     *
     * @throws error on('error') will be emitted on error.
     */
    COUCHFRIENDS.connect = function() {

        if (typeof WebSocket == 'undefined') {
            COUCHFRIENDS.emit('error', 'Websockets are not supported by this device.');
            return false;
        }

        if (this.socketConnected == true) {
            return true;
        }

        var socket = new WebSocket(this.settings.host +':'+this.settings.port);

        socket.onmessage = COUCHFRIENDS.onmessage.bind(socket);

        socket.onopen = function() {
            COUCHFRIENDS.socketConnected = true;
            COUCHFRIENDS._connectPeersocket();
            COUCHFRIENDS.emit('connect');
        };

        socket.onclose = function() {
            COUCHFRIENDS.socketConnected = false;
            COUCHFRIENDS.emit('disconnect');
        };

        socket.onerror = function(error) {
            console.log(error);
            COUCHFRIENDS.emit('error', 'Unknown Websocket error.');
        };

        this.socket = socket;

    };

    COUCHFRIENDS.send = function (data) {

        if (this.peerConnected == true && data.playerId) {
            // Search for playerId
            for (var i = 0; i < this.players.length; i++) {
                var player = this.players[i];
                if (player.id != data.playerId) {
                    continue;
                }
                if (player.peerConnected == true) {
                    // Send through peer.
                    // Something like:
                    // @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection#createDataChannel
                    // player.peerConnection.send();
                }
            }
        }
        if (this.socketConnected == true) {
            // Send through websocket connection
            COUCHFRIENDS.socket.send(JSON.stringify(data));
            return true;
        }
        COUCHFRIENDS.emit('error', 'Message not sent. Not connected.');
        return false;
    };

    /**
     * Received a message from the websocket server or one of it's peers.
     * @param event object
     */
    COUCHFRIENDS.onmessage = function (event) {
        var obj = {};
        try {
            obj = JSON.parse(event.data);
        }
        catch (e) {
            COUCHFRIENDS.emit('error', 'Expected JSON-formatted message.');
            return false;
        }
        var callback = '';
        if (obj.topic != null) {
            callback = obj.topic;
        }
        if (obj.action != null) {
            callback += '.' + obj.action;
        }
        if (callback != '') {
            return COUCHFRIENDS.emit(callback, obj.data);
        }
        COUCHFRIENDS.emit('data', obj);

    };

    Emitter(COUCHFRIENDS);

    COUCHFRIENDS.on('game.host', function(data) {
        console.log('New hosting game.', data);
    });

    /**
     * Callback when an application error happened.
     * @param error string Message with error information.
     */
    COUCHFRIENDS.on('error', function(error) {
        error = error || 'Unknown error.';
        console.log('> Error: ', error);
    });

    /**
     * Data received from server/client
     */
    COUCHFRIENDS.on('data', function (data) {
        console.log('> Received data.', data);
    });

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
        module.exports = COUCHFRIENDS;
    else
        window.COUCHFRIENDS = COUCHFRIENDS;
})();