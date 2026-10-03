"use strict";

const zlib = require("zlib");

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const CHECKPOINT_IDS =
  new Set([
    52,
    65,
    75,
    77
  ]);

const START_IDS =
  new Set([
    5,
    91,
    92,
    93
  ]);

function fail(message) {
  throw new Error(message);
}

function readPackedValue(
  bytes,
  bitPos
) {
  const byteIndex =
    Math.floor(bitPos / 8);

  const offset =
    bitPos - byteIndex * 8;

  const current =
    bytes[byteIndex];

  if (
    offset <= 2 ||
    byteIndex >=
      bytes.length - 1
  ) {
    return (
      (current &
        (63 << offset)) >>>
      offset
    );
  }

  return (
    ((current &
      (63 << offset)) >>
      offset) |
    (
      (bytes[byteIndex + 1] &
        (63 >>>
          (8 - offset))) <<
      (8 - offset)
    )
  );
}

function encodeBase62Like(
  bytes
) {
  let bitPos = 0;
  let text = "";

  while (
    bitPos <
    bytes.length * 8
  ) {
    const value =
      readPackedValue(
        bytes,
        bitPos
      );

    if (
      (value & 30) ===
      30
    ) {
      text +=
        ALPHABET[
          value & 31
        ];

      bitPos += 5;
    } else {
      text +=
        ALPHABET[value];

      bitPos += 6;
    }
  }

  return text;
}

function writeUintLE(
  value,
  length
) {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    fail(
      `Invalid unsigned integer: ${value}`
    );
  }

  const buffer =
    Buffer.alloc(length);

  let remaining =
    Math.floor(value);

  for (
    let i = 0;
    i < length;
    i++
  ) {
    buffer[i] =
      remaining & 255;

    remaining =
      Math.floor(
        remaining / 256
      );
  }

  return buffer;
}

function writeInt32LE(
  value
) {
  if (
    !Number.isInteger(value) ||
    value < -2147483648 ||
    value > 2147483647
  ) {
    fail(
      `Invalid Int32 value: ${value}`
    );
  }

  const buffer =
    Buffer.alloc(4);

  buffer.writeInt32LE(
    value,
    0
  );

  return buffer;
}

function coordinateWidth(
  span
) {
  if (span <= 256) {
    return 1;
  }

  if (span <= 65536) {
    return 2;
  }

  if (span <= 16777216) {
    return 3;
  }

  return 4;
}

function buildRawTrackBytes(
  model
) {
  const track =
    model.track ||
    model;

  const parts =
    Array.isArray(
      track.parts
    )
      ? [...track.parts]
      : [];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;

  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (
    const part of parts
  ) {
    minX =
      Math.min(
        minX,
        part.x
      );

    minY =
      Math.min(
        minY,
        part.y
      );

    minZ =
      Math.min(
        minZ,
        part.z
      );

    maxX =
      Math.max(
        maxX,
        part.x
      );

    maxY =
      Math.max(
        maxY,
        part.y
      );

    maxZ =
      Math.max(
        maxZ,
        part.z
      );
  }

  if (
    !Number.isFinite(
      minX
    )
  ) {
    minX =
      minY =
      minZ =
      maxX =
      maxY =
      maxZ =
        0;
  }

  minX = Math.trunc(minX);
  minY = Math.trunc(minY);
  minZ = Math.trunc(minZ);

  maxX = Math.trunc(maxX);
  maxY = Math.trunc(maxY);
  maxZ = Math.trunc(maxZ);

  const spanX =
    maxX - minX + 1;

  const spanY =
    maxY - minY + 1;

  const spanZ =
    maxZ - minZ + 1;

  const sizeX =
    coordinateWidth(
      spanX
    );

  const sizeY =
    coordinateWidth(
      spanY
    );

  const sizeZ =
    coordinateWidth(
      spanZ
    );

  const chunks = [];

  chunks.push(
    Buffer.from([
      Number(
        track.environmentId ?? 0
      ) & 255
    ])
  );

  chunks.push(
    Buffer.from([
      Number(
        track.sunAngleRepresentation ?? 0
      ) & 255
    ])
  );

  chunks.push(
    writeInt32LE(minX)
  );

  chunks.push(
    writeInt32LE(minY)
  );

  chunks.push(
    writeInt32LE(minZ)
  );

  chunks.push(
    Buffer.from([
      sizeX |
      (sizeY << 2) |
      (sizeZ << 4)
    ])
  );

  const grouped =
    new Map();

  for (
    const part of parts
  ) {
    const id =
      Number(part.id);

    if (
      !Number.isInteger(id) ||
      id < 0 ||
      id > 255
    ) {
      fail(
        `Invalid part ID: ${part.id}`
      );
    }

    if (
      !grouped.has(id)
    ) {
      grouped.set(
        id,
        []
      );
    }

    grouped
      .get(id)
      .push(part);
  }

  const ids =
    [...grouped.keys()]
      .sort(
        (a, b) =>
          a - b
      );

  for (
    const id of ids
  ) {
    const group =
      grouped.get(id);

    chunks.push(
      Buffer.from([
        id
      ])
    );

    chunks.push(
      writeUintLE(
        group.length,
        4
      )
    );

    for (
      const part of group
    ) {
      const x =
        Math.trunc(part.x) -
        minX;

      const y =
        Math.trunc(part.y) -
        minY;

      const z =
        Math.trunc(part.z) -
        minZ;

      const maxXValue =
        2 ** (8 * sizeX) - 1;

      const maxYValue =
        2 ** (8 * sizeY) - 1;

      const maxZValue =
        2 ** (8 * sizeZ) - 1;

      if (
        x < 0 ||
        x > maxXValue ||
        y < 0 ||
        y > maxYValue ||
        z < 0 ||
        z > maxZValue
      ) {
        fail(
          "Coordinate does not fit packed width"
        );
      }

      chunks.push(
        writeUintLE(
          x,
          sizeX
        )
      );

      chunks.push(
        writeUintLE(
          y,
          sizeY
        )
      );

      chunks.push(
        writeUintLE(
          z,
          sizeZ
        )
      );

      const rotation =
        Number(
          part.rotation ?? 0
        ) & 3;

      const rotationAxis =
        Number(
          part.rotationAxis ?? 0
        ) & 7;

      chunks.push(
        Buffer.from([
          rotation |
          (rotationAxis << 2)
        ])
      );

      chunks.push(
        Buffer.from([
          Number(
            part.color ?? 0
          ) & 255
        ])
      );

      if (
        CHECKPOINT_IDS.has(id)
      ) {
        chunks.push(
          writeUintLE(
            Number(
              part.checkpointOrder ?? 0
            ),
            2
          )
        );
      }

      if (
        START_IDS.has(id)
      ) {
        chunks.push(
          writeUintLE(
            Number(
              part.startOrder ?? 0
            ),
            4
          )
        );
      }
    }
  }

  return Buffer.concat(
    chunks
  );
}

function encodeExport(
  model
) {
  if (
    !model ||
    typeof model !==
      "object"
  ) {
    fail(
      "Invalid track model"
    );
  }

  const metadata =
    model.metadata || {};

  const name =
    metadata.name ||
    "Modded Track";

  const author =
    metadata.author ??
    null;

  const nameBytes =
    Buffer.from(
      String(name),
      "utf8"
    );

  const authorBytes =
    author == null
      ? Buffer.alloc(0)
      : Buffer.from(
          String(author),
          "utf8"
        );

  if (
    nameBytes.length >
    255
  ) {
    fail(
      "Track name is too long"
    );
  }

  if (
    authorBytes.length >
    255
  ) {
    fail(
      "Author name is too long"
    );
  }

  let modifiedBytes;

  if (
    metadata.lastModified ==
    null
  ) {
    modifiedBytes =
      Buffer.from([0]);
  } else {
    const date =
      new Date(
        metadata.lastModified
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      fail(
        "Invalid lastModified date"
      );
    }

    modifiedBytes =
      Buffer.concat([
        Buffer.from([1]),
        writeUintLE(
          Math.floor(
            date.getTime() /
              1000
          ),
          4
        )
      ]);
  }

  const metadataBuffer =
    Buffer.concat([
      Buffer.from([
        nameBytes.length
      ]),

      nameBytes,

      Buffer.from([
        authorBytes.length
      ]),

      authorBytes,

      modifiedBytes
    ]);

  const raw =
    buildRawTrackBytes(
      model
    );

  const inner =
    zlib.deflateSync(
      Buffer.concat([
        metadataBuffer,
        raw
      ]),
      {
        level: 9
      }
    );

  const middle =
    encodeBase62Like(
      inner
    );

  const outer =
    zlib.deflateSync(
      Buffer.from(
        middle,
        "utf8"
      ),
      {
        level: 9
      }
    );

  return (
    "PolyTrack2" +
    encodeBase62Like(
      outer
    )
  );
}

module.exports = {
  encodeExport,
  buildRawTrackBytes,
  encodeBase62Like
};
