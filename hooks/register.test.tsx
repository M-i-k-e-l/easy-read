import {expect, test} from "claude-code/testing";

import {cardRows, inline, segments, shortName} from "./register";

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
    {text: "x", isBold: true, isLink: true},
  ]);
  expect(links).toEqual([{label: "x", url: "https://a.example"}]);
});

test("a reply splits into text, a link line taking the blank line under it, code and text", () => {
  const result = segments(REPLY);

  expect(result.map((segment) => segment.kind).join()).toBe("text,text,code,text");
  expect(result[0]).toMatchObject({rows: [{isHeading: true, parts: [{text: "Title"}]}, {parts: []}, {}]});
  expect(result[1]).toMatchObject({
    rows: [{indent: 2}],
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
  const card = await ui.find({type: "Markdown"});
  const code = await ui.find({type: "Code"});

  expect(body?.props.mono).toBe(true);
  expect(body?.props.size).toBe("caption");
  expect(bold?.props.size).toBe("heading");
  expect(bold?.props.weight).toBe("bold");
  expect(link?.props.underline).toBe(true);
  expect(card?.text).toBe("[the docs](https://example.com/docs)");
  expect(code?.props.source).toBe("const a = **b**;");
  expect(await ui.find({type: "Text", text: /engine/})).toBeUndefined();
  await ui.unmount();
});
