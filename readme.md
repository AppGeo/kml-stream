kml-stream
===

[![Build Status](https://travis-ci.org/AppGeo/kml-stream.svg)](https://travis-ci.org/AppGeo/kml-stream)

Transform stream that reads binary data and emits geojson feature objects.

Also a command line tool is included `kml2geojson`, takes a kml file in stdin, emits geojson from stdout

```bash
npm install -g kml-stream

kml2geojson < file.kml > file.geojson
```
