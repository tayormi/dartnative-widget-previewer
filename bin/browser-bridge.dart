import 'dart:convert';
import 'dart:js_interop';
import '../lib/browser/bridge.dart';

@JS('nativeLabRequest')
external set nativeLabRequest(JSFunction function);

void main() {
  nativeLabRequest = ((JSString operation, JSString payload) {
    try {
      if (operation.toDart != 'parse') {
        throw ArgumentError('The widget previewer supports parsing only.');
      }
      final data = jsonDecode(payload.toDart) as Map<String, dynamic>;
      return jsonEncode({
        'result': parseProject(Map<String, String>.from(data['files'])),
      }).toJS;
    } catch (error) {
      return jsonEncode({'error': error.toString()}).toJS;
    }
  }).toJS;
}
