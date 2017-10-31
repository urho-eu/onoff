/**
 *
 * DMB server configuration
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
var dmb_config = {
  // HTTP server port for incoming transfer requests
  host: 'onoff.local',
  port: 8081,

  allowed: {
    onoff_backend: ['onoff_browser_client']
  },

  // flags to send broadcasts to the same clid client if
  // a new client with same clid joins or leaves
  broadcast: {
    onjoin: false,
    onleave: false
  }
};

module.exports = dmb_config;
