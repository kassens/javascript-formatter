require.paths.unshift('.');

var input = require('fs').readFileSync('input.js', 'UTF8');
var format = require('format').format;
process.stdout.write('\n' + format(input) + '\n\n');
