"use strict";

const fs = require("fs");
const path = require("path");

const { decodeInput } = require("./decoder");
const { encodeExport } = require("./encoder");

function usage() {
  console.log(`
PolyTrack Track Lab

Commands:

  node cli.js decode <input.track> <output.json>
  node cli.js encode <input.json> <output.track>
  node cli.js stats <input.json>
`);
}

function readFile(filename) {
  return fs.readFileSync(filename, "utf8").trim();
}

function writeFile(filename, data) {
  const directory = path.dirname(filename);

  fs.mkdirSync(directory, {
    recursive: true
  });

  fs.writeFileSync(filename, data, "utf8");
}

function decodeCommand(input, output) {
  console.log(`Decoding ${input}...`);

  const text = readFile(input);
  const model = decodeInput(text);

  writeFile(
    output,
    JSON.stringify(model, null, 2) + "\n"
  );

  console.log("Decoded successfully.");
  console.log(`Parts: ${model.track.parts.length}`);
  console.log(`Output: ${output}`);
}

function encodeCommand(input, output) {
  console.log(`Encoding ${input}...`);

  const model = JSON.parse(readFile(input));
  const encoded = encodeExport(model);

  writeFile(output, encoded + "\n");

  console.log("Encoded successfully.");
  console.log(`Characters: ${encoded.length}`);
  console.log(`Output: ${output}`);
}

function statsCommand(input) {
  const model = JSON.parse(readFile(input));
  const parts = model.track.parts;

  const counts = new Map();

  for (const part of parts) {
    counts.set(
      part.id,
      (counts.get(part.id) || 0) + 1
    );
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  console.log("");
  console.log("=== PolyTrack Stats ===");
  console.log("");

  console.log(
    `Name: ${model.metadata?.name ?? "unknown"}`
  );

  console.log(
    `Author: ${model.metadata?.author ?? "unknown"}`
  );

  console.log(
    `Environment: ${
      model.track.environmentName ??
      model.track.environmentId
    }`
  );

  console.log(
    `Sun angle: ${
      model.track.sunAngleDegrees ??
      "unknown"
    }°`
  );

  console.log(
    `Total parts: ${parts.length}`
  );

  console.log(
    `Unique part IDs: ${counts.size}`
  );

  console.log("");
  console.log("Part counts:");
  console.log("");

  for (const [id, count] of sorted) {
    const percentage =
      parts.length === 0
        ? "0.00"
        : (
            count /
            parts.length *
            100
          ).toFixed(2);

    console.log(
      `ID ${id}: ${count} (${percentage}%)`
    );
  }

  console.log("");
}

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command) {
    usage();
    process.exit(0);
  }

  if (command === "decode") {
    if (!args[1]) {
      usage();
      process.exit(1);
    }

    const input = args[1];
    const output =
      args[2] ||
      `${input}.json`;

    decodeCommand(
      input,
      output
    );

  } else if (command === "encode") {
    if (!args[1]) {
      usage();
      process.exit(1);
    }

    const input = args[1];
    const output =
      args[2] ||
      input.replace(
        /\.json$/i,
        ".track"
      );

    encodeCommand(
      input,
      output
    );

  } else if (command === "stats") {
    if (!args[1]) {
      usage();
      process.exit(1);
    }

    statsCommand(args[1]);

  } else {
    usage();
    process.exit(1);
  }

} catch (error) {
  console.error("");
  console.error("ERROR:", error.message);
  console.error("");

  process.exit(1);
}
