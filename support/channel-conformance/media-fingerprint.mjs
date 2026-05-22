import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = "89504e470d0a1a0a";

export function mediaFingerprint(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }
  return pngFingerprint(buffer);
}

function pngFingerprint(buffer) {
  if (buffer.length < 33 || buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    return null;
  }

  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  const idatChunks = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      return null;
    }

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || colorType == null || idatChunks.length === 0) {
    return null;
  }

  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const bytesPerPixel = pngBytesPerPixel(colorType);
  if (!bytesPerPixel || inflated.length < bytesPerPixel + 1) {
    return null;
  }

  const filter = inflated[0];
  const firstPixel = inflated.subarray(1, 1 + bytesPerPixel).toString("hex");
  return `png:${width}x${height}:ct${colorType}:bd${bitDepth}:filter${filter}:first=${firstPixel}`;
}

function pngBytesPerPixel(colorType) {
  if (colorType === 0) {
    return 1;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 3) {
    return 1;
  }
  if (colorType === 4) {
    return 2;
  }
  if (colorType === 6) {
    return 4;
  }
  return 0;
}
