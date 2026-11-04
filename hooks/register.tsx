import type {Elements, Register, TextProps} from "claude-code";

type Table = Elements["desktop"];
// `mark` is a link's number, raised, the same as on its card.
export type Part = {text: string; isBold?: true; isItalic?: true; isStruck?: true; isLink?: true; mark?: string};
type Style = Pick<Part, "isBold" | "isItalic" | "isStruck">;
// A table's row, which the Client draws as a grid: `cells` are its columns and
// `widths` each column's widest cell, in cells. `parts` holds the same text in
// one line. `marker` is a list item's dash or number, which the Client draws in
// a column of its own so the item's wrapped lines start under its text.
// `quote` is how many quotes the line is inside, each drawn as a bar on its left.
export type Row = {
  indent: number;
  quote?: number;
  marker?: string;
  isHeading?: true;
  isTable?: true;
  isHeader?: true;
  cells?: Part[][];
  widths?: number[];
  parts: Part[];
};
type Link = {label: string; url: string};
type Segment =
  | {kind: "text"; rows: Row[]; links: Link[]; hasRoom?: true; isTable?: true}
  | {kind: "code"; language: string; lines: string[]};

const FENCE = /^\s*(```|~~~)\s*(\S*)/;
const HEADING = /^#{1,6}\s+/;
const LIST_MARKER = /^([-*+]|\d+[.)])\s+/;
// A quote's > at a line's start, and the space after it; "3 > 2" is not one.
const QUOTE = /^\s*>[ \t]?/;
// A quote's bar and the gap after it, in cells, and the bar's colour, as the
// Client draws them; the cells they take in all.
const QUOTE_BAR = 0.25;
const QUOTE_GAP = 1;
const QUOTE_BAR_COLOR = "#80808033";
const QUOTE_CELLS = QUOTE_BAR + QUOTE_GAP;
// A code span first, so what is inside it stays as written, backticks and all.
// A bare address stops at a quote or an angle bracket, and does not end in the
// sentence's punctuation: "see https://a.example/docs." links to /docs. A
// written link may go anywhere, a file as well: [x](hooks/register.tsx:42).
// Italic, in stars or underscores, starts and ends at a word's edge and not by
// a space, so snake_case, 2*3*4 and a lone * stay as written. Three stars are
// bold and italic. Struck words are in two tildes, so ~5 and ~one~ stay.
const INLINE = new RegExp(
  [
    /(`[^`]*`)/,
    /\*\*\*(.+?)\*\*\*/,
    /\*\*(.+?)\*\*(?!\*)/,
    /~~(?![\s~])(.+?)(?<![\s~])~~(?!~)/,
    /(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])/,
    /(?<!\w)_(?![\s_])(.+?)(?<![\s_])_(?!\w)/,
    /\[([^\]]+)\]\(([^)\s]+)\)/,
    /(https?:\/\/[^\s)`"<>]*[^\s)`"<>.,;:!?'])/,
  ]
    .map((each) => each.source)
    .join("|"),
  "g",
);
// The gap between two names on a card, the cells kept free at its right end as
// the letters are only about a cell wide, and the width when the app gives none.
const CARD_GAP = 2;
// The gap between a line and a card on its row, and the cells a card on a row
// keeps free at the right: the width the app gives is wider than the reply's,
// and a card that just fit by the count wrapped, about 5 cells short at 14.
const LINE_GAP = 1;
const LINE_MARGIN = 20;
const CARD_MARGIN = 4;
const DEFAULT_COLUMNS = 80;
const WEB = /^https?:/;
const RAISED = "⁰¹²³⁴⁵⁶⁷⁸⁹";
// A table's line under its header: pipes, dashes, and colons for alignment.
const SEPARATOR = /^\s*\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/;
const CELL_GAP = " │ ";
// The mark after a character that asks for it drawn as an emoji (U+FE0F). The
// mono font has its own text shape for some older symbols (⚡ ☕ ♈), which wins
// over the emoji without it. It is added to those older symbols only, as the
// newer emoji have no text shape, and not before a skin tone or a joiner, as
// it would split 👍🏽 or 👨‍👩‍👧 apart.
const EMOJI_STYLE = "\uFE0F";
const NEEDS_EMOJI_STYLE = /\p{Emoji_Presentation}(?![\uFE0F\u200D\u{1F3FB}-\u{1F3FF}])/gu;

export function asEmoji(text: string) {
  return text.replace(NEEDS_EMOJI_STYLE, (letter) =>
    (letter.codePointAt(0) ?? 0) < 0x10000 ? letter + EMOJI_STYLE : letter,
  );
}

// A number in raised digits: 12 is ¹².
export function raised(number: number) {
  return [...String(number)].map((digit) => RAISED[Number(digit)]).join("");
}

// Cuts one line into what the Client draws: plain text, bold, italic, struck
// and links, each link also handed to `addLink` for the card under its line,
// which gives back its number on the card. `style` is the bold, italic or
// struck it sits inside.
export function inline(text: string, addLink: (link: Link) => number | void, style: Style = {}): Part[] {
  const parts: Part[] = [];
  const push = (part: Part) => part.text !== "" && parts.push({...part, ...style});
  const pushLink = (text: string, number: number | void) =>
    push({text, isLink: true, ...(typeof number === "number" ? {mark: raised(number)} : {})});
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const [whole, code, boldItalic, bold, struck, starred, underscored, label, url, bare] = match;
    const italic = starred ?? underscored;

    push({text: text.slice(last, match.index)});
    last = match.index + whole.length;

    if (code !== undefined) {
      push({text: code});
    } else if (boldItalic !== undefined) {
      parts.push(...inline(boldItalic, addLink, {...style, isBold: true, isItalic: true}));
    } else if (bold !== undefined) {
      parts.push(...inline(bold, addLink, {...style, isBold: true}));
    } else if (struck !== undefined) {
      parts.push(...inline(struck, addLink, {...style, isStruck: true}));
    } else if (italic !== undefined) {
      parts.push(...inline(italic, addLink, {...style, isItalic: true}));
    } else if (label !== undefined && url !== undefined) {
      pushLink(label, addLink({label, url}));
    } else if (bare !== undefined) {
      pushLink(bare, addLink({label: bare, url: bare}));
    }
  }

  push({text: text.slice(last)});

  return parts;
}

// A table as a grid of cells, each column as wide as its widest cell until the
// window is narrower, the header on a stronger background. Its links are
// numbered through the table, as the table has one card, under it.
export function tableRows(lines: string[], addLink: (link: Link) => number | void): Row[] {
  const first = lines[0] ?? "";
  const indent = first.length - first.trimStart().length;
  const hasHeader = lines.length > 1 && SEPARATOR.test(lines[1] ?? "");
  const cut = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  const table = lines
    .filter((_, index) => !(hasHeader && index === 1))
    .map((line, index) => {
      const cells = cut(line).map((cell) => {
        const parts = inline(cell.trim(), addLink);
        // In cells, as bold is drawn larger.
        const width = parts.reduce(
          (sum, part) =>
            sum +
            [...part.text + (part.mark ?? "")].filter((letter) => letter !== EMOJI_STYLE).length *
              (part.isBold ? BOLD_CELLS : LETTER_CELLS),
          0,
        );

        return {parts, width};
      });

      return {cells};
    });
  const widths: number[] = [];

  for (const {cells} of table) {
    cells.forEach(({width}, column) => (widths[column] = Math.max(widths[column] ?? 0, width)));
  }

  return table.map(({cells}, index) => {
    const parts: Part[] = [];

    widths.forEach((_, column) => {
      const cell = cells[column] ?? {parts: [], width: 0};

      if (column > 0) {
        parts.push({text: CELL_GAP});
      }

      parts.push(...cell.parts);
    });

    return {
      indent,
      isTable: true,
      ...(hasHeader && index === 0 ? {isHeader: true} : {}),
      cells: widths.map((_, column) => cells[column]?.parts ?? []),
      widths,
      parts,
    };
  });
}

// Splits a reply into code fences, which the app draws, and runs of text for the
// Client. A line with a link is a run of its own, so its cards sit right under it.
export function segments(text: string): Segment[] {
  const result: Segment[] = [];
  let code: string[] | undefined;
  let table: string[] | undefined;
  const add = (row: Row, links: Link[]) => {
    const last = result.at(-1);

    if (links.length === 0 && last?.kind === "text" && last.links.length === 0) {
      last.rows.push(row);
    } else {
      result.push({kind: "text", rows: [row], links});
    }
  };
  // A table with links is a run of its own, so its card sits right under it.
  const endTable = () => {
    if (table) {
      const links: Link[] = [];
      const rows = tableRows(table, (link) => links.push(link));

      if (links.length === 0) {
        rows.forEach((row) => add(row, []));
      } else {
        result.push({kind: "text", rows, links, isTable: true});
      }
    }

    table = undefined;
  };

  for (const written of text.split("\n")) {
    const fence = FENCE.exec(written);

    if (fence) {
      endTable();

      if (code) {
        code = undefined;
      } else {
        code = [];
        result.push({kind: "code", language: fence[2] ?? "", lines: code});
      }

      continue;
    }

    if (code) {
      code.push(written);
      continue;
    }

    const line = asEmoji(written);

    // A table's lines are gathered, then drawn as rows when it ends.
    if (line.trimStart().startsWith("|")) {
      (table ??= []).push(line);
      continue;
    }

    endTable();

    const last = result.at(-1);

    // The blank line under a line with a link is where its card shows. It stays
    // in the Client, as a copy leaves out the rows the hook reserves.
    if (line.trim() === "" && last?.kind === "text" && last.links.length > 0 && !last.hasRoom) {
      last.rows.push({indent: 0, parts: []});
      last.hasRoom = true;
      continue;
    }

    // A quote's >s are cut off and counted; what is left is read as any line.
    let quoted = line;
    let quote = 0;

    while (QUOTE.test(quoted)) {
      quoted = quoted.replace(QUOTE, "");
      quote += 1;
    }

    const links: Link[] = [];
    const trimmed = quoted.trimStart();
    const isHeading = HEADING.test(trimmed);
    const marker = isHeading ? undefined : LIST_MARKER.exec(trimmed);
    const text = isHeading ? trimmed.replace(HEADING, "") : marker ? trimmed.slice(marker[0].length) : trimmed;
    const row: Row = {
      indent: quoted.length - trimmed.length,
      ...(quote > 0 ? {quote} : {}),
      ...(marker?.[1] !== undefined ? {marker: marker[1]} : {}),
      ...(isHeading ? {isHeading: true} : {}),
      parts: inline(text, (link) => links.push(link)),
    };

    add(row, links);
  }

  endTable();

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
export function lineWidth({indent, quote = 0, marker, isHeading, parts}: Row) {
  // A quote's bars, and a marker, in the line's largest size, and the space
  // after it.
  let width =
    indent + quote * QUOTE_CELLS + (marker === undefined ? 0 : marker.length * lineSize({indent, parts}).cells + LETTER_CELLS);

  for (const {text, isBold, mark} of parts) {
    const cells = isHeading ? HEADING_CELLS : isBold ? BOLD_CELLS : LETTER_CELLS;

    for (const letter of text + (mark ?? "")) {
      width += letter === EMOJI_STYLE ? 0 : (WIDE.test(letter) ? WIDE_SCALE : 1) * cells;
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
// no rows of its own. In a quote, the card's rows have the quote's bars, those
// of the quotes that go on under them, and the card starts at the quote's text.
function cards(
  {Box, Link, Markdown, Text}: Table,
  links: Link[],
  line: Row,
  columns: number,
  hasRoom: boolean,
  isTable: boolean,
  bars: number,
) {
  const names = links.map(shortName);
  const marks = links.map((_, index) => `${raised(index + 1)} `);
  const shown = names.map((name, index) => `${marks[index]}${name}`);
  // A table's card goes under it, as its rows have no end to put it after.
  const sameLine = isTable ? undefined : sameLineLeft(line, shown, columns);
  const quote = line.quote ?? 0;
  const rows = cardRows(shown, columns - line.indent - Math.ceil(quote * QUOTE_CELLS) - CARD_MARGIN);
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
  // The bars are cells across, not whole ones, so the card is placed in a Box
  // beside them, not counted from the left.
  return (
    <Box height={hasRoom ? rows - 1 : rows} flexDirection="row" columnGap={QUOTE_GAP}>
      {Array.from({length: Math.min(bars, quote)}, () => (
        <Box width={QUOTE_BAR} flexShrink={0} backgroundColor={QUOTE_BAR_COLOR} />
      ))}
      {Array.from({length: quote - Math.min(bars, quote)}, () => (
        <Box width={QUOTE_BAR} flexShrink={0} />
      ))}
      <Box flexGrow={1}>{card(hasRoom ? -1 : 0, line.indent)}</Box>
    </Box>
  );
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
        {segments(e.props.text).map((segment, index, all) => {
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

          // The quotes that go on under the card's rows: those the next line is
          // inside too.
          const after = all[index + 1];
          const bars = after?.kind === "text" ? (after.rows[0]?.quote ?? 0) : 0;

          return (
            <Box key={`link-${index}`} flexDirection="column">
              {client}
              {cards(
                table,
                segment.links,
                segment.rows[0] ?? {indent: 0, parts: []},
                columns,
                segment.hasRoom === true,
                segment.isTable === true,
                bars,
              )}
            </Box>
          );
        })}
      </Box>
    );
  });
};
