/**
 * Lexicons powering the detectors.
 *
 * Two families live here:
 *  - AI phrase / transition / hedge lists used as stylistic "tells".
 *  - Function-word lists used by the built-in language identifier.
 *
 * Everything is deliberately curated and readable so it can be audited and
 * extended. Contributions adding languages are welcome.
 */

/**
 * Phrases that large language models disproportionately produce.
 * Keys are matched case-insensitively on normalised text.
 * `weight` is relative importance (1 = weak tell, 3 = strong tell).
 */
export const AI_PHRASES = [
  // English
  { p: 'it is important to note', w: 3 },
  { p: 'it is worth noting', w: 3 },
  { p: 'it is crucial to', w: 2 },
  { p: "in today's fast-paced world", w: 3 },
  { p: 'in the ever-evolving', w: 3 },
  { p: 'in the realm of', w: 3 },
  { p: 'delve into', w: 3 },
  { p: 'a testament to', w: 3 },
  { p: 'navigate the complexities', w: 3 },
  { p: 'unlock the potential', w: 3 },
  { p: 'game-changer', w: 2 },
  { p: 'cutting-edge', w: 2 },
  { p: 'seamless', w: 1 },
  { p: 'leverage', w: 1 },
  { p: 'robust', w: 1 },
  { p: 'comprehensive', w: 1 },
  { p: 'furthermore', w: 2 },
  { p: 'moreover', w: 2 },
  { p: 'additionally', w: 2 },
  { p: 'however, it', w: 1 },
  { p: 'in conclusion', w: 2 },
  { p: 'in summary', w: 2 },
  { p: 'overall,', w: 1 },
  { p: 'on the other hand', w: 1 },
  { p: 'as an ai language model', w: 3 },
  { p: 'i cannot fulfill', w: 3 },
  { p: 'it is essential to', w: 2 },
  { p: 'plays a crucial role', w: 3 },
  { p: 'plays a vital role', w: 3 },
  { p: 'a wide range of', w: 1 },
  { p: 'when it comes to', w: 1 },
  { p: 'not only', w: 1 },
  { p: 'but also', w: 1 },
  { p: 'whether you are', w: 2 },
  { p: 'look no further', w: 3 },
  { p: 'in this article', w: 2 },
  { p: 'let us explore', w: 2 },
  { p: 'embark on', w: 3 },
  { p: 'tapestry', w: 3 },
  { p: 'realm', w: 2 },
  { p: 'pivotal', w: 2 },
  { p: 'underscores', w: 2 },
  { p: 'multifaceted', w: 2 },
  { p: 'meticulous', w: 1 },
  { p: 'holistic', w: 2 },
  // French
  { p: "il est important de noter", w: 3 },
  { p: "il convient de noter", w: 3 },
  { p: 'à l\u2019ère du numérique', w: 3 },
  { p: 'dans le monde d\u2019aujourd\u2019hui', w: 3 },
  { p: 'plongeons dans', w: 3 },
  { p: 'un large éventail', w: 2 },
  { p: 'en conclusion', w: 2 },
  { p: 'en résumé', w: 2 },
  { p: 'de plus,', w: 2 },
  { p: 'par ailleurs', w: 2 },
  { p: 'témoigne de', w: 2 },
  { p: 'jouer un rôle crucial', w: 3 },
  { p: 'il est essentiel de', w: 2 },
  { p: 'force est de constater', w: 2 },
  // Spanish
  { p: 'es importante señalar', w: 3 },
  { p: 'cabe destacar', w: 3 },
  { p: 'en el mundo actual', w: 3 },
  { p: 'en conclusión', w: 2 },
  { p: 'en resumen', w: 2 },
  { p: 'además,', w: 2 },
  { p: 'un amplio abanico', w: 2 },
  { p: 'juega un papel crucial', w: 3 },
  // German
  { p: 'es ist wichtig zu beachten', w: 3 },
  { p: 'in der heutigen schnelllebigen welt', w: 3 },
  { p: 'zusammenfassend lässt sich sagen', w: 3 },
  { p: 'eine wichtige rolle', w: 3 },
  { p: 'darüber hinaus', w: 2 },
  { p: 'des weiteren', w: 1 },
  // Italian
  { p: 'è importante notare', w: 3 },
  { p: 'nel mondo di oggi', w: 3 },
  { p: 'in conclusione', w: 2 },
  { p: 'inoltre,', w: 2 },
  // Portuguese
  { p: 'é importante notar', w: 3 },
  { p: 'no mundo atual', w: 3 },
  { p: 'em conclusão', w: 2 },
  { p: 'além disso', w: 2 },
  // Dutch
  { p: 'het is belangrijk op te merken', w: 3 },
  { p: 'in de hedendaagse wereld', w: 3 },
  { p: 'bovendien', w: 2 },
  // Other
  { p: 'важно отметить', w: 3 },
  { p: 'в современном мире', w: 3 },
  { p: 'es importante tener en cuenta', w: 2 },
];

/** Sentence-initial discourse markers that LLMs over-use. */
export const TRANSITIONS = [
  'however', 'moreover', 'furthermore', 'additionally', 'therefore',
  'consequently', 'nevertheless', 'nonetheless', 'meanwhile', 'likewise',
  'similarly', 'in addition', 'as a result', 'for instance', 'for example',
  'in contrast', 'on the contrary', 'that being said', 'having said that',
  'cela dit', 'en outre', 'de plus', 'par conséquent', 'toutefois', 'néanmoins',
  'además', 'sin embargo', 'por lo tanto', 'asimismo', 'no obstante',
  'darüber hinaus', 'außerdem', 'allerdings', 'dennoch', 'folglich',
  'inoltre', 'tuttavia', 'pertanto', 'inoltre',
  'além disso', 'no entanto', 'portanto', 'bovendien', 'daarom',
  'кроме того', 'однако', 'следовательно', 'тем не менее',
];

/** Hedging / filler constructions. */
export const HEDGES = [
  'it is important', 'it is worth', 'it should be noted', 'generally speaking',
  'in many cases', 'to some extent', 'arguably', 'one could argue',
  'il est important', 'il convient', 'dans une certaine mesure',
  'es importante', 'en cierto modo', 'es ist wichtig',
];

/** First/second person pronouns — a proxy for personal, human voice. */
export const PERSONAL_PRONOUNS = [
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'yours',
  'je', 'j', 'moi', 'mon', 'ma', 'mes', 'nous', 'notre', 'nos', 'vous', 'votre', 'vos',
  'yo', 'me', 'mi', 'nosotros', 'nuestro', 'tú', 'tu', 'vosotros', 'usted',
  'ich', 'mich', 'mir', 'wir', 'uns', 'unser', 'du', 'dich', 'dir', 'sie', 'ihr',
  'io', 'noi', 'nostro', 'tu', 'voi', 'loro',
  'eu', 'nós', 'nosso', 'você', 'vocês',
  'ik', 'wij', 'ons', 'jij', 'je', 'u',
  'я', 'мы', 'наш', 'ты', 'вы', 'ваш',
];

/**
 * Function words per language, ordered roughly by frequency.
 * Used for the stopword-overlap language identifier.
 */
export const STOPWORDS = {
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'it', 'for', 'as', 'with', 'on', 'was', 'are', 'be', 'this', 'by', 'not', 'or', 'from', 'at', 'which', 'but', 'have', 'has', 'had', 'they', 'you', 'we', 'their', 'there', 'will', 'would', 'can', 'could', 'should', 'if', 'when', 'what', 'who', 'how', 'than', 'then', 'so', 'into', 'about', 'more', 'some', 'such', 'only', 'also', 'been', 'were', 'its', 'our'],
  fr: ['le', 'de', 'un', 'être', 'et', 'à', 'il', 'avoir', 'ne', 'je', 'son', 'que', 'se', 'qui', 'ce', 'dans', 'en', 'du', 'elle', 'au', 'pour', 'pas', 'vous', 'par', 'sur', 'faire', 'plus', 'dire', 'me', 'on', 'mon', 'lui', 'nous', 'comme', 'mais', 'pouvoir', 'avec', 'tout', 'aller', 'voir', 'bien', 'où', 'sans', 'tu', 'ou', 'leur', 'homme', 'si', 'deux', 'moi', 'votre', 'cette', 'aux', 'est', 'les', 'des', 'une', 'sont', 'était', 'cela', 'donc', 'aussi', 'bonjour', 'salut', 'merci', 'comment'],
  es: ['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'hola', 'gracias', 'estás', 'ustedes'],
  de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über', 'einen', 'so', 'zum', 'war', 'haben', 'nur', 'oder', 'aber', 'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein', 'wurde', 'sei', 'ich', 'wir', 'nicht', 'hallo', 'danke', 'bitte'],
  it: ['di', 'e', 'il', 'la', 'che', 'in', 'un', 'a', 'per', 'è', 'non', 'con', 'una', 'su', 'da', 'sono', 'come', 'le', 'si', 'dei', 'nel', 'anche', 'più', 'lo', 'ma', 'se', 'questo', 'della', 'hanno', 'essere', 'o', 'alla', 'tra', 'al', 'gli', 'tutto', 'quando', 'loro', 'sia', 'cosa', 'solo', 'quindi', 'io', 'noi'],
  pt: ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'depois', 'sem', 'mesmo', 'olá', 'obrigado', 'você', 'vocês', 'estou'],
  nl: ['de', 'en', 'het', 'van', 'een', 'in', 'is', 'dat', 'op', 'te', 'zijn', 'voor', 'met', 'die', 'niet', 'aan', 'er', 'om', 'ook', 'als', 'maar', 'bij', 'of', 'uit', 'dan', 'naar', 'worden', 'door', 'over', 'hij', 'ze', 'was', 'heeft', 'nog', 'kan', 'wij', 'je', 'ik', 'meer', 'deze', 'tot', 'geen', 'hebben', 'werd', 'zal'],
  ru: ['и', 'в', 'не', 'на', 'что', 'я', 'с', 'он', 'как', 'а', 'то', 'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот', 'от', 'меня', 'еще', 'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли', 'если', 'уже', 'или', 'ни', 'быть', 'был', 'него'],
  uk: ['і', 'в', 'не', 'на', 'що', 'я', 'з', 'він', 'як', 'а', 'то', 'все', 'вона', 'так', 'його', 'але', 'та', 'ти', 'до', 'у', 'ж', 'ви', 'за', 'би', 'по', 'тільки', 'її', 'мені', 'було', 'ось', 'від', 'мене', 'ще', 'немає', 'про', 'із', 'йому', 'тепер', 'коли', 'навіть', 'ну', 'раптом', 'чи', 'якщо', 'вже', 'або', 'ні', 'бути', 'був'],
  pl: ['w', 'i', 'nie', 'na', 'to', 'z', 'że', 'się', 'do', 'jest', 'o', 'jak', 'a', 'ale', 'tak', 'po', 'od', 'za', 'ja', 'ty', 'on', 'ona', 'my', 'wy', 'oni', 'być', 'był', 'są', 'dla', 'czy', 'już', 'tylko', 'bardzo', 'może', 'gdy', 'albo', 'oraz', 'jeszcze', 'przez', 'jego', 'jej', 'ich'],
  cs: ['a', 'se', 'v', 'na', 'je', 'že', 'o', 's', 'z', 'do', 'i', 'to', 'k', 've', 'ale', 'jsem', 'jako', 'za', 'po', 'od', 'si', 'by', 'byl', 'jsou', 'aby', 'nebo', 'už', 'jen', 'tak', 'může', 'který', 'která', 'které', 'pro', 'před', 'při', 'jeho', 'její'],
  sk: ['a', 'sa', 'v', 'na', 'je', 'že', 'o', 's', 'z', 'do', 'i', 'to', 'k', 'vo', 'ale', 'som', 'ako', 'za', 'po', 'od', 'si', 'by', 'bol', 'sú', 'aby', 'alebo', 'už', 'len', 'tak', 'môže', 'ktorý', 'ktorá', 'ktoré', 'pre', 'pred', 'pri', 'jeho', 'jej'],
  ro: ['de', 'la', 'în', 'și', 'a', 'cu', 'un', 'o', 'este', 'să', 'pe', 'care', 'nu', 'se', 'ce', 'mai', 'lui', 'din', 'pentru', 'dar', 'sau', 'ca', 'sunt', 'fi', 'fost', 'sunt', 'dacă', 'fără', 'poate', 'doar', 'când', 'unde', 'eu', 'noi', 'ei', 'prin', 'despre'],
  hu: ['a', 'az', 'és', 'hogy', 'nem', 'is', 'egy', 'meg', 'van', 'de', 'mint', 'már', 'csak', 'el', 'ez', 'ha', 'ki', 'be', 'fel', 'le', 'vagy', 'még', 'azt', 'volt', 'lesz', 'mert', 'aki', 'ami', 'amely', 'után', 'előtt', 'között', 'szerint', 'által', 'általában'],
  bg: ['и', 'в', 'не', 'на', 'че', 'аз', 'с', 'той', 'като', 'а', 'то', 'всичко', 'тя', 'така', 'него', 'но', 'да', 'ти', 'за', 'у', 'же', 'вие', 'по', 'би', 'само', 'ней', 'ми', 'беше', 'ето', 'от', 'мен', 'още', 'няма', 'за', 'от', 'него', 'сега', 'когато', 'дори'],
  hr: ['i', 'u', 'je', 'na', 'se', 'da', 'za', 'od', 's', 'o', 'a', 'su', 'koji', 'koja', 'koje', 'ali', 'bi', 'bio', 'bila', 'nije', 'što', 'kao', 'još', 'samo', 'može', 'ako', 'ili', 'već', 'sve', 'kada', 'gdje', 'njegov', 'njezin'],
  sr: ['и', 'у', 'је', 'на', 'се', 'да', 'за', 'од', 'с', 'о', 'а', 'су', 'који', 'која', 'које', 'али', 'би', 'био', 'била', 'није', 'што', 'као', 'још', 'само', 'може', 'ако', 'или', 'већ', 'све', 'када', 'где', 'његов'],
  sl: ['in', 'je', 'v', 'na', 'se', 'da', 'za', 'od', 'z', 'o', 'a', 's', 'ki', 'ka', 'ko', 'ali', 'bi', 'bil', 'bila', 'ni', 'kot', 'še', 'samo', 'lahko', 'če', 'ali', 'že', 'kaj', 'ko', 'kdaj', 'kje', 'njegov'],
  lt: ['ir', 'yra', 'į', 'kad', 'ne', 'su', 'kaip', 'jis', 'ji', 'bet', 'ar', 'tai', 'jau', 'tik', 'gali', 'jei', 'arba', 'dar', 'kai', 'kur', 'jo', 'jos', 'nuo', 'apie', 'po', 'prie', 'per', 'kuris', 'kuri'],
  lv: ['un', 'ir', 'ka', 'ne', 'ar', 'tas', 'viņš', 'viņa', 'bet', 'jau', 'tikai', 'var', 'ja', 'vai', 'vēl', 'kad', 'kur', 'no', 'par', 'pēc', 'pie', 'kurš', 'kura', 'viņi', 'mēs', 'es'],
  et: ['ja', 'on', 'ei', 'see', 'ta', 'et', 'mis', 'kui', 'ta', 'aga', 'juba', 'vaid', 'võib', 'kui', 'või', 'veel', 'millal', 'kus', 'tema', 'meie', 'nad', 'oma', 'oli', 'seda', 'sellest'],
  fi: ['ja', 'on', 'ei', 'että', 'se', 'hän', 'oli', 'kun', 'niin', 'mutta', 'tai', 'jo', 'vain', 'voi', 'jos', 'vielä', 'kun', 'missä', 'joka', 'me', 'te', 'he', 'tämä', 'ne', 'sen', 'myös', 'kuin', 'sitten'],
  sv: ['och', 'i', 'att', 'det', 'som', 'en', 'på', 'är', 'av', 'för', 'med', 'till', 'den', 'har', 'de', 'inte', 'om', 'ett', 'han', 'men', 'var', 'jag', 'sig', 'från', 'vi', 'så', 'kan', 'när', 'år', 'efter', 'hur', 'du', 'vad', 'mig', 'dig', 'mycket'],
  da: ['og', 'i', 'at', 'det', 'er', 'en', 'til', 'på', 'de', 'med', 'han', 'af', 'for', 'ikke', 'der', 'var', 'som', 'men', 'et', 'den', 'har', 'om', 'vi', 'så', 'kan', 'når', 'efter', 'jeg', 'hun', 'dem', 'hvordan', 'du', 'hvad', 'mig', 'dig', 'meget'],
  no: ['og', 'i', 'det', 'er', 'en', 'til', 'på', 'de', 'med', 'han', 'av', 'for', 'ikke', 'den', 'som', 'var', 'men', 'et', 'har', 'om', 'vi', 'så', 'kan', 'når', 'etter', 'jeg', 'hun', 'dem', 'også', 'bare', 'hvordan', 'du', 'hva', 'meg', 'deg', 'mye'],
  is: ['og', 'að', 'í', 'er', 'það', 'hann', 'hún', 'en', 'á', 'sem', 'við', 'af', 'fyrir', 'með', 'til', 'ekki', 'þeir', 'ég', 'þú', 'þið', 'vera', 'var', 'hefur', 'getur', 'þegar'],
  el: ['και', 'το', 'του', 'της', 'των', 'να', 'σε', 'με', 'για', 'από', 'που', 'είναι', 'δεν', 'θα', 'τα', 'οι', 'ο', 'η', 'ένα', 'μια', 'αλλά', 'ή', 'αν', 'όταν', 'πώς', 'αυτό', 'ότι', 'μόνο', 'πολύ', 'μπορεί'],
  tr: ['bir', 've', 'bu', 'için', 'ile', 'de', 'da', 'ne', 'o', 'ki', 'ama', 'gibi', 'daha', 'çok', 'en', 'var', 'yok', 'olarak', 'kadar', 'sonra', 'önce', 'göre', 'her', 'ben', 'sen', 'biz', 'onlar', 'değil', 'ise', 'ancak'],
  az: ['bir', 'və', 'bu', 'üçün', 'ilə', 'də', 'da', 'nə', 'o', 'ki', 'amma', 'kimi', 'daha', 'çox', 'ən', 'var', 'yox', 'olaraq', 'qədər', 'sonra', 'əvvəl', 'görə', 'hər', 'mən', 'sən', 'biz', 'onlar', 'deyil'],
  kk: ['және', 'бір', 'бұл', 'үшін', 'мен', 'да', 'де', 'не', 'ол', 'бірақ', 'сияқты', 'көп', 'бар', 'жоқ', 'дейін', 'кейін', 'бұрын', 'әр', 'мен', 'сен', 'біз', 'олар', 'емес'],
  uz: ['va', 'bir', 'bu', 'uchun', 'bilan', 'da', 'nima', 'u', 'lekin', 'kabi', 'ko\u2019p', 'bor', 'yo\u2019q', 'gacha', 'keyin', 'oldin', 'har', 'men', 'sen', 'biz', 'ular', 'emas'],
  id: ['yang', 'dan', 'di', 'itu', 'dengan', 'untuk', 'tidak', 'ini', 'dari', 'dalam', 'akan', 'pada', 'juga', 'saya', 'ke', 'karena', 'tersebut', 'bisa', 'ada', 'mereka', 'lebih', 'kata', 'tahun', 'sudah', 'atau', 'saat', 'oleh', 'seperti', 'harus', 'hanya'],
  ms: ['yang', 'dan', 'di', 'itu', 'dengan', 'untuk', 'tidak', 'ini', 'dari', 'dalam', 'akan', 'pada', 'juga', 'saya', 'ke', 'kerana', 'tersebut', 'boleh', 'ada', 'mereka', 'lebih', 'kata', 'tahun', 'sudah', 'atau', 'bila', 'oleh', 'seperti', 'mesti', 'hanya'],
  tl: ['ang', 'ng', 'sa', 'na', 'at', 'ay', 'mga', 'ito', 'si', 'ni', 'para', 'hindi', 'ako', 'siya', 'kami', 'kayo', 'sila', 'nang', 'may', 'mayroon', 'isang', 'rin', 'lang', 'naman', 'pero', 'kung', 'dahil', 'upang', 'kapag'],
  vi: ['của', 'và', 'có', 'là', 'trong', 'được', 'cho', 'không', 'với', 'người', 'này', 'những', 'đã', 'khi', 'một', 'các', 'để', 'ra', 'theo', 'như', 'từ', 'đến', 'về', 'nhưng', 'thì', 'cũng', 'sẽ', 'vào', 'hay', 'nếu'],
  sw: ['na', 'ya', 'wa', 'kwa', 'ni', 'la', 'katika', 'hii', 'hiyo', 'huyu', 'watu', 'sana', 'pia', 'lakini', 'au', 'kama', 'hata', 'basi', 'kwamba', 'kuwa', 'nini', 'wapi', 'mimi', 'wewe', 'sisi', 'wao'],
  af: ['die', 'en', 'van', 'is', 'in', 'het', 'nie', 'op', 'vir', 'met', 'wat', 'aan', 'sy', 'as', 'maar', 'of', 'uit', 'om', 'ook', 'word', 'deur', 'oor', 'hy', 'sy', 'was', 'het', 'kan', 'ons'],
  ca: ['de', 'la', 'el', 'que', 'i', 'en', 'un', 'a', 'els', 'les', 'per', 'amb', 'una', 'no', 'és', 'del', 'com', 'més', 'però', 'si', 'ho', 'ja', 'quan', 'on', 'tot', 'també', 'fins', 'des', 'aquest'],
  gl: ['de', 'a', 'o', 'que', 'e', 'en', 'un', 'para', 'con', 'non', 'unha', 'os', 'se', 'na', 'por', 'máis', 'as', 'como', 'pero', 'foi', 'ao', 'das', 'ten', 'seu', 'súa', 'ou', 'ser', 'cando', 'moi', 'hai'],
  eu: ['eta', 'da', 'ez', 'du', 'bat', 'izan', 'dira', 'hori', 'hau', 'bere', 'baina', 'edo', 'ere', 'orain', 'nire', 'zure', 'gure', 'hauek', 'zuen', 'dute', 'ez', 'zen', 'nola', 'non', 'oso'],
  cy: ['y', 'yn', 'i', 'o', 'a', 'ac', 'mae', 'ei', 'ar', 'ond', 'gyda', 'gan', 'am', 'fel', 'ond', 'bod', 'wedi', 'roedd', 'bydd', 'nid', 'hyn', 'hynny', 'ef', 'hi', 'ni', 'chi', 'nhw'],
  sq: ['dhe', 'të', 'në', 'është', 'një', 'për', 'me', 'nga', 'që', 'nuk', 'si', 'po', 'kjo', 'ky', 'ai', 'ajo', 'ata', 'ato', 'por', 'ose', 'më', 'shumë', 'kur', 'ku', 'kam', 'ke', 'kemi'],
  mk: ['и', 'на', 'не', 'во', 'е', 'што', 'се', 'да', 'за', 'со', 'од', 'го', 'ја', 'но', 'или', 'уште', 'само', 'може', 'ако', 'како', 'кога', 'каде', 'тој', 'таа', 'ние', 'тие'],
  be: ['і', 'у', 'не', 'на', 'што', 'я', 'з', 'ён', 'як', 'а', 'то', 'усё', 'яна', 'так', 'яго', 'але', 'да', 'ты', 'да', 'за', 'бы', 'па', 'толькі', 'яе', 'мне', 'было', 'вось', 'ад', 'мяне'],
  hy: ['և', 'է', 'որ', 'այս', 'մի', 'համար', 'ինչ', 'նա', 'բայց', 'կամ', 'նաև', 'շատ', 'կա', 'չկա', 'մինչև', 'հետո', 'առաջ', 'ամեն', 'ես', 'դու', 'մենք', 'նրանք', 'ոչ'],
  ka: ['და', 'არის', 'რომ', 'ეს', 'ერთი', 'ამისთვის', 'რა', 'ის', 'მაგრამ', 'ან', 'ასევე', 'ძალიან', 'არის', 'არ', 'მდე', 'შემდე', 'წინ', 'ყველა', 'მე', 'შენ', 'ჩვენ', 'ისინი', 'არა'],
  // Non-Latin scripts (a few function words are enough once the script is known)
  ar: ['في', 'من', 'على', 'أن', 'إلى', 'هذا', 'التي', 'الذي', 'مع', 'كان', 'هو', 'هي', 'لا', 'ما', 'عن', 'هذه', 'لكن', 'أو', 'قد', 'كل', 'بين', 'بعد', 'قبل', 'هناك', 'حتى', 'إذا'],
  fa: ['و', 'در', 'به', 'از', 'که', 'این', 'را', 'با', 'است', 'برای', 'آن', 'یک', 'می', 'شود', 'های', 'هم', 'یا', 'تا', 'بر', 'بود', 'خود', 'هر', 'من', 'ما', 'شما', 'آنها'],
  ur: ['اور', 'میں', 'سے', 'کا', 'کہ', 'یہ', 'پر', 'کو', 'نہیں', 'ہے', 'کی', 'کے', 'وہ', 'ایک', 'لیکن', 'یا', 'بھی', 'تک', 'ہی', 'تو', 'جس', 'ہم', 'آپ'],
  he: ['של', 'את', 'על', 'לא', 'זה', 'עם', 'הוא', 'היא', 'אני', 'אנחנו', 'אבל', 'או', 'גם', 'כל', 'אם', 'כי', 'מה', 'יש', 'אין', 'עד', 'אחרי', 'לפני', 'היה', 'היה'],
  hi: ['और', 'का', 'में', 'है', 'को', 'से', 'पर', 'यह', 'एक', 'कि', 'नहीं', 'भी', 'हो', 'कर', 'लिए', 'था', 'जो', 'थे', 'गया', 'लेकिन', 'या', 'तक', 'ही', 'तो', 'वह', 'हम', 'मैं', 'तुम', 'आप', 'मुझे', 'हमें', 'हैं', 'कैसे', 'क्या', 'क्यों', 'बहुत', 'अच्छा', 'ठीक', 'सब', 'परिवार', 'उम्मीद', 'जाता', 'करना', 'रहा', 'रही', 'यहाँ', 'वहाँ'],
  mr: ['आणि', 'च्या', 'मध्ये', 'आहे', 'ला', 'पासून', 'वर', 'हे', 'एक', 'की', 'नाही', 'सुद्धा', 'हो', 'करून', 'साठी', 'होते', 'जे', 'पण', 'किंवा', 'पर्यंत', 'तो', 'आम्ही', 'मला', 'तुम्ही', 'त्यांनी', 'मराठी'],
  ne: ['र', 'को', 'मा', 'हो', 'छ', 'बाट', 'यो', 'एक', 'कि', 'छैन', 'पनि', 'गर्न', 'लागि', 'थियो', 'जो', 'तर', 'वा', 'सम्म', 'हामी', 'भएको', 'गरेको', 'हरु', 'छन्', 'थिए', 'हुन्छ', 'मलाई', 'तपाईं', 'उनी'],
  bn: ['এবং', 'এর', 'এই', 'একটি', 'করে', 'হয়', 'থেকে', 'জন্য', 'না', 'আর', 'কিন্তু', 'বা', 'আমরা', 'সে', 'তারা', 'কি', 'যখন', 'যে', 'ও', 'পর'],
  pa: ['ਅਤੇ', 'ਦਾ', 'ਵਿੱਚ', 'ਹੈ', 'ਨੂੰ', 'ਤੋਂ', 'ਇੱਕ', 'ਕਿ', 'ਨਹੀਂ', 'ਵੀ', 'ਹੋ', 'ਲਈ', 'ਸੀ', 'ਜੋ', 'ਪਰ', 'ਜਾਂ', 'ਤੱਕ', 'ਅਸੀਂ'],
  gu: ['અને', 'ના', 'માં', 'છે', 'ને', 'થી', 'એક', 'કે', 'નથી', 'પણ', 'હોય', 'માટે', 'હતું', 'જે', 'પરંતુ', 'અથવા', 'અમે', 'તે'],
  ta: ['மற்றும்', 'இந்த', 'ஒரு', 'உள்ளது', 'இருந்து', 'க்கு', 'என்று', 'இல்லை', 'மேலும்', 'ஆனால்', 'அல்லது', 'நான்', 'நாங்கள்', 'அவர்', 'இது', 'என'],
  te: ['మరియు', 'ఈ', 'ఒక', 'ఉంది', 'నుండి', 'కు', 'అని', 'లేదు', 'కూడా', 'కానీ', 'లేదా', 'మేము', 'అతను', 'ఇది', 'అనే'],
  kn: ['ಮತ್ತು', 'ಈ', 'ಒಂದು', 'ಇದೆ', 'ಇಂದ', 'ಗೆ', 'ಎಂದು', 'ಇಲ್ಲ', 'ಸಹ', 'ಆದರೆ', 'ಅಥವಾ', 'ನಾವು', 'ಅವನು', 'ಇದು', 'ಎಂದ'],
  ml: ['ഒപ്പം', 'ഈ', 'ഒരു', 'ഉണ്ട്', 'നിന്ന്', 'ന്', 'എന്ന്', 'ഇല്ല', 'കൂടി', 'പക്ഷേ', 'അല്ലെങ്കിൽ', 'ഞങ്ങൾ', 'അവൻ', 'ഇത്', 'എന്ന'],
  th: ['และ', 'ของ', 'ที่', 'ใน', 'เป็น', 'การ', 'ได้', 'ไม่', 'มี', 'ว่า', 'ให้', 'จาก', 'นี้', 'จะ', 'ก็', 'แต่', 'หรือ', 'กับ', 'เพื่อ', 'เมื่อ'],
  lo: ['ແລະ', 'ຂອງ', 'ທີ່', 'ໃນ', 'ເປັນ', 'ການ', 'ໄດ້', 'ບໍ່', 'ມີ', 'ວ່າ', 'ໃຫ້', 'ຈາກ', 'ນີ້', 'ຈະ', 'ກໍ', 'ແຕ່', 'ຫຼື', 'ກັບ'],
  km: ['និង', 'នៃ', 'ក្នុង', 'ជា', 'ការ', 'បាន', 'មិន', 'មាន', 'ថា', 'ឱ្យ', 'ពី', 'នេះ', 'នឹង', 'ក៏', 'ប៉ុន្តែ', 'ឬ', 'ជាមួយ'],
  my: ['နှင့်', '၏', 'တွင်', 'သည်', 'ကို', 'မှ', 'တစ်', 'သော', 'မ', 'ရှိ', 'ဟု', 'ပေး', 'ဤ', 'မ', 'သော်', 'သို့'],
  si: ['සහ', 'මේ', 'එක්', 'විය', 'සිට', 'ට', 'යනු', 'නැත', 'ද', 'නමුත්', 'හෝ', 'අපි', 'ඔහු', 'මෙය', 'ලෙස'],
  am: ['እና', 'የ', 'በ', 'ነው', 'አንድ', 'ለ', 'ከ', 'ይህ', 'ሆኖ', 'አይ', 'ም', 'ተች', 'እኛ', 'እሱ', 'ይህ'],
  zh: ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'],
  ja: ['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる', 'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や', 'れる', 'など', 'なっ', 'ない', 'この', 'ため'],
  ko: ['이', '의', '는', '에', '를', '과', '가', '은', '한', '하다', '것', '있다', '수', '나', '등', '들', '그', '되다', '및', '에서', '로', '으로', '하다', '없다', '같다'],
};

/**
 * Character hints for Latin-script languages — strong, cheap discriminators.
 * Each key maps to a regex of diacritics almost exclusive to that language.
 */
export const CHAR_HINTS = {
  de: /[äöüß]/i,
  fr: /[àâçéèêëîïôùûüÿœ]/i,
  es: /[áéíñóúü¿¡]/i,
  pt: /[ãõáâàçéêíóôú]/i,
  it: /[àèéìòù]/i,
  nl: /[ij]/i,
  sv: /[åäö]/i,
  da: /[æøå]/i,
  no: /[æøå]/i,
  fi: /[äö]/i,
  pl: /[ąćęłńóśźż]/i,
  cs: /[ěščřžýáíéůúťďň]/i,
  sk: /[ľščťžýáíéôäĺŕ]/i,
  hu: /[őűáéíóöü]/i,
  ro: /[ăâîșțşţ]/i,
  tr: /[ğışİşçöü]/i,
  vi: /[ăâđêôơư]/i,
  is: /[þðæöáíúý]/i,
  lt: /[ąčęėįšųūž]/i,
  lv: /[āčēģīķļņšūž]/i,
  et: /[õäöüšž]/i,
  hr: /[čćđšž]/i,
  sr: /[čćđšž]/i,
  sl: /[čšž]/i,
  ca: /[·]/,
};

/** Unicode script ranges, checked in priority order. */
export const SCRIPTS = [
  { name: 'Hangul', lang: 'ko', re: /[\uAC00-\uD7AF\u1100-\u11FF]/u },
  { name: 'Hiragana', lang: 'ja', re: /[\u3040-\u309F]/u },
  { name: 'Katakana', lang: 'ja', re: /[\u30A0-\u30FF]/u },
  { name: 'Han', lang: 'zh', re: /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u },
  { name: 'Thai', lang: 'th', re: /[\u0E00-\u0E7F]/u },
  { name: 'Lao', lang: 'lo', re: /[\u0E80-\u0EFF]/u },
  { name: 'Khmer', lang: 'km', re: /[\u1780-\u17FF]/u },
  { name: 'Myanmar', lang: 'my', re: /[\u1000-\u109F]/u },
  { name: 'Sinhala', lang: 'si', re: /[\u0D80-\u0DFF]/u },
  { name: 'Tamil', lang: 'ta', re: /[\u0B80-\u0BFF]/u },
  { name: 'Telugu', lang: 'te', re: /[\u0C00-\u0C7F]/u },
  { name: 'Kannada', lang: 'kn', re: /[\u0C80-\u0CFF]/u },
  { name: 'Malayalam', lang: 'ml', re: /[\u0D00-\u0D7F]/u },
  { name: 'Bengali', lang: 'bn', re: /[\u0980-\u09FF]/u },
  { name: 'Gujarati', lang: 'gu', re: /[\u0A80-\u0AFF]/u },
  { name: 'Gurmukhi', lang: 'pa', re: /[\u0A00-\u0A7F]/u },
  { name: 'Devanagari', lang: 'hi', re: /[\u0900-\u097F]/u },
  { name: 'Arabic', lang: 'ar', re: /[\u0600-\u06FF\u0750-\u077F]/u },
  { name: 'Hebrew', lang: 'he', re: /[\u0590-\u05FF]/u },
  { name: 'Greek', lang: 'el', re: /[\u0370-\u03FF\u1F00-\u1FFF]/u },
  { name: 'Armenian', lang: 'hy', re: /[\u0530-\u058F]/u },
  { name: 'Georgian', lang: 'ka', re: /[\u10A0-\u10FF]/u },
  { name: 'Ethiopic', lang: 'am', re: /[\u1200-\u137F]/u },
  { name: 'Cyrillic', lang: null, re: /[\u0400-\u04FF]/u },
];

/** Languages that use Cyrillic and need stopword disambiguation. */
export const CYRILLIC_LANGS = ['ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk'];

/** Letters that appear in one Cyrillic language but not the others. */
export const CYRILLIC_HINTS = {
  uk: /[іїєґ]/i,
  be: /[ў]/i,
  sr: /[ђћџ]/i,
  mk: /[ќѓѕ]/i,
  kk: /[әғқңөұүһ]/i,
  bg: /[ъ]/i,
};
/** Right-to-left languages. */
export const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'dv', 'ps', 'sd', 'ug']);

export const LANGUAGE_NAMES = {
  en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', it: 'Italiano',
  pt: 'Português', nl: 'Nederlands', ru: 'Русский', uk: 'Українська',
  pl: 'Polski', cs: 'Čeština', sk: 'Slovenčina', ro: 'Română', hu: 'Magyar',
  bg: 'Български', hr: 'Hrvatski', sr: 'Српски', sl: 'Slovenščina',
  lt: 'Lietuvių', lv: 'Latviešu', et: 'Eesti', fi: 'Suomi', sv: 'Svenska',
  da: 'Dansk', no: 'Norsk', is: 'Íslenska', el: 'Ελληνικά', tr: 'Türkçe',
  az: 'Azərbaycanca', kk: 'Қазақша', uz: 'Oʻzbekcha', id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu', tl: 'Filipino', vi: 'Tiếng Việt', sw: 'Kiswahili',
  af: 'Afrikaans', ca: 'Català', gl: 'Galego', eu: 'Euskara', cy: 'Cymraeg',
  sq: 'Shqip', mk: 'Македонски', be: 'Беларуская', hy: 'Հայերեն',
  ka: 'ქართული', ar: 'العربية', fa: 'فارسی', ur: 'اردو', he: 'עברית',
  hi: 'हिन्दी', mr: 'मराठी', ne: 'नेपाली', bn: 'বাংলা', pa: 'ਪੰਜਾਬੀ',
  gu: 'ગુજરાતી', ta: 'தமிழ்', te: 'తెలుగు', kn: 'ಕನ್ನಡ', ml: 'മലയാളം',
  th: 'ไทย', lo: 'ລາວ', km: 'ខ្មែរ', my: 'မြန်မာ', si: 'සිංහල',
  am: 'አማርኛ', zh: '中文', ja: '日本語', ko: '한국어',
};
