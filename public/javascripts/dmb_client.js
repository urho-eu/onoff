/**
 *
 * Simple client script for Duplex Message Broker (DMB)
 *
 * {server}: Address of the DMB server
 * {bkid}  : DMB will assign a unique id from backends
 * {clid}  : can be used to identify this client
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

var connection = true;
var dmb_started = false;

var dmb_params = {
  bkid: 'onoff_backend',
  clid: 'onoff_browser_client',
};

// this could go to a separate l10n file...
var errors = {
  no_connection: 'OnOff server connection failed or was lost.'
}

// Updates the websocket's visual cue (green or red sign)
function updateStatus(connected = false, message = '') {
  var dangerCSS = 'p-3 mb-2 bg-danger text-white';
  if (connected) {
    jQuery('.dmb .message').removeClass(dangerCSS).text('');
    jQuery('.dmb .status').addClass('active');
  } else {
    jQuery('.dmb .status').removeClass('active');
    jQuery('.dmb .message').addClass(dangerCSS).text(message);
  }
}

jQuery(document).ready(function() {

  if (typeof dmb_params.clid !== "undefined") {
    jQuery('.info .clid').text(dmb_params.clid);
  }

  // load socket.io
  jQuery.getScript(dmb_params.server || '' + '/socket.io/socket.io.js')
    .done(function( script, textStatus ) {
      // initiate the DMB connection
      jQuery(document).trigger('dmb_start', dmb_params);
    })
    .fail(function( jqxhr, settings, exception ) {
      updateStatus(false, errors.no_connection);
  });
});

/**
 * dmb_start handler
 *
 * Connects to DMB app via web socket.
 * Setting up various other event handlers too.
 */
jQuery(document).on('dmb_start', function(event, dmb_params) {

  console.log('dmb_start triggered');

  if (typeof(dmb_params['clid']) !== 'undefined') {
    window.socket = io(dmb_params.server);
    var socket = window.socket;

    if (typeof dmb_params['clid'] == 'undefined' || dmb_params['clid'] == '') {
      dmb_params['clid'] = 'browser_client';
    }

    // say hello to DMB
    socket.emit('dmb:connect', dmb_params);

    // when onOffUser is available update DMB and the parent app
    jQuery(document).on('onOffUser', function(event, params) {
      socket.userId = params.userId;
      params.type = 'user_update';
      params.action = 'connect';
      socket.emit('dmb:update', params);
      // console.log('emitted dmb:update with ', params);
    });

    // want to hook to this one?
    socket.on('disconnect', function(msg) {
      updateStatus(false, errors.no_connection);
    });
    socket.on('dmb:disconnect', function(msg) {
      updateStatus(false, errors.no_connection);
    });

    // want to hook into this one?
    socket.on('connect', function(msg) {
      updateStatus(true);
    });

    // want to hook into this one?
    socket.on('reconnect', function(msg) {
      updateStatus(true);
      if (window.onOffUser) {
        var params = dmb_params;
        params.type = 'user_update';
        params.action = 'reconnect';
        params.userId = window.onOffUser.userId || '';
        socket.emit('dmb:update', params);
        console.log('emitted dmb:update with ', params);
      }
    });

    socket.on('dmb:connected', function(msg) {
      updateStatus(true);
    });

    // received a broadcast from DMB
    socket.on('dmb:broadcast', function(broadcast) {
      console.log('dmb:broadcast received', broadcast);
      if (broadcast.payload && broadcast.sender) {
        jQuery('#messages').prepend($('<li class="broadcast">').text('Broadcast from ' + broadcast.sender + ': ' + broadcast.payload));
      }
    });

    // received a direct message from DMB
    socket.on('dmb:message', function(msg) {
      console.log('dmb:message received', msg);
      if (msg.payload) {
        jQuery('#messages').prepend($('<li class="private">').text('Message from ' + (msg.sender || dmb_params.bkid) + ': ' + JSON.stringify(msg.payload)));

        if (msg.trigger) {
          // there was an event named which should be triggered
          var eventName = msg.trigger;
          if (eventName) {
            var e = jQuery.Event(eventName);
            var userId = '';
            if (window.onOffUser) {
              userId = window.onOffUser.userId;
            }
            e.params = {
              socket: {sid: socket.id, userId: userId},
              payload: msg.payload
            };

            if (msg.sender != dmb_params.clid) {
              jQuery(document).trigger(e);
            }
          }
        } else {
          // there was an event named which should be triggered
          // hmmm...
        }

      }
    });

    /**
     * The dmb_downlink handler
     *
     * The UI scripts communicate with this dmb_client
     * using the dmb_downlink event only.
     *
     * The incoming event is sent to DMB as a websocket
     * message.
     */
    jQuery(document).on('dmb_downlink', function(event) {
      console.log('dmb_downlink event received: ', event);
      if (typeof event.params != 'undefined') {
        socket.emit('dmb:message', event.params);
      }
    });
  }

  /**
   * Indicate that the DMB client is up, communication channels are
   * established. he work with the OnOff backend can start (or resume).
   */
  jQuery(document).trigger('dmb_started');
});
