(function () {
  "use strict";

  var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  function bytesToString(bytes, start, length) {
    var output = "";
    for (var i = 0; i < length; i += 1) {
      output += String.fromCharCode(bytes[start + i]);
    }
    return output;
  }

  function isPng(bytes) {
    if (bytes.length < PNG_SIGNATURE.length) return false;
    for (var i = 0; i < PNG_SIGNATURE.length; i += 1) {
      if (bytes[i] !== PNG_SIGNATURE[i]) return false;
    }
    return true;
  }

  function detectFormat(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { key: "jpeg", label: "JPEG", mime: "image/jpeg", extension: "jpg" };
    }
    if (isPng(bytes)) {
      return { key: "png", label: "PNG", mime: "image/png", extension: "png" };
    }
    if (bytes.length >= 12 && bytesToString(bytes, 0, 4) === "RIFF" && bytesToString(bytes, 8, 4) === "WEBP") {
      return { key: "webp", label: "WebP", mime: "image/webp", extension: "webp" };
    }
    if (bytes.length >= 12 && bytesToString(bytes, 4, 4) === "ftyp") {
      return { key: "heic", label: "HEIC/AVIF", mime: "image/heif", extension: "heic" };
    }
    return { key: "unknown", label: "Unknown", mime: "application/octet-stream", extension: "img" };
  }

  function roundDpi(value) {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 10) / 10;
  }

  function readRational(view, offset, littleEndian) {
    var numerator = view.getUint32(offset, littleEndian);
    var denominator = view.getUint32(offset + 4, littleEndian);
    if (!denominator) return null;
    return numerator / denominator;
  }

  function parseExifResolution(view, tiffStart, tiffLength) {
    if (tiffLength < 8) return null;
    var endian = view.getUint16(tiffStart, false);
    var littleEndian = endian === 0x4949;
    if (!littleEndian && endian !== 0x4d4d) return null;
    if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

    var ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
    var ifdStart = tiffStart + ifdOffset;
    if (ifdStart < tiffStart || ifdStart + 2 > tiffStart + tiffLength) return null;

    var entryCount = view.getUint16(ifdStart, littleEndian);
    var xResolution = null;
    var yResolution = null;
    var resolutionUnit = 2;

    for (var i = 0; i < entryCount; i += 1) {
      var entry = ifdStart + 2 + i * 12;
      if (entry + 12 > tiffStart + tiffLength) break;
      var tag = view.getUint16(entry, littleEndian);
      var type = view.getUint16(entry + 2, littleEndian);
      var count = view.getUint32(entry + 4, littleEndian);
      var valueOffset = entry + 8;

      if (tag === 0x0128 && type === 3 && count >= 1) {
        resolutionUnit = view.getUint16(valueOffset, littleEndian);
      }

      if ((tag === 0x011a || tag === 0x011b) && type === 5 && count >= 1) {
        var rationalOffset = view.getUint32(valueOffset, littleEndian);
        var absolute = tiffStart + rationalOffset;
        if (absolute >= tiffStart && absolute + 8 <= tiffStart + tiffLength) {
          if (tag === 0x011a) xResolution = readRational(view, absolute, littleEndian);
          if (tag === 0x011b) yResolution = readRational(view, absolute, littleEndian);
        }
      }
    }

    var xDpi = xResolution;
    var yDpi = yResolution;
    if (resolutionUnit === 3) {
      xDpi = xDpi ? xDpi * 2.54 : xDpi;
      yDpi = yDpi ? yDpi * 2.54 : yDpi;
    }
    if (!xDpi && !yDpi) return null;

    return {
      x: roundDpi(xDpi || yDpi),
      y: roundDpi(yDpi || xDpi),
      source: "EXIF"
    };
  }

  function parseJpegDpi(arrayBuffer) {
    var view = new DataView(arrayBuffer);
    var bytes = new Uint8Array(arrayBuffer);
    var offset = 2;
    var jfif = null;
    var exif = null;

    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      var marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      var length = view.getUint16(offset + 2, false);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      var dataStart = offset + 4;
      var dataLength = length - 2;

      if (marker === 0xe0 && dataLength >= 14 && bytesToString(bytes, dataStart, 5) === "JFIF\0") {
        var units = bytes[dataStart + 7];
        var xDensity = view.getUint16(dataStart + 8, false);
        var yDensity = view.getUint16(dataStart + 10, false);
        if (units === 1) {
          jfif = { x: roundDpi(xDensity), y: roundDpi(yDensity), source: "JFIF" };
        } else if (units === 2) {
          jfif = { x: roundDpi(xDensity * 2.54), y: roundDpi(yDensity * 2.54), source: "JFIF" };
        }
      }

      if (marker === 0xe1 && dataLength >= 14 && bytesToString(bytes, dataStart, 6) === "Exif\0\0") {
        exif = parseExifResolution(view, dataStart + 6, dataLength - 6) || exif;
      }

      offset += 2 + length;
    }

    return exif || jfif;
  }

  function parsePngDpi(arrayBuffer) {
    var view = new DataView(arrayBuffer);
    var bytes = new Uint8Array(arrayBuffer);
    if (!isPng(bytes)) return null;

    var offset = 8;
    while (offset + 12 <= bytes.length) {
      var length = view.getUint32(offset, false);
      var type = bytesToString(bytes, offset + 4, 4);
      var dataStart = offset + 8;
      if (dataStart + length + 4 > bytes.length) break;

      if (type === "pHYs" && length === 9) {
        var xPpm = view.getUint32(dataStart, false);
        var yPpm = view.getUint32(dataStart + 4, false);
        var unit = bytes[dataStart + 8];
        if (unit === 1) {
          return {
            x: roundDpi(xPpm * 0.0254),
            y: roundDpi(yPpm * 0.0254),
            source: "PNG pHYs"
          };
        }
      }

      offset = dataStart + length + 4;
    }

    return null;
  }

  function parseDpi(arrayBuffer, format) {
    if (format.key === "jpeg") return parseJpegDpi(arrayBuffer);
    if (format.key === "png") return parsePngDpi(arrayBuffer);
    return null;
  }

  function clampDpi(dpi) {
    var value = Math.round(Number(dpi));
    if (!Number.isFinite(value)) return 300;
    return Math.max(1, Math.min(2400, value));
  }

  function makeJfifSegment(dpi) {
    var segment = new Uint8Array(18);
    var view = new DataView(segment.buffer);
    segment[0] = 0xff;
    segment[1] = 0xe0;
    view.setUint16(2, 16, false);
    segment.set([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x01], 4);
    view.setUint16(12, dpi, false);
    view.setUint16(14, dpi, false);
    segment[16] = 0;
    segment[17] = 0;
    return segment;
  }

  function updateExifResolution(view, tiffStart, tiffLength, dpi) {
    if (tiffLength < 8) return;
    var endian = view.getUint16(tiffStart, false);
    var littleEndian = endian === 0x4949;
    if (!littleEndian && endian !== 0x4d4d) return;
    if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return;

    var ifdStart = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
    if (ifdStart < tiffStart || ifdStart + 2 > tiffStart + tiffLength) return;
    var entryCount = view.getUint16(ifdStart, littleEndian);

    for (var i = 0; i < entryCount; i += 1) {
      var entry = ifdStart + 2 + i * 12;
      if (entry + 12 > tiffStart + tiffLength) break;
      var tag = view.getUint16(entry, littleEndian);
      var type = view.getUint16(entry + 2, littleEndian);
      var count = view.getUint32(entry + 4, littleEndian);
      var valueOffset = entry + 8;

      if (tag === 0x0128 && type === 3 && count >= 1) {
        view.setUint16(valueOffset, 2, littleEndian);
      }

      if ((tag === 0x011a || tag === 0x011b) && type === 5 && count >= 1) {
        var rationalOffset = view.getUint32(valueOffset, littleEndian);
        var absolute = tiffStart + rationalOffset;
        if (absolute >= tiffStart && absolute + 8 <= tiffStart + tiffLength) {
          view.setUint32(absolute, dpi, littleEndian);
          view.setUint32(absolute + 4, 1, littleEndian);
        }
      }
    }
  }

  function setJpegDpi(arrayBuffer, dpi) {
    var density = Math.max(1, Math.min(65535, clampDpi(dpi)));
    var output = new Uint8Array(arrayBuffer.slice(0));
    var view = new DataView(output.buffer);
    var offset = 2;
    var hasJfif = false;

    while (offset + 4 <= output.length) {
      if (output[offset] !== 0xff) break;
      var marker = output[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      var length = view.getUint16(offset + 2, false);
      if (length < 2 || offset + 2 + length > output.length) break;
      var dataStart = offset + 4;
      var dataLength = length - 2;

      if (marker === 0xe0 && dataLength >= 14 && bytesToString(output, dataStart, 5) === "JFIF\0") {
        output[dataStart + 7] = 1;
        view.setUint16(dataStart + 8, density, false);
        view.setUint16(dataStart + 10, density, false);
        hasJfif = true;
      }

      if (marker === 0xe1 && dataLength >= 14 && bytesToString(output, dataStart, 6) === "Exif\0\0") {
        updateExifResolution(view, dataStart + 6, dataLength - 6, density);
      }

      offset += 2 + length;
    }

    if (hasJfif) return output.buffer;

    var jfif = makeJfifSegment(density);
    var combined = new Uint8Array(output.length + jfif.length);
    combined.set(output.slice(0, 2), 0);
    combined.set(jfif, 2);
    combined.set(output.slice(2), 2 + jfif.length);
    return combined.buffer;
  }

  var crcTable = null;

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes, start, length) {
    var table = getCrcTable();
    var c = 0xffffffff;
    for (var i = start; i < start + length; i += 1) {
      c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makePhysChunk(dpi) {
    var ppm = Math.round(clampDpi(dpi) / 0.0254);
    var chunk = new Uint8Array(21);
    var view = new DataView(chunk.buffer);
    view.setUint32(0, 9, false);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4);
    view.setUint32(8, ppm, false);
    view.setUint32(12, ppm, false);
    chunk[16] = 1;
    view.setUint32(17, crc32(chunk, 4, 13), false);
    return chunk;
  }

  function setPngDpi(arrayBuffer, dpi) {
    var original = new Uint8Array(arrayBuffer);
    var view = new DataView(arrayBuffer);
    if (!isPng(original)) throw new Error("This is not a PNG file.");

    var phys = makePhysChunk(dpi);
    var offset = 8;
    var insertAfter = null;

    while (offset + 12 <= original.length) {
      var length = view.getUint32(offset, false);
      var type = bytesToString(original, offset + 4, 4);
      var dataStart = offset + 8;
      var next = dataStart + length + 4;
      if (next > original.length) break;

      if (type === "IHDR") insertAfter = next;
      if (type === "pHYs") {
        var replaced = new Uint8Array(original.length);
        replaced.set(original);
        replaced.set(phys, offset);
        return replaced.buffer;
      }
      if (type === "IDAT") break;
      offset = next;
    }

    if (insertAfter == null) throw new Error("PNG IHDR chunk was not found.");
    var output = new Uint8Array(original.length + phys.length);
    output.set(original.slice(0, insertAfter), 0);
    output.set(phys, insertAfter);
    output.set(original.slice(insertAfter), insertAfter + phys.length);
    return output.buffer;
  }

  function setDpi(arrayBuffer, format, dpi) {
    if (format.key === "jpeg") return setJpegDpi(arrayBuffer, dpi);
    if (format.key === "png") return setPngDpi(arrayBuffer, dpi);
    throw new Error("Metadata-only DPI conversion currently supports JPEG and PNG.");
  }

  window.DpiTools = {
    clampDpi: clampDpi,
    detectFormat: detectFormat,
    parseDpi: parseDpi,
    setDpi: setDpi
  };
})();
