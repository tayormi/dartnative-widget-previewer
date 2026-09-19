import 'package:dartnative/dartnative.dart';
import 'package:dartnative_preview/dartnative_preview.dart';

@DNPreview(
  name: 'Reading card · basic',
  group: 'Components',
  width: 340,
  height: 220,
)
Widget readingCardPreview() => const ReadingCard();

class ReadingCard extends StatefulWidget {
  const ReadingCard({super.key});
  @override
  State<ReadingCard> createState() => _ReadingCardState();
}

class _ReadingCardState extends State<ReadingCard> {
  bool reading = false;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: const Color(0xFFFFFFFF),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Image.asset('assets/dn-logo.png', width: 20, height: 20),
            const SizedBox(width: 8),
            Text(
              reading ? 'NOW READING' : 'ON YOUR SHELF',
              style: TextStyle(fontSize: 11, color: Color(0xFF767670)),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const Text(
          'The Creative Act',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        const Text(
          'Rick Rubin',
          style: TextStyle(fontSize: 16, color: Color(0xFF767670)),
        ),
        const SizedBox(height: 22),
        Button(
          title: reading ? 'Pause reading' : 'Continue reading',
          variant: ButtonVariant.filled,
          onPressed: () => setState(() {
            reading = !reading;
          }),
        ),
      ],
    ),
  );
}

@DNPreview(
  name: 'Reading session',
  group: 'Components',
  width: 340,
  height: 280,
)
Widget readingSessionPreview() => const ReadingSession();

class ReadingSession extends StatefulWidget {
  const ReadingSession({super.key});
  @override
  State<ReadingSession> createState() => _ReadingSessionState();
}

class _ReadingSessionState extends State<ReadingSession> {
  int pages = 0;
  @override
  void dispose() {
    print('DN_FIXTURE_DISPOSE reading-session pages=$pages');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: const Color(0xFFFFFFFF),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Evening reading',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 16),
        Text('$pages pages read', style: const TextStyle(fontSize: 32)),
        const SizedBox(height: 24),
        Button(
          title: 'Read 10 pages',
          variant: ButtonVariant.filled,
          onPressed: () => setState(() {
            pages += 10;
          }),
        ),
      ],
    ),
  );
}
