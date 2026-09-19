import 'package:dartnative/dartnative.dart';

typedef DNPreviewWrapper = Widget Function(Widget child);
typedef DNPreviewTheme = ThemeData Function();
typedef DNPreviewLocalizationBuilder = DNPreviewLocalizations Function();

/// Marks an isolated DartNative widget. Application main() is never invoked.
/// Callbacks must be public top-level functions or public static methods.
class DNPreview {
  const DNPreview({
    required this.name,
    this.group = '',
    double? width,
    double? height,
    this.size,
    this.fullScreen = false,
    this.textScaleFactor = 1,
    this.brightness = Brightness.light,
    this.wrapper,
    this.theme,
    this.localizations,
  }) : width = width ?? (fullScreen ? 402 : 320),
       height = height ?? (fullScreen ? 874 : 240);

  final String name;
  final String group;
  final double width;
  final double height;
  final bool fullScreen;
  final Size? size;
  final double textScaleFactor;
  final Brightness brightness;
  final DNPreviewWrapper? wrapper;
  final DNPreviewTheme? theme;
  final DNPreviewLocalizationBuilder? localizations;
}

/// Reusable configurations. Subclasses can pass a constant list to super.
class DNPreviewSet {
  const DNPreviewSet(this.previews);
  final List<DNPreview> previews;
}

/// The application's wrapper supplies its translation or localization state.
/// Locale metadata alone does not translate strings.
class DNPreviewLocalizations {
  const DNPreviewLocalizations({
    required this.locale,
    this.textDirection = TextDirection.ltr,
    this.wrapper,
  });
  final String locale;
  final TextDirection textDirection;
  final DNPreviewWrapper? wrapper;
}

/// Preview metadata available to a widget or an application wrapper.
class DNPreviewScope extends InheritedWidget {
  const DNPreviewScope({
    required this.locale,
    required this.textScaleFactor,
    required super.child,
  });
  final String locale;
  final double textScaleFactor;

  static DNPreviewScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<DNPreviewScope>();

  @override
  bool updateShouldNotify(DNPreviewScope oldWidget) =>
      locale != oldWidget.locale ||
      textScaleFactor != oldWidget.textScaleFactor;
}
