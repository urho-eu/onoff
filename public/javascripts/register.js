/**
 * OnOff - Device registration including Instascan QR reader
 *
 * Kudos to Chris Schmich for
 * https://schmich.github.io/instascan/
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

jQuery(document).ready(function() {
  // wait till onOffUser gets available; see account.js
  jQuery(document).on('onOffUser', initRegister);

  // registerDevice event can be triggered from many places
  jQuery(document).on('registerDevice', function(event, params) {
    registerDevice(event, params);
  });
  // re-register device when clicking on it's ID in the list
  jQuery('.devid').on('click', function(event) {
    event.preventDefault();
    console.log('dev re-register');
    var params = {
      bkid: dmb_params.bkid,
      clid: dmb_params.clid,
      deviceId: jQuery(event.target).text(),
      deviceType: jQuery(event.target).attr('x-deviceType')
    };
    jQuery(document).trigger('registerDevice', params);
  });
});

/**
 * initialize the code for the page
s */
function initRegister() {

  console.log('initRegister');

  jQuery(document).trigger('initDeviceList', {page: 'register'});

  if (localStorage.getItem('devices') == null) {
    console.log('create local device registry');
    localStorage.setItem('devices', '');
  }

  jQuery('#register').attr('disabled', 'disabled').on('click', function() {
    var params = {
      deviceId: jQuery('#deviceid').val(),
      deviceType: 'SmartSocket'
    };
    if (params.deviceId != '') {
      jQuery(document).trigger('registerDevice', params);
    }
  });

  let scanner = new Instascan.Scanner({
    video: document.getElementById('preview'),
  });

  scanner.addListener('scan', function (content) {
    jQuery('#deviceid').val(content).trigger('change');
    jQuery('#register').removeAttr('disabled');
  });

  Instascan.Camera.getCameras().then(function (cameras) {
    if (cameras.length > 0) {
      jQuery(document).on('change', '.cameras input', function(event) {
        var index = jQuery(event.target).val();
        if (typeof cameras[index] !== 'undefined' &&
          jQuery('#preview').attr('x-cam') != index) {
          scanner.stop();
          jQuery('#register').attr('disabled', 'disabled');

          scanner.start(cameras[index]);
          jQuery('#preview').attr('x-cam', index);
          console.log('new cam selected: ', index);
        }
      });

      jQuery(document).on('change', '#deviceid', function(event) {
        var keycode = (event.keyCode ? event.keyCode : event.which);
        if(keycode == '13'){
          alert('"enter" pressed; call register');
        }
        var devid = jQuery(event.target).val().trim();
        if (devid !== '') {
          console.log('valid devid', devid);
          jQuery('#register').removeAttr('disabled');
        } else {
          jQuery('#register').attr('disabled', 'disabled');
        }
      })

      jQuery('.caminfo').addClass('hidden');
      jQuery('.cameras').removeClass('hidden');
      jQuery('.video').removeClass('hidden');
      //jQuery('#deviceid').attr('disabled', 'disabled');
      jQuery('#register').attr('disabled', 'disabled');

      var cameraTag = jQuery('.camtmpl input').first();
      var labelTag = jQuery('.camtmpl span').first();

      cameras.forEach(function(camera, index) {
        cameraTag.clone(true).val(index).appendTo('.cameras');
        labelTag.clone(true).appendTo('.cameras').text(camera.name);
      });

      jQuery('.cameras input').first().attr('checked', 'checked');
      var index = jQuery('.cameras input[checked]').val();

      if (typeof cameras[index] !== 'undefined') {
        scanner.start(cameras[index]);
        jQuery('#preview').attr('x-cam', index);
      }

    } else {
      jQuery('.caminfo').removeClass('hidden');
      jQuery('.cameras').addClass('hidden');
      jQuery('.video').addClass('hidden');
      //jQuery('#deviceid').removeAttr('disabled');
      jQuery('#register').attr('disabled', 'disabled');
      console.error('No cameras found.');
    }
  }).catch(function (e) {
    console.error(e.message);
  });
}

/**
 * Registers a new device
 */
function registerDevice(event, params) {
  /**
   * registers a new device at the backend
   *
   * The dmb_downlink event is used to communicate with
   * dmb_client.js, which is the single point of contact
   * towards the DMB backend.
   */
  var e = jQuery.Event('dmb_downlink');
  e.params = {
    clid: dmb_params.clid,
    payload: {
      command: 'registerDevice',
      userId: window.onOffUser.userId,
      deviceId: params.deviceId,
      deviceType: params.deviceType,
      // dmb_client will trigger this event upon receiving reply
      // from the backend, acts like a callback.
      // See the handler is below.
      trigger: 'deviceRegistered'
    }
  };
  jQuery(document).trigger(e);
}
// upon receiving a new userId from the backend
jQuery(document).on('deviceRegistered', function(event) {
  if (event.params.payload) {
    var device = JSON.parse(event.params.payload).device;
    console.log('new device object received: ', device);

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

    if (deviceIds.lastIndexOf(device.deviceId) <= -1) {
      devices.push(device);
      localStorage.setItem('devices', JSON.stringify(devices));
      console.log('device registered');
      if (jQuery('.devices:hidden')) {
        jQuery(document).trigger('initDeviceList', {page: 'register'});
      }
    } else {
      console.log('device has already been registered');
    }
  } else {
    console.log('deviceRegistered triggered without payload', event);
  }
});
