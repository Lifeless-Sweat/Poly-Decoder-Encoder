"use strict";

const zlib = require("zlib");

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const REVERSE = new Array(123).fill(-1);

for (let i = 0; i < ALPHABET.length; i++) {
  REVERSE[ALPHABET.charCodeAt(i)] = i;
}

const SHORT_MASK = 30;

const ENVIRONMENT_NAMES = {
  0: "Summer",
  1: "Winter",
  2: "Desert"
};

const ROTATION_AXIS_NAMES = {
  0: "YPositive",
  1: "YNegative",
  2: "XPositive",
  3: "XNegative",
  4: "ZPositive",
  5: "ZNegative"
};

const CHECKPOINT_IDS = new Set([
  52,
  65,
  75,
  77
]);

const START_IDS = new Set([
  5,
  91,
  92,
  93
]);

function fail(message) {
  throw new Error(message);
}

function writePackedValue(
  output,
  bitPos,
  bitLength,
  value,
  isLast
) {
  const byteIndex =
    Math.floor(bitPos / 8);

  while (output.length <= byteIndex) {
    output.push(0);
  }

  const offset =
    bitPos - byteIndex * 8;

  output[byteIndex] |=
    (value << offset) & 255;

  if (
    offset > 8 - bitLength &&
    !isLast
  ) {
    const nextIndex =
      byteIndex + 1;

    while (output.length <= nextIndex) {
      output.push(0);
    }

    output[nextIndex] |=
      value >> (8 - offset);
  }
}

function decodeBase62Like(text) {
  let bitPos = 0;
  const output = [];

  for (let i = 0; i < text.length; i++) {
    const code =
      text.charCodeAt(i);

    if (code >= REVERSE.length) {
      return null;
    }

    const value =
      REVERSE[code];

    if (value === -1) {
      return null;
    }

    const bitLength =
      (value & SHORT_MASK) === SHORT_MASK
        ? 5
        : 6;

    writePackedValue(
      output,
      bitPos,
      bitLength,
      value,
      i === text.length - 1
    );

    bitPos += bitLength;
  }

  return Uint8Array.from(output);
}

function readUintLE(
  bytes,
  offset,
  length
) {
  if (
    offset + length >
    bytes.length
  ) {
    fail(
      "Unexpected end of data"
    );
  }

  let value = 0;

  for (
    let i = 0;
    i < length;
    i++
  ) {
    value +=
      bytes[offset + i] *
      2 ** (8 * i);
  }

  return value;
}

function readInt32LE(
  bytes,
  offset
) {
  if (
    offset + 4 >
    bytes.length
  ) {
    fail(
      "Unexpected end of data"
    );
  }

  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    4
  ).getInt32(0, true);
}

function parseRawTrackBytes(
  bytes,
  offset = 0
) {
  let cursor = offset;

  if (
    bytes.length - cursor <
    15
  ) {
    fail(
      "Track payload is too short"
    );
  }

  const environmentId =
    bytes[cursor++];

  const sunAngleRepresentation =
    bytes[cursor++];

  const minX =
    readInt32LE(bytes, cursor);

  cursor += 4;

  const minY =
    readInt32LE(bytes, cursor);

  cursor += 4;

  const minZ =
    readInt32LE(bytes, cursor);

  cursor += 4;

  const sizeByte =
    bytes[cursor++];

  const sizeX =
    sizeByte & 3;

  const sizeY =
    (sizeByte >> 2) & 3;

  const sizeZ =
    (sizeByte >> 4) & 3;

  if (
    sizeX < 1 ||
    sizeX > 4 ||
    sizeY < 1 ||
    sizeY > 4 ||
    sizeZ < 1 ||
    sizeZ > 4
  ) {
    fail(
      "Invalid packed coordinate widths"
    );
  }

  const parts = [];

  while (
    cursor <
    bytes.length
  ) {
    const id =
      bytes[cursor++];

    const count =
      readUintLE(
        bytes,
        cursor,
        4
      );

    cursor += 4;

    for (
      let i = 0;
      i < count;
      i++
    ) {
      const x =
        readUintLE(
          bytes,
          cursor,
          sizeX
        ) + minX;

      cursor += sizeX;

      const y =
        readUintLE(
          bytes,
          cursor,
          sizeY
        ) + minY;

      cursor += sizeY;

      const z =
        readUintLE(
          bytes,
          cursor,
          sizeZ
        ) + minZ;

      cursor += sizeZ;

      if (
        cursor >=
        bytes.length
      ) {
        fail(
          "Unexpected end of part data"
        );
      }

      const packedRotation =
        bytes[cursor++];

      const rotation =
        packedRotation & 3;

      const rotationAxis =
        (packedRotation >> 2) & 7;

      if (
        cursor >=
        bytes.length
      ) {
        fail(
          "Unexpected end of part data"
        );
      }

      const color =
        bytes[cursor++];

      let checkpointOrder =
        null;

      if (
        CHECKPOINT_IDS.has(id)
      ) {
        checkpointOrder =
          readUintLE(
            bytes,
            cursor,
            2
          );

        cursor += 2;
      }

      let startOrder =
        null;

      if (
        START_IDS.has(id)
      ) {
        startOrder =
          readUintLE(
            bytes,
            cursor,
            4
          );

        cursor += 4;
      }

      parts.push({
        id,
        x,
        y,
        z,
        rotation,
        rotationAxis,
        rotationAxisName:
          ROTATION_AXIS_NAMES[
            rotationAxis
          ] ?? null,
        color,
        checkpointOrder,
        startOrder
      });
    }
  }

  return {
    nextOffset: cursor,

    track: {
      environmentId,

      environmentName:
        ENVIRONMENT_NAMES[
          environmentId
        ] ?? null,

      sunAngleRepresentation,

      sunAngleDegrees:
        sunAngleRepresentation * 2,

      parts
    }
  };
}

function parseExportString(text) {
  const cleaned =
    text.replace(
      /\s+/g,
      ""
    );

  if (
    !cleaned.startsWith(
      "PolyTrack2"
    )
  ) {
    fail(
      "Input is not a PolyTrack2 export string"
    );
  }

  const outer =
    decodeBase62Like(
      cleaned.slice(10)
    );

  if (outer == null) {
    fail(
      "Failed to decode export payload"
    );
  }

  const stageOne =
    zlib
      .inflateSync(
        Buffer.from(outer)
      )
      .toString("utf8");

  const inner =
    decodeBase62Like(
      stageOne
    );

  if (inner == null) {
    fail(
      "Failed to decode inner export payload"
    );
  }

  const payload =
    zlib.inflateSync(
      Buffer.from(inner)
    );

  let cursor = 0;

  const nameLength =
    payload[cursor++];

  const name =
    payload
      .subarray(
        cursor,
        cursor + nameLength
      )
      .toString("utf8");

  cursor += nameLength;

  const authorLength =
    payload[cursor++];

  let author = null;

  if (authorLength > 0) {
    author =
      payload
        .subarray(
          cursor,
          cursor + authorLength
        )
        .toString("utf8");

    cursor += authorLength;
  }

  const modifiedFlag =
    payload[cursor++];

  let lastModified = null;

  if (modifiedFlag === 1) {
    const seconds =
      readUintLE(
        payload,
        cursor,
        4
      );

    cursor += 4;

    lastModified =
      new Date(
        seconds * 1000
      ).toISOString();
  }

  const parsed =
    parseRawTrackBytes(
      payload,
      cursor
    );

  if (
    parsed.nextOffset !==
    payload.length
  ) {
    fail(
      "Trailing bytes detected"
    );
  }

  return {
    kind: "export",

    sourceFormat:
      "PolyTrack2-export",

    metadata: {
      name,
      author,
      lastModified
    },

    track:
      parsed.track
  };
}

function decodeInput(text) {
  const cleaned =
    text.replace(
      /\s+/g,
      ""
    );

  if (
    cleaned.startsWith(
      "PolyTrack2"
    )
  ) {
    return parseExportString(
      cleaned
    );
  }

  fail(
    "This version expects a PolyTrack2 export string."
  );
}

module.exports = {
  decodeInput,
  parseExportString
};
