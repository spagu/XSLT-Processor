/**
 * The issue #9-like benchmark input: a course catalogue with localised
 * strings, rendered to about 3 MB of HTML by a stylesheet that groups with
 * keys, sorts, looks strings up by key, formats numbers and uses the
 * `(a) or (b)` expressions reported in issue #9.
 *
 * @module scripts/benchmark/catalog
 */

import { random, stylesheet } from "./xml.mjs";

/** Number of courses; sized for about 3 MB of HTML output. */
const COURSES = 10500;

/** Category names; 40 categories. */
const TOPICS = [
  "Algebra", "Biology", "Chemistry", "Design", "Economics", "French",
  "Geography", "History", "Informatics", "Journalism", "Kinetics", "Law",
  "Music", "Nutrition", "Optics", "Physics", "Quantum", "Rhetoric",
  "Statistics", "Theatre",
]; // prettier-ignore

/** Label ids and their English and Polish strings. */
const STRINGS = [
  ["heading", "Course catalogue", "Katalog kursów"],
  ["title", "Title", "Tytuł"],
  ["teacher", "Teacher", "Prowadzący"],
  ["price", "Price", "Cena"],
  ["level", "Level", "Poziom"],
  ["start", "Starts", "Początek"],
  ["tags", "Tags", "Tagi"],
  ["featured", "Featured", "Polecany"],
  ["courses", "courses", "kursów"],
];

/**
 * The catalogue document.
 *
 * @returns {string} XML source
 */
export function catalogXml() {
  const next = random(9);
  const strings = ["en", "pl"]
    .map(
      (lang, column) =>
        `<strings lang="${lang}">` +
        STRINGS.map((row) => `<s id="${row[0]}">${row[column + 1]}</s>`).join(
          "",
        ) +
        "</strings>",
    )
    .join("");
  const categories = TOPICS.flatMap((topic, i) => [
    `<category id="c${i * 2}" name="${topic}"/>`,
    `<category id="c${i * 2 + 1}" name="${topic} II"/>`,
  ]).join("");
  const courses = [];
  for (let i = 0; i < COURSES; i++) {
    const cat = Math.floor(next() * TOPICS.length * 2);
    const tags = ["online", "evening", "weekend", "lab", "exam"]
      .filter(() => next() < 0.4)
      .map((tag) => `<tag>${tag}</tag>`)
      .join("");
    courses.push(
      `<course id="k${i}" category="c${cat}" level="${1 + Math.floor(next() * 4)}" ` +
        `price="${(20 + next() * 980).toFixed(2)}" start="2026-${String(1 + (i % 12)).padStart(2, "0")}-01">` +
        `<title>${TOPICS[cat >> 1]} course ${String(i).padStart(4, "0")}</title>` +
        `<teacher>Teacher ${Math.floor(next() * 300)}</teacher>` +
        `<summary>An introduction to ${TOPICS[cat >> 1].toLowerCase()} with exercises, ` +
        `reading lists and a final project (session ${i}).</summary>${tags}</course>`,
    );
  }
  return `<catalog>${strings}<categories>${categories}</categories>${courses.join("")}</catalog>`;
}

/**
 * The catalogue stylesheet (HTML output).
 *
 * @returns {string} XSLT source
 */
export function catalogStylesheet() {
  const label = (id) => `<xsl:value-of select="key('str', '${id}')"/>`;
  return stylesheet(
    '<xsl:param name="lang" select="\'pl\'"/>' +
      '<xsl:key name="str" match="strings[@lang = \'pl\']/s" use="@id"/>' +
      '<xsl:key name="byCategory" match="course" use="@category"/>' +
      '<xsl:key name="category" match="category" use="@id"/>' +
      '<xsl:template match="/catalog"><html><head><title>' +
      label("heading") +
      "</title></head><body><h1>" +
      label("heading") +
      "</h1>" +
      "<xsl:for-each select=\"course[generate-id() = generate-id(key('byCategory', @category)[1])]\">" +
      "<xsl:sort select=\"key('category', @category)/@name\"/>" +
      '<xsl:variable name="members" select="key(\'byCategory\', @category)"/>' +
      '<section id="{@category}"><h2><xsl:value-of select="key(\'category\', @category)/@name"/> ' +
      '(<xsl:value-of select="count($members)"/><xsl:text> </xsl:text>' +
      label("courses") +
      ")</h2><table><thead><tr><th>" +
      label("title") +
      "</th><th>" +
      label("teacher") +
      "</th><th>" +
      label("level") +
      "</th><th>" +
      label("price") +
      "</th><th>" +
      label("start") +
      "</th><th>" +
      label("tags") +
      "</th></tr></thead><tbody>" +
      '<xsl:apply-templates select="$members"><xsl:sort select="title"/></xsl:apply-templates>' +
      "</tbody></table></section></xsl:for-each></body></html></xsl:template>" +
      '<xsl:template match="course"><tr class="level-{@level}">' +
      '<xsl:if test="(@level &gt; 3) or (@price &lt; 100)"><xsl:attribute name="data-featured">' +
      label("featured") +
      "</xsl:attribute></xsl:if>" +
      '<td><a href="courses/{@id}.html"><xsl:value-of select="title"/></a>' +
      '<p><xsl:value-of select="normalize-space(summary)"/></p></td>' +
      '<td><xsl:value-of select="teacher"/></td>' +
      '<td><xsl:choose><xsl:when test="@level = 1">A1</xsl:when><xsl:when test="@level = 2">A2</xsl:when>' +
      '<xsl:when test="@level = 3">B1</xsl:when><xsl:otherwise>B2</xsl:otherwise></xsl:choose></td>' +
      "<td><xsl:value-of select=\"format-number(@price, '#,##0.00')\"/> PLN</td>" +
      "<td><xsl:value-of select=\"translate(@start, '-', '.')\"/></td>" +
      '<td><xsl:for-each select="tag"><xsl:if test="position() &gt; 1">, </xsl:if>' +
      '<xsl:value-of select="."/></xsl:for-each></td></tr></xsl:template>',
    "html",
  );
}
