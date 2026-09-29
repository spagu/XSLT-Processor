/**
 * HTML 4.01 Character Entity References
 *
 * The html output method writes a character the output encoding cannot
 * represent as an entity reference when HTML 4.01 defines one (`&euro;` in
 * ISO-8859-1 output) and as a numeric character reference otherwise, as
 * libxslt does (XSLT 1.0 section 16.2).
 *
 * @module xslt/serializer/htmlEntities
 */

import { characterReference } from "./encoding.js";

/** Entity names of U+00A0 to U+00FF, in code point order. */
const LATIN1_NAMES =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy " +
  "reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm " +
  "raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring " +
  "AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde " +
  "Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml " +
  "Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil " +
  "egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve " +
  "oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute " +
  "thorn yuml";

/** The other entities, as `name codePoint` pairs. */
const OTHER_ENTITIES =
  "OElig 338 oelig 339 Scaron 352 scaron 353 Yuml 376 fnof 402 circ 710 " +
  "tilde 732 Alpha 913 Beta 914 Gamma 915 Delta 916 Epsilon 917 Zeta 918 " +
  "Eta 919 Theta 920 Iota 921 Kappa 922 Lambda 923 Mu 924 Nu 925 Xi 926 " +
  "Omicron 927 Pi 928 Rho 929 Sigma 931 Tau 932 Upsilon 933 Phi 934 Chi 935 " +
  "Psi 936 Omega 937 alpha 945 beta 946 gamma 947 delta 948 epsilon 949 " +
  "zeta 950 eta 951 theta 952 iota 953 kappa 954 lambda 955 mu 956 nu 957 " +
  "xi 958 omicron 959 pi 960 rho 961 sigmaf 962 sigma 963 tau 964 " +
  "upsilon 965 phi 966 chi 967 psi 968 omega 969 thetasym 977 upsih 978 " +
  "piv 982 ensp 8194 emsp 8195 thinsp 8201 zwnj 8204 zwj 8205 lrm 8206 " +
  "rlm 8207 ndash 8211 mdash 8212 lsquo 8216 rsquo 8217 sbquo 8218 " +
  "ldquo 8220 rdquo 8221 bdquo 8222 dagger 8224 Dagger 8225 bull 8226 " +
  "hellip 8230 permil 8240 prime 8242 Prime 8243 lsaquo 8249 rsaquo 8250 " +
  "oline 8254 frasl 8260 euro 8364 image 8465 weierp 8472 real 8476 " +
  "trade 8482 alefsym 8501 larr 8592 uarr 8593 rarr 8594 darr 8595 " +
  "harr 8596 crarr 8629 lArr 8656 uArr 8657 rArr 8658 dArr 8659 hArr 8660 " +
  "forall 8704 part 8706 exist 8707 empty 8709 nabla 8711 isin 8712 " +
  "notin 8713 ni 8715 prod 8719 sum 8721 minus 8722 lowast 8727 radic 8730 " +
  "prop 8733 infin 8734 ang 8736 and 8743 or 8744 cap 8745 cup 8746 " +
  "int 8747 there4 8756 sim 8764 cong 8773 asymp 8776 ne 8800 equiv 8801 " +
  "le 8804 ge 8805 sub 8834 sup 8835 nsub 8836 sube 8838 supe 8839 " +
  "oplus 8853 otimes 8855 perp 8869 sdot 8901 lceil 8968 rceil 8969 " +
  "lfloor 8970 rfloor 8971 lang 9001 rang 9002 loz 9674 spades 9824 " +
  "clubs 9827 hearts 9829 diams 9830";

/**
 * Entity name by code point.
 * @type {Map<number, string>}
 */
const ENTITY_NAMES = new Map(
  LATIN1_NAMES.split(" ").map((name, index) => [0xa0 + index, name]),
);
const otherParts = OTHER_ENTITIES.split(" ");
for (let i = 0; i < otherParts.length; i += 2) {
  ENTITY_NAMES.set(Number(otherParts[i + 1]), otherParts[i]);
}

/**
 * Reference to a character the output encoding cannot represent: the HTML
 * 4.01 entity reference when there is one, a numeric reference otherwise.
 *
 * @param {number} codePoint - The code point
 * @returns {string} `&name;` or `&#N;`
 *
 * @example
 * htmlCharacterReference(0x20ac); // "&euro;"
 */
export function htmlCharacterReference(codePoint) {
  const name = ENTITY_NAMES.get(codePoint);
  return name ? `&${name};` : characterReference(codePoint);
}
