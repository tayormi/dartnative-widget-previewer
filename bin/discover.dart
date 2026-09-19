import 'dart:convert';
import 'dart:io';
import '../lib/discovery.dart';

Future<void> main(List<String> args) async {
  if (args.length < 2) {
    stderr.writeln('Usage: discover.dart PROJECT DART_SDK [--serve]');
    exitCode = 64;
    return;
  }
  final discovery = PreviewDiscovery(args[0], args[1]);
  try {
    if (args.contains('--serve')) {
      await for (final line
          in stdin.transform(utf8.decoder).transform(const LineSplitter())) {
        try {
          final request = jsonDecode(line) as Map;
          stdout.writeln(
            jsonEncode({'id': request['id'], 'result': await discovery.scan()}),
          );
        } catch (error) {
          stdout.writeln(jsonEncode({'error': error.toString()}));
        }
      }
    } else {
      stdout.writeln(jsonEncode(await discovery.scan()));
    }
  } catch (error) {
    stderr.writeln(error);
    exitCode = 1;
  } finally {
    await discovery.dispose();
  }
}
