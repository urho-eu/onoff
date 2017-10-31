/**
 *
 * OnOff - Simple account handling
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

/**
 * Check if onOffId is saved in localstorage
 * upon receiving the dmb_started event that indicates
 * that the OnOff backend is ready to respond
 */
jQuery(document).ready(function() {
  jQuery(document).on('dmb_started', function(event) {

    window.onOffUser = JSON.parse(localStorage.getItem('onOffUser'));
    if (window.onOffUser != null) {
      jQuery(document).trigger('onOffUser', {userId: window.onOffUser.userId});
    }

    if (window.onOffUser == null || typeof window.onOffUser === 'undefined') {
      /**
       * request a new ID from the backend
       *
       * The dmb_downlink event is used to communicate with
       * dmb_client.js, which is the single point of contact
       * towards the DMB backend.
       */
      var e = jQuery.Event('dmb_downlink');
      e.params = {
        bkid: dmb_params.bkid,
        clid: dmb_params.clid,
        payload: {
          command: 'createUser',
          // dmb_client will trigger this event upon receiving reply
          // from the backend, acts like a callback.
          // See the handler is below.
          trigger: 'userReady'
        }
      };
      jQuery(document).trigger(e);
    } else {
      // update UI
      jQuery('#onoffid').text(window.onOffUser.userId);
    }
  });

  // upon receiving a new userId from the backend
  jQuery(document).on('userReady', function(event) {
    if (event.params.payload) {
      var user = JSON.parse(event.params.payload).user;
      console.log('new user object received: ', user);
      if (typeof user !== 'undefined' && ! window.onOffUser) {
        window.onOffUser = user;
        localStorage.setItem('onOffUser', JSON.stringify(user));
        jQuery('#onoffid').text(user.userId);
        jQuery(document).trigger('onOffUser', {userId: user.userId});
      }
    } else {
      console.log('userReady triggered without payload', event);
    }
  });
});
