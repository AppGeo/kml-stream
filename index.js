'use strict';
var sax = require('sax');
var Transform = require('readable-stream').Transform;
var inherits = require('inherits');
module.exports = KmlStream;
inherits(KmlStream, Transform);
function KmlStream() {
  if (!(this instanceof KmlStream)) {
    return new KmlStream();
  }
  Transform.call(this, {
    objectMode: true
  });
  this.parser = sax.parser(false, {
    lowercase: true
  });
  this.schemata = {};
  this.setEvents();
  this.geom = null;
  this.props = null;
  this.exData = null;
  this.field = null;
  this.geoMode = null;
  this.isMulti = 0;
  this.allGeoms = [];
  this.geoms = null;
}
KmlStream.prototype._transform = function (chunk, _, next) {
  this.parser.write(chunk.toString());
  next();
};
KmlStream.prototype._flush = function (done) {
  this.parser.close();
  done();
};
KmlStream.prototype.handleData = function (key, value) {
  if (!this.props || !value || !this.headers) {
    return;
  }
  var field = this.headers[key];
  if (!field) {
    return;
  }
  var type = field.type;
  if (!type) {
    return;
  }
  var parsedValue;
  switch (type) {
    case 'uint':
    case 'int':
    case 'short':
    case 'ushort':
      parsedValue = parseInt(value, 10);
      break;
    case 'float':
    case 'double':
      parsedValue = parseFloat(value);
      break;
    case 'bool':
      if (value === 'true' || value === '1') {
        parsedValue = true;
      } else if (value === 'false' || value === '0') {
        parsedValue = false;
      } else {
        return;
      }
      break;
    case 'string':
      parsedValue = cleanString(value);
      if (!parsedValue) {
        return;
      }
      break;
    default:
      return;
  }
  if (field.displayName) {
    this.props[field.displayName] = parsedValue;
  } else {
    this.props[key] = parsedValue;
  }
};
function cleanString(val) {
  return val
    .replace(/^[\n\r\t]+[\n\r\t]+$/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\([r|n|t])/g, function (a, b) {
      switch(b) {
        case 'r':
          return '\r';
        case 'n':
          return '\n';
        case 't':
          return '\t';
      }
    }).trim();
}
KmlStream.prototype.setEvents = function () {
  var self = this;
  this.parser.onopentag = function (tag) {
    switch(tag.name) {
      case 'simplefield':
        self.headers[tag.attributes.name] = self.field = {
          type: tag.attributes.type
        };
        return;
      case 'schemadata':
        self.headers = self.schemata[tag.attributes.schemaurl];
        return;
      case 'schema':
        self.headers = self.schemata['#' + tag.attributes.id] = {};
        return;
      case 'placemark':
        self.props = {};
        return;
      case 'data':
        self.exData = {
          name: tag.attributes.name
        };
        return;
      case 'point':
        self.geom = {};
        self.geom.type = 'Point';
        self.geoMode = 'point';
        return;
      case 'linestring':
        self.geom = {};
        self.geom.type = 'LineString';
        self.geoMode = 'linestring';
        return;
      case 'polygon':
        self.geom = {};
        self.geom.type = 'Polygon';
        self.geom.coordinates = [];
        self.geoMode = 'poly';
        return;
      case 'outerboundaryis':
        self.geoMode = 'outerbounds';
        return;
      case 'innerboundaryis':
        self.geoMode = 'innerbounds';
        return;
      case 'multigeometry':
        if (self.isMulti) {
          self.allGeoms.push(self.geoms);
        }
        self.isMulti++;
        self.geoms = [];
    }
  };
  this.parser.ontext = function (data) {
    var thing;
    if (!data.trim()) {
      return;
    }
    switch(this.tag.name) {
      case 'simpledata':
        self.handleData(this.tag.attributes.name, data);
        return;
      case 'value':
        if (self.exData) {
          self.exData.value = data;
        }
        return;
      case 'displayname':
        if (self.exData) {
          self.exData.displayName = data;
        } else if (self.field) {
          self.field.displayName = data;
        }
        return;
      case 'coordinates':
        if (self.geoMode === 'point') {
          self.geom.coordinates = parseCord(data);
        } else if(self.geoMode === 'linestring') {
          self.geom.coordinates = parseCords(data);
        } else if (self.geoMode === 'outerbounds') {
          thing = parseCords(data);
          if (thing) {
            self.geom.coordinates.unshift(thing);
          }
        } else if (self.geoMode === 'innerbounds') {
          thing = parseCords(data);
          if (thing) {
            self.geom.coordinates.push(thing);
          }
        }
    }
  };
  function parseCord(data) {
    var out = data.split(',').map(function (item) {
      return parseFloat(item);
    });
    if (out.length === 3 && out[2] === 0) {
      return out.slice(0, 2);
    }
    return out;
  }
  function parseCords(data) {
    data = data.trim();
    if (!data) {
      return null;
    }
    return data.split(/[^0-9\-\.\,]+/).map(function (item) {
      return parseCord(item);
    });
  }
  this.parser.onclosetag = function (tag) {
    var geoms, type;
    switch(tag) {
      case 'placemark':
        var out = {
          type: 'Feature',
          properties: self.props,
          geometry: null
        };
        if (self.geom.type) {
          out.geometry = self.geom;
        }
        self.geom = self.props = null;
        self.push(out);
        return;
      case 'schemadata':
      case 'schema':
        self.headers = null;
        return;
      case 'simplefield':
        self.field = null;
        return;
      case 'data':
        if (!self.exData || !self.props || !self.exData.value) {
          return;
        }
        if (self.exData.displayName) {
          self.props[self.exData.displayName] = self.exData.value;
        } else if(self.exData.name) {
          self.props[self.exData.name] = self.exData.value;
        }
        self.exData = null;
        return;
      case 'point':
      case 'linestring':
      case 'polygon':
        self.geoMode = null;
        if (self.isMulti) {
          self.geoms.push(self.geom);
          self.geom = null;
        }
        return;
      case 'outerboundaryis':
      case 'innerboundaryis':
        self.geoMode = 'poly';
        return;
      case 'multigeometry':
        self.isMulti--;
        geoms = self.geoms;
        self.geoms = null;
        if (self.isMulti) {
          self.geoms = self.allGeoms.pop();
        }
        if (geoms.length === 0) {
          return;
        }
        if (geoms.length === 1) {
          self.geom = geoms[0];
          if (self.isMulti) {
            self.geoms.push(self.geom);
            self.geom = null;
          }
          return;
        }
        type = getMultiType(geoms);
        if (type === 'mixed') {
          self.geom = {
            type: 'GeometryCollection',
            geometries: geoms
          };
        } else if (type === 'Point') {
          self.geom = {
            type: 'MultiPoint',
            coordinates: getThings(geoms)
          };
        } else if (type === 'LineString') {
          self.geom = {
            type: 'MultiLineString',
            coordinates: getThings(geoms)
          };
        } else if (type === 'Polygon') {
          self.geom = {
            type: 'MultiPolygon',
            coordinates: getThings(geoms)
          };
        } else if (type === 'GeometryCollection') {
          self.geom = {
            type: 'GeometryCollection',
            geometries: mergeGeoms(geoms)
          };
        } else if (type.slice(0, 5) === 'Multi') {
          self.geom = {
            type: type,
            coordinates: mergeCoords(geoms)
          };
        }
        if (self.isMulti) {
          self.geoms.push(self.geom);
          self.geom = null;
        }
        return;
    }
  };
};
function getThings(geoms) {
  return geoms.map(function (item) {
    return item.coordinates;
  });
}
function mergeGeoms(geoms) {
  return geoms.reduce(function (a, b) {
    return a.concat(b.geometries);
  }, []);
}
function mergeCoords(geoms) {
  return geoms.reduce(function (a, b) {
    return a.concat(b.coordinates);
  }, []);
}
function getMultiType(geoms) {
  var type;
  var i = -1;
  var len = geoms.length;
  while (++i < len) {
    if (!type) {
      type = geoms[i].type;
      continue;
    }
    if (type !== geoms[i].type) {
      return 'mixed';
    }
  }
  return type;
}
