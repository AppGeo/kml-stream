#!/usr/bin/env node

var jsonstream = require('jsonstream3');
var Kml = require('./');

process.stdin.pipe(new Kml()).pipe(jsonstream.stringify('{"type": "FeatureCollection", "features":[\n', '\n,\n', "\n]}\n")).pipe(process.stdout);
