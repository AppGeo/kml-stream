#!/usr/bin/env node

const jsonstream = require('jsonstream-next');
const { pipeline } = require('stream');
const Kml = require('./');

const stream = pipeline(
  process.stdin,
  new Kml(),
  jsonstream.stringify('{"type": "FeatureCollection", "features":[\n', '\n,\n', "\n]}\n"),
  process.stdout,
  (err) => {
    if (err) stream.emit('error', err)
  }
)
