require.paths.unshift('.');

var sys = require('sys');
var javascript = require('javascript');

function log(obj){
	process.stdout.write(sys.inspect(obj, false, null) + '\n');
}

if (foo){
	if(bar){
		if(zomg) boom();
		else bam();
	}
}
