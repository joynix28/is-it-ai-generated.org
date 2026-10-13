import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, isRTL } from '../src/core/index.js';

const CASES = [
  ['fr', "Bonjour, je suis très heureux de vous rencontrer aujourd'hui, comment allez-vous ? J'espère que tout va bien."],
  ['es', 'Hola, ¿cómo estás? Espero que todo esté bien contigo y tu familia. Nos vemos mañana en el parque.'],
  ['en', 'Hey, I wanted to check whether you are still coming to the meeting tomorrow. Let me know if that works.'],
  ['de', 'Guten Tag, wie geht es Ihnen? Ich hoffe, alles ist gut mit Ihnen und Ihrer Familie. Bis morgen dann.'],
  ['it', 'Ciao, come stai? Spero che tutto vada bene con te e la tua famiglia. Ci vediamo domani al parco.'],
  ['pt', 'Olá, como você está? Espero que tudo esteja bem com você e sua família. Até amanhã no parque.'],
  ['nl', 'Hallo, hoe gaat het met je? Ik hoop dat alles goed is met jou en je familie. Tot morgen in het park.'],
  ['pl', 'Cześć, jak się masz? Mam nadzieję, że wszystko dobrze u ciebie i twojej rodziny. Do zobaczenia jutro.'],
  ['tr', 'Merhaba, nasılsın? Umarım her şey senin ve ailen için iyidir. Yarın parkta görüşürüz.'],
  ['sv', 'Hej, hur mår du? Jag hoppas att allt är bra med dig och din familj. Vi ses imorgon i parken.'],
  ['ru', 'Привет, как дела? Я надеюсь, что всё хорошо у тебя и твоей семьи. До завтра в парке.'],
  ['uk', 'Привіт, як справи? Я сподіваюсь, що все добре у тебе та твоєї родини. До завтра в парку.'],
  ['zh', '你好，今天天气很好，我们一起去公园散步吧。'],
  ['ja', 'こんにちは、今日はいい天気ですね。一緒に公園を散歩しませんか。'],
  ['ko', '안녕하세요, 오늘 날씨가 정말 좋네요. 같이 공원에서 산책할까요?'],
  ['ar', 'مرحبا، كيف حالك؟ أتمنى أن يكون كل شيء بخير معك ومع عائلتك. أراك غدا في الحديقة.'],
  ['hi', 'नमस्ते, आप कैसे हैं? मुझे उम्मीद है कि आप और आपके परिवार में सब ठीक है। कल मिलते हैं।'],
  ['th', 'สวัสดี สบายดีไหม ฉันหวังว่าทุกอย่างจะดีสำหรับคุณและครอบครัว เจอกันพรุ่งนี้'],
  ['el', 'Γεια σου, τι κάνεις; Ελπίζω να είναι όλα καλά με σένα και την οικογένειά σου. Τα λέμε αύριο.'],
  ['he', 'שלום, מה שלומך? אני מקווה שהכל בסדר איתך ועם המשפחה שלך. נתראה מחר.'],
];

for (const [expected, text] of CASES) {
  test(`detects ${expected}`, () => {
    const r = detectLanguage(text);
    assert.equal(r.lang, expected, `got ${r.lang} (top: ${r.scores.slice(0, 3).map((s) => `${s.lang}:${s.score}`).join(', ')})`);
  });
}

test('uses device and header hints for ambiguous text', () => {
  const r = detectLanguage('ok', { deviceLanguages: ['pt-BR'], acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8' });
  assert.equal(r.lang, 'pt');
});

test('flags right-to-left languages', () => {
  assert.equal(isRTL('ar'), true);
  assert.equal(isRTL('he'), true);
  assert.equal(isRTL('en'), false);
});

test('reports confidence in [0,1]', () => {
  const r = detectLanguage('Bonjour, comment allez-vous aujourd\u2019hui ?');
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
  assert.ok(Array.isArray(r.scores));
});
