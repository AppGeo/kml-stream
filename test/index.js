const fs = require('fs')
const test = require('tape')
const { join } = require('path')
const { pipeline } = require('stream')
const geojsonhint = require('@mapbox/geojsonhint')
const KmlStream = require('..')


test('basic file is valid geojson', (t) => {
  const buffer = []
  t.plan(1)
  pipeline(
    fs.createReadStream(join(__dirname, './basic.kml')),
    new KmlStream(),
    (err) => {
      if (err) t.error(err)
      const errs = geojsonhint.hint({
        type: 'FeatureCollection',
        features: buffer
      }).filter((m) => m.level !== 'message')
      t.notOk(errs.length, 'no errors')
    }
  ).on('data', (d) => buffer.push(d))
})

test('paths file is valid geojson', (t) => {
  const buffer = []
  t.plan(1)
  pipeline(
    fs.createReadStream(join(__dirname, './paths.kml')),
    new KmlStream(),
    (err) => {
      if (err) t.error(err)
      const errs = geojsonhint.hint({
        type: 'FeatureCollection',
        features: buffer
      }).filter((m) => m.level !== 'message')
      t.notOk(errs.length, 'no errors')
    }
  ).on('data', (d) => buffer.push(d))
})

test('businesses file is valid geojson', (t) => {
  const buffer = []
  t.plan(2)
  pipeline(
    fs.createReadStream(join(__dirname, './businesses.kml')),
    new KmlStream(),
    (err) => {
      if (err) t.error(err)
      const errs = geojsonhint.hint({
        type: 'FeatureCollection',
        features: buffer
      }).filter((m) => m.level !== 'message')
      t.notOk(errs.length, 'no errors')

      t.deepEqual(buffer[0], {
        type: 'Feature',
        properties: {
          folder: {
            name: 'Open for Take-Out'
          },
          name: 'Fiore Fine Foods',
          styleurl: '#icon-seq2-0-0-0288D1-nodesc'
        },
        geometry: { type: 'Point', coordinates: [ -75.1444634, 39.9383731 ] }
      })
    }
  ).on('data', (d) => buffer.push(d))
})
