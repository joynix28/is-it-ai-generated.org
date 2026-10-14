/**
 * Calibration anchors for the language-model juror.
 *
 * A perplexity number means nothing on its own: it depends on the language, the
 * register and the tokeniser. Before the model is allowed to vote, it must show
 * that it separates machine text from human text *in the language being read*.
 *
 * The worker scores one hand-written passage and one machine-written passage
 * from this table, in the reader's language. If machine text is not clearly more
 * predictable than human text, the model abstains: it has just demonstrated it
 * cannot tell them apart here, and guessing would be worse than silence.
 *
 * The passages are deliberately short and unremarkable. They are not examples of
 * good writing; they are a ruler.
 */

export interface AnchorPair {
  /** A casually hand-written passage in the language. */
  human: string;
  /** A machine-written passage in the same language, same register. */
  machine: string;
}

/** Kept under the model's window so calibration is two cheap inferences. */
export const ANCHORS: Record<string, AnchorPair> = {
  fr: {
    human: "Le train de 7h12 était encore en retard ce matin. J'ai poiroté vingt minutes sur le quai, sous la flotte, avec un café tiède qui fuyait. Ma voisine de palier m'a prêté son parapluie. Elle a soixante-douze ans, elle jure comme un charretier, et elle m'appelle « petit » alors que j'en ai quarante.",
    machine: "Dans le monde actuel en constante évolution, il est important de noter que les solutions innovantes jouent un rôle crucial. En outre, une approche globale facilite des résultats solides. Les équipes doivent naviguer dans la complexité d'un environnement en constante mutation. En conclusion, cela peut représenter un changement.",
  },
  en: {
    human: "The kettle broke this morning. I found the receipt, drove to the shop, and they swapped it, no questions. Took twenty minutes. Then I forgot the milk on the counter and had to go back.",
    machine: "In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations. Furthermore, a comprehensive approach facilitates robust outcomes across a wide range of use cases. In conclusion, innovation stands as a testament to organizational maturity.",
  },
  es: {
    human: 'El tren llegaba tarde otra vez. Esperé veinte minutos bajo la lluvia con un café tibio. Mi vecina me dejó su paraguas y me llamó chaval.',
    machine: 'En la era digital, es importante señalar que las soluciones innovadoras desempeñan un papel crucial. Además, un enfoque integral facilita resultados sólidos. Asimismo, los equipos deben navegar por las complejidades de un entorno en constante evolución.',
  },
  de: {
    human: 'Der Zug war wieder zu spät. Ich stand zwanzig Minuten im Regen mit einem lauwarmen Kaffee. Meine Nachbarin lieh mir ihren Schirm.',
    machine: 'In der heutigen Zeit ist es wichtig zu beachten, dass innovative Lösungen eine entscheidende Rolle spielen. Darüber hinaus ermöglicht ein ganzheitlicher Ansatz robuste Ergebnisse. Zusammenfassend kann dies einen Unterschied bedeuten.',
  },
  it: {
    human: "Il treno era di nuovo in ritardo. Ho aspettato venti minuti sotto la pioggia con un caffè tiepido. La vicina mi ha prestato l'ombrello.",
    machine: "Nell'era digitale è importante notare che le soluzioni innovative svolgono un ruolo cruciale. Inoltre, un approccio globale facilita risultati solidi. In conclusione, l'innovazione rappresenta la maturità.",
  },
  pt: {
    human: 'O comboio atrasou-se outra vez. Fiquei vinte minutos à chuva com um café morno. A vizinha emprestou-me o guarda-chuva.',
    machine: 'Na era digital é importante notar que as soluções inovadoras desempenham um papel crucial. Além disso, uma abordagem abrangente facilita resultados sólidos. Em conclusão, a inovação representa a maturidade.',
  },
  nl: {
    human: 'De trein was weer te laat. Ik stond twintig minuten in de regen met een lauwe koffie. Mijn buurvrouw leende me haar paraplu.',
    machine: 'In de hedendaagse wereld is het belangrijk op te merken dat innovatieve oplossingen een cruciale rol spelen. Bovendien maakt een holistische aanpak robuuste resultaten mogelijk. Samenvattend kan dit een verschil betekenen.',
  },
  ru: {
    human: 'Поезд снова опоздал. Я стоял двадцать минут под дождём с тёплым кофе. Соседка дала мне зонт.',
    machine: 'В современном мире важно отметить, что инновационные решения играют ключевую роль. Кроме того, комплексный подход обеспечивает устойчивые результаты. В заключение следует отметить, что это может означать перемены.',
  },
  zh: {
    human: '火车又晚点了。我在雨里等了二十分钟，手里拿着温咖啡。邻居把伞借给了我。',
    machine: '在数字时代，值得注意的是，创新解决方案起着关键作用。此外，全面的方法有助于实现稳健的成果。总之，这可能意味着变化，需要不断适应。',
  },
  ar: {
    human: 'تأخر القطار مرة أخرى. انتظرت عشرين دقيقة تحت المطر مع قهوة فاترة. أعارتني جارتي مظلّتها.',
    machine: 'في العصر الرقمي، من المهم ملاحظة أن الحلول المبتكرة تلعب دوراً محورياً. علاوة على ذلك، يسهّل النهج الشامل نتائج متينة. في الختام، تجدر الإشارة إلى أن ذلك قد يعني تغييراً.',
  },
};

/** The pair for a locale, falling back to English so there is always a ruler. */
export function anchorsFor(locale: string): AnchorPair {
  const base = locale.split(/[-_]/)[0]!.toLowerCase();
  return ANCHORS[base] ?? ANCHORS.en!;
}
