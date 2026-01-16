// Choose the correct module path depending on where the page is hosted.
// When viewed via htmlpreview.github.io, raw.githubusercontent.com serves
// scripts with a `text/plain` MIME type causing module loading to fail.
// In that case load the module from the jsDelivr CDN; otherwise use a
// relative path for local usage.
const gameModulePath = (location.hostname === 'htmlpreview.github.io')
  ? 'https://cdn.jsdelivr.net/gh/MaWay2000/wzmap/js/game.js'
  : './js/game.js';

import(`${baseUrl}js/game.js`);
import(gameModulePath);