const fs = require('fs');
let html = fs.readFileSync('coverage/src/extension.ts.html', 'utf8');

// The lines in the diff are roughly the command registration, executeDeleteSessionCommand, and deleteSingleSession.
// We can parse the HTML or we can just see what we missed in tests.

console.log("Did we miss testing the command registration?");
