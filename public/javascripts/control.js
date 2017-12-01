/**
 * OnOff - Device control view
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

jQuery(document).ready(function() {
  // wait till onOffUser gets available; see account.js
  jQuery(document).on('onOffUser', initControl);

  // changeLoRaWANClass event can be triggered from many places
  jQuery(document).on('changeLoRaWANClass', function(event, params) {
    changeLoRaWANClass(event, params);
  });

  // removeDevice event can be triggered from many places
  jQuery(document).on('removeDevice', function(event, params) {
    removeDevice(event, params);
  });

  // changeUplinkTimer event can be triggered from many places
  jQuery(document).on('changeUplinkTimer', function(event, params) {
    changeUplinkTimer(event, params);
  });
});

/**
 * Decodes base64 string to hex string
 */
function decodeServerb64(str) {
    return atob(str).split('').map(function(c) {
      var hex = c.charCodeAt(0).toString(16);
      hex = (hex.length === 1) ? '0' + hex : hex;
      return hex;
    }).join('');
}

/**
 * Decodes server time to human readable string
 */
function decodeServerTime(num) {
  var from = Number.parseFloat(num) * 1000;
  var d = new Date(from);
  return d.toLocaleString();
}

/**
 * initialize the control part for the page
 */
function initControl() {

  console.log('initControl');

  jQuery(document).trigger('initDeviceList', {page: 'control'});

  // handler of the switch
  jQuery("#switch").off('change');
  jQuery('#switch').on('change', { value: 1 }, function(event) {

    var deviceId = jQuery('#deviceid').text() || 'n/a';
    /**
     * command to the device
     *
     * The dmb_downlink event is used to communicate with
     * dmb_client.js, which is the single point of contact
     * towards the DMB backend.
     */
    var e = jQuery.Event('dmb_downlink');
    e.params = {
      clid: dmb_params.clid,
      payload: {
        userId: window.onOffUser.userId,
        deviceId: deviceId,
        command: jQuery('#switch').is(':checked') ? 'switchOn' : 'switchOff'
      }
    }
    jQuery(document).trigger(e);
  });

  // handler for duty cycle switch
  jQuery("#dutycycle").off('change');
  jQuery('#dutycycle').on('change', { value: 1 }, function(event) {

    var deviceId = jQuery('#deviceid').text() || 'n/a';
    /**
     * command to the device
     *
     * The dmb_downlink event is used to communicate with
     * dmb_client.js, which is the single point of contact
     * towards the DMB backend.
     */
    var e = jQuery.Event('dmb_downlink');
    e.params = {
      clid: dmb_params.clid,
      payload: {
        userId: window.onOffUser.userId,
        deviceId: deviceId,
        command: jQuery('#dutycycle').is(':checked') ? 'dutyCycleOn' : 'dutyCycleOff'
      }
    }
    jQuery(document).trigger(e);
  });

  // handler for LoRaWAN Class selector
  jQuery(document).on('change', '.lorawanclass input', function(event) {
    var params = {
      deviceId: jQuery('#deviceid').text(),
      lorawanclass: jQuery(event.target).val()
    };
    console.log(params);
    jQuery(document).trigger('changeLoRaWANClass', params);
  });

  // change uplink scheduler
  jQuery(document).on('change', '.timer input', function(event) {
    var params = {
      deviceId: jQuery('#deviceid').text(),
      timer: jQuery(event.target).val()
    };
    jQuery(document).trigger('changeUplinkTimer', params);
  });

  // remove device button handler
  jQuery('#removedev').on('click', function() {
    var params = {
      deviceId: jQuery('#deviceid').text(),
      deviceType: 'SmartSocket'
    };
    if (params.deviceId != '') {
      jQuery(document).trigger('removeDevice', params);
    }
  });

  // may be triggered by dmb_client if received data which did not include
  // an event name to trigger
  jQuery(document).on('device_uplink', function(event, params) {
    console.log('control should handle this:', event.params);
    var decoded = null;
    var data = JSON.parse(event.params.payload);
    try {
      decoded = decodeServerb64(data.status.payload);
    } catch (e) {
      //
    }

    if (decoded) {
      if (jQuery('#deviceid').text().trim() == data.status.dev_eui.trim()) {
        console.log('Uplink from device:', decoded);
        jQuery('#uplinkdata').text(decoded + ' (' + decodeServerTime(data.status.radio.server_time) + ')');
        var splits = decoded.match(/.{1,2}/g);
        switch (splits[0]) {
          case '21':
            // status message
            (splits[2] == '01') ? jQuery('#switch').attr('checked', 'checked') : jQuery('#switch').removeAttr('checked');
            break;
          case '22':
            // consumption message
            break;
          case '29':
            // hello world
            break;
        }
      }
    }
  });
}

/**
 * Removes a device
 */
function removeDevice(event, params) {
  /**
   * The dmb_downlink event is used to communicate with
   * dmb_client.js, which is the single point of contact
   * towards the DMB backend.
   */
  var e = jQuery.Event('dmb_downlink');
  e.params = {
    clid: dmb_params.clid,
    payload: {
      command: 'removeDevice',
      userId: window.onOffUser.userId,
      deviceId: params.deviceId,
      deviceType: params.deviceType,
      // dmb_client will trigger this event upon receiving reply
      // from the backend, acts like a callback.
      // See the handler is below.
      trigger: 'deviceRemoved'
    }
  };
  jQuery(document).trigger(e);
}

// upon successfully removing a device
jQuery(document).on('deviceRemoved', function(event) {
  console.log('deviceRemoved event: ', event.params);
  var deviceId = JSON.parse(event.params.payload).device.deviceId;

  if (deviceId) {
    // remove device from localstorage
    var devices = [];
    var rawdevices = localStorage.getItem('devices');

    try {
      devices = JSON.parse(rawdevices);
    } catch(e) {
      //console.log('error parsing: ', e);
    }
    var deviceIds = devices.map(function(elem) {
      return elem.deviceId;
    });
    var index = deviceIds.indexOf(deviceId);
    if (index > -1) {
      devices.splice(index, 1);
      localStorage.setItem('devices', JSON.stringify(devices));
      console.log(deviceId + ' removed');
      jQuery(document).trigger('initDeviceList', {page: 'control'});
    } else {
      console.log('device not in the list');
    }
  }
});

/**
 * Changes LoRaWAN Class of the RN2483 in the smart socket
 */
function changeLoRaWANClass(event, params) {
  /**
   * The dmb_downlink event is used to communicate with
   * dmb_client.js, which is the single point of contact
   * towards the DMB backend.
   */
  var e = jQuery.Event('dmb_downlink');
  e.params = {
    clid: dmb_params.clid,
    payload: {
      userId: window.onOffUser.userId,
      deviceId: params.deviceId,
      command: 'changeLoRaWANClass',
      lorawanclass: params.lorawanclass
    }
  };
  jQuery(document).trigger(e);
}

/**
 * Changes uplink timer of a device
 */
function changeUplinkTimer(event, params) {
  /**
   * The dmb_downlink event is used to communicate with
   * dmb_client.js, which is the single point of contact
   * towards the DMB backend.
   */
  var e = jQuery.Event('dmb_downlink');
  e.params = {
    clid: dmb_params.clid,
    payload: {
      userId: window.onOffUser.userId,
      deviceId: params.deviceId,
      command: 'changeUplinkTimer',
      timer: params.timer
    }
  };
  jQuery(document).trigger(e);
}
