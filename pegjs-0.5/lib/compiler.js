/* PEG.js compiler. */

(function() {

/* ===== PEG ===== */

PEG = exports;

/*
 * Generates a parser from a specified grammar and returns it.
 *
 * The grammar must be a string in the format described by the metagramar in the
 * metagrammar.pegjs file.
 *
 * Throws |PEG.grammarParser.SyntaxError| if the grammar contains a syntax error
 * or |PEG.GrammarError| if it contains a semantic error. Note that not all
 * errors are detected during the generation and some may protrude to the
 * generated parser and cause its malfunction.
 */
PEG.buildParser = function(grammar) {
  return PEG.Compiler.compileParser(PEG.grammarParser.parse(grammar));
};

/* ===== PEG.GrammarError ===== */

/* Thrown when the grammar contains an error. */

PEG.GrammarError = function(message) {
  this.name = "PEG.GrammarError";
  this.message = message;
};

PEG.GrammarError.prototype = Error.prototype;

/* ===== PEG.ArrayUtils ===== */

/* Array manipulation utility functions. */

PEG.ArrayUtils = {
  /* Like Python's |range|, but without |step|. */
  range: function(start, stop) {
    if (typeof(stop) === "undefined") {
      stop = start;
      start = 0;
    }

    var result = new Array(Math.max(0, stop - start));
    for (var i = 0, j = start; j < stop; i++, j++) {
      result[i] = j;
    }
    return result;
  },

  /*
   * The code needs to be in sync with the code template in the compilation
   * function for "action" nodes.
   */
  contains: function(array, value) {
    /*
     * Stupid IE does not have Array.prototype.indexOf, otherwise this function
     * would be a one-liner.
     */
    var length = array.length;
    for (var i = 0; i < length; i++) {
      if (array[i] === value) {
        return true;
      }
    }
    return false;
  },

  each: function(array, callback) {
    var length = array.length;
    for (var i = 0; i < length; i++) {
      callback(array[i]);
    }
  },

  map: function(array, callback) {
    var result = [];
    var length = array.length;
    for (var i = 0; i < length; i++) {
      result[i] = callback(array[i]);
    }
    return result;
  }
};

/* ===== PEG.StringUtils ===== */

/* String manipulation utility functions. */

PEG.StringUtils = {
  /*
   * Surrounds the string with quotes and escapes characters inside so that the
   * result is a valid JavaScript string.
   *
   * The code needs to be in sync with th code template in the compilation
   * function for "action" nodes.
   */
  quote: function(s) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a string
     * literal except for the closing quote character, backslash, carriage
     * return, line separator, paragraph separator, and line feed. Any character
     * may appear in the form of an escape sequence.
     */
    return '"' + s
      .replace(/\\/g, '\\\\')        // backslash
      .replace(/"/g, '\\"')          // closing quote character
      .replace(/\r/g, '\\r')         // carriage return
      .replace(/\u2028/g, '\\u2028') // line separator
      .replace(/\u2029/g, '\\u2029') // paragraph separator
      .replace(/\n/g, '\\n')         // line feed
      + '"';
  }

};

/* ===== PEG.RegExpUtils ===== */

/* RegExp manipulation utility functions. */

PEG.RegExpUtils = {
  /*
   * Escapes characters inside the string so that it can be used as a list of
   * characters in a character class of a regular expression.
   */
  quoteForClass: function(s) {
    /* Based on ECMA-262, 5th ed., 7.8.5 & 15.10.1. */
    return s
      .replace(/\\/g, '\\\\')        // backslash
      .replace(/\0/g, '\\0')         // null, IE needs this
      .replace(/\//g, '\\/')         // closing slash
      .replace(/]/g, '\\]')          // closing bracket
      .replace(/-/g, '\\-')          // dash
      .replace(/\r/g, '\\r')         // carriage return
      .replace(/\u2028/g, '\\u2028') // line separator
      .replace(/\u2029/g, '\\u2029') // paragraph separator
      .replace(/\n/g, '\\n')         // line feed
  }
};

/* ===== PEG.Compiler ===== */

PEG.Compiler = {
  /*
   * Takes parts of code, interpolates variables inside them and joins them with
   * a newline.
   *
   * Variables are delimited with "${" and "}" and their names must be valid
   * identifiers (i.e. they must match [a-zA-Z_][a-zA-Z0-9_]*). Variable values
   * are specified as properties of the last parameter (if this is an object,
   * otherwise empty variable set is assumed). Undefined variables result in
   * throwing |Error|.
   *
   * There can be a filter specified after the variable name, prefixed with "|".
   * The filter name must be a valid identifier. The only recognized filter
   * right now is "string", which quotes the variable value as a JavaScript
   * string. Unrecognized filters result in throwing |Error|.
   *
   * If any part has multiple lines and the first line is indented by some
   * amount of whitespace (as defined by the /\s+/ JavaScript regular
   * expression), second to last lines are indented by the same amount of
   * whitespace. This results in nicely indented multiline code in variables
   * without making the templates look ugly.
   *
   * Examples:
   *
   *   PEG.Compiler.formatCode("foo", "bar");    // "foo\nbar"
   *   PEG.Compiler.formatCode(
   *     "foo", "${bar}",
   *     { bar: "baz" }
   *   );                                        // "foo\nbaz"
   *   PEG.Compiler.formatCode("foo", "${bar}"); // throws Error
   *   PEG.Compiler.formatCode(
   *     "foo", "${bar|string}",
   *     { bar: "baz" }
   *   );                                        // "foo\n\"baz\""
   *   PEG.Compiler.formatCode(
   *     "foo", "${bar|eeek}",
   *     { bar: "baz" }
   *   );                                        // throws Error
   *   PEG.Compiler.formatCode(
   *     "foo", "${bar}",
   *     { bar: "  baz\nqux" }
   *   );                                        // "foo\n  baz\n  qux"
   */
  formatCode: function() {
    function interpolateVariablesInParts(parts) {
      return PEG.ArrayUtils.map(parts, function(part) {
        return part.replace(
          /\$\{([a-zA-Z_][a-zA-Z0-9_]*)(\|([a-zA-Z_][a-zA-Z0-9_]*))?\}/g,
          function(match, name, dummy, filter) {
            var value = vars[name];
            if (typeof(value) === "undefined") {
              throw new Error("Undefined variable: \"" + name + "\".");
            }

            if (typeof(filter) !== "undefined" && filter != "") { // JavaScript engines differ here.
              if (filter === "string") {
                return PEG.StringUtils.quote(value);
              } else {
                throw new Error("Unrecognized filter: \"" + filter + "\".");
              }
            } else {
              return value;
            }
          }
        );
      });
    }

    function indentMultilineParts(parts) {
      return PEG.ArrayUtils.map(parts, function(part) {
        if (!/\n/.test(part)) { return part; }

        var firstLineWhitespacePrefix = part.match(/^\s*/)[0];
        var lines = part.split("\n");
        var linesIndented = [lines[0]].concat(
          PEG.ArrayUtils.map(lines.slice(1), function(line) {
            return firstLineWhitespacePrefix + line;
          })
        );
        return linesIndented.join("\n");
      });
    }

    var args = Array.prototype.slice.call(arguments);
    var vars = args[args.length - 1] instanceof Object ? args.pop() : {};

    return indentMultilineParts(interpolateVariablesInParts(args)).join("\n");
  },

  _uniqueIdentifierCounters: {},

  /*
   * Generates a unique identifier with specified prefix. The sequence of
   * generated identifiers with given prefix is repeatable and will be the same
   * within different language runtimes.
   */
  generateUniqueIdentifier: function(prefix) {
    this._uniqueIdentifierCounters[prefix]
      = this._uniqueIdentifierCounters[prefix] || 0;
    return prefix + this._uniqueIdentifierCounters[prefix]++;
  },

  /*
   * Resets internal counters of the unique identifier generator. The sequence
   * of identifiers with given prefix generated by |generateUniqueIdentifier|
   * will start from the beginning.
   */
  resetUniqueIdentifierCounters: function() {
    this._uniqueIdentifierCounters = {};
  },

  /*
   * Checks made on the grammar AST before compilation. Each check is a function
   * that is passed the AST and does not return anything. If the check passes,
   * the function does not do anything special, otherwise it throws
   * |PEG.GrammarError|. The checks are run in sequence in order of their
   * definition.
   */
  _checks: [
    /* Checks that all referenced rules exist. */
    function(ast) {
      function nop() {}

      function checkExpression(node) { check(node.expression); }

      function checkSubnodes(propertyName) {
        return function(node) {
          PEG.ArrayUtils.each(node[propertyName], check);
        };
      }

      var checkFunctions = {
        grammar:
          function(node) {
            for (var name in node.rules) {
              check(node.rules[name]);
            }
          },

        rule:         checkExpression,
        choice:       checkSubnodes("alternatives"),
        sequence:     checkSubnodes("elements"),
        labeled:      checkExpression,
        simple_and:   checkExpression,
        simple_not:   checkExpression,
        semantic_and: nop,
        semantic_not: nop,
        optional:     checkExpression,
        zero_or_more: checkExpression,
        one_or_more:  checkExpression,
        action:       checkExpression,

        rule_ref:
          function(node) {
            if (typeof(ast.rules[node.name]) === "undefined") {
              throw new PEG.GrammarError(
                "Referenced rule \"" + node.name + "\" does not exist."
              );
            }
          },

        literal:      nop,
        any:          nop,
        "class":      nop
      };

      function check(node) { checkFunctions[node.type](node); }

      check(ast);
    },

    /* Checks that no left recursion is present. */
    function(ast) {
      function nop() {}

      function checkExpression(node, appliedRules) {
        check(node.expression, appliedRules);
      }

      var checkFunctions = {
        grammar:
          function(node, appliedRules) {
            for (var name in node.rules) {
              check(ast.rules[name], appliedRules);
            }
          },

        rule:
          function(node, appliedRules) {
            check(node.expression, appliedRules.concat(node.name));
          },

        choice:
          function(node, appliedRules) {
            PEG.ArrayUtils.each(node.alternatives, function(alternative) {
              check(alternative, appliedRules);
            });
          },

        sequence:
          function(node, appliedRules) {
            if (node.elements.length > 0) {
              check(node.elements[0], appliedRules);
            }
          },

        labeled:      checkExpression,
        simple_and:   checkExpression,
        simple_not:   checkExpression,
        semantic_and: nop,
        semantic_not: nop,
        optional:     checkExpression,
        zero_or_more: checkExpression,
        one_or_more:  checkExpression,
        action:       checkExpression,

        rule_ref:
          function(node, appliedRules) {
            if (PEG.ArrayUtils.contains(appliedRules, node.name)) {
              throw new PEG.GrammarError(
                "Left recursion detected for rule \"" + node.name + "\"."
              );
            }
            check(ast.rules[node.name], appliedRules);
          },

        literal:      nop,
        any:          nop,
        "class":      nop
      };

      function check(node, appliedRules) {
        checkFunctions[node.type](node, appliedRules);
      }

      check(ast, []);
    }
  ],

  /*
   * Optimalization passes made on the grammar AST before compilation. Each pass
   * is a function that is passed the AST and returns a new AST. The AST can be
   * modified in-place by the pass. The passes are run in sequence in order of
   * their definition.
   */
  _passes: [
    /*
     * Removes proxy rules -- that is, rules that only delegate to other rule.
     */
    function(ast) {
      function isProxyRule(node) {
        return node.type === "rule" && node.expression.type === "rule_ref";
      }

      function replaceRuleRefs(ast, from, to) {
        function nop() {}

        function replaceInExpression(node, from, to) {
          replace(node.expression, from, to);
        }

        function replaceInSubnodes(propertyName) {
          return function(node, from, to) {
            PEG.ArrayUtils.each(node[propertyName], function(node) {
              replace(node, from, to);
            });
          };
        }

        var replaceFunctions = {
          grammar:
            function(node, from, to) {
              for (var name in node.rules) {
                replace(ast.rules[name], from, to);
              }
            },

          rule:         replaceInExpression,
          choice:       replaceInSubnodes("alternatives"),
          sequence:     replaceInSubnodes("elements"),
          labeled:      replaceInExpression,
          simple_and:   replaceInExpression,
          simple_not:   replaceInExpression,
          semantic_and: nop,
          semantic_not: nop,
          optional:     replaceInExpression,
          zero_or_more: replaceInExpression,
          one_or_more:  replaceInExpression,
          action:       replaceInExpression,

          rule_ref:
            function(node, from, to) {
              if (node.name === from) {
                node.name = to;
              }
            },

          literal:      nop,
          any:          nop,
          "class":      nop
        };

        function replace(node, from, to) {
          replaceFunctions[node.type](node, from, to);
        }

        replace(ast, from, to);
      }

      for (var name in ast.rules) {
        if (isProxyRule(ast.rules[name])) {
          replaceRuleRefs(ast, ast.rules[name].name, ast.rules[name].expression.name);
          if (name === ast.startRule) {
            ast.startRule = ast.rules[name].expression.name;
          }
          delete ast.rules[name];
        }
      }

      return ast;
    }
  ],

  _compileFunctions: {
    grammar: function(node) {
      var initializerCode = node.initializer !== null
        ?  PEG.Compiler.compileNode(node.initializer)
        : "";

      var parseFunctionDefinitions = [];
      for (var name in node.rules) {
        parseFunctionDefinitions.push(PEG.Compiler.compileNode(node.rules[name]));
      }

      return PEG.Compiler.formatCode(
        "(function(){",
        "  /* Generated by PEG.js (http://pegjs.majda.cz/). */",
        "  ",
        "  var result = {",
        "    /*",
        "     * Parses the input with a generated parser. If the parsing is successfull,",
        "     * returns a value explicitly or implicitly specified by the grammar from",
        "     * which the parser was generated (see |PEG.buildParser|). If the parsing is",
        "     * unsuccessful, throws |PEG.grammarParser.SyntaxError| describing the error.",
        "     */",
        "    parse: function(input) {",
        "      var pos = 0;",
        "      var rightmostMatchFailuresPos = 0;",
        "      var rightmostMatchFailuresExpected = [];",
        "      var cache = {};",
        "      ",
        /* This needs to be in sync with PEG.StringUtils.quote. */
        "      function quoteString(s) {",
        "        /*",
        "         * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a",
        "         * string literal except for the closing quote character, backslash,",
        "         * carriage return, line separator, paragraph separator, and line feed.",
        "         * Any character may appear in the form of an escape sequence.",
        "         */",
        "        return '\"' + s",
        "          .replace(/\\\\/g, '\\\\\\\\')        // backslash",
        "          .replace(/\"/g, '\\\\\"')          // closing quote character",
        "          .replace(/\\r/g, '\\\\r')         // carriage return",
        "          .replace(/\\u2028/g, '\\\\u2028') // line separator",
        "          .replace(/\\u2029/g, '\\\\u2029') // paragraph separator",
        "          .replace(/\\n/g, '\\\\n')         // line feed",
        "          + '\"';",
        "      }",
        "      ",
        /* This needs to be in sync with PEG.ArrayUtils.contains. */
        "      function arrayContains(array, value) {",
        "        /*",
        "         * Stupid IE does not have Array.prototype.indexOf, otherwise this",
        "         * function would be a one-liner.",
        "         */",
        "        var length = array.length;",
        "        for (var i = 0; i < length; i++) {",
        "          if (array[i] === value) {",
        "            return true;",
        "          }",
        "        }",
        "        return false;",
        "      }",
        "      ",
        "      function matchFailed(failure) {",
        "        if (pos < rightmostMatchFailuresPos) {",
        "          return;",
        "        }",
        "        ",
        "        if (pos > rightmostMatchFailuresPos) {",
        "          rightmostMatchFailuresPos = pos;",
        "          rightmostMatchFailuresExpected = [];",
        "        }",
        "        ",
        "        if (!arrayContains(rightmostMatchFailuresExpected, failure)) {",
        "          rightmostMatchFailuresExpected.push(failure);",
        "        }",
        "      }",
        "      ",
        "      ${parseFunctionDefinitions}",
        "      ",
        "      function buildErrorMessage() {",
        "        function buildExpected(failuresExpected) {",
        "          switch (failuresExpected.length) {",
        "            case 0:",
        "              return 'end of input';",
        "            case 1:",
        "              return failuresExpected[0];",
        "            default:",
        "              failuresExpected.sort();",
        "              return failuresExpected.slice(0, failuresExpected.length - 1).join(', ')",
        "                + ' or '",
        "                + failuresExpected[failuresExpected.length - 1];",
        "          }",
        "        }",
        "        ",
        "        var expected = buildExpected(rightmostMatchFailuresExpected);",
        "        var actualPos = Math.max(pos, rightmostMatchFailuresPos);",
        "        var actual = actualPos < input.length",
        "          ? quoteString(input.charAt(actualPos))",
        "          : 'end of input';",
        "        ",
        "        return 'Expected ' + expected + ' but ' + actual + ' found.';",
        "      }",
        "      ",
        "      function computeErrorPosition() {",
        "        /*",
        "         * The first idea was to use |String.split| to break the input up to the",
        "         * error position along newlines and derive the line and column from",
        "         * there. However IE's |split| implementation is so broken that it was",
        "         * enough to prevent it.",
        "         */",
        "        ",
        "        var line = 1;",
        "        var column = 1;",
        "        var seenCR = false;",
        "        ",
        "        for (var i = 0; i <  rightmostMatchFailuresPos; i++) {",
        "          var ch = input.charAt(i);",
        "          if (ch === '\\n') {",
        "            if (!seenCR) { line++; }",
        "            column = 1;",
        "            seenCR = false;",
        "          } else if (ch === '\\r' | ch === '\\u2028' || ch === '\\u2029') {",
        "            line++;",
        "            column = 1;",
        "            seenCR = true;",
        "          } else {",
        "            column++;",
        "            seenCR = false;",
        "          }",
        "        }",
        "        ",
        "        return { line: line, column: column };",
        "      }",
        "      ",
        "      ${initializerCode}",
        "      ",
        "      var result = parse_${startRule}({ reportMatchFailures: true });",
        "      ",
        "      /*",
        "       * The parser is now in one of the following three states:",
        "       *",
        "       * 1. The parser successfully parsed the whole input.",
        "       *",
        "       *    - |result !== null|",
        "       *    - |pos === input.length|",
        "       *    - |rightmostMatchFailuresExpected| may or may not contain something",
        "       *",
        "       * 2. The parser successfully parsed only a part of the input.",
        "       *",
        "       *    - |result !== null|",
        "       *    - |pos < input.length|",
        "       *    - |rightmostMatchFailuresExpected| may or may not contain something",
        "       *",
        "       * 3. The parser did not successfully parse any part of the input.",
        "       *",
        "       *   - |result === null|",
        "       *   - |pos === 0|",
        "       *   - |rightmostMatchFailuresExpected| contains at least one failure",
        "       *",
        "       * All code following this comment (including called functions) must",
        "       * handle these states.",
        "       */",
        "      if (result === null || pos !== input.length) {",
        "        var errorPosition = computeErrorPosition();",
        "        throw new this.SyntaxError(",
        "          buildErrorMessage(),",
        "          errorPosition.line,",
        "          errorPosition.column",
        "        );",
        "      }",
        "      ",
        "      return result;",
        "    },",
        "    ",
        "    /* Returns the parser source code. */",
        "    toSource: function() { return this._source; }",
        "  };",
        "  ",
        "  /* Thrown when a parser encounters a syntax error. */",
        "  ",
        "  result.SyntaxError = function(message, line, column) {",
        "    this.name = 'SyntaxError';",
        "    this.message = message;",
        "    this.line = line;",
        "    this.column = column;",
        "  };",
        "  ",
        "  result.SyntaxError.prototype = Error.prototype;",
        "  ",
        "  return result;",
        "})()",
        {
          initializerCode:          initializerCode,
          parseFunctionDefinitions: parseFunctionDefinitions.join("\n\n"),
          startRule:                node.startRule
        }
      );
    },

    initializer: function(node) {
      return node.code;
    },

    rule: function(node) {
      /*
       * We want to reset variable names at the beginning of every function so
       * that a little change in the source grammar does not change variables in
       * all the generated code. This is desired especially when one has the
       * generated grammar stored in a VCS (this is true e.g. for our
       * metagrammar).
       */
      PEG.Compiler.resetUniqueIdentifierCounters();

      var resultVar = PEG.Compiler.generateUniqueIdentifier("result");

      if (node.displayName !== null) {
        var setReportMatchFailuresCode = PEG.Compiler.formatCode(
          "var savedReportMatchFailures = context.reportMatchFailures;",
          "context.reportMatchFailures = false;"
        );
        var restoreReportMatchFailuresCode = PEG.Compiler.formatCode(
          "context.reportMatchFailures = savedReportMatchFailures;"
        );
        var reportMatchFailureCode = PEG.Compiler.formatCode(
          "if (context.reportMatchFailures && ${resultVar} === null) {",
          "  matchFailed(${displayName|string});",
          "}",
          {
            displayName: node.displayName,
            resultVar:   resultVar
          }
        );
      } else {
        var setReportMatchFailuresCode = "";
        var restoreReportMatchFailuresCode = "";
        var reportMatchFailureCode = "";
      }

      return PEG.Compiler.formatCode(
        "function parse_${name}(context) {",
        "  var cacheKey = ${name|string} + '@' + pos;",
        "  var cachedResult = cache[cacheKey];",
        "  if (cachedResult) {",
        "    pos = cachedResult.nextPos;",
        "    return cachedResult.result;",
        "  }",
        "  ",
        "  ${setReportMatchFailuresCode}",
        "  ${code}",
        "  ${restoreReportMatchFailuresCode}",
        "  ${reportMatchFailureCode}",
        "  ",
        "  cache[cacheKey] = {",
        "    nextPos: pos,",
        "    result:  ${resultVar}",
        "  };",
        "  return ${resultVar};",
        "}",
        {
          name:                           node.name,
          setReportMatchFailuresCode:     setReportMatchFailuresCode,
          restoreReportMatchFailuresCode: restoreReportMatchFailuresCode,
          reportMatchFailureCode:         reportMatchFailureCode,
          code:                           PEG.Compiler.compileNode(node.expression, resultVar),
          resultVar:                      resultVar
        }
      );
    },

    /*
     * The contract for all code fragments generated by the following functions
     * is as follows:
     *
     * * The code fragment should try to match a part of the input starting with
     * the position indicated in |pos|. That position may point past the end of
     * the input.
     *
     * * If the code fragment matches the input, it advances |pos| after the
     *   matched part of the input and sets variable with a name stored in
     *   |resultVar| to appropriate value, which is always non-null.
     *
     * * If the code fragment does not match the input, it does not change |pos|
     *   and it sets a variable with a name stored in |resultVar| to |null|.
     */

    choice: function(node, resultVar) {
      var code = PEG.Compiler.formatCode(
        "var ${resultVar} = null;",
        { resultVar: resultVar }
      );

      for (var i = node.alternatives.length - 1; i >= 0; i--) {
        var alternativeResultVar = PEG.Compiler.generateUniqueIdentifier("result");
        code = PEG.Compiler.formatCode(
          "${alternativeCode}",
          "if (${alternativeResultVar} !== null) {",
          "  var ${resultVar} = ${alternativeResultVar};",
          "} else {",
          "  ${code};",
          "}",
          {
            alternativeCode:      PEG.Compiler.compileNode(node.alternatives[i], alternativeResultVar),
            alternativeResultVar: alternativeResultVar,
            code:                 code,
            resultVar:            resultVar
          }
        );
      }

      return code;
    },

    sequence: function(node, resultVar) {
      var savedPosVar = PEG.Compiler.generateUniqueIdentifier("savedPos");

      var elementResultVars = PEG.ArrayUtils.map(node.elements, function() {
        return PEG.Compiler.generateUniqueIdentifier("result")
      });

      var code = PEG.Compiler.formatCode(
        "var ${resultVar} = ${elementResultVarArray};",
        {
          resultVar:             resultVar,
          elementResultVarArray: "[" + elementResultVars.join(", ") + "]"
        }
      );

      for (var i = node.elements.length - 1; i >= 0; i--) {
        code = PEG.Compiler.formatCode(
          "${elementCode}",
          "if (${elementResultVar} !== null) {",
          "  ${code}",
          "} else {",
          "  var ${resultVar} = null;",
          "  pos = ${savedPosVar};",
          "}",
          {
            elementCode:      PEG.Compiler.compileNode(node.elements[i], elementResultVars[i]),
            elementResultVar: elementResultVars[i],
            code:             code,
            savedPosVar:      savedPosVar,
            resultVar:        resultVar
          }
        );
      }

      return PEG.Compiler.formatCode(
        "var ${savedPosVar} = pos;",
        "${code}",
        {
          code:        code,
          savedPosVar: savedPosVar
        }
      );
    },

    labeled: function(node, resultVar) {
      return PEG.Compiler.compileNode(node.expression, resultVar);
    },

    simple_and: function(node, resultVar) {
      var savedPosVar                 = PEG.Compiler.generateUniqueIdentifier("savedPos");
      var savedReportMatchFailuresVar = PEG.Compiler.generateUniqueIdentifier("savedReportMatchFailuresVar");
      var expressionResultVar         = PEG.Compiler.generateUniqueIdentifier("result");

      return PEG.Compiler.formatCode(
        "var ${savedPosVar} = pos;",
        "var ${savedReportMatchFailuresVar} = context.reportMatchFailures;",
        "context.reportMatchFailures = false;",
        "${expressionCode}",
        "context.reportMatchFailures = ${savedReportMatchFailuresVar};",
        "if (${expressionResultVar} !== null) {",
        "  var ${resultVar} = '';",
        "  pos = ${savedPosVar};",
        "} else {",
        "  var ${resultVar} = null;",
        "}",
        {
          expressionCode:              PEG.Compiler.compileNode(node.expression, expressionResultVar),
          expressionResultVar:         expressionResultVar,
          savedPosVar:                 savedPosVar,
          savedReportMatchFailuresVar: savedReportMatchFailuresVar,
          resultVar:                   resultVar
        }
      );
    },

    simple_not: function(node, resultVar) {
      var savedPosVar                 = PEG.Compiler.generateUniqueIdentifier("savedPos");
      var savedReportMatchFailuresVar = PEG.Compiler.generateUniqueIdentifier("savedReportMatchFailuresVar");
      var expressionResultVar         = PEG.Compiler.generateUniqueIdentifier("result");

      return PEG.Compiler.formatCode(
        "var ${savedPosVar} = pos;",
        "var ${savedReportMatchFailuresVar} = context.reportMatchFailures;",
        "context.reportMatchFailures = false;",
        "${expressionCode}",
        "context.reportMatchFailures = ${savedReportMatchFailuresVar};",
        "if (${expressionResultVar} === null) {",
        "  var ${resultVar} = '';",
        "} else {",
        "  var ${resultVar} = null;",
        "  pos = ${savedPosVar};",
        "}",
        {
          expressionCode:              PEG.Compiler.compileNode(node.expression, expressionResultVar),
          expressionResultVar:         expressionResultVar,
          savedPosVar:                 savedPosVar,
          savedReportMatchFailuresVar: savedReportMatchFailuresVar,
          resultVar:                   resultVar
        }
      );
    },

    semantic_and: function(node, resultVar) {
      var savedPosVar = PEG.Compiler.generateUniqueIdentifier("savedPos");

      return PEG.Compiler.formatCode(
        "var ${resultVar} = (function() {${actionCode}})() ? '' : null;",
        {
          actionCode:  node.code,
          resultVar:   resultVar
        }
      );
    },

    semantic_not: function(node, resultVar) {
      var savedPosVar = PEG.Compiler.generateUniqueIdentifier("savedPos");

      return PEG.Compiler.formatCode(
        "var ${resultVar} = (function() {${actionCode}})() ? null : '';",
        {
          actionCode:  node.code,
          resultVar:   resultVar
        }
      );
    },

    optional: function(node, resultVar) {
      var expressionResultVar = PEG.Compiler.generateUniqueIdentifier("result");

      return PEG.Compiler.formatCode(
        "${expressionCode}",
        "var ${resultVar} = ${expressionResultVar} !== null ? ${expressionResultVar} : '';",
        {
          expressionCode:      PEG.Compiler.compileNode(node.expression, expressionResultVar),
          expressionResultVar: expressionResultVar,
          resultVar:           resultVar
        }
      );
    },

    zero_or_more: function(node, resultVar) {
      var expressionResultVar = PEG.Compiler.generateUniqueIdentifier("result");

      return PEG.Compiler.formatCode(
        "var ${resultVar} = [];",
        "${expressionCode}",
        "while (${expressionResultVar} !== null) {",
        "  ${resultVar}.push(${expressionResultVar});",
        "  ${expressionCode}",
        "}",
        {
          expressionCode:      PEG.Compiler.compileNode(node.expression, expressionResultVar),
          expressionResultVar: expressionResultVar,
          resultVar:           resultVar
        }
      );
    },

    one_or_more: function(node, resultVar) {
      var expressionResultVar = PEG.Compiler.generateUniqueIdentifier("result");

      return PEG.Compiler.formatCode(
        "${expressionCode}",
        "if (${expressionResultVar} !== null) {",
        "  var ${resultVar} = [];",
        "  while (${expressionResultVar} !== null) {",
        "    ${resultVar}.push(${expressionResultVar});",
        "    ${expressionCode}",
        "  }",
        "} else {",
        "  var ${resultVar} = null;",
        "}",
        {
          expressionCode:      PEG.Compiler.compileNode(node.expression, expressionResultVar),
          expressionResultVar: expressionResultVar,
          resultVar:           resultVar
        }
      );
    },

    action: function(node, resultVar) {
      /*
       * In case of sequences, we splat their elements into function arguments
       * one by one. Example:
       *
       *   start: a:"a" b:"b" c:"c" { alert(arguments.length) }  // => 3
       *
       * This behavior is reflected in this function.
       */

      var expressionResultVar = PEG.Compiler.generateUniqueIdentifier("result");

      if (node.expression.type === "sequence") {
        var formalParams = [];
        var actualParams = [];

        var elements = node.expression.elements;
        var elementsLength = elements.length;
        for (var i = 0; i < elementsLength; i++) {
          if (elements[i].type === "labeled") {
            formalParams.push(elements[i].label);
            actualParams.push(expressionResultVar + "[" + i + "]");
          }
        }
      } else if (node.expression.type === "labeled") {
        var formalParams = [node.expression.label];
        var actualParams = [expressionResultVar];
      } else {
        var formalParams = [];
        var actualParams = [];
      }

      return PEG.Compiler.formatCode(
        "${expressionCode}",
        "var ${resultVar} = ${expressionResultVar} !== null",
        "  ? (function(${formalParams}) {${actionCode}})(${actualParams})",
        "  : null;",
        {
          expressionCode:      PEG.Compiler.compileNode(node.expression, expressionResultVar),
          expressionResultVar: expressionResultVar,
          actionCode:          node.code,
          formalParams:        formalParams.join(", "),
          actualParams:        actualParams.join(", "),
          resultVar:           resultVar
        }
      );
    },

    rule_ref: function(node, resultVar) {
      return PEG.Compiler.formatCode(
        "var ${resultVar} = ${ruleMethod}(context);",
        {
          ruleMethod: "parse_" + node.name,
          resultVar:  resultVar
        }
      );
    },

    literal: function(node, resultVar) {
      return PEG.Compiler.formatCode(
        "if (input.substr(pos, ${length}) === ${value|string}) {",
        "  var ${resultVar} = ${value|string};",
        "  pos += ${length};",
        "} else {",
        "  var ${resultVar} = null;",
        "  if (context.reportMatchFailures) {",
        "    matchFailed(quoteString(${value|string}));",
        "  }",
        "}",
        {
          value:     node.value,
          length:    node.value.length,
          resultVar: resultVar
        }
      );
    },

    any: function(node, resultVar) {
      return PEG.Compiler.formatCode(
        "if (input.length > pos) {",
        "  var ${resultVar} = input.charAt(pos);",
        "  pos++;",
        "} else {",
        "  var ${resultVar} = null;",
        "  if (context.reportMatchFailures) {",
        "    matchFailed('any character');",
        "  }",
        "}",
        { resultVar: resultVar }
      );
    },

    "class": function(node, resultVar) {
      if (node.parts.length > 0) {
        var regexp = "/^["
          + (node.inverted ? "^" : "")
          + PEG.ArrayUtils.map(node.parts, function(part) {
              return part instanceof Array
                ? PEG.RegExpUtils.quoteForClass(part[0])
                  + "-"
                  + PEG.RegExpUtils.quoteForClass(part[1])
                : PEG.RegExpUtils.quoteForClass(part);
            }).join("")
          + "]/";
      } else {
        /*
         * Stupid IE considers regexps /[]/ and /[^]/ syntactically invalid, so
         * we translate them into euqivalents it can handle.
         */
        var regexp = node.inverted ? "/^[\\S\\s]/" : "/^(?!)/";
      }

      return PEG.Compiler.formatCode(
        "if (input.substr(pos).match(${regexp}) !== null) {",
        "  var ${resultVar} = input.charAt(pos);",
        "  pos++;",
        "} else {",
        "  var ${resultVar} = null;",
        "  if (context.reportMatchFailures) {",
        "    matchFailed(${rawText|string});",
        "  }",
        "}",
        {
          regexp:    regexp,
          rawText:   node.rawText,
          resultVar: resultVar
        }
      );
    }
  },

  /*
   * Compiles an AST node and returns the generated code. The |resultVar|
   * parameter contains a name of variable in which the match result will be
   * stored in the generated code.
   */
  compileNode: function(node, resultVar) {
    return this._compileFunctions[node.type](node, resultVar);
  },

  /*
   * Generates a parser from a specified grammar AST. Throws |PEG.GrammarError|
   * if the AST contains a semantic error. Note that not all errors are detected
   * during the generation and some may protrude to the generated parser and
   * cause its malfunction.
   */
  compileParser: function(ast) {
    for (var i = 0; i < this._checks.length; i++) {
      this._checks[i](ast);
    }

    for (var i = 0; i < this._passes.length; i++) {
      ast = this._passes[i](ast);
    }

    var source = this.compileNode(ast);
    var result = eval(source);
    result._source = source;

    return result;
  }
};

PEG.grammarParser = (function(){
  /* Generated by PEG.js (http://pegjs.majda.cz/). */
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.grammarParser.SyntaxError| describing the error.
     */
    parse: function(input) {
      var pos = 0;
      var rightmostMatchFailuresPos = 0;
      var rightmostMatchFailuresExpected = [];
      var cache = {};
      
      function quoteString(s) {
        /*
         * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
         * string literal except for the closing quote character, backslash,
         * carriage return, line separator, paragraph separator, and line feed.
         * Any character may appear in the form of an escape sequence.
         */
        return '"' + s
          .replace(/\\/g, '\\\\')        // backslash
          .replace(/"/g, '\\"')          // closing quote character
          .replace(/\r/g, '\\r')         // carriage return
          .replace(/\u2028/g, '\\u2028') // line separator
          .replace(/\u2029/g, '\\u2029') // paragraph separator
          .replace(/\n/g, '\\n')         // line feed
          + '"';
      }
      
      function arrayContains(array, value) {
        /*
         * Stupid IE does not have Array.prototype.indexOf, otherwise this
         * function would be a one-liner.
         */
        var length = array.length;
        for (var i = 0; i < length; i++) {
          if (array[i] === value) {
            return true;
          }
        }
        return false;
      }
      
      function matchFailed(failure) {
        if (pos < rightmostMatchFailuresPos) {
          return;
        }
        
        if (pos > rightmostMatchFailuresPos) {
          rightmostMatchFailuresPos = pos;
          rightmostMatchFailuresExpected = [];
        }
        
        if (!arrayContains(rightmostMatchFailuresExpected, failure)) {
          rightmostMatchFailuresExpected.push(failure);
        }
      }
      
      function parse_grammar(context) {
        var cacheKey = "grammar" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse___(context);
        if (result2 !== null) {
          var result6 = parse_initializer(context);
          var result3 = result6 !== null ? result6 : '';
          if (result3 !== null) {
            var result5 = parse_rule(context);
            if (result5 !== null) {
              var result4 = [];
              while (result5 !== null) {
                result4.push(result5);
                var result5 = parse_rule(context);
              }
            } else {
              var result4 = null;
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(initializer, rules) {
                var rulesConverted = {};
                PEG.ArrayUtils.each(rules, function(rule) { rulesConverted[rule.name] = rule; });
          
                return {
                  type:        "grammar",
                  initializer: initializer !== "" ? initializer : null,
                  rules:       rulesConverted,
                  startRule:   rules[0].name
                }
              })(result1[1], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_initializer(context) {
        var cacheKey = "initializer" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_action(context);
        if (result2 !== null) {
          var result4 = parse_semicolon(context);
          var result3 = result4 !== null ? result4 : '';
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(code) {
                return {
                  type: "initializer",
                  code: code
                };
              })(result1[0])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_rule(context) {
        var cacheKey = "rule" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_identifier(context);
        if (result2 !== null) {
          var result9 = parse_literal(context);
          if (result9 !== null) {
            var result3 = result9;
          } else {
            if (input.substr(pos, 0) === "") {
              var result8 = "";
              pos += 0;
            } else {
              var result8 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString(""));
              }
            }
            if (result8 !== null) {
              var result3 = result8;
            } else {
              var result3 = null;;
            };
          }
          if (result3 !== null) {
            var result4 = parse_equals(context);
            if (result4 !== null) {
              var result5 = parse_choice(context);
              if (result5 !== null) {
                var result7 = parse_semicolon(context);
                var result6 = result7 !== null ? result7 : '';
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(name, displayName, expression) {
                return {
                  type:        "rule",
                  name:        name,
                  displayName: displayName !== "" ? displayName : null,
                  expression:  expression
                };
              })(result1[0], result1[1], result1[3])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_choice(context) {
        var cacheKey = "choice" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_sequence(context);
        if (result2 !== null) {
          var result3 = [];
          var savedPos1 = pos;
          var result5 = parse_slash(context);
          if (result5 !== null) {
            var result6 = parse_sequence(context);
            if (result6 !== null) {
              var result4 = [result5, result6];
            } else {
              var result4 = null;
              pos = savedPos1;
            }
          } else {
            var result4 = null;
            pos = savedPos1;
          }
          while (result4 !== null) {
            result3.push(result4);
            var savedPos1 = pos;
            var result5 = parse_slash(context);
            if (result5 !== null) {
              var result6 = parse_sequence(context);
              if (result6 !== null) {
                var result4 = [result5, result6];
              } else {
                var result4 = null;
                pos = savedPos1;
              }
            } else {
              var result4 = null;
              pos = savedPos1;
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(head, tail) {
                if (tail.length > 0) {
                  var alternatives = [head].concat(PEG.ArrayUtils.map(
                      tail,
                      function(element) { return element[1]; }
                  ));
                  return {
                    type:         "choice",
                    alternatives: alternatives
                  }
                } else {
                  return head;
                }
              })(result1[0], result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_sequence(context) {
        var cacheKey = "sequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result6 = [];
        var result8 = parse_labeled(context);
        while (result8 !== null) {
          result6.push(result8);
          var result8 = parse_labeled(context);
        }
        if (result6 !== null) {
          var result7 = parse_action(context);
          if (result7 !== null) {
            var result5 = [result6, result7];
          } else {
            var result5 = null;
            pos = savedPos0;
          }
        } else {
          var result5 = null;
          pos = savedPos0;
        }
        var result4 = result5 !== null
          ? (function(elements, code) {
                var expression = elements.length != 1
                  ? {
                      type:     "sequence",
                      elements: elements
                    }
                  : elements[0];
                return {
                  type:       "action",
                  expression: expression,
                  code:       code
                };
              })(result5[0], result5[1])
          : null;
        if (result4 !== null) {
          var result0 = result4;
        } else {
          var result2 = [];
          var result3 = parse_labeled(context);
          while (result3 !== null) {
            result2.push(result3);
            var result3 = parse_labeled(context);
          }
          var result1 = result2 !== null
            ? (function(elements) {
                  return elements.length != 1
                    ? {
                        type:     "sequence",
                        elements: elements
                      }
                    : elements[0];
                })(result2)
            : null;
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_labeled(context) {
        var cacheKey = "labeled" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result4 = parse_identifier(context);
        if (result4 !== null) {
          var result5 = parse_colon(context);
          if (result5 !== null) {
            var result6 = parse_prefixed(context);
            if (result6 !== null) {
              var result3 = [result4, result5, result6];
            } else {
              var result3 = null;
              pos = savedPos0;
            }
          } else {
            var result3 = null;
            pos = savedPos0;
          }
        } else {
          var result3 = null;
          pos = savedPos0;
        }
        var result2 = result3 !== null
          ? (function(label, expression) {
                return {
                  type:       "labeled",
                  label:      label,
                  expression: expression
                };
              })(result3[0], result3[2])
          : null;
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_prefixed(context);
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_prefixed(context) {
        var cacheKey = "prefixed" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos3 = pos;
        var result16 = parse_and(context);
        if (result16 !== null) {
          var result17 = parse_action(context);
          if (result17 !== null) {
            var result15 = [result16, result17];
          } else {
            var result15 = null;
            pos = savedPos3;
          }
        } else {
          var result15 = null;
          pos = savedPos3;
        }
        var result14 = result15 !== null
          ? (function(code) {
                return {
                  type: "semantic_and",
                  code: code
                };
              })(result15[1])
          : null;
        if (result14 !== null) {
          var result0 = result14;
        } else {
          var savedPos2 = pos;
          var result12 = parse_and(context);
          if (result12 !== null) {
            var result13 = parse_suffixed(context);
            if (result13 !== null) {
              var result11 = [result12, result13];
            } else {
              var result11 = null;
              pos = savedPos2;
            }
          } else {
            var result11 = null;
            pos = savedPos2;
          }
          var result10 = result11 !== null
            ? (function(expression) {
                  return {
                    type:       "simple_and",
                    expression: expression
                  };
                })(result11[1])
            : null;
          if (result10 !== null) {
            var result0 = result10;
          } else {
            var savedPos1 = pos;
            var result8 = parse_not(context);
            if (result8 !== null) {
              var result9 = parse_action(context);
              if (result9 !== null) {
                var result7 = [result8, result9];
              } else {
                var result7 = null;
                pos = savedPos1;
              }
            } else {
              var result7 = null;
              pos = savedPos1;
            }
            var result6 = result7 !== null
              ? (function(code) {
                    return {
                      type: "semantic_not",
                      code: code
                    };
                  })(result7[1])
              : null;
            if (result6 !== null) {
              var result0 = result6;
            } else {
              var savedPos0 = pos;
              var result4 = parse_not(context);
              if (result4 !== null) {
                var result5 = parse_suffixed(context);
                if (result5 !== null) {
                  var result3 = [result4, result5];
                } else {
                  var result3 = null;
                  pos = savedPos0;
                }
              } else {
                var result3 = null;
                pos = savedPos0;
              }
              var result2 = result3 !== null
                ? (function(expression) {
                      return {
                        type:       "simple_not",
                        expression: expression
                      };
                    })(result3[1])
                : null;
              if (result2 !== null) {
                var result0 = result2;
              } else {
                var result1 = parse_suffixed(context);
                if (result1 !== null) {
                  var result0 = result1;
                } else {
                  var result0 = null;;
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_suffixed(context) {
        var cacheKey = "suffixed" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos2 = pos;
        var result12 = parse_primary(context);
        if (result12 !== null) {
          var result13 = parse_question(context);
          if (result13 !== null) {
            var result11 = [result12, result13];
          } else {
            var result11 = null;
            pos = savedPos2;
          }
        } else {
          var result11 = null;
          pos = savedPos2;
        }
        var result10 = result11 !== null
          ? (function(expression) {
                return {
                  type:       "optional",
                  expression: expression
                };
              })(result11[0])
          : null;
        if (result10 !== null) {
          var result0 = result10;
        } else {
          var savedPos1 = pos;
          var result8 = parse_primary(context);
          if (result8 !== null) {
            var result9 = parse_star(context);
            if (result9 !== null) {
              var result7 = [result8, result9];
            } else {
              var result7 = null;
              pos = savedPos1;
            }
          } else {
            var result7 = null;
            pos = savedPos1;
          }
          var result6 = result7 !== null
            ? (function(expression) {
                  return {
                    type:       "zero_or_more",
                    expression: expression
                  };
                })(result7[0])
            : null;
          if (result6 !== null) {
            var result0 = result6;
          } else {
            var savedPos0 = pos;
            var result4 = parse_primary(context);
            if (result4 !== null) {
              var result5 = parse_plus(context);
              if (result5 !== null) {
                var result3 = [result4, result5];
              } else {
                var result3 = null;
                pos = savedPos0;
              }
            } else {
              var result3 = null;
              pos = savedPos0;
            }
            var result2 = result3 !== null
              ? (function(expression) {
                    return {
                      type:       "one_or_more",
                      expression: expression
                    };
                  })(result3[0])
              : null;
            if (result2 !== null) {
              var result0 = result2;
            } else {
              var result1 = parse_primary(context);
              if (result1 !== null) {
                var result0 = result1;
              } else {
                var result0 = null;;
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_primary(context) {
        var cacheKey = "primary" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos1 = pos;
        var result13 = parse_identifier(context);
        if (result13 !== null) {
          var savedPos2 = pos;
          var savedReportMatchFailuresVar0 = context.reportMatchFailures;
          context.reportMatchFailures = false;
          var savedPos3 = pos;
          var result19 = parse_literal(context);
          if (result19 !== null) {
            var result16 = result19;
          } else {
            if (input.substr(pos, 0) === "") {
              var result18 = "";
              pos += 0;
            } else {
              var result18 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString(""));
              }
            }
            if (result18 !== null) {
              var result16 = result18;
            } else {
              var result16 = null;;
            };
          }
          if (result16 !== null) {
            var result17 = parse_equals(context);
            if (result17 !== null) {
              var result15 = [result16, result17];
            } else {
              var result15 = null;
              pos = savedPos3;
            }
          } else {
            var result15 = null;
            pos = savedPos3;
          }
          context.reportMatchFailures = savedReportMatchFailuresVar0;
          if (result15 === null) {
            var result14 = '';
          } else {
            var result14 = null;
            pos = savedPos2;
          }
          if (result14 !== null) {
            var result12 = [result13, result14];
          } else {
            var result12 = null;
            pos = savedPos1;
          }
        } else {
          var result12 = null;
          pos = savedPos1;
        }
        var result11 = result12 !== null
          ? (function(name) {
                return {
                  type: "rule_ref",
                  name: name
                };
              })(result12[0])
          : null;
        if (result11 !== null) {
          var result0 = result11;
        } else {
          var result10 = parse_literal(context);
          var result9 = result10 !== null
            ? (function(value) {
                  return {
                    type:  "literal",
                    value: value
                  };
                })(result10)
            : null;
          if (result9 !== null) {
            var result0 = result9;
          } else {
            var result8 = parse_dot(context);
            var result7 = result8 !== null
              ? (function() { return { type: "any" }; })()
              : null;
            if (result7 !== null) {
              var result0 = result7;
            } else {
              var result6 = parse_class(context);
              if (result6 !== null) {
                var result0 = result6;
              } else {
                var savedPos0 = pos;
                var result3 = parse_lparen(context);
                if (result3 !== null) {
                  var result4 = parse_choice(context);
                  if (result4 !== null) {
                    var result5 = parse_rparen(context);
                    if (result5 !== null) {
                      var result2 = [result3, result4, result5];
                    } else {
                      var result2 = null;
                      pos = savedPos0;
                    }
                  } else {
                    var result2 = null;
                    pos = savedPos0;
                  }
                } else {
                  var result2 = null;
                  pos = savedPos0;
                }
                var result1 = result2 !== null
                  ? (function(expression) { return expression; })(result2[1])
                  : null;
                if (result1 !== null) {
                  var result0 = result1;
                } else {
                  var result0 = null;;
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_action(context) {
        var cacheKey = "action" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        var savedPos0 = pos;
        var result2 = parse_braced(context);
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(braced) { return braced.substr(1, braced.length - 2); })(result1[0])
          : null;
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("action");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_braced(context) {
        var cacheKey = "braced" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "{") {
          var result2 = "{";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("{"));
          }
        }
        if (result2 !== null) {
          var result3 = [];
          var result7 = parse_braced(context);
          if (result7 !== null) {
            var result5 = result7;
          } else {
            var result6 = parse_nonBraceCharacter(context);
            if (result6 !== null) {
              var result5 = result6;
            } else {
              var result5 = null;;
            };
          }
          while (result5 !== null) {
            result3.push(result5);
            var result7 = parse_braced(context);
            if (result7 !== null) {
              var result5 = result7;
            } else {
              var result6 = parse_nonBraceCharacter(context);
              if (result6 !== null) {
                var result5 = result6;
              } else {
                var result5 = null;;
              };
            }
          }
          if (result3 !== null) {
            if (input.substr(pos, 1) === "}") {
              var result4 = "}";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("}"));
              }
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(parts) {
                return "{" + parts.join("") + "}";
              })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_nonBraceCharacters(context) {
        var cacheKey = "nonBraceCharacters" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result2 = parse_nonBraceCharacter(context);
        if (result2 !== null) {
          var result1 = [];
          while (result2 !== null) {
            result1.push(result2);
            var result2 = parse_nonBraceCharacter(context);
          }
        } else {
          var result1 = null;
        }
        var result0 = result1 !== null
          ? (function(chars) { return chars.join(""); })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_nonBraceCharacter(context) {
        var cacheKey = "nonBraceCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[^{}]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[^{}]");
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_equals(context) {
        var cacheKey = "equals" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "=") {
          var result2 = "=";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("="));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "="; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_colon(context) {
        var cacheKey = "colon" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === ":") {
          var result2 = ":";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString(":"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return ":"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_semicolon(context) {
        var cacheKey = "semicolon" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === ";") {
          var result2 = ";";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString(";"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return ";"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_slash(context) {
        var cacheKey = "slash" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "/") {
          var result2 = "/";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("/"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "/"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_and(context) {
        var cacheKey = "and" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "&") {
          var result2 = "&";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("&"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "&"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_not(context) {
        var cacheKey = "not" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "!") {
          var result2 = "!";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("!"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "!"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_question(context) {
        var cacheKey = "question" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "?") {
          var result2 = "?";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("?"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "?"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_star(context) {
        var cacheKey = "star" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "*") {
          var result2 = "*";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("*"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "*"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_plus(context) {
        var cacheKey = "plus" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "+") {
          var result2 = "+";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("+"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "+"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_lparen(context) {
        var cacheKey = "lparen" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "(") {
          var result2 = "(";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("("));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "("; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_rparen(context) {
        var cacheKey = "rparen" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === ")") {
          var result2 = ")";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString(")"));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return ")"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_dot(context) {
        var cacheKey = "dot" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === ".") {
          var result2 = ".";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("."));
          }
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "."; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_identifier(context) {
        var cacheKey = "identifier" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        var savedPos0 = pos;
        var result12 = parse_letter(context);
        if (result12 !== null) {
          var result2 = result12;
        } else {
          if (input.substr(pos, 1) === "_") {
            var result11 = "_";
            pos += 1;
          } else {
            var result11 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("_"));
            }
          }
          if (result11 !== null) {
            var result2 = result11;
          } else {
            if (input.substr(pos, 1) === "$") {
              var result10 = "$";
              pos += 1;
            } else {
              var result10 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("$"));
              }
            }
            if (result10 !== null) {
              var result2 = result10;
            } else {
              var result2 = null;;
            };
          };
        }
        if (result2 !== null) {
          var result3 = [];
          var result9 = parse_letter(context);
          if (result9 !== null) {
            var result5 = result9;
          } else {
            var result8 = parse_digit(context);
            if (result8 !== null) {
              var result5 = result8;
            } else {
              if (input.substr(pos, 1) === "_") {
                var result7 = "_";
                pos += 1;
              } else {
                var result7 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("_"));
                }
              }
              if (result7 !== null) {
                var result5 = result7;
              } else {
                if (input.substr(pos, 1) === "$") {
                  var result6 = "$";
                  pos += 1;
                } else {
                  var result6 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("$"));
                  }
                }
                if (result6 !== null) {
                  var result5 = result6;
                } else {
                  var result5 = null;;
                };
              };
            };
          }
          while (result5 !== null) {
            result3.push(result5);
            var result9 = parse_letter(context);
            if (result9 !== null) {
              var result5 = result9;
            } else {
              var result8 = parse_digit(context);
              if (result8 !== null) {
                var result5 = result8;
              } else {
                if (input.substr(pos, 1) === "_") {
                  var result7 = "_";
                  pos += 1;
                } else {
                  var result7 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("_"));
                  }
                }
                if (result7 !== null) {
                  var result5 = result7;
                } else {
                  if (input.substr(pos, 1) === "$") {
                    var result6 = "$";
                    pos += 1;
                  } else {
                    var result6 = null;
                    if (context.reportMatchFailures) {
                      matchFailed(quoteString("$"));
                    }
                  }
                  if (result6 !== null) {
                    var result5 = result6;
                  } else {
                    var result5 = null;;
                  };
                };
              };
            }
          }
          if (result3 !== null) {
            var result4 = parse___(context);
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(head, tail) {
                return head + tail.join("");
              })(result1[0], result1[1])
          : null;
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("identifier");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_literal(context) {
        var cacheKey = "literal" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        var savedPos0 = pos;
        var result5 = parse_doubleQuotedLiteral(context);
        if (result5 !== null) {
          var result2 = result5;
        } else {
          var result4 = parse_singleQuotedLiteral(context);
          if (result4 !== null) {
            var result2 = result4;
          } else {
            var result2 = null;;
          };
        }
        if (result2 !== null) {
          var result3 = parse___(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(literal) { return literal; })(result1[0])
          : null;
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("literal");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_doubleQuotedLiteral(context) {
        var cacheKey = "doubleQuotedLiteral" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "\"") {
          var result2 = "\"";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\""));
          }
        }
        if (result2 !== null) {
          var result3 = [];
          var result5 = parse_doubleQuotedCharacter(context);
          while (result5 !== null) {
            result3.push(result5);
            var result5 = parse_doubleQuotedCharacter(context);
          }
          if (result3 !== null) {
            if (input.substr(pos, 1) === "\"") {
              var result4 = "\"";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("\""));
              }
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(chars) { return chars.join(""); })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_doubleQuotedCharacter(context) {
        var cacheKey = "doubleQuotedCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result6 = parse_simpleDoubleQuotedCharacter(context);
        if (result6 !== null) {
          var result0 = result6;
        } else {
          var result5 = parse_simpleEscapeSequence(context);
          if (result5 !== null) {
            var result0 = result5;
          } else {
            var result4 = parse_zeroEscapeSequence(context);
            if (result4 !== null) {
              var result0 = result4;
            } else {
              var result3 = parse_hexEscapeSequence(context);
              if (result3 !== null) {
                var result0 = result3;
              } else {
                var result2 = parse_unicodeEscapeSequence(context);
                if (result2 !== null) {
                  var result0 = result2;
                } else {
                  var result1 = parse_eolEscapeSequence(context);
                  if (result1 !== null) {
                    var result0 = result1;
                  } else {
                    var result0 = null;;
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_simpleDoubleQuotedCharacter(context) {
        var cacheKey = "simpleDoubleQuotedCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var savedReportMatchFailuresVar0 = context.reportMatchFailures;
        context.reportMatchFailures = false;
        if (input.substr(pos, 1) === "\"") {
          var result7 = "\"";
          pos += 1;
        } else {
          var result7 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\""));
          }
        }
        if (result7 !== null) {
          var result4 = result7;
        } else {
          if (input.substr(pos, 1) === "\\") {
            var result6 = "\\";
            pos += 1;
          } else {
            var result6 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("\\"));
            }
          }
          if (result6 !== null) {
            var result4 = result6;
          } else {
            var result5 = parse_eolChar(context);
            if (result5 !== null) {
              var result4 = result5;
            } else {
              var result4 = null;;
            };
          };
        }
        context.reportMatchFailures = savedReportMatchFailuresVar0;
        if (result4 === null) {
          var result2 = '';
        } else {
          var result2 = null;
          pos = savedPos1;
        }
        if (result2 !== null) {
          if (input.length > pos) {
            var result3 = input.charAt(pos);
            pos++;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed('any character');
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(char_) { return char_; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_singleQuotedLiteral(context) {
        var cacheKey = "singleQuotedLiteral" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "'") {
          var result2 = "'";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("'"));
          }
        }
        if (result2 !== null) {
          var result3 = [];
          var result5 = parse_singleQuotedCharacter(context);
          while (result5 !== null) {
            result3.push(result5);
            var result5 = parse_singleQuotedCharacter(context);
          }
          if (result3 !== null) {
            if (input.substr(pos, 1) === "'") {
              var result4 = "'";
              pos += 1;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("'"));
              }
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(chars) { return chars.join(""); })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_singleQuotedCharacter(context) {
        var cacheKey = "singleQuotedCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result6 = parse_simpleSingleQuotedCharacter(context);
        if (result6 !== null) {
          var result0 = result6;
        } else {
          var result5 = parse_simpleEscapeSequence(context);
          if (result5 !== null) {
            var result0 = result5;
          } else {
            var result4 = parse_zeroEscapeSequence(context);
            if (result4 !== null) {
              var result0 = result4;
            } else {
              var result3 = parse_hexEscapeSequence(context);
              if (result3 !== null) {
                var result0 = result3;
              } else {
                var result2 = parse_unicodeEscapeSequence(context);
                if (result2 !== null) {
                  var result0 = result2;
                } else {
                  var result1 = parse_eolEscapeSequence(context);
                  if (result1 !== null) {
                    var result0 = result1;
                  } else {
                    var result0 = null;;
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_simpleSingleQuotedCharacter(context) {
        var cacheKey = "simpleSingleQuotedCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var savedReportMatchFailuresVar0 = context.reportMatchFailures;
        context.reportMatchFailures = false;
        if (input.substr(pos, 1) === "'") {
          var result7 = "'";
          pos += 1;
        } else {
          var result7 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("'"));
          }
        }
        if (result7 !== null) {
          var result4 = result7;
        } else {
          if (input.substr(pos, 1) === "\\") {
            var result6 = "\\";
            pos += 1;
          } else {
            var result6 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("\\"));
            }
          }
          if (result6 !== null) {
            var result4 = result6;
          } else {
            var result5 = parse_eolChar(context);
            if (result5 !== null) {
              var result4 = result5;
            } else {
              var result4 = null;;
            };
          };
        }
        context.reportMatchFailures = savedReportMatchFailuresVar0;
        if (result4 === null) {
          var result2 = '';
        } else {
          var result2 = null;
          pos = savedPos1;
        }
        if (result2 !== null) {
          if (input.length > pos) {
            var result3 = input.charAt(pos);
            pos++;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed('any character');
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(char_) { return char_; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_class(context) {
        var cacheKey = "class" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "[") {
          var result2 = "[";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("["));
          }
        }
        if (result2 !== null) {
          if (input.substr(pos, 1) === "^") {
            var result10 = "^";
            pos += 1;
          } else {
            var result10 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("^"));
            }
          }
          var result3 = result10 !== null ? result10 : '';
          if (result3 !== null) {
            var result4 = [];
            var result9 = parse_classCharacterRange(context);
            if (result9 !== null) {
              var result7 = result9;
            } else {
              var result8 = parse_classCharacter(context);
              if (result8 !== null) {
                var result7 = result8;
              } else {
                var result7 = null;;
              };
            }
            while (result7 !== null) {
              result4.push(result7);
              var result9 = parse_classCharacterRange(context);
              if (result9 !== null) {
                var result7 = result9;
              } else {
                var result8 = parse_classCharacter(context);
                if (result8 !== null) {
                  var result7 = result8;
                } else {
                  var result7 = null;;
                };
              }
            }
            if (result4 !== null) {
              if (input.substr(pos, 1) === "]") {
                var result5 = "]";
                pos += 1;
              } else {
                var result5 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("]"));
                }
              }
              if (result5 !== null) {
                var result6 = parse___(context);
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(inverted, parts) {
                partsConverted = PEG.ArrayUtils.map(parts, function(part) {
                  return part.data;
                });
                rawText = "["
                  + inverted
                  + PEG.ArrayUtils.map(parts, function(part) {
                      return part.rawText;
                    }).join("")
                  + "]";
          
                return {
                  type:     "class",
                  inverted: inverted === "^",
                  parts:    partsConverted,
                  // FIXME: Get the raw text from the input directly.
                  rawText:  rawText
                };
              })(result1[1], result1[2])
          : null;
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("character class");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_classCharacterRange(context) {
        var cacheKey = "classCharacterRange" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var result2 = parse_classCharacter(context);
        if (result2 !== null) {
          if (input.substr(pos, 1) === "-") {
            var result3 = "-";
            pos += 1;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("-"));
            }
          }
          if (result3 !== null) {
            var result4 = parse_classCharacter(context);
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(begin, end) {
                if (begin.data.charCodeAt(0) > end.data.charCodeAt(0)) {
                  throw new this.SyntaxError(
                    "Invalid character range: " + begin.rawText + "-" + end.rawText + "."
                  );
                }
          
                return {
                  data:    [begin.data, end.data],
                  // FIXME: Get the raw text from the input directly.
                  rawText: begin.rawText + "-" + end.rawText
                }
              })(result1[0], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_classCharacter(context) {
        var cacheKey = "classCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result1 = parse_bracketDelimitedCharacter(context);
        var result0 = result1 !== null
          ? (function(char_) {
                return {
                  data:    char_,
                  // FIXME: Get the raw text from the input directly.
                  rawText: PEG.RegExpUtils.quoteForClass(char_)
                };
              })(result1)
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_bracketDelimitedCharacter(context) {
        var cacheKey = "bracketDelimitedCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result6 = parse_simpleBracketDelimitedCharacter(context);
        if (result6 !== null) {
          var result0 = result6;
        } else {
          var result5 = parse_simpleEscapeSequence(context);
          if (result5 !== null) {
            var result0 = result5;
          } else {
            var result4 = parse_zeroEscapeSequence(context);
            if (result4 !== null) {
              var result0 = result4;
            } else {
              var result3 = parse_hexEscapeSequence(context);
              if (result3 !== null) {
                var result0 = result3;
              } else {
                var result2 = parse_unicodeEscapeSequence(context);
                if (result2 !== null) {
                  var result0 = result2;
                } else {
                  var result1 = parse_eolEscapeSequence(context);
                  if (result1 !== null) {
                    var result0 = result1;
                  } else {
                    var result0 = null;;
                  };
                };
              };
            };
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_simpleBracketDelimitedCharacter(context) {
        var cacheKey = "simpleBracketDelimitedCharacter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        var savedPos1 = pos;
        var savedReportMatchFailuresVar0 = context.reportMatchFailures;
        context.reportMatchFailures = false;
        if (input.substr(pos, 1) === "]") {
          var result7 = "]";
          pos += 1;
        } else {
          var result7 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("]"));
          }
        }
        if (result7 !== null) {
          var result4 = result7;
        } else {
          if (input.substr(pos, 1) === "\\") {
            var result6 = "\\";
            pos += 1;
          } else {
            var result6 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("\\"));
            }
          }
          if (result6 !== null) {
            var result4 = result6;
          } else {
            var result5 = parse_eolChar(context);
            if (result5 !== null) {
              var result4 = result5;
            } else {
              var result4 = null;;
            };
          };
        }
        context.reportMatchFailures = savedReportMatchFailuresVar0;
        if (result4 === null) {
          var result2 = '';
        } else {
          var result2 = null;
          pos = savedPos1;
        }
        if (result2 !== null) {
          if (input.length > pos) {
            var result3 = input.charAt(pos);
            pos++;
          } else {
            var result3 = null;
            if (context.reportMatchFailures) {
              matchFailed('any character');
            }
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(char_) { return char_; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_simpleEscapeSequence(context) {
        var cacheKey = "simpleEscapeSequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "\\") {
          var result2 = "\\";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\\"));
          }
        }
        if (result2 !== null) {
          var savedPos1 = pos;
          var savedReportMatchFailuresVar0 = context.reportMatchFailures;
          context.reportMatchFailures = false;
          var result9 = parse_digit(context);
          if (result9 !== null) {
            var result5 = result9;
          } else {
            if (input.substr(pos, 1) === "x") {
              var result8 = "x";
              pos += 1;
            } else {
              var result8 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("x"));
              }
            }
            if (result8 !== null) {
              var result5 = result8;
            } else {
              if (input.substr(pos, 1) === "u") {
                var result7 = "u";
                pos += 1;
              } else {
                var result7 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("u"));
                }
              }
              if (result7 !== null) {
                var result5 = result7;
              } else {
                var result6 = parse_eolChar(context);
                if (result6 !== null) {
                  var result5 = result6;
                } else {
                  var result5 = null;;
                };
              };
            };
          }
          context.reportMatchFailures = savedReportMatchFailuresVar0;
          if (result5 === null) {
            var result3 = '';
          } else {
            var result3 = null;
            pos = savedPos1;
          }
          if (result3 !== null) {
            if (input.length > pos) {
              var result4 = input.charAt(pos);
              pos++;
            } else {
              var result4 = null;
              if (context.reportMatchFailures) {
                matchFailed('any character');
              }
            }
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(char_) {
                return char_
                  .replace("b", "\b")
                  .replace("f", "\f")
                  .replace("n", "\n")
                  .replace("r", "\r")
                  .replace("t", "\t")
                  .replace("v", "\x0B") // IE does not recognize "\v".
              })(result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_zeroEscapeSequence(context) {
        var cacheKey = "zeroEscapeSequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "\\0") {
          var result2 = "\\0";
          pos += 2;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\\0"));
          }
        }
        if (result2 !== null) {
          var savedPos1 = pos;
          var savedReportMatchFailuresVar0 = context.reportMatchFailures;
          context.reportMatchFailures = false;
          var result4 = parse_digit(context);
          context.reportMatchFailures = savedReportMatchFailuresVar0;
          if (result4 === null) {
            var result3 = '';
          } else {
            var result3 = null;
            pos = savedPos1;
          }
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function() { return "\0"; })()
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_hexEscapeSequence(context) {
        var cacheKey = "hexEscapeSequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "\\x") {
          var result2 = "\\x";
          pos += 2;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\\x"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_hexDigit(context);
          if (result3 !== null) {
            var result4 = parse_hexDigit(context);
            if (result4 !== null) {
              var result1 = [result2, result3, result4];
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(h1, h2) {
                return String.fromCharCode(parseInt("0x" + h1 + h2));
              })(result1[1], result1[2])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_unicodeEscapeSequence(context) {
        var cacheKey = "unicodeEscapeSequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "\\u") {
          var result2 = "\\u";
          pos += 2;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\\u"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_hexDigit(context);
          if (result3 !== null) {
            var result4 = parse_hexDigit(context);
            if (result4 !== null) {
              var result5 = parse_hexDigit(context);
              if (result5 !== null) {
                var result6 = parse_hexDigit(context);
                if (result6 !== null) {
                  var result1 = [result2, result3, result4, result5, result6];
                } else {
                  var result1 = null;
                  pos = savedPos0;
                }
              } else {
                var result1 = null;
                pos = savedPos0;
              }
            } else {
              var result1 = null;
              pos = savedPos0;
            }
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(h1, h2, h3, h4) {
                return String.fromCharCode(parseInt("0x" + h1 + h2 + h3 + h4));
              })(result1[1], result1[2], result1[3], result1[4])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_eolEscapeSequence(context) {
        var cacheKey = "eolEscapeSequence" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 1) === "\\") {
          var result2 = "\\";
          pos += 1;
        } else {
          var result2 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\\"));
          }
        }
        if (result2 !== null) {
          var result3 = parse_eol(context);
          if (result3 !== null) {
            var result1 = [result2, result3];
          } else {
            var result1 = null;
            pos = savedPos0;
          }
        } else {
          var result1 = null;
          pos = savedPos0;
        }
        var result0 = result1 !== null
          ? (function(eol) { return eol; })(result1[1])
          : null;
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_digit(context) {
        var cacheKey = "digit" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[0-9]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[0-9]");
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_hexDigit(context) {
        var cacheKey = "hexDigit" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[0-9a-fA-F]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[0-9a-fA-F]");
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_letter(context) {
        var cacheKey = "letter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result2 = parse_lowerCaseLetter(context);
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_upperCaseLetter(context);
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_lowerCaseLetter(context) {
        var cacheKey = "lowerCaseLetter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[a-z]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[a-z]");
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_upperCaseLetter(context) {
        var cacheKey = "upperCaseLetter" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[A-Z]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[A-Z]");
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse___(context) {
        var cacheKey = "__" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var result0 = [];
        var result4 = parse_whitespace(context);
        if (result4 !== null) {
          var result1 = result4;
        } else {
          var result3 = parse_eol(context);
          if (result3 !== null) {
            var result1 = result3;
          } else {
            var result2 = parse_comment(context);
            if (result2 !== null) {
              var result1 = result2;
            } else {
              var result1 = null;;
            };
          };
        }
        while (result1 !== null) {
          result0.push(result1);
          var result4 = parse_whitespace(context);
          if (result4 !== null) {
            var result1 = result4;
          } else {
            var result3 = parse_eol(context);
            if (result3 !== null) {
              var result1 = result3;
            } else {
              var result2 = parse_comment(context);
              if (result2 !== null) {
                var result1 = result2;
              } else {
                var result1 = null;;
              };
            };
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_comment(context) {
        var cacheKey = "comment" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        var result2 = parse_singleLineComment(context);
        if (result2 !== null) {
          var result0 = result2;
        } else {
          var result1 = parse_multiLineComment(context);
          if (result1 !== null) {
            var result0 = result1;
          } else {
            var result0 = null;;
          };
        }
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("comment");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_singleLineComment(context) {
        var cacheKey = "singleLineComment" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "//") {
          var result1 = "//";
          pos += 2;
        } else {
          var result1 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("//"));
          }
        }
        if (result1 !== null) {
          var result2 = [];
          var savedPos1 = pos;
          var savedPos2 = pos;
          var savedReportMatchFailuresVar0 = context.reportMatchFailures;
          context.reportMatchFailures = false;
          var result6 = parse_eolChar(context);
          context.reportMatchFailures = savedReportMatchFailuresVar0;
          if (result6 === null) {
            var result4 = '';
          } else {
            var result4 = null;
            pos = savedPos2;
          }
          if (result4 !== null) {
            if (input.length > pos) {
              var result5 = input.charAt(pos);
              pos++;
            } else {
              var result5 = null;
              if (context.reportMatchFailures) {
                matchFailed('any character');
              }
            }
            if (result5 !== null) {
              var result3 = [result4, result5];
            } else {
              var result3 = null;
              pos = savedPos1;
            }
          } else {
            var result3 = null;
            pos = savedPos1;
          }
          while (result3 !== null) {
            result2.push(result3);
            var savedPos1 = pos;
            var savedPos2 = pos;
            var savedReportMatchFailuresVar0 = context.reportMatchFailures;
            context.reportMatchFailures = false;
            var result6 = parse_eolChar(context);
            context.reportMatchFailures = savedReportMatchFailuresVar0;
            if (result6 === null) {
              var result4 = '';
            } else {
              var result4 = null;
              pos = savedPos2;
            }
            if (result4 !== null) {
              if (input.length > pos) {
                var result5 = input.charAt(pos);
                pos++;
              } else {
                var result5 = null;
                if (context.reportMatchFailures) {
                  matchFailed('any character');
                }
              }
              if (result5 !== null) {
                var result3 = [result4, result5];
              } else {
                var result3 = null;
                pos = savedPos1;
              }
            } else {
              var result3 = null;
              pos = savedPos1;
            }
          }
          if (result2 !== null) {
            var result0 = [result1, result2];
          } else {
            var result0 = null;
            pos = savedPos0;
          }
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_multiLineComment(context) {
        var cacheKey = "multiLineComment" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        var savedPos0 = pos;
        if (input.substr(pos, 2) === "/*") {
          var result1 = "/*";
          pos += 2;
        } else {
          var result1 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("/*"));
          }
        }
        if (result1 !== null) {
          var result2 = [];
          var savedPos1 = pos;
          var savedPos2 = pos;
          var savedReportMatchFailuresVar0 = context.reportMatchFailures;
          context.reportMatchFailures = false;
          if (input.substr(pos, 2) === "*/") {
            var result7 = "*/";
            pos += 2;
          } else {
            var result7 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("*/"));
            }
          }
          context.reportMatchFailures = savedReportMatchFailuresVar0;
          if (result7 === null) {
            var result5 = '';
          } else {
            var result5 = null;
            pos = savedPos2;
          }
          if (result5 !== null) {
            if (input.length > pos) {
              var result6 = input.charAt(pos);
              pos++;
            } else {
              var result6 = null;
              if (context.reportMatchFailures) {
                matchFailed('any character');
              }
            }
            if (result6 !== null) {
              var result4 = [result5, result6];
            } else {
              var result4 = null;
              pos = savedPos1;
            }
          } else {
            var result4 = null;
            pos = savedPos1;
          }
          while (result4 !== null) {
            result2.push(result4);
            var savedPos1 = pos;
            var savedPos2 = pos;
            var savedReportMatchFailuresVar0 = context.reportMatchFailures;
            context.reportMatchFailures = false;
            if (input.substr(pos, 2) === "*/") {
              var result7 = "*/";
              pos += 2;
            } else {
              var result7 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("*/"));
              }
            }
            context.reportMatchFailures = savedReportMatchFailuresVar0;
            if (result7 === null) {
              var result5 = '';
            } else {
              var result5 = null;
              pos = savedPos2;
            }
            if (result5 !== null) {
              if (input.length > pos) {
                var result6 = input.charAt(pos);
                pos++;
              } else {
                var result6 = null;
                if (context.reportMatchFailures) {
                  matchFailed('any character');
                }
              }
              if (result6 !== null) {
                var result4 = [result5, result6];
              } else {
                var result4 = null;
                pos = savedPos1;
              }
            } else {
              var result4 = null;
              pos = savedPos1;
            }
          }
          if (result2 !== null) {
            if (input.substr(pos, 2) === "*/") {
              var result3 = "*/";
              pos += 2;
            } else {
              var result3 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("*/"));
              }
            }
            if (result3 !== null) {
              var result0 = [result1, result2, result3];
            } else {
              var result0 = null;
              pos = savedPos0;
            }
          } else {
            var result0 = null;
            pos = savedPos0;
          }
        } else {
          var result0 = null;
          pos = savedPos0;
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_eol(context) {
        var cacheKey = "eol" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        if (input.substr(pos, 1) === "\n") {
          var result5 = "\n";
          pos += 1;
        } else {
          var result5 = null;
          if (context.reportMatchFailures) {
            matchFailed(quoteString("\n"));
          }
        }
        if (result5 !== null) {
          var result0 = result5;
        } else {
          if (input.substr(pos, 2) === "\r\n") {
            var result4 = "\r\n";
            pos += 2;
          } else {
            var result4 = null;
            if (context.reportMatchFailures) {
              matchFailed(quoteString("\r\n"));
            }
          }
          if (result4 !== null) {
            var result0 = result4;
          } else {
            if (input.substr(pos, 1) === "\r") {
              var result3 = "\r";
              pos += 1;
            } else {
              var result3 = null;
              if (context.reportMatchFailures) {
                matchFailed(quoteString("\r"));
              }
            }
            if (result3 !== null) {
              var result0 = result3;
            } else {
              if (input.substr(pos, 1) === "\u2028") {
                var result2 = "\u2028";
                pos += 1;
              } else {
                var result2 = null;
                if (context.reportMatchFailures) {
                  matchFailed(quoteString("\u2028"));
                }
              }
              if (result2 !== null) {
                var result0 = result2;
              } else {
                if (input.substr(pos, 1) === "\u2029") {
                  var result1 = "\u2029";
                  pos += 1;
                } else {
                  var result1 = null;
                  if (context.reportMatchFailures) {
                    matchFailed(quoteString("\u2029"));
                  }
                }
                if (result1 !== null) {
                  var result0 = result1;
                } else {
                  var result0 = null;;
                };
              };
            };
          };
        }
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("end of line");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_eolChar(context) {
        var cacheKey = "eolChar" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        
        if (input.substr(pos).match(/^[\n\r\u2028\u2029]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[\\n\\r\\u2028\\u2029]");
          }
        }
        
        
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function parse_whitespace(context) {
        var cacheKey = "whitespace" + '@' + pos;
        var cachedResult = cache[cacheKey];
        if (cachedResult) {
          pos = cachedResult.nextPos;
          return cachedResult.result;
        }
        
        var savedReportMatchFailures = context.reportMatchFailures;
        context.reportMatchFailures = false;
        if (input.substr(pos).match(/^[ 	 ﻿ ᠎ -   　]/) !== null) {
          var result0 = input.charAt(pos);
          pos++;
        } else {
          var result0 = null;
          if (context.reportMatchFailures) {
            matchFailed("[ 	 ﻿ ᠎ -   　]");
          }
        }
        context.reportMatchFailures = savedReportMatchFailures;
        if (context.reportMatchFailures && result0 === null) {
          matchFailed("whitespace");
        }
        
        cache[cacheKey] = {
          nextPos: pos,
          result:  result0
        };
        return result0;
      }
      
      function buildErrorMessage() {
        function buildExpected(failuresExpected) {
          switch (failuresExpected.length) {
            case 0:
              return 'end of input';
            case 1:
              return failuresExpected[0];
            default:
              failuresExpected.sort();
              return failuresExpected.slice(0, failuresExpected.length - 1).join(', ')
                + ' or '
                + failuresExpected[failuresExpected.length - 1];
          }
        }
        
        var expected = buildExpected(rightmostMatchFailuresExpected);
        var actualPos = Math.max(pos, rightmostMatchFailuresPos);
        var actual = actualPos < input.length
          ? quoteString(input.charAt(actualPos))
          : 'end of input';
        
        return 'Expected ' + expected + ' but ' + actual + ' found.';
      }
      
      function computeErrorPosition() {
        /*
         * The first idea was to use |String.split| to break the input up to the
         * error position along newlines and derive the line and column from
         * there. However IE's |split| implementation is so broken that it was
         * enough to prevent it.
         */
        
        var line = 1;
        var column = 1;
        var seenCR = false;
        
        for (var i = 0; i <  rightmostMatchFailuresPos; i++) {
          var ch = input.charAt(i);
          if (ch === '\n') {
            if (!seenCR) { line++; }
            column = 1;
            seenCR = false;
          } else if (ch === '\r' | ch === '\u2028' || ch === '\u2029') {
            line++;
            column = 1;
            seenCR = true;
          } else {
            column++;
            seenCR = false;
          }
        }
        
        return { line: line, column: column };
      }
      
      
      
      var result = parse_grammar({ reportMatchFailures: true });
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostMatchFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostMatchFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostMatchFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        var errorPosition = computeErrorPosition();
        throw new this.SyntaxError(
          buildErrorMessage(),
          errorPosition.line,
          errorPosition.column
        );
      }
      
      return result;
    },
    
    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(message, line, column) {
    this.name = 'SyntaxError';
    this.message = message;
    this.line = line;
    this.column = column;
  };
  
  result.SyntaxError.prototype = Error.prototype;
  
  return result;
})();

})();
