Run node - <<'NODE'
[stdin]:25
const encoded = encodeExport(track);
                ^

TypeError: encodeExport is not a function
    at [stdin]:25:17
    at runScriptInThisContext (node:internal/vm:143:10)
    at node:internal/process/execution:100:14
    at [stdin]-wrapper:6:24
    at runScript (node:internal/process/execution:83:62)
    at evalScript (node:internal/process/execution:114:10)
    at node:internal/main/eval_stdin:32:5
    at Socket.<anonymous> (node:internal/process/execution:215:5)
    at Socket.emit (node:events:529:35)
    at endReadableNT (node:internal/streams/readable:1400:12)

Node.js v18.20.8
