import type {Elements, Register} from "claude-code";

type Table = Elements["desktop"];
export type Part = {text: string; isBold?: true; isLink?: true};
export type Row = {indent: number; isHeading?: true; parts: Part[]};
type Link = {label: string; url: string};
type Segment =
  | {kind: "text"; rows: Row[]; links: Link[]; hasRoom?: true}
  | {kind: "code"; language: string; lines: string[]};

const FENCE = /^\s*(```|~~~)\s*(\S*)/;
const HEADING = /^#{1,6}\s+/;
// A code span first, so what is inside it stays as written, backticks and all.
const INLINE = /(`[^`]*`)|\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)|(https?:\/\/[^\s)`]+)/g;
// The gap between two names on a card, the cells kept free at its right end as
// the letters are only about a cell wide, and the width when the app gives none.
const CARD_GAP = 2;
const CARD_MARGIN = 4;
const DEFAULT_COLUMNS = 80;

// Cuts one line into what the Client draws: plain text, bold, and links, each
// link also handed to `addLink` for the card under its line.
export function inline(text: string, addLink: (link: Link) => void, isBold = false): Part[] {
  const parts: Part[] = [];
  const push = (part: Part) => part.text !== "" && parts.push(isBold ? {...part, isBold: true} : part);
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
      addLink({label, url});
      push({text: label, isLink: true});
    } else if (bare !== undefined) {
      addLink({label: bare, url: bare});
      push({text: bare, isLink: true});
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

// A line's card: the app's own links, which can be clicked and copied, hidden
// until the pointer is on the line. The hover sits on the hook's keyed Box
// around the line, as a hover inside the Client does not reach the card. The
// card is absolute, in blank rows of the line's own, as many as its names wrap
// to: one in the flow moves the lines under it, so the pointer on it was on the
// next line, and one over the text has no background to hide what is under it.
function cards({Box, Markdown}: Table, links: Link[], indent: number, columns: number, hasRoom: boolean) {
  const names = links.map(shortName);
  const rows = cardRows(names, columns - indent - CARD_MARGIN);

  // With a blank line of the Client's under the line, the card starts on it.
  return (
    <Box height={hasRoom ? rows - 1 : rows}>
      <Box
        position="absolute"
        top={hasRoom ? -1 : 0}
        left={indent}
        right={0}
        display="none"
        flexWrap="wrap"
        columnGap={CARD_GAP}
        hover={{display: "flex"}}
      >
        {links.map((link, index) => (
          <Markdown text={`[${names[index]?.replace(/[[\]]/g, "\\$&")}](${link.url})`} />
        ))}
      </Box>
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
              {cards(table, segment.links, segment.rows[0]?.indent ?? 0, columns, segment.hasRoom === true)}
            </Box>
          );
        })}
      </Box>
    );
  });
};
