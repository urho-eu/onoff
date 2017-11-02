/**
 * OnOff - Control the uplink message viewer
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

jQuery(document).ready(function() {
  jQuery('#dmbswitch').on('click', function(event, params) {
    if (jQuery('#dmbswitch').is(':checked')) {
      jQuery('.dmb #messages').show();
    } else {
      jQuery('.dmb #messages').hide();
    }
  });
});
