import type {Elements, Register, TextProps} from "claude-code";

type Table = Elements["desktop"];
// `mark` is a link's number, raised, the same as on its card.
export type Part = {text: string; isBold?: true; isLink?: true; mark?: string};
export type Row = {indent: number; isHeading?: true; parts: Part[]};
type Link = {label: string; url: string};
type Segment =
  | {kind: "text"; rows: Row[]; links: Link[]; hasRoom?: true}
  | {kind: "code"; language: string; lines: string[]};

const FENCE = /^\s*(```|~~~)\s*(\S*)/;
const HEADING = /^#{1,6}\s+/;
// A code span first, so what is inside it stays as written, backticks and all.
// A bare address stops at a quote or an angle bracket, and does not end in the
// sentence's punctuation: "see https://a.example/docs." links to /docs. A
// written link may go anywhere, a file as well: [x](hooks/register.tsx:42).
const INLINE = /(`[^`]*`)|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)`"<>]*[^\s)`"<>.,;:!?'])/g;
// The gap between two names on a card, the cells kept free at its right end as
// the letters are only about a cell wide, and the width when the app gives none.
const CARD_GAP = 2;
// The gap between a line and a card on its row, and the cells a card on a row
// keeps free at the right: the width the app gives is wider than the reply's,
// and in a narrow window a card that just fit by the count wrapped.
const LINE_GAP = 1;
const LINE_MARGIN = 14;
const CARD_MARGIN = 4;
const DEFAULT_COLUMNS = 80;
const WEB = /^https?:/;const RAISED = "⁰¹²³⁴⁵⁶⁷⁸⁹";

// A number in raised digits: 12 is ¹².
export function raised(number: number) {
  return [...String(number)].map((digit) => RAISED[Number(digit)]).join("");
}

// Cuts one line into what the Client draws: plain text, bold, and links, each
// link also handed to `addLink` for the card under its line, which gives back
// its number on the card.
export function inline(text: string, addLink: (link: Link) => number | void, isBold = false): Part[] {
  const parts: Part[] = [];
  const push = (part: Part) => part.text !== "" && parts.push(isBold ? {...part, isBold: true} : part);
  const pushLink = (text: string, number: number | void) =>
    push({text, isLink: true, ...(typeof number === "number" ? {mark: raised(number)} : {})});
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const [whole, code, bold, label, url, bare] = match;

    push({text: text.slice(last, match.index)});
    last = match.index + whole.length;

    if (code !== undefined) {
      push({text: code});
    } else if (bold !== undefined) {
      parts.push(...inline(bold, addLink, true));
    } else if (label !== undefined && url !== undefined) {
      pushLink(label, addLink({label, url}));
    } else if (bare !== undefined) {
      pushLink(bare, addLink({label: bare, url: bare}));
    }
  }

  push({text: text.slice(last)});

  return parts;
}

// Splits a reply into code fences, which the app draws, and runs of text for the
// Client. A line with a link is a run of its own, so its cards sit right under it.
export function segments(text: string): Segment[] {
  const result: Segment[] = [];
  let code: string[] | undefined;

  for (const line of text.split("\n")) {
    const fence = FENCE.exec(line);

    if (fence) {
      if (code) {
        code = undefined;
      } else {
        code = [];
        result.push({kind: "code", language: fence[2] ?? "", lines: code});
      }

      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    const last = result.at(-1);

    // The blank line under a line with a link is where its card shows. It stays
    // in the Client, as a copy leaves out the rows the hook reserves.
    if (line.trim() === "" && last?.kind === "text" && last.links.length > 0 && !last.hasRoom) {
      last.rows.push({indent: 0, parts: []});
      last.hasRoom = true;
      continue;
    }

    const links: Link[] = [];
    const trimmed = line.trimStart();
    const isHeading = HEADING.test(trimmed);
    const row: Row = {
      indent: line.length - trimmed.length,
      ...(isHeading ? {isHeading: true} : {}),
      parts: inline(isHeading ? trimmed.replace(HEADING, "") : trimmed, (link) => links.push(link)),
    };

    if (links.length === 0 && last?.kind === "text" && last.links.length === 0) {
      last.rows.push(row);
    } else {
      result.push({kind: "text", rows: [row], links});
    }
  }

  return result;
}

// What a card shows for a link, short so several fit on one row: its label, or
// for a bare address its host and the end of its path.
export function shortName({label, url}: Link) {
  if (label !== url) {
    return label;
  }

  const [host = url, ...path] = url.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/");
  const end = path.at(-1);

  if (end === undefined) {
    return host;
  }

  return path.length === 1 ? `${host}/${end}` : `${host}/…/${end}`;
}

// How many rows the names take, wrapped as the card wraps them. A letter of the
// card's font is counted as one cell, about what the mono text's letters take.
export function cardRows(names: string[], width: number) {
  let rows = 1;
  let used = 0;

  for (const name of names) {
    const needed = used === 0 ? name.length : used + CARD_GAP + name.length;

    if (used > 0 && needed > width) {
      rows += 1;
      used = name.length;
    } else {
      used = needed;
    }
  }

  return rows;
}

// How many cells a line takes, measured on the desktop app and rounded up a
// little so a card placed after it does not overlap it: a reply's letter is
// about 0.75 of a cell, a bold one about 0.95, and a wide one (Chinese, an
// emoji) about 1.4, and a heading's about 1.4.
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u;
const LETTER_CELLS = 0.8;
const BOLD_CELLS = 1;
const HEADING_CELLS = 1.45;
const WIDE_SCALE = 1.875;
export function lineWidth({indent, isHeading, parts}: Row) {
  let width = indent;

  for (const {text, isBold, mark} of parts) {
    const cells = isHeading ? HEADING_CELLS : isBold ? BOLD_CELLS : LETTER_CELLS;

    for (const letter of text + (mark ?? "")) {
      width += (WIDE.test(letter) ? WIDE_SCALE : 1) * cells;
    }
  }

  // Less a hair, as 1.3 added ten times is a little over 13.
  return Math.ceil(width - 1e-9);
}

// The largest size on a line, as its row is as tall as its largest letters: a
// card on the row in that size is as tall as the line, so their middles meet.
export function lineSize({isHeading, parts}: Row): {size: NonNullable<TextProps["size"]>; cells: number} {
  if (isHeading) {
    return {size: "title", cells: HEADING_CELLS};
  }

  return parts.some((part) => part.isBold) ? {size: "heading", cells: BOLD_CELLS} : {size: "caption", cells: LETTER_CELLS};
}

// Where a card goes on its line's own row: the cell after the line and a gap,
// when its names, in the line's largest size, fit there in one row; otherwise
// undefined, and it goes under.
export function sameLineLeft(row: Row, names: string[], columns: number) {
  const left = lineWidth(row) + LINE_GAP;
  const {cells} = lineSize(row);
  const width = names.reduce((sum, name) => sum + name.length * cells, 0) + CARD_GAP * (names.length - 1);

  return left + width + LINE_MARGIN <= columns ? left : undefined;
}

// A line's card: each link's number, raised as in the line, then the app's own links, which can be clicked and copied, hidden
// until the pointer is on the line. The hover sits on the hook's keyed Box
// around the line, as a hover inside the Client does not reach the card. The
// card is absolute, in blank rows of the line's own, as many as its names wrap
// to: one in the flow moves the lines under it, so the pointer on it was on the
// next line, and one over the text has no background to hide what is under it.
// When the names fit after the line, on its row, the card goes there and takes
// no rows of its own.
function cards({Box, Link, Markdown, Text}: Table, links: Link[], line: Row, columns: number, hasRoom: boolean) {
  const names = links.map(shortName);
  const marks = links.map((_, index) => `${raised(index + 1)} `);
  const shown = names.map((name, index) => `${marks[index]}${name}`);
  const sameLine = sameLineLeft(line, shown, columns);
  const rows = cardRows(shown, columns - line.indent - CARD_MARGIN);
  const card = (top: number, left: number) => (
    <Box
      position="absolute"
      top={top}
      left={left}
      right={0}
      display="none"
      flexWrap="wrap"
      columnGap={CARD_GAP}
      hover={{display: "flex"}}
    >
      {links.map((link, index) => (
        <Markdown text={`${marks[index]}[${names[index]?.replace(/[[\]]/g, "\\$&")}](${link.url})`} />
      ))}
    </Box>
  );

  // On the line's row the card is placed against the keyed Box around the
  // line, whose first row is the line: its top is the line's top. Counted up
  // from under the line, it sat high, as the hook's rows are taller.
  // It is drawn in the line's font at its largest size, so the two are as tall.
  if (sameLine !== undefined) {
    const {size} = lineSize(line);

    return (
      <Box
        position="absolute"
        top={0}
        left={sameLine}
        right={0}
        display="none"
        columnGap={CARD_GAP}
        hover={{display: "flex"}}
      >
        {links.map((link, index) =>
          // The app's Link opens only a web address here; a file's goes to its
          // Markdown, written as a reply writes it.
          WEB.test(link.url) ? (
            <Text mono size={size}>
              {marks[index]}
              <Link href={link.url}>
                <Text underline>{names[index]}</Text>
              </Link>
            </Text>
          ) : (
            <Box>
              <Text mono size={size}>
                {marks[index]}
              </Text>
              <Markdown text={`[${names[index]?.replace(/[[\]]/g, "\\$&")}](${link.url})`} />
            </Box>
          ),
        )}
      </Box>
    );
  }

  // With a blank line of the Client's under the line, the card starts on it.
  return <Box height={hasRoom ? rows - 1 : rows}>{card(hasRoom ? -1 : 0, line.indent)}</Box>;
}

export const register: Register = (on) => {
  on("ui.render", {component: "AssistantMessage"}, ($, e, next) => {
    if (e.surface !== "desktop" || e.props.isSummary || e.props.text.trim() === "") {
      return next(e);
    }

    const table = $.ui.resolve(e);
    const {Box, Client, Code} = table;
    const columns = e.viewport?.columns ?? DEFAULT_COLUMNS;

    return (
      <Box flexDirection="column">
        {segments(e.props.text).map((segment, index) => {
          if (segment.kind === "code") {
            const source = segment.lines.join("\n");

            return segment.language === "" ? (
              <Code source={source} />
            ) : (
              <Code source={source} language={segment.language} />
            );
          }

          const client = (
            <Client key={`text-${index}`} module="./client.tsx" props={{rows: segment.rows}} width="100%" />
          );

          if (segment.links.length === 0) {
            return client;
          }

          return (
            <Box key={`link-${index}`} flexDirection="column">
              {client}
              {cards(table, segment.links, segment.rows[0] ?? {indent: 0, parts: []}, columns, segment.hasRoom === true)}
            </Box>
          );
        })}
      </Box>
    );
  });
};
