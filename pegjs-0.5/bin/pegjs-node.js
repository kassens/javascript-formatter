// var x = require('compiler');
var sys = require('sys');
var fs = require('fs');

require.paths.unshift('/Users/kassens/Code/ecmascript-parser/pegjs-0.5/lib');

var PEG = require('compiler');

var input = fs.readFileSync(process.argv[2], 'UTF8');

try {
	var parser = PEG.buildParser(input);
	var source = 'parser = ' + parser.toSource() + ';\n\n' +
		'for (var item in parser){\n' + 
		'\texports[item] = parser[item];\n' + 
		'}'
		
	
	fs.writeFileSync(process.argv[3], source);
} catch (e) {
  if (e.line !== undefined && e.column !== undefined) {
    sys.error(e.line + ":" + e.column + ": " + e.message);
  } else {
    sys.error(e.message);
  }
}

