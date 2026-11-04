import {expect, test} from "claude-code/testing";

import {cardRows, inline, lineSize, lineWidth, raised, sameLineLeft, segments, shortName} from "./register";

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

test("bold is cut out, and a code span keeps its backticks and its stars", () => {
  expect(inline("a **b** `**c**` d", noLinks)).toEqual([
    {text: "a "},
    {text: "b", isBold: true},
    {text: " "},
    {text: "`**c**`"},
    {text: " d"},
  ]);
});

test("a link inside bold is bold, and is handed on for its card", () => {
  const links: unknown[] = [];

  expect(inline("**see [x](https://a.example)**", (link) => links.push(link))).toEqual([
    {text: "see ", isBold: true},
    {text: "x", isBold: true, isLink: true, mark: "¹"},
  ]);
  expect(links).toEqual([{label: "x", url: "https://a.example"}]);
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

test("a line's width is measured: bold and headings wider, wide letters wider still", () => {
  expect(lineWidth({indent: 2, parts: [{text: "abcde"}]})).toBe(6);
  expect(lineWidth({indent: 0, parts: [{text: "abcdefghij", isBold: true}]})).toBe(10);
  expect(lineWidth({indent: 0, isHeading: true, parts: [{text: "abcdefghij"}]})).toBe(15);
  expect(lineWidth({indent: 0, parts: [{text: "中文😀"}]})).toBe(5);
  expect(lineWidth({indent: 0, parts: [{text: "xxxx", isLink: true, mark: "¹"}]})).toBe(4);
});

test("a card goes on its line when its names fit after it, else under it", () => {
  const row = {indent: 0, parts: [{text: "0123456789"}]};

  // 8 cells of line, a gap of 1, names of 3 and 4 letters (5.6 cells) with a gap of 2, a margin of 14.
  expect(sameLineLeft(row, ["abc", "defg"], 31)).toBe(9);
  expect(sameLineLeft(row, ["abc", "defg"], 30)).toBeUndefined();
});

test("a card on its line takes the line's largest size", () => {
  expect(lineSize({indent: 0, parts: [{text: "a"}]}).size).toBe("caption");
  expect(lineSize({indent: 0, parts: [{text: "a"}, {text: "b", isBold: true}]}).size).toBe("heading");
  expect(lineSize({indent: 0, isHeading: true, parts: [{text: "a"}]}).size).toBe("title");
});
