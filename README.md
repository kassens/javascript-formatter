Javascript Formatter
====================

A Javascript formatter based on a [PEG][] using [PEG.js][] by David Majda.

Currently, it's tested with [Node][], but should be compatible with other
Javascript environments.

Getting Started
---------------

	node test.js

Buyer Beware!
-------------

Currently, comments are discarded and it may still miss some uncommon Javascript
constructs.

Credits
-------
The javascript.pegjs is based on an [example][] of [PEG.js][].

[PEG]:http://en.wikipedia.org/wiki/Parsing_expression_grammar "parsing expression grammar"
[Node]:http://nodejs.org/
[PEG.js]:http://github.com/dmajda/pegjs
[example]:http://github.com/dmajda/pegjs/blob/master/examples/javascript.pegjs
