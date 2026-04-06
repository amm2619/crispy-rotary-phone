// Records — optional local server
// Run with: node server.js  (from the Records/ directory)
// Then open: http://localhost:3000/
//
// Only needed for local access. The app works fully online via GitHub Pages.

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Records running at http://localhost:${PORT}/`);
});
