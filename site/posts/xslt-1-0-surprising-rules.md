---
title: "Ten XSLT 1.0 rules that surprise experienced developers"
description: "An empty xsl:param is not what you think, != on node-sets means something else, &#160; is not whitespace, and a template can never see its caller's variables. Ten XSLT 1.0 rules with examples, and the patterns that make stylesheets slow."
slug: xslt-1-0-surprising-rules
status: publish
type: post
date: 2026-09-29T12:00:00Z
---
XSLT 1.0 is a short specification, and people who have written stylesheets for
years still get caught by parts of it. We know, because writing a processor
that matches Chrome meant finding every one of these the hard way: the 1.1
releases of @tradik/xslt-processor fixed dozens of them. Here are the ten that
surprise people most, with what the specification actually says. They apply to
every XSLT 1.0 processor, not just ours.

## 1. An empty `xsl:param` is an empty string

```xml
<xsl:template name="greet">
  <xsl:param name="title"/>
  <xsl:if test="$title">Dear <xsl:value-of select="$title"/></xsl:if>
</xsl:template>
```

When the caller passes no `title`, the test is **false**. A parameter with
neither `select` nor content has the value `""` (XSLT 1.0 section 11.2), and an
empty string is false. It is easy to assume the parameter is an empty result
tree fragment instead, which would be true, and some processors got this wrong
for years. This was [issue #11](https://github.com/spagu/XSLT-Processor/issues/11)
in our tracker.

## 2. `!=` on a node-set does not mean "not equal"

```xml
<xsl:if test="item/@status != 'done'">…</xsl:if>
```

This is true when **some** `@status` differs from `'done'`, even if others equal
it. Comparisons with node-sets are existential (XPath 1.0 section 3.4): `=`
asks "is there a node equal to", `!=` asks "is there a node not equal to". If
you mean "none of them is done", write `not(item/@status = 'done')`. With the
statuses `1` and `2`, `@n != 1` and `@n = 1` are both true.

## 3. A template never sees its caller's variables

```xml
<xsl:variable name="v" select="'global'"/>

<xsl:template match="/">
  <xsl:variable name="v" select="'outer'"/>
  <xsl:call-template name="show"/>   <!-- prints "global" -->
</xsl:template>

<xsl:template name="show"><xsl:value-of select="$v"/></xsl:template>
```

Scope in XSLT is lexical (section 11.5): a variable is visible in the
following siblings of its declaration and their descendants, nothing else. A
called template sees the global variables, not the local ones of whoever
called it, and a variable declared inside `xsl:if` ends with the `xsl:if`. Pass
what you need with `xsl:with-param`.

## 4. `match="/"` matches the root node only

```xml
<xsl:template match="/"><html><xsl:apply-templates/></html></xsl:template>
<xsl:template match="catalog">…</xsl:template>
```

`/` is the root of the tree, the parent of `<catalog>`, not the `<catalog>`
element itself. That is why the classic layout above works: the first template
writes the page around everything, the second handles the document element. A
processor that lets `/` match the document element renders the wrapper twice.

## 5. `number()` is stricter than JavaScript

| Expression | XPath 1.0 | JavaScript `Number()` |
|---|---|---|
| `number('1e3')` | NaN | 1000 |
| `number('0x10')` | NaN | 16 |
| `number('.5')` | 0.5 | 0.5 |
| `number('5.')` | 5 | 5 |
| `number(' 12 ')` | 12 | 12 |

XPath 1.0 numbers have no exponent and no hexadecimal form (section 3.7), and
`string()` of a number never uses one either: a billion billion is
`1000000000000000000000`, not `1e21`. Data from systems that write exponents
needs converting before XSLT 1.0 can do arithmetic with it.

## 6. A non-breaking space is not whitespace

```xml
<xsl:value-of select="string-length(normalize-space(cell))"/>
```

For `<cell>&#160;a&#160;</cell>` this gives **3**. XML whitespace is exactly
four characters: space, tab, carriage return and line feed (XML 1.0 production
`S`). `normalize-space()` does not touch `&#160;`, and neither does
`xsl:strip-space`, which is why `<td>&#160;</td>` is the classic way to keep an
empty table cell from collapsing.

## 7. `string-length()` counts characters, not bytes or code units

`string-length('😀é')` is **2**. XPath counts characters, so an emoji is one
character, even though JavaScript's `'😀é'.length` is 3 (UTF-16 code units).
The same goes for `substring()` and `translate()`: positions are character
positions. A processor written in JavaScript has to work for this.

## 8. An attribute must come before any content

```xml
<p>
  <b>x</b>
  <xsl:attribute name="class">late</xsl:attribute>
</p>
```

The result is `<p><b>x</b></p>`, with no `class`. An attribute can only be added
to an element before its children (section 7.1.3); adding it later is an error
that processors recover from by ignoring it, libxslt with a warning. Put
`xsl:attribute` (and `xsl:copy-of` of attributes) first.

## 9. Braces in attribute values are expressions, unless doubled

```xml
<a title="{concat('{', 'x', '}')}" data-template="{{name}}"/>
```

The result is `title="{x}" data-template="{name}"`. In a literal result
element's attribute, `{…}` is an XPath expression (an attribute value
template, section 7.6.2) and `{{`/`}}` write a literal brace. Inside the
expression, braces in a string literal are just characters, which a naive
parser splits in the wrong place.

## 10. Text and CDATA next to each other are one text node

```xml
<r>a<![CDATA[b]]>c</r>
```

`count(r/text())` is **1** and its value is `abc`. The XPath data model has no
CDATA sections (section 5): adjacent text and CDATA become a single text node.
A DOM keeps them apart, so a processor that reads a DOM has to join them, or
`text()[1]` returns `a`.

## Bonus: the patterns that make stylesheets slow

Correct is half of it. The other half is time, and a handful of everyday XSLT
idioms are quadratic in a naive processor: the work for each node grows with
the number of nodes. At 8,000 nodes that is the difference between a tenth of a
second and a minute and a half. These are the cases we measured while fixing
them in 1.1:

![Dumbbell chart of seconds before and after the 1.1 fixes on a log scale: xsl:number level any 105 s to 0.09 s, apply-templates with a predicate pattern 90 s to 0.1 s, the issue 9 catalogue 28 s to 8 s, Muenchian grouping 8.5 s to 0.3 s, key lookups 7 s to 0.2 s, xsl:number level single 5.5 s to 0.1 s, following-sibling first match 4.7 s to 0.09 s](../../images/blog/xslt1-performance-1-1.svg)

What made each one slow is worth knowing whichever processor you use:

- **`xsl:number level="any"`** counts every matching node before the current
  one. Done literally for each numbered node, that is quadratic. A processor
  can remember where it counted last; you can also number with `position()`
  inside `xsl:for-each` when the order allows it.
- **Template patterns with predicates** (`match="item[@id]"`) have to be tried
  against every node. A processor should index templates by element name, so
  most nodes never try most patterns.
- **Muenchian grouping** (`key('k', @x)[1]` compared with `generate-id()`)
  calls `key()` for every item. Without an index built once per document, each
  call scans the whole document.
- **`following-sibling::x[1]`** in a loop should stop at the first match. A
  processor that builds the whole axis before applying `[1]` reads every
  following sibling for every node.

In your own stylesheets: use `xsl:key` instead of `//item[@id = $id]` inside a
loop, prefer `following-sibling::x[1]` to `following-sibling::x[position() =
1]` (some processors only optimize the short form), and when a transformation
gets slow with more data, suspect one of the four above first.

The full list of what changed is in the [changelog](../../changelog/), and
the [playground](../../playground/) runs any of these examples in your
browser.
