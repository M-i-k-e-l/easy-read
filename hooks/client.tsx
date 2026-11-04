import type {ClientElements, ClientSurface, TextProps} from "claude-code";
import type {Part, Row} from "./register";

// A link is underlined, and its number, raised and not underlined, follows it.
function part({Text}: ClientElements, {text, isBold, isLink, mark}: Part) {
  const bold: TextProps = isBold ? {size: "heading", weight: "bold"} : {};
  const drawn = <Text {...bold} {...(isLink ? {underline: true} : {})}>{text}</Text>;

  return mark ? [drawn, <Text {...bold}>{mark}</Text>] : [drawn];
}

// Drawn in a Client, not by the hook: a selection in the hook's own Text rows
// disappears. Every line is mono at caption size; bold and headings are larger.
export default function EasyReadClient({rows}: {rows: Row[]}, surface: ClientSurface) {
  const {Box, Text} = surface.elements;

  const lines = rows.map((row) => {
    // A blank line is a newline, not a space, so a copy of it holds nothing.
    const children = row.parts.length === 0 ? ["\n"] : row.parts.flatMap((each) => part(surface.elements, each));
    const props = row.isHeading ? {size: "title", weight: "bold"} : {size: "caption"};

    return <Box paddingLeft={row.indent}>{h(Text, {mono: true, ...props} as const, ...children)}</Box>;
  });

  return h(Box, {flexDirection: "column"}, ...lines);
}
