/**
 * OnOff web app for SmartSocket
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
'use strict';

//var aws = require('aws-sdk');
var awsIotDevice = require('aws-iot-device-sdk');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var dmb = require('./lib/dmb/dmb');
var rp = require('request-promise');

const EventEmitter = require('events');
const dmbEvent = new EventEmitter();
const uplinkEventName = 'from_onoff';
const downlinkEventName = 'to_onoff';

// config files
const onoff = require('./config/onoff.config');
const grus = require('./config/grus.config');
//
var debug = require('debug')(onoff.name);
var ev_emit_debug = require('debug')(onoff.name + '_EV_EMIT');
var ev_recv_debug = require('debug')(onoff.name + '_EV_RECV');

var aws_debug = require('debug')('AWS');
var aws_msg_debug = require('debug')('AWS_MSG');

// routes
var index = require('./routes/index');
var users = require('./routes/users');
var register = require('./routes/register');
var control = require('./routes/control');

// app setup
var app = express();
app.set('allSubs', false);
app.set('users', []);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);
app.use('/register', register);
app.use('/control', control);

dmb.start(dmbEvent, uplinkEventName, downlinkEventName);

debug('booting...');

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

/**
 * AWS setup and handlers
 */
var awsOptions = {
  // for awsIot
  //accessKeyId: grus.accessKeyId,
  //secretAccessKey: grus.secretAccessKey,
  // for awsDevice
  keyPath: grus.iot.keyPath,
  certPath: grus.iot.certPath,
  caPath: grus.iot.caPath,
  // common
  region: grus.region,
  host: grus.iot.endPoint,
  clientId: grus.iot.clientId
};

//var awsIot = new awsIot(awsOptions);
var awsDevice = awsIotDevice.device(awsOptions);

/**
 * Listener for DMB event
 *
 *    DOWNLINK  <--                direction                -->  UPLINK
 * <device> <--> Operator <--> Grus <--> OnOff backend (DMB) <--> OnOff UI
 *
 * This event is emitted by DMB upon receiving a downlink command
 * from the UI via the websocket.
 */
dmbEvent.on(downlinkEventName, function(params) {
  setImmediate(() => {
    ev_recv_debug('%s %o', downlinkEventName, params);
    if (typeof params.type == 'undefined') {
      // invalid
      return;
    }
    switch (params.type) {
      case 'command':
        handleDownlinkCommand(params);
        break;
      case 'user_update':
        handleUserUpdate(params);
        break;
      default:
        debug('invalid command type from DMB');
    }
  });
});

awsDevice.on('connect', function(res) {
  aws_debug('device connected: %o', res);
});

// any message received in any subscribed topic
awsDevice.on('message', function(topic, payload) {
  var payload_str = payload.toString();
  aws_msg_debug('%s %o', topic, payload_str);
  // get the deviceId from the topic
  // e.g. $aws/things/0004a30b001a8765_uplink/shadow/update/accepted
  var thingName = topic.split('/', 3)[2];
  var deviceId = thingName.split('_')[0];

  // placeholder for the thing's userId attribute
  var userId = '';

  var options = {
    method: 'GET',
    uri: grus.apiGw.staging.endPoint + 'devices?deviceId=' + deviceId,
    headers: {
      'x-api-key': grus.apiGw.staging.apiKey,
      'Grus-ApplicationId': grus.applicationId
    },
    json: true
  };

  rp(options).
  then(function(response) {
    aws_msg_debug('device GET success: ', response);

    var device = JSON.parse(response).devices[0];
    aws_msg_debug('device GET success parsed: ', device);
    // pass the result to DMB, which will send it the appropriate websocket
    var json = JSON.parse(payload);
    var data = json.state.desired;
    if (data) {
      var params = {
        response: {
          userId: device.userId,
          applicationId: device.applicationId,
          deviceId: deviceId,
          data: JSON.stringify(data),
          trigger: 'device_uplink'
        }
      }
      sendToAllActiveConnections(device.userId, params);
    }
  }).
  catch(function(err) {
    aws_debug('device GET NOK:', err.message);
  });
});

subscribeTopics();

/**
 * Emits uplinkEventName events as many times as many active
 * connections the userId has
 */
function sendToAllActiveConnections(userId = null, params = {}) {
  // send this to all active connections of the user
  var index = app.get('users').findIndex(function(user) {
    return user.userId == userId;
  })
  if (index > -1)
  {
    // user exists; don't do anything..
    // app.get('users')[index] = user;
    app.get('users')[index].sockets.forEach(function(sid, idx) {
      params.socket = {sid: sid}
      ev_emit_debug('#%d %s %o', idx, uplinkEventName, params);
      dmbEvent.emit(uplinkEventName, params);
    });
  }
}

/**
 * List all devices and subscribe to topics that
 * belong to deices of onoff
 */
function subscribeTopics() {
  var options = {
    method: 'GET',
    uri: grus.apiGw.staging.endPoint + 'devices',
    headers: {
      'x-api-key': grus.apiGw.staging.apiKey,
      'Grus-ApplicationId': grus.applicationId
    },
    json: true
  };
  rp(options).
  then(function(res) {
    JSON.parse(res).devices.forEach(function(device, index) {
      var topic = '$aws/things/' + device.deviceId + '_uplink/shadow/update/accepted';
      var res = awsDevice.subscribe(topic, {qos: 1}, function(err, data) {
        aws_debug('#%d subscription result: %o %o', index, err, data);
      });
    });
  }).
  catch(function(err) {
    debug('devices GET NOK:', err.message);
  });
}

/**
 * Request handlers - messages received from the frontend via DMB (ws)
 *
 * These commands come from the frontend and forwarded to Grus.
 * Grus will either reply or will forward them to the end-device.
 *
 *    DOWNLINK  <--                direction                -->  UPLINK
 * <device> <--> Operator <--> Grus <--> OnOff backend (DMB) <--> OnOff UI
 */
function handleDownlinkCommand(params) {
  debug('Handle downlink payload: %o', params);

  switch(params.payload.command) {
    case 'createUser':
      // HTTP POST to AWS
      var options = {
        method: 'POST',
        uri: grus.apiGw.staging.endPoint + 'users',
        headers: {
          'x-api-key': grus.apiGw.staging.apiKey,
          'Grus-ApplicationId': grus.applicationId
        },
        json: true
      };
      rp(options).
      then(function(res) {

        var response = {
          response: {
            data: res,
            applicationId: grus.applicationId,
            socket: { sid: params.socket.sid },
            trigger: params.payload.trigger
          },
          bkid: params.bkid,
          clid: params.clid,
          socket: { sid: params.socket.sid }
        }
        ev_emit_debug('%s %o', uplinkEventName, response);
        dmbEvent.emit(uplinkEventName, response);
      }).
      catch(function(err) {
        debug('users POST NOK:', err.message);
      });
      break;
    case 'registerDevice':
      // HTTP POST to AWS
      var options = {
        method: 'POST',
        uri: grus.apiGw.staging.endPoint + 'devices',
        headers: {
          'x-api-key': grus.apiGw.staging.apiKey,
          'Grus-ApplicationId': grus.applicationId,
          'Grus-UserId': params.payload.userId
        },
        body: {
          'deviceId': params.payload.deviceId,
          'deviceType': params.payload.deviceType
        },
        json: true // Automatically stringifies the body to JSON
      };
      rp(options).
      then(function(res) {
        var resJson = JSON.parse(res);
        aws_msg_debug('response: %o', resJson);

        var response = {
          response: {
            data: res,
            userId: params.payload.userId,
            applicationId: resJson.device.applicationId,
            deviceId: resJson.device.deviceId,
            trigger: params.payload.trigger
          },
          bkid: params.bkid,
          clid: params.clid
        }
        sendToAllActiveConnections(params.payload.userId, response);

        //dmbEvent.emit(uplinkEventName, response);
      }).
      then(function(res) {
        aws_debug('subscribe to shadow/update/accepted of', params.payload.deviceId);
        awsDevice.subscribe('$aws/things/' + params.payload.deviceId + '_uplink/shadow/update/accepted');
      }).
      catch(function(err) {
        debug('device POST NOK:', err.message);
      });
      break;
    case 'removeDevice':
      // HTTP POST to AWS
      var options = {
        method: 'DELETE',
        uri: grus.apiGw.staging.endPoint + 'devices?deviceId=' + params.payload.deviceId,
        headers: {
          'x-api-key': grus.apiGw.staging.apiKey,
          'Grus-ApplicationId': grus.applicationId,
          'Grus-UserId': params.payload.userId
        },
        json: true // Automatically stringifies the body to JSON
      };
      rp(options).
      then(function(res) {
        var resJson = JSON.parse(res);
        aws_msg_debug('response: %o', resJson);

        var response = {
          response: {
            data: res,
            userId: params.payload.userId,
            applicationId: resJson.device.applicationId,
            deviceId: resJson.device.deviceId,
            trigger: params.payload.trigger
          },
          bkid: params.bkid,
          clid: params.clid
        }
        sendToAllActiveConnections(params.payload.userId, response);

        //dmbEvent.emit(uplinkEventName, response);
      }).
      catch(function(err) {
        debug('device DELETE NOK:', err.message);
      });
      break;
    case 'switchOff':
      // translate the received command to device specific command
      params.payload.deviceCommand = '300100';
      publishPayload(params.payload);
      break;
    case 'switchOn':
      // translate the received command to device specific command
      params.payload.deviceCommand = '300101';
      publishPayload(params.payload);
      break;
    case 'changeUplinkTimer':
      // translate the received command to device specific command
      params.payload.deviceCommand = '31';
      var newTimer = Number(params.payload.timer).toString(16);
      var padding = '0'.repeat(6 - newTimer.length);
      var seqNum = '00';
      params.payload.deviceCommand += seqNum + (padding + newTimer);
      //debug('params %o', params);
      publishPayload(params.payload);
      break;
    case 'dutyCycleOn':
      // translate the received command to device specific command
      params.payload.deviceCommand = '400100';
      publishPayload(params.payload);
      break;
    case 'dutyCycleOff':
      // translate the received command to device specific command
      params.payload.deviceCommand = '400101';
      publishPayload(params.payload);
      break;
    case 'changeLoRaWANClass':
      // translate the received command to device specific command
      debug('params %o', params);
      params.payload.deviceCommand = '400102';
      switch (params.payload.lorawanclass) {
        case '3':
          params.payload.deviceCommand = '400103';
          break;
      }

      publishPayload(params.payload);
      break;
    default:
      debug('Unknown downlink command received. Skipping.');
  }
}

/**
 * Handle messages received from Grus
 *
 * These messages go from Grus towards OnOff ot perhaps to
 * the frontend directly..
 */
function handleUplink(params) {
  debug('Handle uplink: ', params);
}

/**
 * Update the active user registery (ie. active websockets
 */
function handleUserUpdate(params) {

  debug('Handle user update: %o', params);

  var index = -1;
  index = app.get('users').findIndex(function(user) {
    return user.userId == params.userId;
  })

  switch (params.action) {
    case 'connect':
    case 'reconnect':
      var user = {
        userId: params.userId,
        sockets: [params.socket.sid]
      }

      if (index > -1)
      {
        // user exists; don't do anything..
        // app.get('users')[index] = user;
        app.get('users')[index].sockets.push(params.socket.sid);
        debug('connections of user %o', app.get('users')[index]);
      } else {
        // push new user
        app.get('users').push(user);
        debug('new active user %o', user);
      }
      break;
    case 'disconnect':
      if (index > -1)
      {
        var socketIndex = app.get('users')[index].sockets.indexOf(params.socket.sid);
        if (socketIndex > -1) {
          app.get('users')[index].sockets.splice(socketIndex, 1);
          debug('connections of user %o', app.get('users')[index]);
        }
      }
      break;
    default:
      debug('unknown user_update action: %s', params.action);
  }
}

/**
 * Push a message to the shadow
 */
function publishPayload(payload) {
  var shadowPayload = {
    state: {
      desired: {
        payload: payload
      }
    }
  };
  awsDevice.publish('$aws/things/' + payload.deviceId + '_downlink/shadow/update', JSON.stringify(shadowPayload));
}

module.exports = app;
