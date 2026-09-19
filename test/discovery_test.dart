import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';
import '../lib/discovery.dart';

void main() {
  late Directory temp;
  final sdk = p.dirname(p.dirname(Platform.resolvedExecutable));
  final annotation = Directory('packages/dartnative_preview').absolute.uri;
  setUp(() async {
    temp = Directory.systemTemp.createTempSync('dn-preview-discovery-');
    Directory(p.join(temp.path, 'lib')).createSync();
    Directory(p.join(temp.path, 'native/lib')).createSync(recursive: true);
    File(p.join(temp.path, 'native/lib/dartnative.dart')).writeAsStringSync(
      '''export 'core.dart';
class Size { const Size(this.width, this.height); final double width, height; }
enum Brightness { dark, light }
enum TextDirection { ltr, rtl }
class ThemeData {}
class BuildContext { T? dependOnInheritedWidgetOfExactType<T>() => null; }
abstract class InheritedWidget { const InheritedWidget({required this.child}); final dynamic child; bool updateShouldNotify(covariant InheritedWidget old); }
''',
    );
    File(p.join(temp.path, 'native/lib/core.dart')).writeAsStringSync(
      'abstract class Widget {} class Text extends Widget {}',
    );
    File(p.join(temp.path, 'pubspec.yaml')).writeAsStringSync(
      'name: sample\nenvironment:\n  sdk: ">=3.9.0 <4.0.0"\n',
    );
    Directory(p.join(temp.path, '.dart_tool')).createSync();
    File(p.join(temp.path, '.dart_tool/package_config.json')).writeAsStringSync(
      jsonEncode({
        'configVersion': 2,
        'packages': [
          {
            'name': 'sample',
            'rootUri': '../',
            'packageUri': 'lib/',
            'languageVersion': '3.9',
          },
          {
            'name': 'dartnative',
            'rootUri': '../native/',
            'packageUri': 'lib/',
            'languageVersion': '3.9',
          },
          {
            'name': 'dartnative_preview',
            'rootUri': annotation.toString(),
            'packageUri': 'lib/',
            'languageVersion': '3.9',
          },
        ],
      }),
    );
  });
  tearDown(() => temp.deleteSync(recursive: true));
  Future<Map<String, Object>> run(String source) async {
    File(p.join(temp.path, 'lib/previews.dart')).writeAsStringSync(source);
    return discover(temp.path, sdk);
  }

  const imports =
      "import 'package:dartnative/core.dart';\nimport 'package:dartnative_preview/dartnative_preview.dart' as dn;\n";
  test(
    'resolves annotation aliases and repeated variants with source locations',
    () async {
      final result = await run(
        '$imports@dn.DNPreview(name: "Small")\n@dn.DNPreview(name: "Large", width: 400)\nWidget sample() => Text();',
      );
      expect(result['diagnostics'], isEmpty);
      final previews = result['previews'] as List;
      expect(previews.length, 2);
      expect(previews[1]['width'], 400);
      expect(previews[0]['uri'], 'package:sample/previews.dart');
      expect(previews[0]['id'], isNot(previews[1]['id']));
    },
  );
  test(
    'full-screen defaults preserve phone dimensions and explicit sizes',
    () async {
      final result = await run(
        '$imports@dn.DNPreview(name: "Phone", fullScreen: true)\n@dn.DNPreview(name: "Wide", fullScreen: true, width: 760, height: 760)\nWidget sample() => Text();',
      );
      expect(result['diagnostics'], isEmpty);
      final previews = result['previews'] as List;
      expect(previews[0]['width'], 402);
      expect(previews[0]['height'], 874);
      expect(previews[1]['width'], 760);
      expect(previews[1]['height'], 760);
    },
  );
  test(
    'a same-named annotation from another library is not a preview',
    () async {
      final result = await run(
        'class DNPreview { const DNPreview(); }\n@DNPreview() int fake() => 1;',
      );
      expect(result['previews'], isEmpty);
    },
  );
  test(
    'rejects non-widgets, required arguments and invalid dimensions',
    () async {
      final result = await run(
        '${imports}@dn.DNPreview(name:"Wrong") int wrong() => 1;\n@dn.DNPreview(name:"Arguments") Widget args(int value) => Text();\n@dn.DNPreview(name:"Size", width:-1) Widget size() => Text();',
      );
      expect(result['previews'], isEmpty);
      expect((result['diagnostics'] as List).length, 3);
    },
  );
  test('reports real source errors for a last-good-frame workflow', () async {
    final result = await run(
      '${imports}@dn.DNPreview(name:"Broken") Widget broken() => MissingWidget();',
    );
    expect(result['diagnostics'], isNotEmpty);
  });
  test(
    'supports preview declarations in part files through their containing library',
    () async {
      File(
        p.join(temp.path, 'lib/main.dart'),
      ).writeAsStringSync("${imports}part 'previews.dart';");
      final result = await run(
        "part of 'main.dart';\n@dn.DNPreview(name:'Part') Widget fromPart() => Text();",
      );
      expect(result['diagnostics'], isEmpty);
      expect(
        (result['previews'] as List).single['uri'],
        'package:sample/main.dart',
      );
    },
  );
  test(
    'discovers reusable sets, inherited annotations, callbacks and static factories',
    () async {
      final result = await run("""
import 'package:dartnative/core.dart';
import 'package:dartnative/dartnative.dart';
import 'package:dartnative_preview/dartnative_preview.dart';
Widget wrap(Widget child) => child;
class Variants extends DNPreviewSet {
  const Variants() : super(const [
    DNPreview(name:'Small', size:Size(240,180), wrapper:wrap),
    DNPreview(name:'Dark', brightness:Brightness.dark, textScaleFactor:2),
  ]);
}
class MyPreview extends DNPreview {
  const MyPreview() : super(name:'Inherited', group:'Components');
}
class Examples {
  @Variants()
  static Widget sample() => Text();
}
@MyPreview()
Widget sample() => Text();
""");
      expect(result['diagnostics'], isEmpty);
      final previews = result['previews'] as List;
      expect(previews.length, 3);
      expect(previews[0]['width'], 240);
      expect(previews[0]['symbol'], 'Examples.sample');
      expect(previews[0]['wrapper']['symbol'], 'wrap');
      expect(previews[1]['brightness'], 'dark');
      expect(previews[1]['textScaleFactor'], 2);
      expect(previews[2]['group'], 'Components');
    },
  );
  test('rejects private callbacks and out-of-range scale', () async {
    final result = await run("""
$imports
Widget _wrap(Widget child) => child;
@dn.DNPreview(name:'Private', wrapper:_wrap)
Widget privateWrapper() => Text();
@dn.DNPreview(name:'Scale', textScaleFactor:4)
Widget tooLarge() => Text();
""");
    expect(result['previews'], isEmpty);
    expect((result['diagnostics'] as List).length, 2);
  });
  test(
    'discovers public constructors callable without required arguments',
    () async {
      final result = await run('''
$imports
class Component extends Widget {
  @dn.DNPreview(name:'Default')
  Component({String label = 'Sample'});
  @dn.DNPreview(name:'Named')
  Component.example();
}
''');
      expect(result['diagnostics'], isEmpty);
      expect((result['previews'] as List).map((p) => p['symbol']), [
        'Component',
        'Component.example',
      ]);
    },
  );
  test(
    'persistent discovery sees edits, errors and removal without stale results',
    () async {
      final file = File(p.join(temp.path, 'lib/previews.dart'));
      final discovery = PreviewDiscovery(temp.path, sdk);
      try {
        file.writeAsStringSync(
          '${imports}@dn.DNPreview(name:"First") Widget sample() => Text();',
        );
        expect(
          ((await discovery.scan())['previews'] as List).single['name'],
          'First',
        );
        file.writeAsStringSync(
          '${imports}@dn.DNPreview(name:"Changed") Widget sample() => Text();',
        );
        expect(
          ((await discovery.scan())['previews'] as List).single['name'],
          'Changed',
        );
        file.writeAsStringSync('${imports}Widget sample() => MissingWidget();');
        expect((await discovery.scan())['diagnostics'], isNotEmpty);
        file.deleteSync();
        final removed = await discovery.scan();
        expect(removed['previews'], isEmpty);
        expect(removed['diagnostics'], isEmpty);
      } finally {
        await discovery.dispose();
      }
    },
  );
}
