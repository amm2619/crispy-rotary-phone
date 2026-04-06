// Records — optional local server
// Run with: node server.js
// Then open: http://localhost:3000/records_v23.html
//
// Only needed for local access. The app works fully online via GitHub Pages.

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Records running at http://localhost:${PORT}/records_v23.html`);
});
