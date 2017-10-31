/**
 * OnOff - Populate device list element
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

jQuery(document).ready(function() {
  // wait till onOffUser gets available; see account.js
  jQuery(document).on('initDeviceList', function(event, params) {
    initDeviceList(event, params);
  });
});

/**
 * initialize the device list on the page
 *
 * params.page could be 'control' or 'register'
 *
 */
function initDeviceList(event, params) {

  console.log('initDeviceList');

  var devices = [];
  var rawdevices = localStorage.getItem('devices');
  var deviceTag = jQuery('.devtmpl').first();
  var newTag;

  try {
    devices = JSON.parse(rawdevices);
  } catch(e) {
    //console.log('error parsing: ', e);
  }
  if (devices instanceof Array && devices.length) {

    jQuery('.control').show();
    jQuery('.devices .devtmpl').remove();

    devices.map(function(elem) {
      console.log('append list');
      newTag = deviceTag.clone(true).removeClass('hidden').appendTo('.devices');
      if (params.page == 'control') {
        newTag.find('input').val(elem.deviceId);
      } else {
        newTag.find('input').remove();
      }
      newTag.find('span').text(elem.deviceId).attr('x-deviceType', elem.deviceType);
    });

    var selected = jQuery('.devices').removeClass('hidden').find('input:first').attr('checked', 'checked').val();
    jQuery('#deviceid').text(selected);

    if (params.page == 'control') {
      jQuery(document).on('change', '.devices input', function(event) {
        var device = jQuery(event.target).val();
        jQuery('#deviceid').text(device);
      });
    }
  } else {
    if (params.page == 'control') {
      jQuery('.nodevices').show();
    }
  }
}
