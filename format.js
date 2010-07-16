require.paths.unshift('.');

var sys = require('sys');
var javascript = require('javascript');

function log(obj){
	process.stdout.write(sys.inspect(obj, false, null) + '\n');
}

var INDENT = '\t';
var format = function(ast, indent){
	indent = indent || '';

	var formatter = format[ast.type];
	if (formatter) return formatter(ast, indent);
	sys.error('no formatter for type: ' + ast.type);
	var fun = '\n\nformat.' + ast.type + ' = function(node){\n';
	for (prop in ast){
		if (prop != 'type') {
			fun += '\tnode.' + prop + '\n';
		}
	}
	fun += '};\n';
	sys.debug(fun);
	log(ast);
	return '';
};

format.Program = function(ast){
	return ast.elements.map(function(node){
		return format(node, '');
	}).join('\n');
};

format.NumericLiteral = function(node){
	return node.value;
};

format.UnaryExpression = function(node){
	return node.operator + ' ' + format(node.expression);
};

format.BinaryExpression = function(node){
	return format(node.left) + ' ' + node.operator + ' ' + format(node.right);
};

format.ConditionalExpression = function(node, indent){
	return format(node.condition, indent) + ' ? ' +
		format(node.trueExpression, indent) + ' : ' +
		format(node.falseExpression, indent);
};

format.ParenthesizedExpression = function(node, indent){
	return "(" + format(node.value, indent) + ")";
};

format.VariableStatement = function(node, indent){
	return 'var ' + node.declarations.map(function(declaration){
		return format(declaration, indent);
	}).join(', ') + ';';
};

format.VariableDeclarations = function(node, indent){
	return 'var ' + node.declarations.map(function(declaration){
		return format(declaration, indent);
	}).join(', ');
};

format.VariableDeclaration = function(node, indent){
	if (!node.value) return node.name;
	return node.name + ' = ' + format(node.value, indent);
};

format.FunctionCall = function(node, indent){
	return format(node.name, indent) + '(' + node.arguments.map(function(argument){
		return format(argument, indent);
	}).join(', ') + ')';
};

format.Function = function(node, indent){
	return 'function ' + (node.name || '') + '(' + node.params.join(', ') + '){\n' +
		node.elements.map(function(element){
			return indent + INDENT + format(element, indent + INDENT);
		}).join('\n') + '\n' + indent + '}';
};

format.StringLiteral = function(node){
	return JSON.stringify(node.value);
};

format.BooleanLiteral = function(node){
	return node.value ? 'true' : 'false';
};

format.NullLiteral = function(node){
	return 'null';
};

format.Variable = function(node){
	return node.name;
};

format.PropertyAccess = function(node, indent){
	var base = format(node.base, indent);
	if (node.name.type) return base + '[' + format(node.name, indent) + ']';
	else return base + '.' + node.name;
};

format.IfStatement = function(node, indent){
	var result = 'if (' + format(node.condition) + ') ' + format(node.ifStatement, indent);
	if (node.elseStatement){
		result += ' else ' + format(node.elseStatement, indent);
	}
	return result;
};

format.Block = function(node, indent){
	return '{\n' + node.statements.map(function(statement){
		return indent + INDENT + format(statement, indent + INDENT) + '\n';
	}).join('') + indent + '}';
};

format.ReturnStatement = function(node, indent){
	if (!node.value) return 'return;';
	return 'return ' + format(node.value, indent) + ';';
};

format.EmptyStatement = function(node){
	return ';';
};

format.ExpressionStatement = function(node, indent){
	return format(node.value, indent) + ';';
};

format.AssignmentExpression = function(node, indent){
	return format(node.left) + ' ' + node.operator + ' ' + format(node.right, indent);
};

format.PostfixExpression = function(node){
	return format(node.expression) + node.operator;
};

format.ArrayLiteral = function(node, indent){
	return '[' + node.elements.map(function(element){
		return format(element, indent);
	}).join(', ') + ']';
};

format.ObjectLiteral = function(node, indent){
	if (node.properties.length == 0) return '{}';
	return '{\n' + node.properties.map(function(property){
		return indent + INDENT + format(property, indent);
	}).join(',\n') + '\n' + indent + '}';
};

format.RegularExpressionLiteral = function(node){
	return '/' + node.body + '/' + node.flags;
};

format.This = function(node){
	return 'this';
};

format.ThrowStatement = function(node, indent){
	return 'throw ' + format(node.exception, indent);
};

format.ForStatement = function(node, indent){
	return 'for (' +
		(node.initializer ? format(node.initializer) : '') + '; ' +
		(node.test ? format(node.test) : '') + '; ' +
		(node.counter ? format(node.counter) : '') + ')' +
		format(node.statement, indent);
};

format.ForInStatement = function(node, indent){
	return 'for (' +
		format(node.iterator) + ' in ' +
		format(node.collection) + ') ' +
		format(node.statement, indent);
};

format.WhileStatement = function(node, indent){
	return 'while (' + format(node.condition) + ') ' + format(node.statement, indent);
};

format.SwitchStatement = function(node, indent){
	return 'switch (' + format(node.expression, indent) + '){\n' + node.clauses.map(function(clause){
		return indent + INDENT + format(clause, indent + INDENT);
	}).join('\n') + '\n' + indent + '}';
};

format.CaseClause = function(node, indent){
	return 'case ' + format(node.selector, indent) + ':\n' + node.statements.map(function(statement){
		return indent + INDENT + format(statement, indent + INDENT);
	}).join('\n');
};

format.DefaultClause = function(node, indent){
	return 'default:\n' + node.statements.map(function(statement){
		return indent + INDENT + format(statement, indent + INDENT);
	}).join('\n');
};

format.BreakStatement = function(node){
	return node.label ? 'break ' + node.label + ';' : 'break;';
};

format.ContinueStatement = function(node){
	return node.label ? 'continue ' + node.label + ';' : 'continue;';
};

format.TryStatement = function(node, indent){
	return 'try ' + format(node.block, indent) +
		(node['catch'] ? format(node['catch'], indent) : '')+ 
		(node['finally'] ? format(node['finally'], indent) : '');
};

format.Catch = function(node, indent){
	return ' catch (' + node.identifier + ')' + format(node.block, indent);
};

format.Finally = function(node, indent){
	return ' finally ' + format(node.block, indent);
};

format.PropertyAssignment = function(node, indent){
	return JSON.stringify(node.name) + ': ' + format(node.value, indent + INDENT);
};

format.NewOperator = function(node, indent){
	return 'new ' + format(node.constructor, indent) + '(' + node.arguments.map(function(argument){
		return format(argument, indent);
	}).join(', ') + ')';
};

exports.format = function(input){
	parsed = javascript.parse(input);
	return format(parsed);
};
