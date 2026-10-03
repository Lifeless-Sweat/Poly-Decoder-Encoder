# PolyTrack Track Lab

A small Node.js toolkit for decoding, editing, analyzing, and encoding PolyTrack2 tracks.

## Requirements

- Node.js 18+

## Commands

Decode a track:

```bash
node cli.js decode input.track output.json
```

Encode a track:

```bash
node cli.js encode output.json output.track
```

Show track statistics:

```bash
node cli.js stats output.json
```

Run tests:

```bash
npm test
```

## Project

This project is designed to inspect and modify PolyTrack2 tracks.

The current tools include:

- PolyTrack2 export decoding
- PolyTrack2 export encoding
- Track statistics
- Coordinate preservation
- Part metadata preservation
- Automated tests
