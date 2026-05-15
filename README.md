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

Snippet extensions are UI extensions in VS Code. When you use Remote SSH, install
this VSIX on the local VS Code client, not on the SSH target. The snippets will
then be available while editing files in the remote window.

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
