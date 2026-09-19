import 'package:analyzer/dart/ast/ast.dart';
import 'structure.dart' show argumentsFor;

ConstructorDeclaration? inputConstructor(ClassDeclaration cls) {
  final constructors = cls.members.whereType<ConstructorDeclaration>().toList();
  if (cls.extendsClause?.superclass.toSource() != 'StatelessWidget' ||
      constructors.length != 1)
    return null;
  final ctor = constructors.single;
  if (ctor.name != null ||
      ctor.constKeyword == null ||
      ctor.initializers.isNotEmpty ||
      ctor.body is! EmptyFunctionBody)
    return null;
  for (final p in ctor.parameters.parameters) {
    if (p is! DefaultFormalParameter || !p.isNamed || p.requiredKeyword != null)
      return null;
    if (p.parameter is SuperFormalParameter && p.name?.lexeme == 'key')
      continue;
    if (p.parameter is! FieldFormalParameter ||
        inputValue(p.defaultValue) == null)
      return null;
    final fields = cls.members
        .whereType<FieldDeclaration>()
        .where(
          (f) => f.fields.variables.any((v) => v.name.lexeme == p.name?.lexeme),
        )
        .toList();
    if (fields.length != 1 ||
        fields.single.fields.variables.any((v) => v.initializer != null) ||
        !fields.single.fields.isFinal ||
        fields.single.isStatic ||
        fields.single.fields.type?.toSource() !=
            inputValue(p.defaultValue)!['type'])
      return null;
  }
  return ctor;
}

Map<String, dynamic>? inputValue(Expression? value) {
  if (value is SimpleStringLiteral)
    return {'type': 'String', 'value': value.value};
  final args = value == null ? null : argumentsFor(value);
  final name = switch (value) {
    InstanceCreationExpression n => n.constructorName.toSource(),
    MethodInvocation n when n.target == null => n.methodName.name,
    _ => null,
  };
  if (name == 'Color' &&
      args?.arguments.length == 1 &&
      args!.arguments.single is IntegerLiteral) {
    final v = (args.arguments.single as IntegerLiteral).value!;
    if (v >= 0 && v <= 0xFFFFFFFF) return {'type': 'Color', 'value': v};
  }
  return null;
}

Map<String, dynamic> describeInputs(ClassDeclaration cls) {
  final ctor = inputConstructor(cls);
  return {
    'editable': ctor != null,
    'items': [
      if (ctor != null)
        for (final p
            in ctor.parameters.parameters.whereType<DefaultFormalParameter>())
          if (p.parameter is FieldFormalParameter)
            {'name': p.name!.lexeme, ...inputValue(p.defaultValue)!},
    ],
  };
}
