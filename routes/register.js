/**
 * Register route for OnOff
 *
 * Author: ferenc.szekely@urho.eu
 * License: MIT
 *
 * Copyright (c) 2017 Ferenc Székely
 */
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('register', { title: 'OnOff' });
});

module.exports = router;
