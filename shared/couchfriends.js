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

    /**
     * component/emitter
     *
     * Copyright (c) 2014 Component contributors <dev@component.io>
     */
    function Emitter(a){return a?mixin(a):void 0}function mixin(a){for(var b in Emitter.prototype)a[b]=Emitter.prototype[b];return a}Emitter.prototype.on=Emitter.prototype.addEventListener=function(a,b){return this._callbacks=this._callbacks||{},(this._callbacks["$"+a]=this._callbacks["$"+a]||[]).push(b),this},Emitter.prototype.once=function(a,b){function c(){this.off(a,c),b.apply(this,arguments)}return c.fn=b,this.on(a,c),this},Emitter.prototype.off=Emitter.prototype.removeListener=Emitter.prototype.removeAllListeners=Emitter.prototype.removeEventListener=function(a,b){if(this._callbacks=this._callbacks||{},0==arguments.length)return this._callbacks={},this;var c=this._callbacks["$"+a];if(!c)return this;if(1==arguments.length)return delete this._callbacks["$"+a],this;for(var d,e=0;e<c.length;e++)if(d=c[e],d===b||d.fn===b){c.splice(e,1);break}return this},Emitter.prototype.emit=function(a){this._callbacks=this._callbacks||{};var b=[].slice.call(arguments,1),c=this._callbacks["$"+a];if(c){c=c.slice(0);for(var d=0,e=c.length;e>d;++d)c[d].apply(this,b)}return this},Emitter.prototype.listeners=function(a){return this._callbacks=this._callbacks||{},this._callbacks["$"+a]||[]},Emitter.prototype.hasListeners=function(a){return!!this.listeners(a).length};

    var COUCHFRIENDS = {
        _defaultConnection: {
            id: 0,
            type: 'client',
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
         * @param connection.id int the unique identifier of the client
         * @param connection.type string the type of connection: host|client
         * @param connection.player object all identify data for the player
         * @param connection.player.name string the name of the player
         * @param connection.player.color string the color of the player
         * @param connection.connection the Connection object for sending and
         * receiving data
         * @param connection.host Reference to the object of the host its
         * connected to. Empty if it's a host itself.
         */
        connections: [],
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
        settings: {
            host: 'ws://localhost',
            port: 8080
        }
    };

    COUCHFRIENDS.foo = function foo() {
        console.log('fooed');
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
            COUCHFRIENDS.emit('connect');
        };

        socket.onclose = function() {
            COUCHFRIENDS.socketConnected = false;
            COUCHFRIENDS.emit('disconnect');
        };

        socket.onerror = function(error) {
            COUCHFRIENDS.emit('error', 'Unable to connect to Websocket server ('+ COUCHFRIENDS.settings.host +':'+ COUCHFRIENDS.settings.port +').');
        };

        this.socket = socket;

    };

    COUCHFRIENDS.send = function (data) {

        if (this.peerConnected == true) {
            // Send through peer connection
            return true;
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