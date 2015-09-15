var fs = require('fs');
var KmlStream = require('./');
var test = require('tape');
var geojsonhint = require('geojsonhint');
var out = [];
test('valid geojson', function (t) {
  t.plan(1);
  fs.createReadStream('./test.kml').pipe(new KmlStream()).on('data', function (d) {
    out.push(d);
  }).on('end', function () {
    var msg = geojsonhint.hint({
      type: 'FeatureCollection',
      features: out
    });
    t.notOk(msg.length, 'no errors');
  }).on('error', function (e) {
    t.error(e);
  });
});
