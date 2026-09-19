import 'dart:io';
import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/constant/value.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:path/path.dart' as p;

const annotationUri = 'package:dartnative_preview/dartnative_preview.dart';

bool annotationType(DartObject? value, String name) {
  final type = value?.type;
  return type is InterfaceType &&
      [type, ...type.allSupertypes].any(
        (t) =>
            t.element.name == name &&
            t.element.library.uri.toString() == annotationUri,
      );
}

DartObject? field(DartObject value, String name) {
  final direct = value.getField(name);
  final parent = value.getField('(super)');
  return direct ?? (parent == null ? null : field(parent, name));
}

/// Reuses the analyzer between saves. A CLI invocation owns one session.
class PreviewDiscovery {
  PreviewDiscovery(String project, String sdk)
    : project = p.normalize(p.absolute(project)),
      collection = AnalysisContextCollection(
        includedPaths: [p.normalize(p.absolute(project))],
        sdkPath: p.normalize(p.absolute(sdk)),
      );
  final String project;
  final AnalysisContextCollection collection;
  final Set<String> knownPaths = {};
  Future<void> dispose() => collection.dispose();

  Future<Map<String, Object>> scan() async {
    final previews = <Map<String, Object?>>[];
    final diagnostics = <Map<String, Object?>>[];
    final paths =
        Directory(p.join(project, 'lib'))
            .listSync(recursive: true, followLinks: false)
            .whereType<File>()
            .map((f) => f.path)
            .where(
              (f) =>
                  f.endsWith('.dart') &&
                  !p.basename(f).startsWith('dn_preview_generated'),
            )
            .toList()
          ..sort();
    for (final path in {...knownPaths, ...paths}) {
      collection.contextFor(path).changeFile(path);
    }
    knownPaths
      ..clear()
      ..addAll(paths);
    for (final context in collection.contexts) {
      await context.applyPendingFileChanges();
    }
    for (final file in paths) {
      final result = await collection
          .contextFor(file)
          .currentSession
          .getResolvedUnit(file);
      if (result is! ResolvedUnitResult) continue;
      final relative = p.relative(file, from: project);
      for (final error in result.diagnostics) {
        if (error.diagnosticCode.severity.name != 'ERROR') continue;
        diagnostics.add({
          'file': relative,
          'line': result.lineInfo.getLocation(error.offset).lineNumber,
          'message': error.message,
        });
      }
      final declarations = <AnnotatedNode>[
        for (final d in result.unit.declarations) ...[
          d,
          if (d is ClassDeclaration) ...d.members,
        ],
      ];
      for (final declaration in declarations) {
        var variant = 0;
        for (final annotation in declaration.metadata) {
          final constant = annotation.elementAnnotation?.computeConstantValue();
          final configs = annotationType(constant, 'DNPreviewSet')
              ? field(constant!, 'previews')?.toListValue() ?? <DartObject>[]
              : annotationType(constant, 'DNPreview')
              ? [constant!]
              : <DartObject>[];
          for (final value in configs) {
            final line = result.lineInfo
                .getLocation(declaration.offset)
                .lineNumber;
            void problem(String message) => diagnostics.add({
              'file': relative,
              'line': line,
              'message': message,
            });
            ExecutableElement? element;
            String? symbol;
            if (declaration is FunctionDeclaration) {
              element = declaration.declaredFragment?.element;
              symbol = declaration.name.lexeme;
            } else if (declaration is MethodDeclaration &&
                declaration.isStatic) {
              element = declaration.declaredFragment?.element;
              symbol =
                  '${(declaration.parent as ClassDeclaration).name.lexeme}.${declaration.name.lexeme}';
            } else if (declaration is ConstructorDeclaration) {
              element = declaration.declaredFragment?.element;
              final name = declaration.name?.lexeme;
              symbol =
                  '${(declaration.parent as ClassDeclaration).name.lexeme}${name == null ? '' : '.$name'}';
            }
            final body = switch (declaration) {
              FunctionDeclaration d => d.functionExpression.body,
              MethodDeclaration d => d.body,
              ConstructorDeclaration d => d.body,
              _ => null,
            };
            if (element == null ||
                symbol == null ||
                symbol.split('.').any((n) => n.startsWith('_')) ||
                element.formalParameters.any((p) => p.isRequired) ||
                body?.isAsynchronous == true ||
                body?.isGenerator == true) {
              problem(
                'DNPreview needs a public synchronous factory, static method or constructor with no required parameters.',
              );
              continue;
            }
            final returnType = element.returnType;
            bool nativeWidget(InterfaceType t) =>
                t.element.name == 'Widget' &&
                t.element.library.uri.toString().startsWith(
                  'package:dartnative/',
                );
            if (returnType is! InterfaceType ||
                ![returnType, ...returnType.allSupertypes].any(nativeWidget)) {
              problem('The preview factory must return a DartNative Widget.');
              continue;
            }
            final size = field(value, 'size');
            final width =
                size?.getField('width')?.toDoubleValue() ??
                field(value, 'width')?.toDoubleValue();
            final height =
                size?.getField('height')?.toDoubleValue() ??
                field(value, 'height')?.toDoubleValue();
            final scale =
                field(value, 'textScaleFactor')?.toDoubleValue() ?? 1.0;
            final name = field(value, 'name')?.toStringValue();
            if (name == null ||
                name.trim().isEmpty ||
                width == null ||
                height == null ||
                !width.isFinite ||
                !height.isFinite ||
                width <= 0 ||
                height <= 0 ||
                width > 4096 ||
                height > 4096 ||
                !scale.isFinite ||
                scale < 0.5 ||
                scale > 3) {
              problem(
                'Preview name is required; dimensions must be between 0 and 4096 points and text scale between 0.5 and 3.',
              );
              continue;
            }
            final callbacks = <String, Object?>{};
            var invalid = false;
            for (final key in ['wrapper', 'theme', 'localizations']) {
              final callback = field(value, key);
              if (callback == null || callback.isNull) continue;
              final fn = callback.toFunctionValue();
              final parent = fn?.enclosingElement;
              if (fn == null ||
                  fn.isPrivate ||
                  (parent is InterfaceElement &&
                      (parent.isPrivate ||
                          fn is! MethodElement ||
                          !fn.isStatic))) {
                problem(
                  '$key must reference a public top-level function or public static method.',
                );
                invalid = true;
                continue;
              }
              callbacks[key] = {
                'uri': fn.library.uri.toString(),
                'symbol':
                    '${parent is InterfaceElement ? '${parent.name}.' : ''}${fn.name}',
              };
            }
            if (invalid) continue;
            final uri = result.libraryElement.uri.toString();
            previews.add({
              'id': '$uri::$symbol::${variant++}',
              'name': name,
              'group': field(value, 'group')?.toStringValue() ?? '',
              'file': relative,
              'line': line,
              'uri': uri,
              'symbol': symbol,
              'width': width,
              'height': height,
              'fullScreen': field(value, 'fullScreen')?.toBoolValue() ?? false,
              'textScaleFactor': scale,
              'brightness':
                  field(value, 'brightness')?.getField('index')?.toIntValue() ==
                      0
                  ? 'dark'
                  : 'light',
              ...callbacks,
            });
          }
        }
      }
    }
    return {'previews': previews, 'diagnostics': diagnostics};
  }
}

Future<Map<String, Object>> discover(String project, String sdk) async {
  final discovery = PreviewDiscovery(project, sdk);
  try {
    return await discovery.scan();
  } finally {
    await discovery.dispose();
  }
}
