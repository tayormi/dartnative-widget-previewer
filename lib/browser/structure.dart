import 'package:analyzer/dart/ast/ast.dart';

const childLayouts = {'Column', 'Row', 'ListView', 'Stack', 'Wrap'};
const editableWidgets = {
  ...childLayouts,
  'Text',
  'Button',
  'Container',
  'SizedBox',
  'Divider',
  'Icon',
  'Image.asset',
  'Padding',
  'Center',
  'Align',
  'Expanded',
  'Flexible',
  'Spacer',
  'ListTile',
  'IconButton',
  'TextField',
  'Switch',
  'Checkbox',
  'Scaffold',
  'AppBar',
  'SearchBar',
  'SegmentedControl',
  'Slider',
  'LinearProgressIndicator',
  'CircularProgressIndicator',
};
ArgumentList? argumentsFor(AstNode node) => switch (node) {
  InstanceCreationExpression n => n.argumentList,
  MethodInvocation n => n.argumentList,
  _ => null,
};
String? widgetName(AstNode? node) => switch (node) {
  InstanceCreationExpression n => n.constructorName.toSource(),
  MethodInvocation n =>
    n.target?.toSource() == 'Image'
        ? 'Image.${n.methodName.name}'
        : n.methodName.name,
  _ => null,
};
ListLiteral? siblingList(AstNode node) {
  final list = node.parent;
  if (list is! ListLiteral) return null;
  final named = list.parent;
  if (named is! NamedExpression || named.name.label.name != 'children')
    return null;
  return childLayouts.contains(widgetName(named.parent?.parent)) ? list : null;
}

Map<String, dynamic> structureInfo(AstNode node, String name) {
  final list = siblingList(node);
  final parent = node.parent;
  final isSingle =
      parent is NamedExpression &&
      {'child', 'body'}.contains(parent.name.label.name);
  if (!editableWidgets.contains(name) && list == null && !isSingle) return {};
  final index =
      list?.elements.indexWhere((element) => identical(element, node)) ?? -1;
  final args = argumentsFor(node)!;
  final children = args.arguments
      .whereType<NamedExpression>()
      .where((n) => n.name.label.name == 'children')
      .firstOrNull;
  final operations = <String>[];
  if (childLayouts.contains(name) &&
      (children == null || children.expression is ListLiteral))
    operations.add('append');
  if (list != null) {
    operations.addAll(['before', 'after', 'duplicate', 'remove']);
    if (index > 0 && widgetName(list.elements[index - 1]) != null)
      operations.add('up');
    if (index < list.elements.length - 1 &&
        widgetName(list.elements[index + 1]) != null)
      operations.add('down');
  }

  if (list != null || isSingle) operations.add('wrap');
  return {
    'operations': operations,
    'listIndex': index,
    'listCount': list?.elements.length,
    'parentStart': list?.parent?.parent?.parent?.offset,
    'computedChildren':
        childLayouts.contains(name) &&
        children != null &&
        children.expression is! ListLiteral,
  };
}
