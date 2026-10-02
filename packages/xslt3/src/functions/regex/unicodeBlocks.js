/**
 * Unicode block ranges for the regular expression escapes \p{IsBlock}
 * (XSD 1.1 Part 2 appendix G.4.2.3), generated from Blocks.txt of
 * Unicode 15.0. Names have spaces and underscores removed; hyphens are
 * kept ("IsLatin-1Supplement").
 *
 * @module @tradik/xslt3/functions/regex/unicodeBlocks
 */

/** "Name:start-end" entries (hex), separated by semicolons. */
const TABLE =
  "BasicLatin:0-7f;Latin-1Supplement:80-ff;LatinExtended-A:100-17f;" +
  "LatinExtended-B:180-24f;IPAExtensions:250-2af;" +
  "SpacingModifierLetters:2b0-2ff;CombiningDiacriticalMarks:300-36f;" +
  "GreekandCoptic:370-3ff;Cyrillic:400-4ff;CyrillicSupplement:500-52f;" +
  "Armenian:530-58f;Hebrew:590-5ff;Arabic:600-6ff;Syriac:700-74f;" +
  "ArabicSupplement:750-77f;Thaana:780-7bf;NKo:7c0-7ff;Samaritan:800-83f;" +
  "Mandaic:840-85f;SyriacSupplement:860-86f;ArabicExtended-B:870-89f;" +
  "ArabicExtended-A:8a0-8ff;Devanagari:900-97f;Bengali:980-9ff;" +
  "Gurmukhi:a00-a7f;Gujarati:a80-aff;Oriya:b00-b7f;Tamil:b80-bff;" +
  "Telugu:c00-c7f;Kannada:c80-cff;Malayalam:d00-d7f;Sinhala:d80-dff;" +
  "Thai:e00-e7f;Lao:e80-eff;Tibetan:f00-fff;Myanmar:1000-109f;" +
  "Georgian:10a0-10ff;HangulJamo:1100-11ff;Ethiopic:1200-137f;" +
  "EthiopicSupplement:1380-139f;Cherokee:13a0-13ff;" +
  "UnifiedCanadianAboriginalSyllabics:1400-167f;Ogham:1680-169f;" +
  "Runic:16a0-16ff;Tagalog:1700-171f;Hanunoo:1720-173f;Buhid:1740-175f;" +
  "Tagbanwa:1760-177f;Khmer:1780-17ff;Mongolian:1800-18af;" +
  "UnifiedCanadianAboriginalSyllabicsExtended:18b0-18ff;Limbu:1900-194f;" +
  "TaiLe:1950-197f;NewTaiLue:1980-19df;KhmerSymbols:19e0-19ff;" +
  "Buginese:1a00-1a1f;TaiTham:1a20-1aaf;" +
  "CombiningDiacriticalMarksExtended:1ab0-1aff;Balinese:1b00-1b7f;" +
  "Sundanese:1b80-1bbf;Batak:1bc0-1bff;Lepcha:1c00-1c4f;OlChiki:1c50-1c7f;" +
  "CyrillicExtended-C:1c80-1c8f;GeorgianExtended:1c90-1cbf;" +
  "SundaneseSupplement:1cc0-1ccf;VedicExtensions:1cd0-1cff;" +
  "PhoneticExtensions:1d00-1d7f;PhoneticExtensionsSupplement:1d80-1dbf;" +
  "CombiningDiacriticalMarksSupplement:1dc0-1dff;" +
  "LatinExtendedAdditional:1e00-1eff;GreekExtended:1f00-1fff;" +
  "GeneralPunctuation:2000-206f;SuperscriptsandSubscripts:2070-209f;" +
  "CurrencySymbols:20a0-20cf;CombiningDiacriticalMarksforSymbols:20d0-20ff;" +
  "LetterlikeSymbols:2100-214f;NumberForms:2150-218f;Arrows:2190-21ff;" +
  "MathematicalOperators:2200-22ff;MiscellaneousTechnical:2300-23ff;" +
  "ControlPictures:2400-243f;OpticalCharacterRecognition:2440-245f;" +
  "EnclosedAlphanumerics:2460-24ff;BoxDrawing:2500-257f;" +
  "BlockElements:2580-259f;GeometricShapes:25a0-25ff;" +
  "MiscellaneousSymbols:2600-26ff;Dingbats:2700-27bf;" +
  "MiscellaneousMathematicalSymbols-A:27c0-27ef;" +
  "SupplementalArrows-A:27f0-27ff;BraillePatterns:2800-28ff;" +
  "SupplementalArrows-B:2900-297f;" +
  "MiscellaneousMathematicalSymbols-B:2980-29ff;" +
  "SupplementalMathematicalOperators:2a00-2aff;" +
  "MiscellaneousSymbolsandArrows:2b00-2bff;Glagolitic:2c00-2c5f;" +
  "LatinExtended-C:2c60-2c7f;Coptic:2c80-2cff;GeorgianSupplement:2d00-2d2f;" +
  "Tifinagh:2d30-2d7f;EthiopicExtended:2d80-2ddf;CyrillicExtended-A:2de0-2dff;" +
  "SupplementalPunctuation:2e00-2e7f;CJKRadicalsSupplement:2e80-2eff;" +
  "KangxiRadicals:2f00-2fdf;IdeographicDescriptionCharacters:2ff0-2fff;" +
  "CJKSymbolsandPunctuation:3000-303f;Hiragana:3040-309f;Katakana:30a0-30ff;" +
  "Bopomofo:3100-312f;HangulCompatibilityJamo:3130-318f;Kanbun:3190-319f;" +
  "BopomofoExtended:31a0-31bf;CJKStrokes:31c0-31ef;" +
  "KatakanaPhoneticExtensions:31f0-31ff;EnclosedCJKLettersandMonths:3200-32ff;" +
  "CJKCompatibility:3300-33ff;CJKUnifiedIdeographsExtensionA:3400-4dbf;" +
  "YijingHexagramSymbols:4dc0-4dff;CJKUnifiedIdeographs:4e00-9fff;" +
  "YiSyllables:a000-a48f;YiRadicals:a490-a4cf;Lisu:a4d0-a4ff;Vai:a500-a63f;" +
  "CyrillicExtended-B:a640-a69f;Bamum:a6a0-a6ff;ModifierToneLetters:a700-a71f;" +
  "LatinExtended-D:a720-a7ff;SylotiNagri:a800-a82f;" +
  "CommonIndicNumberForms:a830-a83f;Phags-pa:a840-a87f;Saurashtra:a880-a8df;" +
  "DevanagariExtended:a8e0-a8ff;KayahLi:a900-a92f;Rejang:a930-a95f;" +
  "HangulJamoExtended-A:a960-a97f;Javanese:a980-a9df;" +
  "MyanmarExtended-B:a9e0-a9ff;Cham:aa00-aa5f;MyanmarExtended-A:aa60-aa7f;" +
  "TaiViet:aa80-aadf;MeeteiMayekExtensions:aae0-aaff;" +
  "EthiopicExtended-A:ab00-ab2f;LatinExtended-E:ab30-ab6f;" +
  "CherokeeSupplement:ab70-abbf;MeeteiMayek:abc0-abff;" +
  "HangulSyllables:ac00-d7af;HangulJamoExtended-B:d7b0-d7ff;" +
  "HighSurrogates:d800-db7f;HighPrivateUseSurrogates:db80-dbff;" +
  "LowSurrogates:dc00-dfff;PrivateUseArea:e000-f8ff;" +
  "CJKCompatibilityIdeographs:f900-faff;AlphabeticPresentationForms:fb00-fb4f;" +
  "ArabicPresentationForms-A:fb50-fdff;VariationSelectors:fe00-fe0f;" +
  "VerticalForms:fe10-fe1f;CombiningHalfMarks:fe20-fe2f;" +
  "CJKCompatibilityForms:fe30-fe4f;SmallFormVariants:fe50-fe6f;" +
  "ArabicPresentationForms-B:fe70-feff;HalfwidthandFullwidthForms:ff00-ffef;" +
  "Specials:fff0-ffff;LinearBSyllabary:10000-1007f;" +
  "LinearBIdeograms:10080-100ff;AegeanNumbers:10100-1013f;" +
  "AncientGreekNumbers:10140-1018f;AncientSymbols:10190-101cf;" +
  "PhaistosDisc:101d0-101ff;Lycian:10280-1029f;Carian:102a0-102df;" +
  "CopticEpactNumbers:102e0-102ff;OldItalic:10300-1032f;Gothic:10330-1034f;" +
  "OldPermic:10350-1037f;Ugaritic:10380-1039f;OldPersian:103a0-103df;" +
  "Deseret:10400-1044f;Shavian:10450-1047f;Osmanya:10480-104af;" +
  "Osage:104b0-104ff;Elbasan:10500-1052f;CaucasianAlbanian:10530-1056f;" +
  "Vithkuqi:10570-105bf;LinearA:10600-1077f;LatinExtended-F:10780-107bf;" +
  "CypriotSyllabary:10800-1083f;ImperialAramaic:10840-1085f;" +
  "Palmyrene:10860-1087f;Nabataean:10880-108af;Hatran:108e0-108ff;" +
  "Phoenician:10900-1091f;Lydian:10920-1093f;MeroiticHieroglyphs:10980-1099f;" +
  "MeroiticCursive:109a0-109ff;Kharoshthi:10a00-10a5f;" +
  "OldSouthArabian:10a60-10a7f;OldNorthArabian:10a80-10a9f;" +
  "Manichaean:10ac0-10aff;Avestan:10b00-10b3f;" +
  "InscriptionalParthian:10b40-10b5f;InscriptionalPahlavi:10b60-10b7f;" +
  "PsalterPahlavi:10b80-10baf;OldTurkic:10c00-10c4f;OldHungarian:10c80-10cff;" +
  "HanifiRohingya:10d00-10d3f;RumiNumeralSymbols:10e60-10e7f;" +
  "Yezidi:10e80-10ebf;ArabicExtended-C:10ec0-10eff;OldSogdian:10f00-10f2f;" +
  "Sogdian:10f30-10f6f;OldUyghur:10f70-10faf;Chorasmian:10fb0-10fdf;" +
  "Elymaic:10fe0-10fff;Brahmi:11000-1107f;Kaithi:11080-110cf;" +
  "SoraSompeng:110d0-110ff;Chakma:11100-1114f;Mahajani:11150-1117f;" +
  "Sharada:11180-111df;SinhalaArchaicNumbers:111e0-111ff;Khojki:11200-1124f;" +
  "Multani:11280-112af;Khudawadi:112b0-112ff;Grantha:11300-1137f;" +
  "Newa:11400-1147f;Tirhuta:11480-114df;Siddham:11580-115ff;Modi:11600-1165f;" +
  "MongolianSupplement:11660-1167f;Takri:11680-116cf;Ahom:11700-1174f;" +
  "Dogra:11800-1184f;WarangCiti:118a0-118ff;DivesAkuru:11900-1195f;" +
  "Nandinagari:119a0-119ff;ZanabazarSquare:11a00-11a4f;Soyombo:11a50-11aaf;" +
  "UnifiedCanadianAboriginalSyllabicsExtended-A:11ab0-11abf;" +
  "PauCinHau:11ac0-11aff;DevanagariExtended-A:11b00-11b5f;" +
  "Bhaiksuki:11c00-11c6f;Marchen:11c70-11cbf;MasaramGondi:11d00-11d5f;" +
  "GunjalaGondi:11d60-11daf;Makasar:11ee0-11eff;Kawi:11f00-11f5f;" +
  "LisuSupplement:11fb0-11fbf;TamilSupplement:11fc0-11fff;" +
  "Cuneiform:12000-123ff;CuneiformNumbersandPunctuation:12400-1247f;" +
  "EarlyDynasticCuneiform:12480-1254f;Cypro-Minoan:12f90-12fff;" +
  "EgyptianHieroglyphs:13000-1342f;" +
  "EgyptianHieroglyphFormatControls:13430-1345f;" +
  "AnatolianHieroglyphs:14400-1467f;BamumSupplement:16800-16a3f;" +
  "Mro:16a40-16a6f;Tangsa:16a70-16acf;BassaVah:16ad0-16aff;" +
  "PahawhHmong:16b00-16b8f;Medefaidrin:16e40-16e9f;Miao:16f00-16f9f;" +
  "IdeographicSymbolsandPunctuation:16fe0-16fff;Tangut:17000-187ff;" +
  "TangutComponents:18800-18aff;KhitanSmallScript:18b00-18cff;" +
  "TangutSupplement:18d00-18d7f;KanaExtended-B:1aff0-1afff;" +
  "KanaSupplement:1b000-1b0ff;KanaExtended-A:1b100-1b12f;" +
  "SmallKanaExtension:1b130-1b16f;Nushu:1b170-1b2ff;Duployan:1bc00-1bc9f;" +
  "ShorthandFormatControls:1bca0-1bcaf;ZnamennyMusicalNotation:1cf00-1cfcf;" +
  "ByzantineMusicalSymbols:1d000-1d0ff;MusicalSymbols:1d100-1d1ff;" +
  "AncientGreekMusicalNotation:1d200-1d24f;KaktovikNumerals:1d2c0-1d2df;" +
  "MayanNumerals:1d2e0-1d2ff;TaiXuanJingSymbols:1d300-1d35f;" +
  "CountingRodNumerals:1d360-1d37f;" +
  "MathematicalAlphanumericSymbols:1d400-1d7ff;SuttonSignWriting:1d800-1daaf;" +
  "LatinExtended-G:1df00-1dfff;GlagoliticSupplement:1e000-1e02f;" +
  "CyrillicExtended-D:1e030-1e08f;NyiakengPuachueHmong:1e100-1e14f;" +
  "Toto:1e290-1e2bf;Wancho:1e2c0-1e2ff;NagMundari:1e4d0-1e4ff;" +
  "EthiopicExtended-B:1e7e0-1e7ff;MendeKikakui:1e800-1e8df;Adlam:1e900-1e95f;" +
  "IndicSiyaqNumbers:1ec70-1ecbf;OttomanSiyaqNumbers:1ed00-1ed4f;" +
  "ArabicMathematicalAlphabeticSymbols:1ee00-1eeff;MahjongTiles:1f000-1f02f;" +
  "DominoTiles:1f030-1f09f;PlayingCards:1f0a0-1f0ff;" +
  "EnclosedAlphanumericSupplement:1f100-1f1ff;" +
  "EnclosedIdeographicSupplement:1f200-1f2ff;" +
  "MiscellaneousSymbolsandPictographs:1f300-1f5ff;Emoticons:1f600-1f64f;" +
  "OrnamentalDingbats:1f650-1f67f;TransportandMapSymbols:1f680-1f6ff;" +
  "AlchemicalSymbols:1f700-1f77f;GeometricShapesExtended:1f780-1f7ff;" +
  "SupplementalArrows-C:1f800-1f8ff;" +
  "SupplementalSymbolsandPictographs:1f900-1f9ff;ChessSymbols:1fa00-1fa6f;" +
  "SymbolsandPictographsExtended-A:1fa70-1faff;" +
  "SymbolsforLegacyComputing:1fb00-1fbff;" +
  "CJKUnifiedIdeographsExtensionB:20000-2a6df;" +
  "CJKUnifiedIdeographsExtensionC:2a700-2b73f;" +
  "CJKUnifiedIdeographsExtensionD:2b740-2b81f;" +
  "CJKUnifiedIdeographsExtensionE:2b820-2ceaf;" +
  "CJKUnifiedIdeographsExtensionF:2ceb0-2ebef;" +
  "CJKCompatibilityIdeographsSupplement:2f800-2fa1f;" +
  "CJKUnifiedIdeographsExtensionG:30000-3134f;" +
  "CJKUnifiedIdeographsExtensionH:31350-323af;Tags:e0000-e007f;" +
  "VariationSelectorsSupplement:e0100-e01ef;" +
  "SupplementaryPrivateUseArea-A:f0000-fffff;" +
  "SupplementaryPrivateUseArea-B:100000-10ffff";

/**
 * Former block names that XSD 1.0 regular expressions use, mapped to the
 * current names.
 */
const ALIASES = {
  Greek: "GreekandCoptic",
  CombiningMarksforSymbols: "CombiningDiacriticalMarksforSymbols",
  CyrillicSupplementary: "CyrillicSupplement",
};

/** @type {Map<string, [number, number][]>} ranges by block name */
const blocks = new Map();
for (const entry of TABLE.split(";")) {
  const [name, range] = entry.split(":");
  const [start, end] = range.split("-").map((hex) => parseInt(hex, 16));
  blocks.set(name, [[start, end]]);
}
for (const [alias, name] of Object.entries(ALIASES)) {
  blocks.set(alias, blocks.get(name));
}
// XSD 1.0 "PrivateUse" also covers the supplementary private use planes
blocks.set("PrivateUse", [
  ...blocks.get("PrivateUseArea"),
  ...blocks.get("SupplementaryPrivateUseArea-A"),
  ...blocks.get("SupplementaryPrivateUseArea-B"),
]);

/**
 * Ranges of a Unicode block (the name is case-sensitive; spaces and
 * underscores are ignored).
 * @param {string} name - Block name without the "Is" prefix
 * @returns {[number, number][]|undefined} inclusive codepoint ranges
 */
export function blockRanges(name) {
  return blocks.get(name.replace(/[\s_]/g, ""));
}
