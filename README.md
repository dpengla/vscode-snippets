# Vim Snippets for VS Code

This extension packages snippets converted from the local vim-snippets
snipMate directory:

```text
~/.local/share/nvim/plugged/vim-snippets/snippets
```

The generated snippets are written to `snippets/generated` and contributed
through `package.json`.

## Build

Regenerate snippets:

```sh
npm run generate
```

Create a VSIX package:

```sh
npm run package
```

Install the generated `.vsix` from VS Code with `Extensions: Install from VSIX`.

## Remote SSH

This extension declares both workspace and UI extension hosts, with workspace
preferred. In a local VS Code window, install the VSIX locally. In a Remote SSH
window, use `Extensions: Install from VSIX` to install it on the SSH target.

## Conversion Notes

- snipMate `${VISUAL}` placeholders are converted to VS Code `${TM_SELECTED_TEXT}`.
- Literal language dollars, such as PHP `$this` or JSP `${...}`, are escaped for
  VS Code snippet syntax.
- snipMate `extends` directives are flattened into VS Code snippet
  contributions for the derived language.
- Vim backtick expressions cannot run in VS Code; common date, filename, and
  author expressions are converted to VS Code variables or simple placeholder
  defaults where possible.

The source vim-snippets project is bundled under its MIT license; see
`third_party/vim-snippets`.
