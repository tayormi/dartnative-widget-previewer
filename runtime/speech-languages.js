// Language identifiers and labels follow the SDK. Samples are browser examples;
// the SDK's private test-string implementation is not distributed as source.
const rows = [
  ['en', 'English', 'English', 'Hello! This is SuperTonic, running fully on-device.'],
  ['ko', 'Korean', '한국어', '안녕하세요! 오늘도 좋은 하루 보내세요.'],
  ['es', 'Spanish', 'Español', '¡Hola! Espero que tengas un buen día.'],
  ['pt', 'Portuguese', 'Português', 'Olá! Espero que você tenha um bom dia.'],
  ['fr', 'French', 'Français', 'Bonjour ! Je vous souhaite une bonne journée.'],
  ['it', 'Italian', 'Italiano', 'Ciao! Ti auguro una buona giornata.'],
  ['ar', 'Arabic', 'العربية', 'مرحباً! أتمنى لك يوماً سعيداً.'],
  ['bg', 'Bulgarian', 'Български', 'Здравейте! Пожелавам ви хубав ден.'],
  ['hr', 'Croatian', 'Hrvatski', 'Pozdrav! Želim vam ugodan dan.'],
  ['cs', 'Czech', 'Čeština', 'Dobrý den! Přeji vám krásný den.'],
  ['da', 'Danish', 'Dansk', 'Hej! Jeg ønsker dig en god dag.'],
  ['nl', 'Dutch', 'Nederlands', 'Hallo! Ik wens je een fijne dag.'],
  ['et', 'Estonian', 'Eesti', 'Tere! Soovin sulle ilusat päeva.'],
  ['fi', 'Finnish', 'Suomi', 'Hei! Toivotan sinulle hyvää päivää.'],
  ['de', 'German', 'Deutsch', 'Hallo! Ich wünsche dir einen schönen Tag.'],
  ['el', 'Greek', 'Ελληνικά', 'Γεια σας! Σας εύχομαι μια όμορφη μέρα.'],
  ['hi', 'Hindi', 'हिन्दी', 'नमस्ते! आपका दिन शुभ हो।'],
  ['hu', 'Hungarian', 'Magyar', 'Szia! Szép napot kívánok neked.'],
  ['id', 'Indonesian', 'Bahasa Indonesia', 'Halo! Semoga harimu menyenangkan.'],
  ['ja', 'Japanese', '日本語', 'こんにちは！今日も良い一日をお過ごしください。'],
  ['lv', 'Latvian', 'Latviešu', 'Sveiki! Novēlu jums jauku dienu.'],
  ['lt', 'Lithuanian', 'Lietuvių', 'Sveiki! Linkiu jums gražios dienos.'],
  ['pl', 'Polish', 'Polski', 'Cześć! Życzę ci miłego dnia.'],
  ['ro', 'Romanian', 'Română', 'Bună! Îți doresc o zi frumoasă.'],
  ['ru', 'Russian', 'Русский', 'Здравствуйте! Желаю вам хорошего дня.'],
  ['sk', 'Slovak', 'Slovenčina', 'Dobrý deň! Prajem vám krásny deň.'],
  ['sl', 'Slovenian', 'Slovenščina', 'Pozdravljeni! Želim vam lep dan.'],
  ['sv', 'Swedish', 'Svenska', 'Hej! Jag önskar dig en trevlig dag.'],
  ['tr', 'Turkish', 'Türkçe', 'Merhaba! Sana güzel bir gün diliyorum.'],
  ['uk', 'Ukrainian', 'Українська', 'Вітаю! Бажаю вам гарного дня.'],
  ['vi', 'Vietnamese', 'Tiếng Việt', 'Xin chào! Chúc bạn một ngày tốt lành.'],
];
export const speechLanguages = rows.map(([code, name, nativeName]) => ({
  code,
  name,
  nativeName,
  valueType: 'TTSLanguage',
}));
export const speechSample = (code) => {
  const row = rows.find((r) => r[0] === code);
  if (!row) throw Error('Unknown speech language.');
  return row[3];
};
