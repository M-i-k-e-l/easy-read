import {expect, test} from "claude-code/testing";

import {asEmoji, cardRows, inline, lineSize, lineWidth, raised, sameLineLeft, segments, shortName, tableRows} from "./register";

const REPLY = [
  "# Title",
  "",
  "Body with **bold** and `**code**`.",
  "  - See [the docs](https://example.com/docs) now.",
  "",
  "```ts",
  "const a = **b**;",
  "```",
  "After.",
].join("\n");

const message = (text: string, surface: "desktop" | "terminal", isSummary = false) =>
  ({
    plugin: "easy-read",
    component: "AssistantMessage",
    requestId: "m1",
    surface,
    props: {text, isFirstOfReply: true, ...(isSummary ? {isSummary: true as const} : {})},
  }) as const;

const noLinks = () => {};
const textRows = (text: string) => segments(text).flatMap((segment) => (segment.kind === "text" ? segment.rows : []));

test("bold is cut out, and a code span keeps its backticks and its stars", () => {
  expect(inline("a **b** `**c**` d", noLinks)).toEqual([
    {text: "a "},
    {text: "b", isBold: true},
    {text: " "},
    {text: "`**c**`"},
    {text: " d"},
  ]);
});

test("italic is cut out of stars and underscores, inside bold too, and words with them inside stay as written", () => {
  expect(inline("*a* _b_ **c *d*** ***e***", noLinks)).toEqual([
    {text: "a", isItalic: true},
    {text: " "},
    {text: "b", isItalic: true},
    {text: " "},
    {text: "c ", isBold: true},
    {text: "d", isBold: true, isItalic: true},
    {text: " "},
    {text: "e", isBold: true, isItalic: true},
  ]);
  expect(inline("snake_case_name, 2*3*4, a * star, `*c*`", noLinks)).toEqual([
    {text: "snake_case_name, 2*3*4, a * star, "},
    {text: "`*c*`"},
  ]);
});

test("struck words are cut out of two tildes, inside bold and around it, and one tilde stays as written", () => {
  expect(inline("~~a~~ **b ~~c~~** ~~**d**~~", noLinks)).toEqual([
    {text: "a", isStruck: true},
    {text: " "},
    {text: "b ", isBold: true},
    {text: "c", isBold: true, isStruck: true},
    {text: " "},
    {text: "d", isBold: true, isStruck: true},
  ]);
  expect(inline("~5, a ~ tilde, ~one~, `~~c~~`", noLinks)).toEqual([{text: "~5, a ~ tilde, ~one~, "}, {text: "`~~c~~`"}]);
});

test("a link inside bold is bold, and is handed on for its card", () => {
  const links: unknown[] = [];

  expect(inline("**see [x](https://a.example)**", (link) => links.push(link))).toEqual([
    {text: "see ", isBold: true},
    {text: "x", isBold: true, isLink: true, mark: "¹"},
  ]);
  expect(links).toEqual([{label: "x", url: "https://a.example"}]);
});

test("a bare address leaves out a quote and the sentence's punctuation after it", () => {
  const links: unknown[] = [];

  expect(inline('In "see https://a.example/docs." and https://a.example/x?y=1, too', (link) => links.push(link))).toEqual([
    {text: 'In "see '},
    {text: "https://a.example/docs", isLink: true, mark: "¹"},
    {text: '." and '},
    {text: "https://a.example/x?y=1", isLink: true, mark: "²"},
    {text: ", too"},
  ]);
});

test("an address keeps a pair of parentheses inside it, and leaves out a closing one with no opening one", () => {
  const urls = (text: string) => {
    const links: {url: string}[] = [];

    inline(text, (link) => links.push(link));

    return links.map((link) => link.url);
  };

  expect(urls("https://a.example/Mercury_(planet) and (see https://a.example/Mercury_(planet)).")).toEqual([
    "https://a.example/Mercury_(planet)",
    "https://a.example/Mercury_(planet)",
  ]);
  expect(urls("(see https://a.example/docs) and [m](https://a.example/Mercury_(planet))")).toEqual([
    "https://a.example/docs",
    "https://a.example/Mercury_(planet)",
  ]);
});

test("a link to a file is a link, its card named by its label", () => {
  const links: unknown[] = [];

  expect(inline("see [register.tsx](hooks/register.tsx:42)", (link) => links.push(link))).toEqual([
    {text: "see "},
    {text: "register.tsx", isLink: true, mark: "¹"},
  ]);
  expect(links).toEqual([{label: "register.tsx", url: "hooks/register.tsx:42"}]);
});

test("a table is a grid of cells, its header marked", () => {
  const rows = tableRows(["| a | bb |", "|---|:-:|", "| **ccc** | d |"], () => {});

  expect(rows.length).toBe(2);
  expect(rows.every((row) => row.isTable)).toBe(true);
  expect(rows[0]?.isHeader).toBe(true);
  expect(rows[1]).not.toHaveProperty("isHeader");
  // In cells: a letter 0.8, a bold one 1.
  expect(rows[0]?.widths).toEqual([3, 1.6]);
  expect(rows[0]?.cells).toEqual([[{text: "a"}], [{text: "bb"}]]);
  expect(rows[1]?.cells).toEqual([[{text: "ccc", isBold: true}], [{text: "d"}]]);
});

test("a table may leave out its outer pipes, and a pipe in code or after a backslash stays in its cell", () => {
  const cellTexts = (text: string) =>
    textRows(text)
      .filter((row) => row.isTable)
      .map((row) => (row.cells ?? []).map((cell) => cell.map((part) => part.text).join("")));

  expect(cellTexts("a | b\n--- | ---\n1 | 2\n3 | 4 |\nafter")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  expect(cellTexts("x | y\n- | -\n`a | b` | a \\| b")).toEqual([["x", "y"], ["`a | b`", "a | b"]]);
  expect(cellTexts("a | b, in a sentence\nnext")).toEqual([]);
  expect(textRows("a | b\n---")).toMatchObject([{parts: [{text: "a | b"}]}, {isRule: true}]);
  expect(textRows("run `ls | wc` now\n---")).toMatchObject([{parts: [{text: "run "}, {text: "`ls | wc`"}, {text: " now"}]}, {isRule: true}]);
});

test("a table in a quote is read without its >s, and ends where the quote does", () => {
  const rows = textRows("> a | b\n> --- | ---\n> 1 | 2\nc | d\n> | e |\n| f |");

  expect(rows).toMatchObject([
    {isTable: true, isHeader: true, quote: 1, cells: [[{text: "a"}], [{text: "b"}]]},
    {isTable: true, quote: 1, cells: [[{text: "1"}], [{text: "2"}]]},
    {parts: [{text: "c | d"}]},
    {isTable: true, quote: 1, cells: [[{text: "e"}]]},
    {isTable: true, cells: [[{text: "f"}]]},
  ]);
  expect(rows[4]).not.toHaveProperty("quote");
  expect(textRows("a | b\n> --- | ---")).toMatchObject([{parts: [{text: "a | b"}]}, {quote: 1}]);
});

test("a table with links is one run, its links numbered through it", () => {
  const result = segments(
    ["Before.", "| a | b |", "|---|---|", "| [x](hooks/a.ts) | c |", "| d | [y](https://a.example) |", "After."].join("\n"),
  );

  expect(result).toMatchObject([
    {rows: [{parts: [{text: "Before."}]}], links: []},
    {
      rows: [{isHeader: true}, {cells: [[{text: "x", mark: "¹"}], [{text: "c"}]]}, {cells: [[{text: "d"}], [{text: "y", mark: "²"}]]}],
      links: [{url: "hooks/a.ts"}, {url: "https://a.example"}],
      isTable: true,
    },
    {rows: [{parts: [{text: "After."}]}], links: []},
  ]);
});

test("a fence in a quote is code, keeps the >s past the quote's own, and ends where the quote does", () => {
  expect(segments("> a\n> ```ts\n> const b = 1;\n> > c\n> ```\n> d")).toMatchObject([
    {kind: "text", rows: [{quote: 1, parts: [{text: "a"}]}]},
    {kind: "code", language: "ts", quote: 1, lines: ["const b = 1;", "> c"]},
    {kind: "text", rows: [{quote: 1, parts: [{text: "d"}]}]},
  ]);
  expect(segments("> ```\n> e\nf")).toMatchObject([
    {kind: "code", quote: 1, lines: ["e"]},
    {kind: "text", rows: [{parts: [{text: "f"}]}]},
  ]);
  expect(segments("```\n> g\n```")).toEqual([{kind: "code", language: "", lines: ["> g"]}]);
  expect(segments("> > ```\n> > h\n> ```\n> i")).toMatchObject([
    {kind: "code", quote: 2, lines: ["h"]},
    {kind: "code", quote: 1, lines: ["i"]},
  ]);
});

test("a fence under a list item keeps its indent, one outside a list does not, and its lines lose as many spaces, no more", () => {
  expect(segments("- a\n  ```\n  b\n    c\n d\n  ```")).toMatchObject([
    {kind: "text"},
    {kind: "code", indent: 2, lines: ["b", "  c", "d"]},
  ]);
  expect(segments("> - e\n>   ```\n>   f\n>   ```")[1]).toMatchObject({kind: "code", quote: 1, indent: 2, lines: ["f"]});
  expect(segments("```\n  g\n```")).toEqual([{kind: "code", language: "", lines: ["  g"]}]);
  expect(segments("h\n  ```\n  i\n  ```")[1]).toEqual({kind: "code", language: "", lines: ["i"]});
});

test("an older symbol is asked to draw as an emoji, once, and never inside a skin tone, a flag or a joined emoji", () => {
  expect(asEmoji("⚡ ☕ ♈")).toBe("⚡\uFE0F ☕\uFE0F ♈\uFE0F");
  expect(asEmoji("❤\uFE0F ⚡\uFE0F")).toBe("❤\uFE0F ⚡\uFE0F");
  expect(asEmoji("✊🏽 🚀 🇺🇸 👨‍👩‍👧")).toBe("✊🏽 🚀 🇺🇸 👨‍👩‍👧");
  expect(segments("```\n⚡\n```\n⚡")).toMatchObject([
    {kind: "code", lines: ["⚡"]},
    {kind: "text", rows: [{parts: [{text: "⚡\uFE0F"}]}]},
  ]);
});

test("the emoji mark takes no width", () => {
  expect(lineWidth({indent: 0, parts: [{text: "⚡\uFE0F"}]})).toBe(lineWidth({indent: 0, parts: [{text: "⚡"}]}));
});

test("a reply splits into text, a link line taking the blank line under it, code and text", () => {
  const result = segments(REPLY);

  expect(result.map((segment) => segment.kind).join()).toBe("text,text,code,text");
  expect(result[0]).toMatchObject({rows: [{isHeading: true, parts: [{text: "Title"}]}, {parts: []}, {}]});
  expect(result[1]).toMatchObject({
    rows: [{indent: 2}, {parts: []}],
    links: [{label: "the docs", url: "https://example.com/docs"}],
    hasRoom: true,
  });
  expect(result[2]).toEqual({kind: "code", language: "ts", lines: ["const a = **b**;"]});
});

test("a list item's dash or number is cut from its text, and bold or italic at its start is not a marker", () => {
  expect(segments("- a\n  * b\n12. c\n3) d\n**e** f\n*g*")).toMatchObject([
    {
      rows: [
        {indent: 0, marker: "-", parts: [{text: "a"}]},
        {indent: 2, marker: "*", parts: [{text: "b"}]},
        {marker: "12.", parts: [{text: "c"}]},
        {marker: "3)", parts: [{text: "d"}]},
        {parts: [{text: "e", isBold: true}, {text: " f"}]},
        {parts: [{text: "g", isItalic: true}]},
      ],
    },
  ]);
  for (const row of textRows("**e** f\n*g*")) {
    expect(row).not.toHaveProperty("marker");
  }
  expect(lineWidth({indent: 0, marker: "-", parts: [{text: "abcde"}]})).toBe(6);
});

test("a dot item's level is how many dot items it is under, so one under a number starts over, and a line that is not an item ends the list", () => {
  const levels = (text: string) => textRows(text).map((row) => row.level ?? 0);

  expect(levels("- a\n  - b\n    - c\n  - d\n- e\n   1. f\ng\n  - h")).toEqual([0, 1, 2, 1, 0, 1, 0, 0]);
  expect(levels("- a\n\n  - b\n> - c\n>   - d")).toEqual([0, 0, 1, 0, 1]);
  expect(levels("1. a\n   - b\n     - c\n- d\n  1. e\n     - f")).toEqual([0, 0, 1, 0, 1, 1]);
});

test("a quote's >s are cut off and counted, and what is left is read as any line", () => {
  expect(textRows("> a\n>\n> - b\n> > c\n3 > 2")).toMatchObject([
    {quote: 1, parts: [{text: "a"}]},
    {quote: 1, parts: []},
    {quote: 1, marker: "-", parts: [{text: "b"}]},
    {quote: 2, parts: [{text: "c"}]},
    {parts: [{text: "3 > 2"}]},
  ]);
  expect(textRows("3 > 2")[0]).not.toHaveProperty("quote");
  expect(lineWidth({indent: 0, quote: 2, parts: [{text: "abcde"}]})).toBe(7);
});

test("a line of only ---, *** or ___ is a rule, in a quote and right after a table too", () => {
  expect(textRows("a\n---\n* * *\n> ___\n- - -\n--\n|x|\n|-|\n|1|\n---")).toMatchObject([
    {parts: [{text: "a"}]},
    {isRule: true, parts: []},
    {isRule: true, parts: []},
    {isRule: true, quote: 1, parts: []},
    {isRule: true, parts: []},
    {parts: [{text: "--"}]},
    {isTable: true},
    {isTable: true},
    {isRule: true, parts: []},
  ]);
});

test("a link line with no blank line under it still is a run of its own", () => {
  const result = segments("[a](https://a.example)\nnext");

  expect(result).toMatchObject([{links: [{url: "https://a.example"}]}, {links: [], rows: [{parts: [{text: "next"}]}]}]);
  expect(result[0]).not.toHaveProperty("hasRoom");
});

test("a card names a link by its label, or a bare address by its host and the end of its path", () => {
  const bare = (url: string) => shortName({label: url, url});

  expect(shortName({label: "the docs", url: "https://example.com/docs"})).toBe("the docs");
  expect(bare("https://example.com")).toBe("example.com");
  expect(bare("https://example.com/")).toBe("example.com");
  expect(bare("https://example.com/docs")).toBe("example.com/docs");
  expect(bare("https://code.claude.com/docs/en/plugins")).toBe("code.claude.com/…/plugins");
});

test("a card takes as many rows as its names wrap to", () => {
  expect(cardRows(["abc", "de"], 7)).toBe(1);
  expect(cardRows(["abc", "de"], 6)).toBe(2);
  expect(cardRows(["abc", "de", "f"], 6)).toBe(2);
  expect(cardRows(["a name longer than the width"], 10)).toBe(1);
});

test("a summary, a terminal and an empty reply go to next", async ($, on) => {
  on("ui.render", ($, e) => {
    const {Text} = $.ui.resolve(e);

    return <Text>engine</Text>;
  });

  for (const props of [message(REPLY, "terminal"), message(REPLY, "desktop", true), message("  ", "desktop")]) {
    const ui = await $.ui.mount(props);

    expect((await ui.find({type: "Text", text: /engine/}))?.text).toBe("engine");
    await ui.unmount();
  }
});

test("the desktop draws text in mono caption, bold as heading, code as Code, and a hidden link card", async ($, on) => {
  on("ui.render", ($, e) => {
    const {Text} = $.ui.resolve(e);

    return <Text>engine</Text>;
  });

  const ui = await $.ui.mount(message(REPLY, "desktop"));

  const bold = await ui.find({type: "Text", text: /^bold$/, in: "text-0"});
  const body = await ui.find({type: "Text", text: /^Body with/, in: "text-0"});
  const link = await ui.find({type: "Text", text: /^the docs$/, in: "text-1"});
  const card = await ui.find({type: "Link"});
  const cardLine = await ui.find({type: "Text", text: /^¹ /});
  const code = await ui.find({type: "Code"});

  expect(body?.props.mono).toBe(true);
  expect(body?.props.size).toBe("caption");
  expect(bold?.props.size).toBe("heading");
  expect(bold?.props.weight).toBe("bold");
  expect(link?.props.underline).toBe(true);
  expect(card?.props.href).toBe("https://example.com/docs");
  expect(card?.text).toContain("the docs");
  expect(cardLine?.props.mono).toBe(true);
  expect(cardLine?.props.size).toBe("caption");
  expect(await ui.find({type: "Text", text: /^¹$/, in: "text-1"})).toBeDefined();
  expect(code?.props.source).toBe("const a = **b**;");
  expect(await ui.find({type: "Text", text: /engine/})).toBeUndefined();
  await ui.unmount();
});

test("a link's number is raised", () => {
  expect(raised(1)).toBe("¹");
  expect(raised(10)).toBe("¹⁰");
});

test("a heading's size is by its level: #, ##, then ### and deeper alike", () => {
  expect(textRows("# a\n## b\n### c\n###### d\n#e").map((row) => row.headingSize)).toEqual([
    "title",
    "heading",
    "body",
    "body",
    undefined,
  ]);
});

test("a line's width is measured: bold and headings wider, wide letters wider still", () => {
  expect(lineWidth({indent: 2, parts: [{text: "abcde"}]})).toBe(6);
  expect(lineWidth({indent: 0, parts: [{text: "abcdefghij", isBold: true}]})).toBe(10);
  expect(lineWidth({indent: 0, isHeading: true, parts: [{text: "abcdefghij"}]})).toBe(15);
  expect(lineWidth({indent: 0, isHeading: true, headingSize: "heading", parts: [{text: "abcdefghij"}]})).toBe(10);
  expect(lineWidth({indent: 0, isHeading: true, headingSize: "body", parts: [{text: "abcdefghij"}]})).toBe(10);
  expect(lineWidth({indent: 0, parts: [{text: "中文😀"}]})).toBe(5);
  expect(lineWidth({indent: 0, parts: [{text: "xxxx", isLink: true, mark: "¹"}]})).toBe(4);
});

test("a card goes on its line when its names fit after it, else under it", () => {
  const row = {indent: 0, parts: [{text: "0123456789"}]};

  // 8 cells of line, a gap of 1, names of 3 and 4 letters (5.6 cells) with a gap of 2, a margin of 20.
  expect(sameLineLeft(row, ["abc", "defg"], 37)).toBe(9);
  expect(sameLineLeft(row, ["abc", "defg"], 36)).toBeUndefined();
});

test("a card on its line takes the line's largest size", () => {
  expect(lineSize({indent: 0, parts: [{text: "a"}]}).size).toBe("caption");
  expect(lineSize({indent: 0, parts: [{text: "a"}, {text: "b", isBold: true}]}).size).toBe("heading");
  expect(lineSize({indent: 0, isHeading: true, parts: [{text: "a"}]}).size).toBe("title");
});
