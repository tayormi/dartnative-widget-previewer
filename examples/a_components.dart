import 'package:dartnative/dartnative.dart';
import 'package:dartnative_preview/dartnative_preview.dart';

// One widget, shared data, and independent preview environments.
class ReadingAppearances extends DNPreviewSet {
  const ReadingAppearances()
    : super(const [
        DNPreview(
          name: 'Reading card',
          group: 'Reading card',
          size: Size(360, 300),
          wrapper: sampleBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'Dark',
          group: 'Reading card',
          size: Size(360, 300),
          brightness: Brightness.dark,
          wrapper: sampleBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'Large text',
          group: 'Reading card',
          size: Size(360, 460),
          textScaleFactor: 2,
          wrapper: sampleBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'Narrow',
          group: 'Reading card',
          size: Size(260, 390),
          wrapper: sampleBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'Arabic',
          group: 'Reading card',
          size: Size(360, 320),
          wrapper: sampleBook,
          theme: readingTheme,
          localizations: arabicPreview,
        ),
        DNPreview(
          name: 'Long title',
          group: 'Content states',
          size: Size(360, 340),
          wrapper: longBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'No book',
          group: 'Content states',
          size: Size(360, 300),
          wrapper: emptyBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'Loading',
          group: 'Content states',
          size: Size(360, 300),
          wrapper: loadingBook,
          theme: readingTheme,
        ),
        DNPreview(
          name: 'Unavailable',
          group: 'Content states',
          size: Size(360, 300),
          wrapper: unavailableBook,
          theme: readingTheme,
        ),
      ]);
}

@ReadingAppearances()
Widget readingComponentPreview() => const EnvironmentReadingCard();

ThemeData readingTheme() =>
    ThemeData.light().copyWith(colorScheme: ColorScheme.light());

DNPreviewLocalizations arabicPreview() => const DNPreviewLocalizations(
  locale: 'ar',
  textDirection: TextDirection.rtl,
);
Widget sampleBook(Widget child) => BookFixture(child: child);
Widget longBook(Widget child) => BookFixture(
  title: 'The Little Book of Finding Wonder in the Everyday',
  author: 'A collection of observations by Rob Walker',
  child: child,
);
Widget emptyBook(Widget child) => BookFixture(status: 'empty', child: child);
Widget loadingBook(Widget child) =>
    BookFixture(status: 'loading', child: child);
Widget unavailableBook(Widget child) =>
    BookFixture(status: 'error', child: child);

class BookFixture extends InheritedWidget {
  const BookFixture({
    this.title = 'The Creative Act',
    this.author = 'Rick Rubin',
    this.status = 'ready',
    required super.child,
  });
  final String title, author, status;
  static BookFixture of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<BookFixture>()!;
  @override
  bool updateShouldNotify(BookFixture oldWidget) =>
      title != oldWidget.title ||
      author != oldWidget.author ||
      status != oldWidget.status;
}

class EnvironmentReadingCard extends StatefulWidget {
  const EnvironmentReadingCard({super.key});
  @override
  State<EnvironmentReadingCard> createState() => _EnvironmentReadingCardState();
}

class _EnvironmentReadingCardState extends State<EnvironmentReadingCard> {
  bool reading = false;
  bool recovered = false;
  @override
  Widget build(BuildContext context) {
    final book = BookFixture.of(context);
    final arabic = DNPreviewScope.maybeOf(context)?.locale == 'ar';
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? const Color(0xFFF4F2EC) : const Color(0xFF252C27);
    final muted = dark ? const Color(0xFFAAAFA9) : const Color(0xFF6D766E);
    final surface = dark ? const Color(0xFF202622) : const Color(0xFFF3F4EF);
    final ready = book.status == 'ready' || recovered;
    final accent = Theme.of(context).colorScheme.primary;
    return Container(
      color: surface,
      padding: const EdgeInsets.all(22),
      child: ListView(
        children: [
          Text(
            arabic ? 'وقت القراءة' : 'ON YOUR SHELF',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: muted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 22),
          if (ready) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 60,
                  color: dark
                      ? const Color(0xFFBBA985)
                      : const Color(0xFFC8BDA2),
                  child: Center(
                    child: Container(width: 22, height: 1, color: ink),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        arabic ? 'الفعل الإبداعي' : book.title,
                        style: TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w600,
                          color: ink,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        arabic ? 'ريك روبن' : book.author,
                        style: TextStyle(fontSize: 13, color: muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            Text(
              arabic
                  ? 'لحظة هادئة، وصفحة جديدة.'
                  : reading
                  ? 'Your reading session is underway.'
                  : 'A quiet moment. A few more pages.',
              style: TextStyle(fontSize: 14, color: muted),
            ),
            const SizedBox(height: 18),
            Button(
              title: arabic
                  ? (reading ? 'إيقاف القراءة' : 'ابدأ القراءة')
                  : (reading ? 'Pause reading' : 'Start reading'),
              color: accent,
              variant: ButtonVariant.filled,
              onPressed: () => setState(() => reading = !reading),
            ),
          ] else ...[
            if (book.status == 'loading') const CircularProgressIndicator(),
            Text(
              book.status == 'empty'
                  ? 'Room for your next book'
                  : book.status == 'loading'
                  ? 'Finding your place…'
                  : 'Your shelf is unavailable',
              style: TextStyle(
                fontSize: 21,
                fontWeight: FontWeight.w600,
                color: ink,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              book.status == 'empty'
                  ? 'Choose something you have been meaning to read.'
                  : book.status == 'loading'
                  ? 'Your reading list will appear here.'
                  : 'Try again when your connection is back.',
              style: TextStyle(fontSize: 14, color: muted),
            ),
            const SizedBox(height: 20),
            Button(
              title: book.status == 'empty'
                  ? 'Add sample book'
                  : book.status == 'loading'
                  ? 'Finish loading'
                  : 'Try again',
              color: accent,
              variant: ButtonVariant.filled,
              onPressed: () => setState(() => recovered = true),
            ),
          ],
        ],
      ),
    );
  }
}
