import 'package:analyzer/dart/ast/ast.dart';

/// Discovery metadata, independent of the browser renderer or native host.
/// Constructor support does not imply support for the widget's implementation.
Map<String, dynamic>? describeWidgetPreview(
  CompilationUnitMember declaration,
  String file, {
  Map<String, List<String>> enums = const {},
  Map<String, String> enumFiles = const {},
}) {
  final name = switch (declaration) {
    ClassDeclaration d => d.name.lexeme,
    FunctionDeclaration d => d.name.lexeme,
    _ => '',
  };
  if (name.isEmpty || name.startsWith('_')) return null;
  final problems = <String>[];
  final inputs = <Map<String, dynamic>>[];
  String kind;
  if (declaration is ClassDeclaration) {
    if (!{
      'StatelessWidget',
      'StatefulWidget',
    }.contains(declaration.extendsClause?.superclass.toSource()))
      return null;
    kind = 'widget';
    if (declaration.abstractKeyword != null) return null;
    if (declaration.typeParameters != null) {
      problems.add('Use a preview function to supply generic type arguments.');
    }
    final constructors = declaration.members
        .whereType<ConstructorDeclaration>();
    final unnamed = constructors.where((c) => c.name == null).firstOrNull;
    if (constructors.isNotEmpty && unnamed == null) {
      problems.add('Use a preview function to call a named constructor.');
    }
    if (unnamed != null) {
      for (final parameter in unnamed.parameters.parameters) {
        final p = parameter is DefaultFormalParameter
            ? parameter.parameter
            : parameter;
        final inputName = p.name?.lexeme ?? '';
        if (p is SuperFormalParameter &&
            inputName == 'key' &&
            parameter.isNamed)
          continue;
        if (!parameter.isNamed ||
            (p is! FieldFormalParameter && p is! SimpleFormalParameter)) {
          problems.add(
            'Input "$inputName" needs a named parameter with a supported type for browser sampling.',
          );
          continue;
        }
        final field = declaration.members
            .whereType<FieldDeclaration>()
            .where(
              (f) =>
                  !f.isStatic &&
                  f.fields.variables.any((v) => v.name.lexeme == inputName),
            )
            .firstOrNull;
        final type = switch (p) {
          FieldFormalParameter p =>
            p.type?.toSource() ?? field?.fields.type?.toSource() ?? '',
          SimpleFormalParameter p => p.type?.toSource() ?? '',
          _ => '',
        };
        final value = parameter is DefaultFormalParameter
            ? parameter.defaultValue
            : null;
        final required = parameter.isRequiredNamed;
        final sample = _sample(type, value, enums, enumFiles);
        if (sample == null) {
          problems.add(
            'Input "$inputName" ($type) needs a preview function with sample data.',
          );
          continue;
        }
        inputs.add({
          'name': inputName,
          'type': type,
          'required': required,
          'defaultSource': value?.toSource(),
          ...sample,
        });
      }
    }
  } else if (declaration is FunctionDeclaration &&
      declaration.returnType?.toSource() == 'Widget') {
    kind = 'function';
    if (declaration.functionExpression.parameters?.parameters.isNotEmpty ??
        false) {
      problems.add(
        'Preview functions must take no parameters. Put sample data inside the function.',
      );
    }
    if (declaration.functionExpression.body.isAsynchronous ||
        declaration.functionExpression.body.isGenerator) {
      problems.add('Preview functions must return a widget synchronously.');
    }
  } else {
    return null;
  }
  return {
    'id': '$file::$name',
    'name': name,
    'kind': kind,
    'file': file,
    'start': declaration.offset,
    'end': declaration.end,
    'inputs': inputs,
    'sampleable': problems.isEmpty,
    'problems': problems,
  };
}

Map<String, dynamic>? _sample(
  String type,
  Expression? value,
  Map<String, List<String>> enums,
  Map<String, String> enumFiles,
) {
  final base = type.replaceFirst(RegExp(r'\?$'), '');
  final choices = enums[base];
  if (choices != null && choices.isNotEmpty && !base.startsWith('_')) {
    final source = value?.toSource();
    final selected = source == null
        ? choices.first
        : source == 'null' && type.endsWith('?')
        ? null
        : source.startsWith('$base.')
        ? source.substring(base.length + 1)
        : '';
    if (selected != null && !choices.contains(selected)) return null;
    return {
      'kind': 'enum',
      'options': choices,
      'enumFile': enumFiles[base],
      'value': selected,
    };
  }
  if (!{'String', 'bool', 'int', 'double', 'num', 'Color'}.contains(base))
    return null;
  dynamic sample;
  if (value is SimpleStringLiteral)
    sample = value.value;
  else if (value is BooleanLiteral)
    sample = value.value;
  else if (value is IntegerLiteral)
    sample = value.value;
  else if (value is DoubleLiteral)
    sample = value.value;
  else if (value is PrefixExpression &&
      value.operator.lexeme == '-' &&
      value.operand is IntegerLiteral)
    sample = -(value.operand as IntegerLiteral).value!;
  else if (value is PrefixExpression &&
      value.operator.lexeme == '-' &&
      value.operand is DoubleLiteral)
    sample = -(value.operand as DoubleLiteral).value;
  else if (value is NullLiteral)
    sample = null;
  else if (value != null && base == 'Color') {
    final args = switch (value) {
      InstanceCreationExpression e
          when e.constructorName.toSource() == 'Color' =>
        e.argumentList,
      MethodInvocation e
          when e.target == null && e.methodName.name == 'Color' =>
        e.argumentList,
      _ => null,
    };
    if (args?.arguments.length != 1 ||
        args!.arguments.single is! IntegerLiteral)
      return null;
    sample = (args.arguments.single as IntegerLiteral).value;
  } else if (value != null)
    return null;
  else
    sample = switch (base) {
      'String' => 'Sample text',
      'bool' => false,
      'Color' => 0xff2563eb,
      _ => 0,
    };
  if (value is! NullLiteral) {
    final valid = switch (base) {
      'String' => sample is String,
      'bool' => sample is bool,
      'Color' => sample is int && sample >= 0 && sample <= 0xffffffff,
      'int' => sample is int,
      _ => sample is num,
    };
    if (!valid) return null;
  } else if (!type.endsWith('?'))
    return null;
  return {'value': sample};
}
