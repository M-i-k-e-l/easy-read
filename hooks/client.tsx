import type {ClientElements, ClientSurface, TextProps} from "claude-code";
import type {Part, Row} from "./register";

// A cell's padding, about a cell across in all.
const CELL_PADDING = 2;
// Grey seen through, so a cell is lighter than the page in a dark theme and
// darker in a light one; the header more so.
const CELL_BACKGROUND = "#8080801a";
const HEADER_BACKGROUND = "#80808033";
// The desktop rounds a cell's corners only through a border: borderRadius is
// ignored, and "single" rounds them less than "round". It is in the cell's own
// colour, so only its shape shows.
const BORDER = "single";
// The gap between cells, a quarter of a cell, about 5px: a whole cell is too
// wide, and a size in px is ignored.
const CELL_GAP = 0.25;
// The gap between a list item's marker and its text, about a space of the mono
// caption text.
const MARKER_GAP = 0.8;
// A quote's bar, a quarter of a cell wide, in the header's grey, a cell from the
// quote's text. The text is in the theme's grey, as the app draws a quote.
const QUOTE_BAR = 0.25;
const QUOTE_GAP = 1;
const QUOTE_COLOR = "inactive";
// A rule, about a pixel high, in the header's grey, with space above and below.
const RULE_HEIGHT = 0.05;

// A link is underlined, and its number, raised and not underlined, follows it.
function part({Text}: ClientElements, {text, isBold, isItalic, isStruck, isLink, mark}: Part) {
  const style: TextProps = {
    ...(isBold ? {size: "heading", weight: "bold"} : {}),
    ...(isItalic ? {italic: true} : {}),
    ...(isStruck ? {strikethrough: true} : {}),
  };
  const drawn = <Text {...style} {...(isLink ? {underline: true} : {})}>{text}</Text>;

  return mark ? [drawn, <Text {...style}>{mark}</Text>] : [drawn];
}

// A table's row: a cell per column on a background, as wide as the column's
// widest cell. In a narrower window the cells shrink by their widths and wrap
// inside themselves.
function grid(elements: ClientElements, row: Row, cells: Part[][], widths: number[]) {
  const {Box, Text} = elements;

  return (
    <Box paddingLeft={row.indent} paddingTop={CELL_GAP} flexDirection="row" columnGap={CELL_GAP}>
      {widths.map((width, column) => (
        <Box
          width={Math.ceil(width) + CELL_PADDING}
          flexShrink={1}
          minWidth={1}
          paddingX="sm"
          paddingY="xs"
          backgroundColor={row.isHeader ? HEADER_BACKGROUND : CELL_BACKGROUND}
          borderStyle={BORDER}
          borderColor={row.isHeader ? HEADER_BACKGROUND : CELL_BACKGROUND}
        >
          {h(
            Text,
            {mono: true, size: "caption"} as const,
            ...(cells[column] ?? []).flatMap((each) => part(elements, each)),
          )}
        </Box>
      ))}
    </Box>
  );
}

// Drawn in a Client, not by the hook: a selection in the hook's own Text rows
// disappears. Every line is mono at caption size; bold and headings are larger.
export default function EasyReadClient({rows}: {rows: Row[]}, surface: ClientSurface) {
  const {Box, Text} = surface.elements;

  const lines = rows.map((row, index) => {
    const isLast = index === rows.length - 1;

    if (row.cells && row.widths) {
      return grid(surface.elements, row, row.cells, row.widths);
    }

    if (row.isRule) {
      return quoted(
        row,
        isLast,
        <Box paddingLeft={row.indent} paddingY="sm">
          <Box flexGrow={1} height={RULE_HEIGHT} backgroundColor={HEADER_BACKGROUND} />
        </Box>,
      );
    }

    // A blank line is a newline, not a space, so a copy of it holds nothing.
    const children = row.parts.length === 0 ? ["\n"] : row.parts.flatMap((each) => part(surface.elements, each));
    const props: TextProps = {
      ...(row.isHeading ? {size: "title", weight: "bold"} : {size: "caption"}),
      ...(row.quote ? {color: QUOTE_COLOR} : {}),
    };

    const text = h(Text, {mono: true, ...props} as const, ...children);

    // A list item's marker in a column of its own that does not shrink, so its
    // wrapped lines start under its text and "10." stays on one line. It is in
    // the line's largest size, as a line with bold is taller and a smaller
    // marker would sit above the middle of its first line.
    if (row.marker !== undefined) {
      const markerSize: TextProps = {size: row.parts.some((each) => each.isBold) ? "heading" : "caption"};

      return quoted(
        row,
        isLast,
        <Box paddingLeft={row.indent} flexDirection="row" columnGap={MARKER_GAP}>
          <Box flexShrink={0}>
            <Text mono {...markerSize} {...(row.quote ? {color: QUOTE_COLOR} : {})}>
              {row.marker}
            </Text>
          </Box>
          <Box flexShrink={1}>{text}</Box>
        </Box>,
      );
    }

    return quoted(row, isLast, <Box paddingLeft={row.indent}>{text}</Box>);
  });

  // A quoted line behind a bar for each quote it is inside. The bars of a
  // quote's lines meet, as the lines have no gap between them. The app gives a
  // Client a little more height than its lines take, so the last line grows
  // into it, and its bars with it, to meet the bars of the run under it.
  function quoted(row: Row, isLast: boolean, line: ReturnType<typeof Box>) {
    if (!row.quote) {
      return line;
    }

    const bars = Array.from({length: row.quote}, () => <Box width={QUOTE_BAR} flexShrink={0} backgroundColor={HEADER_BACKGROUND} />);

    return h(
      Box,
      {flexDirection: "row", columnGap: QUOTE_GAP, ...(isLast ? {flexGrow: 1} : {})},
      ...bars,
      <Box flexGrow={1} flexShrink={1} flexDirection="column">{line}</Box>,
    );
  }

  return h(Box, {flexDirection: "column", flexGrow: 1, height: "100%"}, ...lines);
}
