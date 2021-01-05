const sax = require('sax')
const { Transform } = require('stream')

module.exports = class KmlStream extends Transform {
  constructor() {
    super({ objectMode: true })
    this.parser = sax.parser(false, {
      lowercase: true
    })
    this.currentTag = null
    this.schemata = {}
    this.setEvents()
    this.geom = null
    this.props = null
    this.folder = null
    this.exData = null
    this.field = null
    this.geoMode = null
    this.isMulti = 0
    this.allGeoms = []
    this.geoms = null
  }
  _transform(chunk, _, next) {
    this.parser.write(chunk.toString())
    next()
  }
  _final(done) {
    this.parser.close()
    done()
  }
  handleData(key, value) {
    if (!this.props || !value || !this.headers) return
    const field = this.headers[key]
    if (!field) return

    const type = field.type
    if (!type) return

    let parsedValue
    switch (type) {
      case 'uint':
      case 'int':
      case 'short':
      case 'ushort':
        parsedValue = parseInt(value, 10)
        break
      case 'float':
      case 'double':
        parsedValue = parseFloat(value)
        break
      case 'bool':
        if (value === 'true' || value === '1') {
          parsedValue = true
        } else if (value === 'false' || value === '0') {
          parsedValue = false
        } else {
          return
        }
        break
      case 'string':
        parsedValue = cleanString(value)
        if (!parsedValue) {
          return
        }
        break
      default:
        return
    }
    if (field.displayName) {
      this.props[field.displayName] = parsedValue
    } else {
      this.props[key] = parsedValue
    }
  }
  setEvents() {
    this.parser.onopentag = (tag) => {
      this.currentTag = tag
      switch (tag.name) {
        case 'simplefield':
          this.headers[tag.attributes.name] = this.field = {
            type: tag.attributes.type
          }
          return
        case 'schemadata':
          this.headers = this.schemata[tag.attributes.schemaurl]
          return
        case 'schema':
          this.headers = this.schemata['#' + tag.attributes.id] = {}
          return
        case 'placemark':
          this.props = {}
          return
        case 'folder':
          this.folder = {}
          return
        case 'data':
          this.exData = {
            name: tag.attributes.name
          }
          return
        case 'point':
          this.geom = {}
          this.geom.type = 'Point'
          this.geoMode = 'point'
          return
        case 'linestring':
          this.geom = {}
          this.geom.type = 'LineString'
          this.geoMode = 'linestring'
          return
        case 'polygon':
          this.geom = {}
          this.geom.type = 'Polygon'
          this.geom.coordinates = []
          this.geoMode = 'poly'
          return
        case 'outerboundaryis':
          this.geoMode = 'outerbounds'
          return
        case 'innerboundaryis':
          this.geoMode = 'innerbounds'
          return
        case 'multigeometry':
          if (this.isMulti) {
            this.allGeoms.push(this.geoms)
          }
          this.isMulti++
          this.geoms = []
      }
    }
    this.parser.ontext = (data) => {
      let thing
      if (!data.trim()) return
      switch (this.currentTag.name) {
        case 'simpledata':
          this.handleData(this.currentTag.attributes.name, data)
          return
        case 'value':
          if (this.exData) {
            this.exData.value = data
          }
          return
        case 'displayname':
          if (this.exData) {
            this.exData.displayName = data
          } else if (this.field) {
            this.field.displayName = data
          }
          return
        case 'coordinates':
          if (this.geoMode === 'point') {
            this.geom.coordinates = parseCoord(data)
          } else if (this.geoMode === 'linestring') {
            this.geom.coordinates = parseCoords(data)
          } else if (this.geoMode === 'outerbounds') {
            thing = parseCoords(data)
            if (thing) {
              this.geom.coordinates.unshift(thing)
            }
          } else if (this.geoMode === 'innerbounds') {
            thing = parseCoords(data)
            if (thing) {
              this.geom.coordinates.push(thing)
            }
          }
          return
      }

      // any tag not handled that is a child of placemark or a folder should be added as a property!
      if (this.folder && !this.props) this.folder[this.currentTag.name] = data
      if (this.props) this.props[this.currentTag.name] = data
    }
    this.parser.onclosetag = (tag) => {
      this.currentTag = null
      let geoms, type
      switch (tag) {
        case 'folder':
          this.folder = null
          return
        case 'placemark':
          const out = {
            type: 'Feature',
            properties: this.folder ? {
              folder: this.folder,
              ...this.props
            } : this.props,
            geometry: null
          }
          if (this.geom.type) {
            out.geometry = this.geom
          }
          this.geom = this.props = null
          this.push(out)
          return
        case 'schemadata':
        case 'schema':
          this.headers = null
          return
        case 'simplefield':
          this.field = null
          return
        case 'data':
          if (!this.exData || !this.props || !this.exData.value) {
            return
          }
          if (this.exData.displayName) {
            this.props[this.exData.displayName] = this.exData.value
          } else if (this.exData.name) {
            this.props[this.exData.name] = this.exData.value
          }
          this.exData = null
          return
        case 'point':
        case 'linestring':
        case 'polygon':
          this.geoMode = null
          if (this.isMulti) {
            this.geoms.push(this.geom)
            this.geom = null
          }
          return
        case 'outerboundaryis':
        case 'innerboundaryis':
          this.geoMode = 'poly'
          return
        case 'multigeometry':
          this.isMulti--
          geoms = this.geoms
          this.geoms = null
          if (this.isMulti) {
            this.geoms = this.allGeoms.pop()
          }
          if (geoms.length === 0) {
            return
          }
          if (geoms.length === 1) {
            this.geom = geoms[0]
            if (this.isMulti) {
              this.geoms.push(this.geom)
              this.geom = null
            }
            return
          }
          type = getMultiType(geoms)
          if (type === 'mixed') {
            this.geom = {
              type: 'GeometryCollection',
              geometries: geoms
            }
          } else if (type === 'Point') {
            this.geom = {
              type: 'MultiPoint',
              coordinates: getThings(geoms)
            }
          } else if (type === 'LineString') {
            this.geom = {
              type: 'MultiLineString',
              coordinates: getThings(geoms)
            }
          } else if (type === 'Polygon') {
            this.geom = {
              type: 'MultiPolygon',
              coordinates: getThings(geoms)
            }
          } else if (type === 'GeometryCollection') {
            this.geom = {
              type: 'GeometryCollection',
              geometries: mergeGeoms(geoms)
            }
          } else if (type.slice(0, 5) === 'Multi') {
            this.geom = {
              type: type,
              coordinates: mergeCoords(geoms)
            }
          }
          if (this.isMulti) {
            this.geoms.push(this.geom)
            this.geom = null
          }
          return
      }
    }
  }
}

// utilities
function parseCoord(data) {
  const out = data.split(',').map(function (item) {
    return parseFloat(item)
  })
  if (out.length === 3 && out[2] === 0) {
    return out.slice(0, 2)
  }
  return out
}
function parseCoords(data) {
  data = data.trim()
  if (!data) return null

  return data.split(/[^0-9\-\.\,]+/).map(function (item) {
    return parseCoord(item)
  })
}

const cleanString = (val) =>
  val
    .replace(/^[\n\r\t]+[\n\r\t]+$/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\([r|n|t])/g, function (a, b) {
      switch(b) {
        case 'r':
          return '\r'
        case 'n':
          return '\n'
        case 't':
          return '\t'
      }
    }).trim()

const getThings = (geoms) =>
  geoms.map((i) => i.coordinates)

const mergeGeoms = (geoms) =>
  geoms.reduce((a, b) => a.concat(b.geometries), [])

const mergeCoords = (geoms) =>
  geoms.reduce((a, b) => a.concat(b.coordinates), [])

function getMultiType(geoms) {
  let type
  let i = -1
  const len = geoms.length
  while (++i < len) {
    if (!type) {
      type = geoms[i].type
      continue
    }
    if (type !== geoms[i].type) {
      return 'mixed'
    }
  }
  return type
}
