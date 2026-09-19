import 'component_inputs.dart' show describeInputs;
import 'widget_previews.dart' show describeWidgetPreview;
import 'structure.dart' show structureInfo, widgetName;
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

String revision(String source) =>
    sha256.convert(utf8.encode(source)).toString();
typedef Json = Map<String, dynamic>;

/// Parse only. Imported code is never loaded or executed by this service.
Json parseProject(Map<String, String> files) {
  final classes = <String, dynamic>{};
  final functions = <String, dynamic>{};
  final globals = <String, dynamic>{};
  final getters = <String, dynamic>{}, setters = <String, dynamic>{};
  final enums = <String, List<String>>{};
  final enumConstants = <String, dynamic>{};
  final enumFiles = <String, String>{};
  final extensions = <Json>[];
  final diagnostics = <Json>[];
  final calls = <Json>[];
  final starts = <dynamic>[];
  final routes = <String, dynamic>{};
  final previews = <Json>[];
  final initializations = <Json>[];
  final parsedFiles = files.map(
    (name, source) =>
        MapEntry(name, parseString(content: source, throwIfDiagnostics: false)),
  );
  for (final entry in parsedFiles.entries) {
    for (final declaration
        in entry.value.unit.declarations.whereType<EnumDeclaration>()) {
      enums[declaration.name.lexeme] = declaration.constants
          .map((constant) => constant.name.lexeme)
          .toList();
      enumFiles[declaration.name.lexeme] = entry.key;
    }
  }
  for (final entry in files.entries) {
    final parsed = parsedFiles[entry.key]!;
    final encoder = Encoder(entry.key, entry.value);
    for (final e in parsed.errors) {
      diagnostics.add({
        'file': entry.key,
        'offset': e.offset,
        'length': e.length,
        'message': e.message,
        'severity': e.diagnosticCode.severity.name,
      });
    }
    for (final d in parsed.unit.declarations) {
      final preview = describeWidgetPreview(
        d,
        entry.key,
        enums: enums,
        enumFiles: enumFiles,
      );
      if (preview != null) previews.add(preview);
      if (d is EnumDeclaration) {
        enumConstants[d.name.lexeme] = {
          for (final constant in d.constants)
            constant.name.lexeme: {
              'constructor':
                  constant.arguments?.constructorSelector?.name.name ?? '',
              'args': [
                for (final arg
                    in constant.arguments?.argumentList.arguments ??
                        <Expression>[])
                  if (arg is! NamedExpression) encoder.encode(arg),
              ],
              'named': {
                for (final arg
                    in constant.arguments?.argumentList.arguments ??
                        <Expression>[])
                  if (arg is NamedExpression)
                    arg.name.label.name: encoder.encode(arg.expression),
              },
            },
        };
      }
      if (d is ClassDeclaration || d is EnumDeclaration) {
        final name = d is ClassDeclaration
            ? d.name.lexeme
            : (d as EnumDeclaration).name.lexeme;
        final members = d is ClassDeclaration
            ? d.members
            : (d as EnumDeclaration).members;
        final fields = <String, dynamic>{};
        final methods = <String, dynamic>{};
        final classGetters = <String, dynamic>{},
            classSetters = <String, dynamic>{};
        final staticFields = <String, dynamic>{},
            staticMethods = <String, dynamic>{};
        final staticGetters = <String, dynamic>{},
            staticSetters = <String, dynamic>{};
        final constructors = <String, dynamic>{};
        final lateFields = <String>[];
        final defaults = <String, dynamic>{};
        for (final member in members) {
          if (member is FieldDeclaration) {
            for (final v in member.fields.variables) {
              (member.isStatic ? staticFields : fields)[v.name.lexeme] = encoder
                  .encode(v.initializer);
              if (!member.isStatic && member.fields.isLate)
                lateFields.add(v.name.lexeme);
            }
          } else if (member is MethodDeclaration) {
            final target = member.isStatic
                ? (member.isGetter
                      ? staticGetters
                      : member.isSetter
                      ? staticSetters
                      : staticMethods)
                : (member.isGetter
                      ? classGetters
                      : member.isSetter
                      ? classSetters
                      : methods);
            target[member.name.lexeme] = encoder.function(
              member.parameters,
              member.body,
            );
          } else if (member is ConstructorDeclaration) {
            constructors[member.name?.lexeme ?? ''] = encoder.constructor(
              member,
            );
            for (final p in member.parameters.parameters) {
              if (p is DefaultFormalParameter) {
                defaults[p.name?.lexeme ?? ''] = encoder.encode(p.defaultValue);
              }
            }
          }
        }
        if (classes.containsKey(name)) {
          diagnostics.add({
            'file': entry.key,
            'offset': d.offset,
            'length': d.length,
            'severity': 'ERROR',
            'message':
                'Duplicate class $name; import namespaces are not resolved in this prototype.',
          });
        }
        classes[name] = {
          'name': name,
          'base': d is ClassDeclaration
              ? d.extendsClause?.superclass.toSource()
              : null,
          'fields': fields,
          'methods': methods,
          'getters': classGetters,
          'setters': classSetters,
          'staticFields': staticFields,
          'staticMethods': staticMethods,
          'staticGetters': staticGetters,
          'staticSetters': staticSetters,
          'constructors': constructors,
          'lateFields': lateFields,
          'defaults': defaults,
          'inputs': d is ClassDeclaration ? describeInputs(d) : [],
          'libraryComponent': entry.value
              .substring(0, d.offset)
              .trimRight()
              .endsWith('// @native-lab-component'),
          'file': entry.key,
          'start': d.offset,
          'end': d.end,
        };
      } else if (d is ExtensionDeclaration) {
        extensions.add({
          'type': d.onClause?.extendedType.toSource(),
          'members': [
            for (final m in d.members.whereType<MethodDeclaration>())
              {
                'name': m.name.lexeme,
                'getter': m.isGetter,
                'setter': m.isSetter,
                'function': encoder.function(m.parameters, m.body),
              },
          ],
        });
      } else if (d is FunctionDeclaration &&
          d.functionExpression.body is! EmptyFunctionBody) {
        final body = d.functionExpression.body;
        if (d.name.lexeme == 'main' && body is BlockFunctionBody) {
          final initialization = <Statement>[];
          for (final statement in body.block.statements) {
            if (statement is ExpressionStatement &&
                statement.expression is MethodInvocation) {
              final call = statement.expression as MethodInvocation;
              if (call.target == null && call.methodName.name == 'runApp')
                break;
              if (call.target?.toSource() == 'DartNativePluginRegistrant' &&
                  call.methodName.name == 'registerAll')
                continue;
            }
            initialization.add(statement);
          }
          initializations.add({
            'file': entry.key,
            'async': body.isAsynchronous,
            'source': initialization.map((s) => s.toSource()).join('\n'),
            'body': {
              'kind': 'block',
              'statements': initialization.map(encoder.encode).toList(),
            },
          });
        }
        (d.isGetter
            ? getters
            : d.isSetter
            ? setters
            : functions)[d.name.lexeme] = encoder.function(
          d.functionExpression.parameters,
          d.functionExpression.body,
        );
      } else if (d is TopLevelVariableDeclaration) {
        for (final v in d.variables.variables) {
          if (globals.containsKey(v.name.lexeme))
            diagnostics.add({
              'file': entry.key,
              'offset': v.offset,
              'length': v.length,
              'severity': 'ERROR',
              'message':
                  'Duplicate global ${v.name.lexeme}; use a unique app variable name.',
            });
          globals[v.name.lexeme] = encoder.encode(v.initializer);
        }
      }
    }
    parsed.unit.accept(CallCollector(encoder, calls, starts, routes));
  }
  final entryInitialization =
      initializations.where((s) => s['file'] == 'main.dart').firstOrNull ??
      initializations.firstOrNull;
  return {
    'files': files.map((k, v) => MapEntry(k, revision(v))),
    'imports': {
      for (final entry in parsedFiles.entries)
        entry.key: {
          for (final directive
              in entry.value.unit.directives.whereType<ImportDirective>())
            if (directive.prefix != null)
              directive.prefix!.name: directive.uri.stringValue,
        },
    },
    'classes': classes,
    'functions': functions,
    'globals': globals,
    'getters': getters,
    'setters': setters,
    'enums': enums,
    'enumConstants': enumConstants,
    'extensions': extensions,
    'root': starts.isEmpty ? null : starts.first,
    'routes': routes,
    'calls': calls,
    'diagnostics': diagnostics,
    'previews': previews,
    'previewInitializers': [
      if (entryInitialization != null && entryInitialization['source'] != '')
        {
          'file': entryInitialization['file'],
          'source': entryInitialization['source'],
          'async': entryInitialization['async'],
        },
    ],
    'startup': entryInitialization,
  };
}

class Encoder {
  final String file, source;
  Encoder(this.file, this.source);
  Json node(AstNode n, String kind, [Json extra = const {}]) => {
    'kind': kind,
    'file': file,
    'start': n.offset,
    'end': n.end,
    ...extra,
  };
  Json function(FormalParameterList? parameters, FunctionBody body) => {
    'kind': 'lambda',
    'async': body.isAsynchronous,
    'params':
        parameters?.parameters.map((p) => p.name?.lexeme ?? '_').toList() ?? [],
    'parameters': parameters?.parameters.map(parameter).toList() ?? [],
    'body': body is ExpressionFunctionBody
        ? {'kind': 'return', 'value': encode(body.expression)}
        : encode(body),
  };
  Json parameter(FormalParameter parameter) {
    final actual = parameter is DefaultFormalParameter
        ? parameter.parameter
        : parameter;
    return {
      'name': parameter.name?.lexeme ?? '_',
      'named': parameter.isNamed,
      'required': parameter.isRequired,
      'field': actual is FieldFormalParameter,
      'super': actual is SuperFormalParameter,
      'default': parameter is DefaultFormalParameter
          ? encode(parameter.defaultValue)
          : null,
    };
  }

  Json constructor(ConstructorDeclaration c) => {
    'parameters': c.parameters.parameters.map(parameter).toList(),
    'factory': c.factoryKeyword != null,
    'body': c.body is EmptyFunctionBody ? null : encode(c.body),
    'initializers': [
      for (final i in c.initializers)
        if (i is ConstructorFieldInitializer)
          {
            'kind': 'field',
            'name': i.fieldName.name,
            'value': encode(i.expression),
          }
        else if (i is SuperConstructorInvocation)
          call(i, i.constructorName?.name ?? '', i.argumentList)
            ..['kind'] = 'superConstructor'
        else if (i is RedirectingConstructorInvocation)
          call(i, i.constructorName?.name ?? '', i.argumentList)
            ..['kind'] = 'redirectConstructor'
        else
          encode(i),
    ],
  };
  Json pattern(DartPattern p) {
    if (p is DeclaredVariablePattern)
      return {'kind': 'binding', 'name': p.name.lexeme};
    if (p is RecordPattern)
      return {
        'kind': 'recordPattern',
        'fields': [
          for (final f in p.fields)
            {'name': f.name?.name?.lexeme, 'pattern': pattern(f.pattern)},
        ],
      };
    if (p is ConstantPattern)
      return {'kind': 'constant', 'value': encode(p.expression)};
    if (p is WildcardPattern) return {'kind': 'wildcard'};
    return {'kind': 'unsupportedPattern', 'source': p.toSource()};
  }

  Json loop(ForLoopParts p, AstNode body, {bool collection = false}) {
    final result = <String, dynamic>{
      'kind': collection ? 'forElement' : 'loop',
      'body': encode(body),
    };
    if (p is ForEachParts) {
      result['items'] = encode(p.iterable);
      if (p is ForEachPartsWithDeclaration)
        result['pattern'] = {
          'kind': 'binding',
          'name': p.loopVariable.name.lexeme,
        };
      else if (p is ForEachPartsWithIdentifier)
        result['pattern'] = {'kind': 'binding', 'name': p.identifier.name};
      else if (p is ForEachPartsWithPattern)
        result['pattern'] = pattern(p.pattern);
    } else if (p is ForParts) {
      result['condition'] = encode(p.condition);
      result['updates'] = p.updaters.map(encode).toList();
      if (p is ForPartsWithDeclarations)
        result['initialize'] = encode(p.variables);
      else if (p is ForPartsWithExpression)
        result['initialize'] = encode(p.initialization);
    }
    return result;
  }

  dynamic encode(AstNode? n) {
    if (n == null) return null;
    if (n is AwaitExpression)
      return node(n, 'await', {'value': encode(n.expression)});
    if (n is SimpleStringLiteral) return node(n, 'literal', {'value': n.value});
    if (n is AdjacentStrings)
      return node(n, 'concat', {'parts': n.strings.map(encode).toList()});
    if (n is StringInterpolation)
      return node(n, 'concat', {
        'parts': n.elements
            .map(
              (e) => e is InterpolationString
                  ? {'kind': 'literal', 'value': e.value}
                  : encode((e as InterpolationExpression).expression),
            )
            .toList(),
      });
    if (n is IntegerLiteral) return node(n, 'literal', {'value': n.value});
    if (n is DoubleLiteral) return node(n, 'literal', {'value': n.value});
    if (n is BooleanLiteral) return node(n, 'literal', {'value': n.value});
    if (n is NullLiteral) return node(n, 'literal', {'value': null});
    if (n is SimpleIdentifier) return node(n, 'ref', {'name': n.name});
    if (n is ThisExpression) return node(n, 'ref', {'name': 'this'});
    if (n is SuperExpression) return node(n, 'ref', {'name': 'super'});
    if (n is PrefixedIdentifier)
      return node(n, 'get', {
        'target': encode(n.prefix),
        'name': n.identifier.name,
      });
    if (n is PropertyAccess)
      return node(n, 'get', {
        'target': n.isCascaded
            ? {'kind': 'ref', 'name': r'$cascade'}
            : encode(n.target),
        'name': n.propertyName.name,
        if (n.isNullAware) 'nullAware': true,
      });
    if (n is ParenthesizedExpression) return encode(n.expression);
    if (n is NamedExpression) return encode(n.expression);
    if (n is InstanceCreationExpression)
      return call(n, n.constructorName.toSource(), n.argumentList);
    if (n is MethodInvocation) {
      final result = call(
        n,
        n.methodName.name,
        n.argumentList,
        target: n.target,
      );
      if (n.isNullAware) result['nullAware'] = true;
      if (n.isCascaded) result['target'] = {'kind': 'ref', 'name': r'$cascade'};
      return result;
    }
    if (n is AsExpression)
      return node(n, 'cast', {
        'value': encode(n.expression),
        'type': n.type.toSource(),
      });
    if (n is IsExpression)
      return node(n, 'is', {
        'value': encode(n.expression),
        'type': n.type.toSource(),
        'not': n.notOperator != null,
      });
    if (n is CascadeExpression)
      return node(n, 'cascade', {
        'target': encode(n.target),
        'sections': n.cascadeSections.map(encode).toList(),
        'nullAware': n.isNullAware,
      });
    if (n is FunctionExpressionInvocation)
      return node(n, 'invoke', {
        'target': encode(n.function),
        'args': n.argumentList.arguments.map(encode).toList(),
      });
    if (n is FunctionExpression)
      return {
        ...function(n.parameters, n.body),
        'file': file,
        'start': n.offset,
        'end': n.end,
      };
    if (n is ListLiteral)
      return node(n, 'list', {'items': n.elements.map(encode).toList()});
    if (n is SetOrMapLiteral)
      return node(n, 'map', {
        'entries': n.elements.map(encode).toList(),
        'set': n.typeArguments?.arguments.length == 1 || n.isSet,
      });
    if (n is RecordLiteral)
      return node(n, 'record', {
        'fields': [
          for (final f in n.fields)
            {
              'name': f is NamedExpression ? f.name.label.name : null,
              'value': encode(f),
            },
        ],
      });
    if (n is MapLiteralEntry)
      return node(n, 'entry', {'key': encode(n.key), 'value': encode(n.value)});
    if (n is IfElement)
      return node(n, 'ifElement', {
        'condition': encode(n.expression),
        'yes': encode(n.thenElement),
        'no': encode(n.elseElement),
      });
    if (n is ForElement)
      return {
        ...node(n, 'forElement'),
        ...loop(n.forLoopParts, n.body, collection: true),
        'awaitStream': n.awaitKeyword != null,
      };
    if (n is ForStatement)
      return {
        ...node(n, 'loop'),
        ...loop(n.forLoopParts, n.body),
        'awaitStream': n.awaitKeyword != null,
      };
    if (n is WhileStatement)
      return node(n, 'loop', {
        'condition': encode(n.condition),
        'body': encode(n.body),
      });
    if (n is DoStatement)
      return node(n, 'loop', {
        'condition': encode(n.condition),
        'body': encode(n.body),
        'doFirst': true,
      });
    if (n is BreakStatement) return node(n, 'break', {'label': n.label?.name});
    if (n is ContinueStatement)
      return node(n, 'continue', {'label': n.label?.name});
    if (n is SwitchStatement)
      return node(n, 'switch', {
        'value': encode(n.expression),
        'cases': [
          for (final m in n.members)
            {
              'pattern': m is SwitchCase
                  ? {'kind': 'constant', 'value': encode(m.expression)}
                  : m is SwitchPatternCase
                  ? pattern(m.guardedPattern.pattern)
                  : {'kind': 'wildcard'},
              if (m is SwitchPatternCase)
                'guard': encode(m.guardedPattern.whenClause?.expression),
              'body': {
                'kind': 'block',
                'statements': m.statements.map(encode).toList(),
              },
            },
        ],
      });
    if (n is SwitchExpression)
      return node(n, 'switch', {
        'value': encode(n.expression),
        'cases': [
          for (final c in n.cases)
            {
              'pattern': pattern(c.guardedPattern.pattern),
              'guard': encode(c.guardedPattern.whenClause?.expression),
              'body': encode(c.expression),
            },
        ],
      });
    if (n is TryStatement)
      return node(n, 'try', {
        'body': encode(n.body),
        'finally': encode(n.finallyBlock),
        'catches': [
          for (final c in n.catchClauses)
            {
              'type': c.exceptionType?.toSource(),
              'exception': c.exceptionParameter?.name.lexeme,
              'stack': c.stackTraceParameter?.name.lexeme,
              'body': encode(c.body),
            },
        ],
      });
    if (n is ThrowExpression)
      return node(n, 'throw', {'value': encode(n.expression)});
    if (n is RethrowExpression) return node(n, 'rethrow');
    if (n is SpreadElement)
      return node(n, 'spread', {'value': encode(n.expression)});
    if (n is ConditionalExpression)
      return node(n, 'conditional', {
        'condition': encode(n.condition),
        'yes': encode(n.thenExpression),
        'no': encode(n.elseExpression),
      });
    if (n is BinaryExpression)
      return node(n, 'binary', {
        'left': encode(n.leftOperand),
        'op': n.operator.lexeme,
        'right': encode(n.rightOperand),
      });
    if (n is PrefixExpression)
      return node(n, 'prefix', {
        'op': n.operator.lexeme,
        'value': encode(n.operand),
      });
    if (n is PostfixExpression)
      return node(n, 'postfix', {
        'op': n.operator.lexeme,
        'value': encode(n.operand),
      });
    if (n is AssignmentExpression)
      return node(n, 'assign', {
        'left': encode(n.leftHandSide),
        'op': n.operator.lexeme,
        'right': encode(n.rightHandSide),
      });
    if (n is IndexExpression)
      return node(n, 'index', {
        'target': encode(n.target),
        'index': encode(n.index),
      });
    if (n is BlockFunctionBody) return encode(n.block);
    if (n is Block)
      return node(n, 'block', {
        'statements': n.statements.map(encode).toList(),
      });
    if (n is ReturnStatement)
      return node(n, 'return', {'value': encode(n.expression)});
    if (n is ExpressionStatement) return encode(n.expression);
    if (n is FunctionDeclarationStatement)
      return node(n, 'variables', {
        'entries': [
          {
            'name': n.functionDeclaration.name.lexeme,
            'value': function(
              n.functionDeclaration.functionExpression.parameters,
              n.functionDeclaration.functionExpression.body,
            ),
          },
        ],
      });
    if (n is VariableDeclarationStatement) return encode(n.variables);
    if (n is PatternVariableDeclarationStatement) return encode(n.declaration);
    if (n is PatternVariableDeclaration)
      return node(n, 'patternDeclaration', {
        'pattern': pattern(n.pattern),
        'value': encode(n.expression),
      });
    if (n is VariableDeclarationList)
      return node(n, 'variables', {
        'entries': n.variables
            .map((v) => {'name': v.name.lexeme, 'value': encode(v.initializer)})
            .toList(),
      });
    if (n is IfStatement)
      return node(n, 'if', {
        'condition': encode(n.expression),
        'yes': encode(n.thenStatement),
        'no': encode(n.elseStatement),
      });
    return node(n, 'unsupported', {
      'syntax': n.toSource().split('\n').first.split('').take(100).join(),
      'source': n.toSource(),
    });
  }

  Json call(AstNode n, String name, ArgumentList list, {Expression? target}) {
    final positional = <dynamic>[], named = <String, dynamic>{};
    for (final a in list.arguments) {
      if (a is NamedExpression) {
        named[a.name.label.name] = encode(a.expression);
      } else {
        positional.add(encode(a));
      }
    }
    return node(n, 'call', {
      'name': name.replaceAll(RegExp(r'<.*>'), ''),
      if (n is MethodInvocation && n.typeArguments != null)
        'typeArguments': n.typeArguments!.arguments
            .map((t) => t.toSource())
            .toList(),
      if (n is InstanceCreationExpression &&
          n.constructorName.type.typeArguments != null)
        'typeArguments': n.constructorName.type.typeArguments!.arguments
            .map((t) => t.toSource())
            .toList(),
      'target': encode(target),
      'args': positional,
      'named': named,
    });
  }
}

class CallCollector extends RecursiveAstVisitor<void> {
  final Encoder e;
  final List<Json> calls;
  final List<dynamic> starts;
  final Map<String, dynamic> routes;
  CallCollector(this.e, this.calls, this.starts, this.routes);
  void collect(AstNode n, ArgumentList args, String name) {
    final encoded = e.encode(n) as Json;
    calls.add({
      ...encoded,
      'source': e.source.substring(n.offset, n.end),
      'argsStart': args.leftParenthesis.offset,
      'argsEnd': args.rightParenthesis.offset,
      'structure': structureInfo(n, widgetName(n) ?? name),
    });
    if (name == 'runApp' && args.arguments.isNotEmpty)
      starts.add(e.encode(args.arguments.first));
    if (name == 'registerRoutes' &&
        args.arguments.isNotEmpty &&
        args.arguments.first is SetOrMapLiteral) {
      for (final entry
          in (args.arguments.first as SetOrMapLiteral).elements
              .whereType<MapLiteralEntry>()) {
        if (entry.key is SimpleStringLiteral)
          routes[(entry.key as SimpleStringLiteral).value] = e.encode(
            entry.value,
          );
      }
    }
  }

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression n) {
    collect(n, n.argumentList, n.constructorName.toSource());
    super.visitInstanceCreationExpression(n);
  }

  @override
  void visitMethodInvocation(MethodInvocation n) {
    collect(n, n.argumentList, n.methodName.name);
    super.visitMethodInvocation(n);
  }
}
