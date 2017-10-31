/**
 *
 * DMB modification for OnOff purposes
 * Original: https://github.com/feri/dmb
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

const debug = require('debug')('DMB');
const msg_send_debug = require('debug')('DMB_WS_SEND');
const msg_recv_debug = require('debug')('DMB_WS_RECV');

const ev_emit_debug = require('debug')('DMB_EV_EMIT');
const ev_recv_debug = require('debug')('DMB_EV_RECV');

const EventEmitter = require('events');
const dmb_config = require('./dmb_config');

var dmb = exports = module.exports = {}
dmb.uplinkEventName = null;
dmb.downlinkEventName = null;

var sockets = {};
var numUsers = 0;

// webscoket server host and port configurable; see dmb_config.js
var dmb_host = process.env.debug_HOST || dmb_config.host || "onoff.local";
var dmb_port = process.env.debug_PORT || dmb_config.port || 8081;

var allowed = dmb_config.allowed;

// for communicating with the parent app
var parentProxy = new EventEmitter();

// Websocket server
const dmb_server = require('http').createServer();
const dmb_io = require('socket.io')(dmb_server, {
  // below are engine.IO options
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false
});

// start the webscoket server app
dmb_server.listen(dmb_port, dmb_host, function () {
  debug('debug Server listening on %s at port %d', dmb_host, dmb_port);
  debug('debug Allowed backends: %o', dmb_config.allowed);
});

dmb.start = function start(dmbEvent = null, uplinkEventName = null, downlinkEventName = null) {
  /**
   * If event is a valid string then debug will trigger an event with that
   * name passing data to all listeners.
   * With this debug is able to send data to the process who started debug.
   */
  if (dmbEvent instanceof EventEmitter) {
    parentProxy = dmbEvent;
    if (uplinkEventName) {
      dmb.uplinkEventName = uplinkEventName;
      dmb.uplinkHandler(dmb.uplinkEventName);
    }
    if (downlinkEventName) {
      dmb.downlinkEventName = downlinkEventName;
    }

    debug('parentProxy is ready');
    debug('uplinkEventName: ' + dmb.uplinkEventName + ', downlinkEventname: ' + dmb.downlinkEventName);

  } else {
    parentProxy = null;
  }

  /**
   * Register callbacks
   */
  dmb_io.on('connection', function(socket) {

    socket.on('error', (error) => {
      debug('socket error: %o', error);
    });
    // debug assigns a unique ID {bkid} for backend service
    // Regular clients must specify a unique {clid}
    socket.on('dmb:broadcast', function (params) {
      msg_recv_debug('dmb:broadcast %o', params);
      dmb.send('dmb:broadcast', params.bkid, params.clid, null, broadcast);
    });
    // debug assigns a unique ID {bkid} for backend service
    // Regular clients must specify a unique {clid}
    socket.on('dmb:connect', function (params) {
      // the client joins to uid room automatically
      msg_recv_debug("dmb:connect, params: %o", params);

      if (typeof allowed[params.bkid] === 'undefined') {
        debug('bkid is not allowed: ' + params.bkid);
        return;
      }

      socket.join(params.bkid, function() {
        var ok = true;
        if (typeof params.clid != 'undefined') {
          socket.appid = params.bkid;
          socket.username = params.clid;

          // lame check if this is a backend type or client type connection
          if (socket.appid == socket.username) {
            // backend
            if (allowed[socket.appid].length == 0) {
              if (params.allowed.length > 0) {
                // populate which clids are allowed
                allowed[socket.appid] = params.allowed;
              }
            }
          } else {

            if (typeof params.allowed !== "undefined" && params.allowed.length > 0) {
              // populate which clids are allowed
              allowed[socket.appid] = params.allowed;
            }

            if (typeof allowed[socket.appid].length === "undefined" || allowed[socket.appid].length == 0) {
              // don't specify exact reason of denial, clients might be fishing
              debug('all connections disabled to this backend: ' + socket.appid);
              ok = false;
            } else {
              if (typeof allowed[socket.appid]['all'] !== 'undefined') {
                // all connections allowed
                debug('all connections are allowed');
                ok = true;
              } else {
                debug('can client: ' + socket.username + ' connect to backend: ' + socket.appid + ' ?');
                debug(allowed[socket.appid]);
                if (allowed[socket.appid].indexOf(socket.username) == -1) {
                  debug('access denied for client: ' + socket.username);
                  ok = false;
                } else {
                  debug('access allowed');
                }
              }
            }
          }

          if (ok == false) {
            // do not provide more info
            socket.emit("dmb:message", "access denied for " + socket.username);
            // disconnect
            socket.disconnect(true);
            return;
          }

          if (typeof sockets[params.clid] == 'undefined') {
            sockets[params.clid] = [];
          }

          socket.userId = params.userId || socket.id;
          var lastclient = {sid: socket.id, userId: socket.userId};
          sockets[params.clid].push(lastclient);

          socket.emit('dmb:connected', {clid: params.clid});

          debug('new client of ' + socket.username + ', userId: ' + lastclient.userId + ', sid: ' + lastclient.sid);

          if (dmb_config.broadcast.onjoin) {
            // a broadcast
            var broadcast = {
              sender: params.bkid,
              payload: 'new client joined'// as ' + params.clid + ' (userId: ' + params.userId + ')'
            }
            // broadcast
            dmb.send('dmb:broadcast', params.bkid, params.clid, null, broadcast);
            //dmb_io.sockets.in(params.clid).emit("dmb:broadcast", broadcast);
            broadcast = null;
          }

          // a private greeting
          var message = {
            sender: params.bkid,
            payload: "Hello from backend service: " + params.bkid + '!',
          }
          dmb.send('dmb:message', params.bkid, params.clid, {sid: socket.id, userId: socket.userId}, message);

          ++numUsers;
        }
        else
        {
          debug('invalid typeof clid: ' + typeof params.clid + ': ' + params.clid);
        }
      });
    });

    // messages back and forth between backends and clients
    socket.on('dmb:message', function (params) {
      msg_recv_debug('dmb:message, params: %o', params);

      if (typeof params.bkid === 'undefined') {
        msg_recv_debug('params.bkid is missing, set it to:', socket.appid);
        params.bkid = socket.appid;
      }

      if (typeof params.clid === 'undefined') {
        msg_recv_debug('params.clid is missing, set it to:', socket.username);
        params.clid = socket.username;
      }

      if (typeof params.to === 'undefined') {
        msg_recv_debug('params.to missing; set it to:', socket.appid);
        params.to = socket.appid;
      }

      if (params.bkid == params.clid) {
        debug('just before calling send: %o', params);
        // if the backend wants to reach a client send a private msg
        dmb.send("dmb:message", params.bkid, params.to, params.socket, JSON.stringify(params));
        debug('sent to', params.socket);
      }

      params.type = 'command';
      params.socket = { sid: socket.id, userId: socket.userId };
      dmb.sendToParent(params);
    });

    // when client soft-disconnects
    socket.on('dmb:disconnect', function (params) {
      msg_recv_debug('dmb:disconnect, params: %o', params);
      dmb.send("dmb:message", socket.appid, socket.username, {sid: socket.id, userId: socket.userId}, socket.username + " disconnected from " + socket.appid);
      socket.disconnect(false);
    });

    // when the client updates something
    socket.on('dmb:update', function(params) {
      msg_recv_debug('dmb:update from socket: %s: %o', socket.id, params);

      if (params.type == 'user_update') {
        socket.userId = params.userId;
      }

      params.socket = { sid: socket.id, userId: socket.userId };
      // this update might concern the parent app too, so push it further
      dmb.sendToParent(params);
    });

    // when the client disconnects
    socket.on('disconnect', function(params) {
      // remove the connection from the global list
      if (typeof sockets[socket.username] !== 'undefined') {
        debug('>> disconnecting: ', socket.username + ':' + socket.id);

        // create a map of socket ids to find the leaving one quicker
        var sids = sockets[socket.username].map(function(elem) {
          return elem.sid;
        });
        var index = sids.lastIndexOf(socket.id);
        // not needed anymore
        sids = null;

        if (index > -1)
        {
          sockets[socket.username].splice(index, 1);

          if (dmb_config.broadcast.onleave) {
            // a broadcast
            var broadcast = {
              sender: socket.appid,
              payload: 'client ' + socket.username + ' left'
            }
            dmb.send('dmb:broadcast', socket.appid, socket.username, null, broadcast);
            broadcast = null;
          }

          debug('client left: ' + socket.username + ', sid: ' + socket.id + "\r\n");

          // the disconnection might interest the parent app too, so push it further
          var params = {
            type: 'user_update',
            action: 'disconnect',
            userId: socket.userId,
            socket: { sid: socket.id, userId: socket.userId }
          }
          dmb.sendToParent(params);

          --numUsers;
        }
        else {
          debug('No socket available for ' + socket.username + ' with id: ' + socket.id);
        }
      }
    });
  });
}

/**
 * Message sending
 */
dmb.send = function send(event, bkid, clid, socket, payload) {
  msg_send_debug('dmb.send', event, bkid, clid, socket, payload);

//  if (typeof sockets[clid] !== 'undefined' && sockets[clid].length > 0) {
    msg_send_debug('send %s %o', event, payload);

    switch (event) {
      case 'dmb:broadcast':
        msg_send_debug('to: %o', sockets[clid]);
        sockets[clid].forEach(function(socket, index, array) {
          dmb_io.sockets.to(socket.sid).emit(event, payload);
          msg_send_debug((index + 1) + '. broadcast to ' + socket.sid + ', userId: ' + socket.userId);
        });
        break;
      case 'dmb:message':
        // send to one socket only
        dmb_io.sockets.to(socket.sid).emit(event, payload);
        msg_send_debug('to: %o', socket);
        break;
      default:
        msg_send_debug('Invalid event type; abort sending...');
    }
  //~ }
  //~ else {
    //~ msg_send_debug('No sockets available for ' + clid + ' for sending message');
  //~ }
}

/**
 * Sends messages via events to parent app.
 *
 * If the parent app who called dmb.start specified an event then
 * DMB will trigger that event with data.
 *
 * The parent app can listen to the event and deal with the data.
 */
dmb.sendToParent = function sendToParent(params) {
  if (parentProxy && dmb.downlinkEventName) {
    if (parentProxy.emit(dmb.downlinkEventName, params)) {
      ev_emit_debug('%s %o', dmb.downlinkEventName, params);
    } else {
      ev_emit_debug('Failed to emit ' + dmb.downlinkEventName + ' event, probably no listeners');
    }
  }
}

/**
 * Subscribes and handles events that carry messages from the parent app.
 */
dmb.uplinkHandler = function uplinkHandler(uplinkEventName) {
  if (parentProxy) {
    parentProxy.on(uplinkEventName, function(params) {
      ev_recv_debug('%s %o', uplinkEventName, params);

      if (typeof params.socket !== 'undefined') {
        // forward the data to the websocket of the exact client UI
        var response = {sender: params.bkid, payload: params.response.data};
        // add the name of the event that should be triggered in the UI
        if (params.response.trigger) {
          response.trigger = params.response.trigger;
        }
        dmb.send('dmb:message', params.bkid, params.clid, params.socket, response);
      }
    });
  }
}
