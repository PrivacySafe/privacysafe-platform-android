#!/bin/bash

echo "Patching ecma-nacl-cryptors module to remove require lines to node's worker module."

node -e "
const filePath = 'node_modules/ecma-nacl-cryptors/build/lib-client/cryptor/cryptor.js';
let cryptorJS = fs.readFileSync(filePath, { encoding: 'utf8' });
const fstSegment = 'const makeInWorkerCryptor = (logErr, logWarning, maxThreads) => {';
const sndSegment = 'exports.makeInWorkerWasmCryptor = makeInWorkerWasmCryptor;';
const startInd = cryptorJS.indexOf(fstSegment);
if (startInd < 0) {
  throw 'First segment is not found';
}
const sndInd = cryptorJS.indexOf(sndSegment);
if (sndInd < 0) {
  throw 'Second segment is not found';
}
if (sndInd < startInd) {
  throw 'Second segment is in unexpected place';
}
cryptorJS = cryptorJS.substring(0, startInd) + cryptorJS.substring(sndInd+sndSegment.length);
fs.writeFileSync(filePath, cryptorJS, { encoding: 'utf8' });
" || exit $?