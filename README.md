# easy-read

A Claude Code mod that draws Claude's replies in the Claude desktop app in an easier-to-read font: every line in mono,
with bold that is really bold and a size larger, so the words you should not miss stand out.

**The desktop app's Code tab only.** In a terminal, and for summaries, replies are drawn as before.

Requires Claude Code 2.1.316, the version it was tested on. The hooks API it uses is early access and may change between
releases.

## Set up

1. Install the mod: click + next to the prompt box, then Plugins, Add marketplace with `M-i-k-e-l/easy-read`, then Add
   plugin. Or, from a terminal:

   ```
   /plugin install easy-read --marketplace M-i-k-e-l/easy-read
   ```

2. Start a new session. Claude's next reply is drawn in mono.

## What it draws

- **Text**: mono at caption size. **Bold** is bold and a size larger; *italic* and ~~struck~~ words are drawn as such,
  inside bold and tables too. `snake_case`, `2*3*4`, `~5` and code stay as written.
- **Headings**: regular weight, sized by level: `#` the largest, `##` a size down, `###` and deeper a size down again, so
  bold inside a heading still shows.
- **Links**: underlined, each with a raised number. Hovering a line shows a card with its links, by number; a card opens
  a web address or a file, such as `hooks/register.tsx:42`. Bare addresses end before the sentence's punctuation and keep
  a `( )` pair inside them, as in `Mercury_(planet)`.
- **Lists**: the dash or number in a column of its own, so wrapped lines start under the item's text. Dashes are drawn as
  dots, hollow a level deeper and square deeper still.
- **Quotes**: grey bars and grey text, with their tables, code and link cards inside the quote.
- **Tables**: a grid of mono cells on rounded backgrounds, with one card for the table's links. In a narrow window, wide
  columns shrink first, so short ones keep their words whole. Tables without outer pipes work too.
- **Code fences**: the app's own code blocks, beside a quote's bars or under a list item's indent.
- **Rules**: `---`, `***` and `___` as a thin line across.
- **Emoji**: older symbols such as ⚡ and ☕ as emoji, not the mono font's text shape.

## Limits

- A copy across table cells puts each cell on a line of its own, not a row on a line with tabs between its cells.
- A table too wide for its columns' longest words breaks the words in every column, as nothing here can scroll.
- A file's name on a link card is in the app's font, not mono.
- Two code fences in a row touch, where the app leaves a small gap between them.
- In a quote, the bars beside a link card meet the line's bars with a faint notch.

## Development

Load the mod from a checkout by setting `CLAUDE_CODE_PLUGIN_DIRS` to its folder in the `env` block of
`~/.claude/settings.json`. Saving a file reloads the mod in every open session.

Checks: `claude plugin validate .`, `claude plugin test .`, and `tsc -p .` once Claude Code has loaded the mod and
written `.claude-plugin/types/`.

## License

MIT
