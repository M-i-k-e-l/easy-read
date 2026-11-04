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

// A link is underlined, and its number, raised and not underlined, follows it.
function part({Text}: ClientElements, {text, isBold, isItalic, isLink, mark}: Part) {
  const style: TextProps = {...(isBold ? {size: "heading", weight: "bold"} : {}), ...(isItalic ? {italic: true} : {})};
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

  const lines = rows.map((row) => {
    if (row.cells && row.widths) {
      return grid(surface.elements, row, row.cells, row.widths);
    }

    // A blank line is a newline, not a space, so a copy of it holds nothing.
    const children = row.parts.length === 0 ? ["\n"] : row.parts.flatMap((each) => part(surface.elements, each));
    const props = row.isHeading ? {size: "title", weight: "bold"} : {size: "caption"};

    return <Box paddingLeft={row.indent}>{h(Text, {mono: true, ...props} as const, ...children)}</Box>;
  });

  return h(Box, {flexDirection: "column"}, ...lines);
}
