import 'package:dartnative/dartnative.dart';
import 'package:dartnative_preview/dartnative_preview.dart';

// All fixtures are local and deterministic. No account, service or network is needed.
const ink = Color(0xFF233D35);
const paper = Color(0xFFF3F4EF);
const muted = Color(0xFF6B746D);
const white = Color(0xFFFFFFFF);

@DNPreview(
  name: 'Library',
  group: 'Screens',
  width: 390,
  height: 844,
  fullScreen: true,
)
@DNPreview(
  name: 'Library · wide',
  group: 'Layouts',
  width: 760,
  height: 760,
  fullScreen: true,
)
Widget libraryPreview() => const LibraryScreen();

@DNPreview(
  name: 'Book & progress',
  group: 'Screens',
  width: 390,
  height: 844,
  fullScreen: true,
)
Widget bookDetailsPreview() => const BookDetails();

@DNPreview(
  name: 'Add a book',
  group: 'Screens',
  width: 390,
  height: 844,
  fullScreen: true,
)
Widget addBookPreview() => const AddBookScreen();

@DNPreview(
  name: 'Preferences',
  group: 'Screens',
  width: 390,
  height: 760,
  fullScreen: true,
)
Widget preferencesPreview() => const ReadingPreferences();

@DNPreview(name: 'Empty library', group: 'States', width: 340, height: 300)
Widget emptyLibraryPreview() => const LibraryStatus(initialStatus: 'empty');

@DNPreview(name: 'Loading library', group: 'States', width: 340, height: 300)
Widget loadingLibraryPreview() => const LibraryStatus(initialStatus: 'loading');

@DNPreview(name: 'Connection error', group: 'States', width: 340, height: 300)
Widget failedLibraryPreview() => const LibraryStatus(initialStatus: 'error');

Widget label(String text) => Text(
  text,
  style: const TextStyle(
    fontSize: 12,
    color: muted,
    fontWeight: FontWeight.w600,
  ),
);

Widget panel(Widget child) => Container(
  padding: const EdgeInsets.all(20),
  decoration: BoxDecoration(
    color: white,
    borderRadius: BorderRadius.circular(16),
  ),
  child: child,
);

Widget cover(
  String title,
  Color color, {
  double width = 80,
  double height = 112,
}) => Container(
  width: width,
  height: height,
  padding: const EdgeInsets.all(10),
  decoration: BoxDecoration(
    color: color,
    borderRadius: BorderRadius.circular(4),
  ),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Container(width: 20, height: 3, color: white),
      Text(
        title,
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: width > 100 ? 20 : 10,
          color: white,
          fontWeight: FontWeight.w700,
        ),
      ),
      const Text('SHELF', style: TextStyle(fontSize: 8, color: white)),
    ],
  ),
);

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key});
  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final search = TextEditingController();
  int filter = 0;
  String query = '';
  final books = [
    {
      'title': 'The Creative Act',
      'author': 'Rick Rubin',
      'short': 'The\nCreative\nAct',
      'color': 0xFFB5694E,
      'reading': true,
    },
    {
      'title': 'A Psalm for the Wild-Built',
      'author': 'Becky Chambers',
      'short': 'A Psalm\nfor the\nWild-Built',
      'color': 0xFF507368,
      'reading': false,
    },
    {
      'title': 'Braiding Sweetgrass',
      'author': 'Robin Wall Kimmerer',
      'short': 'Braiding\nSweetgrass',
      'color': 0xFF887342,
      'reading': false,
    },
    {
      'title': 'The Art of Noticing',
      'author': 'Rob Walker',
      'short': 'The Art\nof\nNoticing',
      'color': 0xFF596F86,
      'reading': true,
    },
  ];

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Widget overview(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: ink,
      borderRadius: BorderRadius.circular(18),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'YOUR READING YEAR',
          style: TextStyle(
            fontSize: 11,
            color: Color(0xFFBFD1BD),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'Make room for\na good book.',
          style: TextStyle(
            fontSize: 29,
            fontWeight: FontWeight.w700,
            color: white,
          ),
        ),
        const SizedBox(height: 22),
        const LinearProgressIndicator(
          value: 0.5,
          color: Color(0xFFD5E4A1),
          backgroundColor: Color(0xFF456055),
        ),
        const SizedBox(height: 10),
        const Text(
          '6 of 12 books this year',
          style: TextStyle(fontSize: 14, color: white),
        ),
        const SizedBox(height: 14),
        Button(
          title: 'Reading preferences',
          variant: ButtonVariant.plain,
          foregroundColor: white,
          onPressed: () => Navigator.push(
            context,
            PageRoute(builder: (_) => const ReadingPreferences()),
          ),
        ),
      ],
    ),
  );

  Widget collection(BuildContext context) {
    final visible = books
        .where(
          (book) =>
              (filter == 0 ||
                  (filter == 1
                      ? book['reading'] == true
                      : book['reading'] == false)) &&
              ('${book['title']} ${book['author']}').toLowerCase().contains(
                query.toLowerCase(),
              ),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: search,
          decoration: const InputDecoration(hintText: 'Search title or author'),
          onChanged: (value) => setState(() {
            query = value;
          }),
        ),
        const SizedBox(height: 14),
        SegmentedControl(
          segments: const ['All books', 'Reading', 'Up next'],
          selectedIndex: filter,
          onValueChanged: (value) => setState(() {
            filter = value;
          }),
        ),
        const SizedBox(height: 22),
        label('${visible.length} BOOKS'),
        const SizedBox(height: 14),
        if (visible.isEmpty)
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'No books found',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                const Text('Try another title or author.'),
                Button(
                  title: 'Clear search',
                  onPressed: () => setState(() {
                    search.text = '';
                    query = '';
                    filter = 0;
                  }),
                ),
              ],
            ),
          ),
        for (final book in visible)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            child: panel(
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  cover(book['short'] as String, Color(book['color'] as int)),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          book['title'] as String,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                            color: ink,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          book['author'] as String,
                          style: const TextStyle(fontSize: 13, color: muted),
                        ),
                        const SizedBox(height: 8),
                        Button(
                          title: book['reading'] == true
                              ? 'Continue'
                              : 'Book details',
                          variant: ButtonVariant.plain,
                          foregroundColor: ink,
                          onPressed: () => Navigator.push(
                            context,
                            PageRoute(
                              builder: (_) => BookDetails(
                                title: book['title'] as String,
                                author: book['author'] as String,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 600;
    return Scaffold(
      brightness: Brightness.light,
      backgroundColor: paper,
      appBar: AppBar(
        title: const Text('Shelf'),
        actions: [
          BarButtonItem(
            title: 'Add book',
            onPressed: () => Navigator.push(
              context,
              PageRoute(
                builder: (_) => AddBookScreen(
                  onAdded: (title, author, reading) => setState(() {
                    books.add({
                      'title': title,
                      'author': author,
                      'short': title,
                      'color': 0xFF596F86,
                      'reading': reading,
                    });
                  }),
                ),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Your library',
            style: TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w700,
              color: ink,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'A little reading, every day.',
            style: TextStyle(fontSize: 15, color: muted),
          ),
          const SizedBox(height: 24),
          if (wide)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 250, child: overview(context)),
                const SizedBox(width: 24),
                Expanded(child: collection(context)),
              ],
            )
          else ...[
            overview(context),
            const SizedBox(height: 24),
            collection(context),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

class BookDetails extends StatefulWidget {
  final String title;
  final String author;
  const BookDetails({
    super.key,
    this.title = 'The Creative Act',
    this.author = 'Rick Rubin',
  });
  @override
  State<BookDetails> createState() => _BookDetailsState();
}

class _BookDetailsState extends State<BookDetails> {
  double pages = 80;
  bool saved = false;
  int sessions = 4;
  @override
  Widget build(BuildContext context) => Scaffold(
    brightness: Brightness.light,
    backgroundColor: paper,
    appBar: AppBar(title: const Text('Book details')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Center(
          child: cover(
            widget.title,
            const Color(0xFFB5694E),
            width: 130,
            height: 176,
          ),
        ),
        const SizedBox(height: 22),
        Text(
          widget.title,
          style: const TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
        ),
        const SizedBox(height: 6),
        Text(widget.author, style: const TextStyle(fontSize: 16, color: muted)),
        const SizedBox(height: 18),
        Button(
          title: saved ? 'Saved to favorites' : 'Save to favorites',
          variant: ButtonVariant.tinted,
          onPressed: () => setState(() {
            saved = !saved;
          }),
        ),
        const SizedBox(height: 22),
        panel(
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              label('READING PROGRESS'),
              const SizedBox(height: 10),
              Text(
                '${pages.toInt()} of 400 pages',
                style: const TextStyle(
                  fontSize: 23,
                  fontWeight: FontWeight.w600,
                  color: ink,
                ),
              ),
              const SizedBox(height: 14),
              LinearProgressIndicator(
                value: pages / 400,
                color: ink,
                backgroundColor: paper,
              ),
              const SizedBox(height: 12),
              Slider(
                value: pages,
                min: 0,
                max: 400,
                divisions: 40,
                activeColor: ink,
                onChanged: (value) => setState(() {
                  pages = value;
                }),
              ),
              const SizedBox(height: 12),
              Button(
                title: pages >= 400 ? 'Book finished' : 'Log 20 pages',
                variant: ButtonVariant.filled,
                color: ink,
                onPressed: pages >= 400
                    ? null
                    : () => setState(() {
                        pages = (pages + 20).clamp(0, 400).toDouble();
                        sessions += 1;
                      }),
              ),
              const SizedBox(height: 10),
              Text(
                '$sessions reading sessions',
                style: const TextStyle(fontSize: 13, color: muted),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        label('READING NOTE'),
        const SizedBox(height: 10),
        const Text(
          'Leave a little space after each chapter. What stayed with you?',
          style: TextStyle(fontSize: 17, color: ink),
        ),
        const SizedBox(height: 24),
      ],
    ),
  );
}

class AddBookScreen extends StatefulWidget {
  final void Function(String, String, bool)? onAdded;
  const AddBookScreen({super.key, this.onAdded});
  @override
  State<AddBookScreen> createState() => _AddBookScreenState();
}

class _AddBookScreenState extends State<AddBookScreen> {
  final title = TextEditingController();
  final author = TextEditingController();
  final notes = TextEditingController();
  int format = 0;
  bool startNow = true;
  String error = '';
  bool added = false;
  @override
  void dispose() {
    title.dispose();
    author.dispose();
    notes.dispose();
    super.dispose();
  }

  void save() {
    setState(() {
      if (title.text.trim().isEmpty || author.text.trim().isEmpty) {
        error = 'Add a title and author to continue.';
      } else {
        error = '';
        if (widget.onAdded != null) {
          widget.onAdded!(title.text.trim(), author.text.trim(), startNow);
        }
        added = true;
      }
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    brightness: Brightness.light,
    backgroundColor: paper,
    appBar: AppBar(title: const Text('Add a book')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (added) ...[
          const SizedBox(height: 40),
          label('ADDED TO YOUR SHELF'),
          const SizedBox(height: 16),
          Text(
            title.text.trim(),
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w700,
              color: ink,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            author.text.trim(),
            style: const TextStyle(fontSize: 17, color: muted),
          ),
          const SizedBox(height: 24),
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  format == 0
                      ? 'Paperback'
                      : format == 1
                      ? 'E-book'
                      : 'Audiobook',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  startNow
                      ? 'Ready for your first reading session.'
                      : 'Saved for your next read.',
                ),
                if (notes.text.trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(notes.text.trim()),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          Button(
            title: 'View book',
            variant: ButtonVariant.filled,
            color: ink,
            onPressed: () => Navigator.push(
              context,
              PageRoute(
                builder: (_) => BookDetails(
                  title: title.text.trim(),
                  author: author.text.trim(),
                ),
              ),
            ),
          ),
          Button(
            title: 'Add another',
            variant: ButtonVariant.plain,
            onPressed: () => setState(() {
              title.text = '';
              author.text = '';
              notes.text = '';
              format = 0;
              startNow = true;
              added = false;
            }),
          ),
        ] else ...[
          const Text(
            'Your next good read',
            style: TextStyle(
              fontSize: 27,
              fontWeight: FontWeight.w700,
              color: ink,
            ),
          ),
          const SizedBox(height: 24),
          label('BOOK DETAILS'),
          const SizedBox(height: 12),
          TextField(
            controller: title,
            decoration: const InputDecoration(hintText: 'Book title'),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: author,
            decoration: const InputDecoration(hintText: 'Author'),
          ),
          const SizedBox(height: 24),
          label('FORMAT'),
          const SizedBox(height: 12),
          SegmentedControl(
            segments: const ['Paperback', 'E-book', 'Audio'],
            selectedIndex: format,
            onValueChanged: (value) => setState(() {
              format = value;
            }),
          ),
          const SizedBox(height: 24),
          panel(
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Start reading now',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
                Switch(
                  value: startNow,
                  onChanged: (value) => setState(() {
                    startNow = value;
                  }),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: notes,
            maxLines: 3,
            minLines: 3,
            decoration: const InputDecoration(
              hintText: 'A note for later (optional)',
            ),
          ),
          if (error.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              error,
              style: const TextStyle(color: Color(0xFFB33C30), fontSize: 14),
            ),
          ],
          const SizedBox(height: 24),
          Button(
            title: 'Add to shelf',
            variant: ButtonVariant.filled,
            color: ink,
            onPressed: save,
          ),
        ],
        const SizedBox(height: 24),
      ],
    ),
  );
}

class ReadingPreferences extends StatefulWidget {
  const ReadingPreferences({super.key});
  @override
  State<ReadingPreferences> createState() => _ReadingPreferencesState();
}

class _ReadingPreferencesState extends State<ReadingPreferences> {
  bool dark = false;
  bool reminders = true;
  double goal = 20;
  int schedule = 0;
  bool saved = false;
  @override
  Widget build(BuildContext context) {
    final background = dark ? const Color(0xFF19241F) : paper;
    final foreground = dark ? white : ink;
    final surface = dark ? const Color(0xFF2A3830) : white;
    return Scaffold(
      brightness: dark ? Brightness.dark : Brightness.light,
      backgroundColor: background,
      appBar: AppBar(title: const Text('Preferences')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            'A reading rhythm\nthat fits you.',
            style: TextStyle(
              fontSize: 29,
              fontWeight: FontWeight.w700,
              color: foreground,
            ),
          ),
          const SizedBox(height: 28),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Dark appearance',
                        style: TextStyle(color: foreground, fontSize: 16),
                      ),
                    ),
                    Switch(
                      value: dark,
                      onChanged: (value) => setState(() {
                        dark = value;
                        saved = false;
                      }),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Reading reminders',
                        style: TextStyle(color: foreground, fontSize: 16),
                      ),
                    ),
                    Switch(
                      value: reminders,
                      onChanged: (value) => setState(() {
                        reminders = value;
                        saved = false;
                      }),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Text('DAILY GOAL', style: TextStyle(fontSize: 12, color: foreground)),
          const SizedBox(height: 12),
          Text(
            '${goal.toInt()} minutes',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w600,
              color: foreground,
            ),
          ),
          Slider(
            value: goal,
            min: 5,
            max: 60,
            divisions: 11,
            onChanged: (value) => setState(() {
              goal = value;
              saved = false;
            }),
          ),
          if (reminders) ...[
            const SizedBox(height: 24),
            Text(
              'REMIND ME',
              style: TextStyle(fontSize: 12, color: foreground),
            ),
            const SizedBox(height: 12),
            SegmentedControl(
              segments: const ['Evening', 'Morning'],
              selectedIndex: schedule,
              onValueChanged: (value) => setState(() {
                schedule = value;
                saved = false;
              }),
            ),
          ],
          const SizedBox(height: 30),
          Button(
            title: saved ? 'Preferences saved' : 'Save preferences',
            variant: ButtonVariant.filled,
            onPressed: saved
                ? null
                : () => setState(() {
                    saved = true;
                  }),
          ),
          const SizedBox(height: 16),
          Text(
            'Changes stay in this preview until Reset.',
            style: TextStyle(fontSize: 13, color: foreground),
          ),
        ],
      ),
    );
  }
}

class LibraryStatus extends StatefulWidget {
  final String initialStatus;
  const LibraryStatus({super.key, required this.initialStatus});
  @override
  State<LibraryStatus> createState() => _LibraryStatusState();
}

class _LibraryStatusState extends State<LibraryStatus> {
  String status = '';
  @override
  void initState() {
    super.initState();
    status = widget.initialStatus;
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    color: paper,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        label('YOUR LIBRARY'),
        const SizedBox(height: 22),
        if (status == 'loading') ...[
          const CircularProgressIndicator(),
          const SizedBox(height: 18),
          const Text(
            'Finding your books…',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          Button(
            title: 'Finish loading',
            variant: ButtonVariant.plain,
            onPressed: () => setState(() {
              status = 'ready';
            }),
          ),
        ] else if (status == 'error') ...[
          const Text(
            'Couldn’t load your shelf',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          const Text('Your books are safe. Give it another try.'),
          const SizedBox(height: 22),
          Button(
            title: 'Try again',
            variant: ButtonVariant.filled,
            color: ink,
            onPressed: () => setState(() {
              status = 'loading';
            }),
          ),
        ] else if (status == 'empty') ...[
          const Text(
            'Room for your first book',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          const Text('Start with something you’ve been meaning to read.'),
          const SizedBox(height: 22),
          Button(
            title: 'Add sample book',
            variant: ButtonVariant.filled,
            color: ink,
            onPressed: () => setState(() {
              status = 'ready';
            }),
          ),
        ] else ...[
          const Text(
            'Your shelf is ready',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              cover('The\nCreative\nAct', const Color(0xFFB5694E)),
              const SizedBox(width: 16),
              const Expanded(
                child: Text(
                  'The Creative Act\nRick Rubin',
                  style: TextStyle(fontSize: 17),
                ),
              ),
            ],
          ),
        ],
      ],
    ),
  );
}
