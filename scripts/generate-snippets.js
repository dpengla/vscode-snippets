#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(
  process.env.VIM_SNIPPETS_DIR ||
    path.join(process.env.HOME || "", ".local/share/nvim/plugged/vim-snippets/snippets")
);
const generatedRoot = path.join(repoRoot, "snippets", "generated");
const packagePath = path.join(repoRoot, "package.json");

const languageAliases = new Map(
  Object.entries({
    angular_coffee: "coffeescript",
    bash: "shellscript",
    coffee: "coffeescript",
    codeigniter: "php",
    cs: "csharp",
    "dart-flutter": "dart",
    dosini: "ini",
    eruby: ["erb", "html"],
    gitcommit: "git-commit",
    htmldjango: "django-html",
    htmltornado: "html",
    jade: "pug",
    "javascript-bemjson": "javascript",
    "javascript-d3": "javascript",
    "javascript-jasmine": "javascript",
    "javascript-jquery": "javascript",
    "javascript-mocha": "javascript",
    "javascript-openui5": "javascript",
    "javascript-react": "javascriptreact",
    "javascript-redux": ["javascript", "javascriptreact"],
    "javascript-requirejs": "javascript",
    "javascript.node": "javascript",
    jquery_coffee: "coffeescript",
    laravel: "php",
    ls: "livescript",
    make: "makefile",
    mustache: "handlebars",
    objc: "objective-c",
    pandoc: "markdown",
    perl6: ["raku", "perl6"],
    phoenix: "elixir",
    ps1: "powershell",
    rails: "ruby",
    requirejs_coffee: "coffeescript",
    rmd: ["rmd", "markdown"],
    rst: "restructuredtext",
    sh: "shellscript",
    simplemvcf: "php",
    snippets: "snippets",
    tex: "latex",
    vim: ["viml", "vimscript"],
    yii: "php",
    "yii-chtml": "php",
    zsh: "shellscript"
  })
);

function main() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Snippet source directory not found: ${sourceRoot}`);
  }

  cleanGeneratedRoot();

  const sourceFiles = listSnippetFiles(sourceRoot);
  const parsedFiles = sourceFiles.map(parseSnippetFile);
  const sourceByFiletype = groupByFiletype(parsedFiles);
  const generatedFiles = new Map();

  for (const parsed of parsedFiles) {
    if (parsed.snippets.length === 0) {
      continue;
    }

    const outputRelative = generatedRelativePath(parsed.relativePath);
    const outputPath = path.join(generatedRoot, outputRelative);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(toVSCodeSnippetObject(parsed), null, 2) + "\n");
    generatedFiles.set(parsed.relativePath, `./${path.posix.join("snippets/generated", outputRelative)}`);
  }

  const contributions = buildSnippetContributions(parsedFiles, sourceByFiletype, generatedFiles);
  updatePackageJson(contributions);

  const snippetCount = parsedFiles.reduce((sum, parsed) => sum + parsed.snippets.length, 0);
  console.log(
    `Generated ${snippetCount} snippets from ${parsedFiles.length} files into ${path.relative(repoRoot, generatedRoot)}`
  );
  console.log(`Updated package.json with ${contributions.length} snippet contributions`);
}

function cleanGeneratedRoot() {
  fs.rmSync(generatedRoot, { recursive: true, force: true });
  fs.mkdirSync(generatedRoot, { recursive: true });
}

function listSnippetFiles(root) {
  const results = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listSnippetFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".snippets")) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b)));
}

function parseSnippetFile(filePath) {
  const relativePath = toPosix(path.relative(sourceRoot, filePath));
  const filetype = path.basename(relativePath, ".snippets");
  const content = fs.readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n");
  const lines = content.split("\n");
  const snippets = [];
  const extendsFiletypes = [];
  let current = null;

  const finishCurrent = () => {
    if (!current) {
      return;
    }

    while (current.body.length > 0 && current.body[current.body.length - 1] === "") {
      current.body.pop();
    }

    if (current.trigger && current.body.length > 0) {
      snippets.push(current);
    }

    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const snippetMatch = /^snippet(?:\s+(.*))?$/.exec(line);
    if (snippetMatch) {
      finishCurrent();
      current = {
        ...parseSnippetHeader(snippetMatch[1] || ""),
        body: [],
        line: index + 1,
        source: relativePath
      };
      continue;
    }

    const extendsMatch = /^extends\s+(.+)$/.exec(line);
    if (extendsMatch) {
      finishCurrent();
      extendsFiletypes.push(
        ...extendsMatch[1]
          .split(/[,\s]+/)
          .map((name) => name.trim())
          .filter(Boolean)
      );
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.trim() === "") {
      current.body.push("");
      continue;
    }

    if (/^\s/.test(line)) {
      current.body.push(convertBodyLine(unindentSnippetBodyLine(line)));
      continue;
    }

    finishCurrent();
  }

  finishCurrent();

  return {
    relativePath,
    filetype,
    extendsFiletypes,
    snippets
  };
}

function parseSnippetHeader(rawHeader) {
  const trimmed = rawHeader.trimEnd();
  if (!trimmed) {
    return { trigger: "", description: "" };
  }

  const firstSpace = trimmed.search(/\s/);
  const trigger = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace).trim();

  if (!rest) {
    return { trigger, description: "" };
  }

  if (rest.startsWith('"')) {
    const parsed = parseQuotedDescription(rest);
    return { trigger, description: parsed.description };
  }

  return { trigger, description: rest };
}

function parseQuotedDescription(rest) {
  for (let index = rest.length - 1; index > 0; index -= 1) {
    if (rest[index] !== '"' || isEscaped(rest, index)) {
      continue;
    }

    return {
      description: rest
        .slice(1, index)
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\"),
      remaining: rest.slice(index + 1).trim()
    };
  }

  return { description: rest.slice(1), remaining: "" };
}

function isEscaped(value, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function unindentSnippetBodyLine(line) {
  if (line.startsWith("\t")) {
    return line.slice(1);
  }

  if (line.startsWith("    ")) {
    return line.slice(4);
  }

  return line.replace(/^ {1,3}/, "");
}

function convertBodyLine(line) {
  return escapeLiteralDollars(convertVimExpressions(line.replace(/\$\{VISUAL\}/g, "${TM_SELECTED_TEXT}")));
}

function convertVimExpressions(line) {
  let output = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\\" && line[index + 1] === "`") {
      output += "`";
      index += 1;
      continue;
    }

    if (char !== "`") {
      output += char;
      continue;
    }

    const end = findClosingBacktick(line, index + 1);
    if (end === -1) {
      output += char;
      continue;
    }

    output += convertVimExpression(line.slice(index + 1, end));
    index = end;
  }

  return output;
}

function findClosingBacktick(value, start) {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "`" && !isEscaped(value, index)) {
      return index;
    }
  }

  return -1;
}

function convertVimExpression(expression) {
  const normalized = expression.trim();
  const withoutPrefix = normalized.replace(/^!(?:v|p)\s+/, "");

  if (/^g:snips_author$/.test(withoutPrefix)) {
    return "author";
  }

  if (/^g:snips_email$/.test(withoutPrefix)) {
    return "email";
  }

  if (/^g:snips_github$/.test(withoutPrefix)) {
    return "github";
  }

  if (/^@[*+]$/.test(withoutPrefix)) {
    return "${CLIPBOARD}";
  }

  if (/^indent\('\.'\)\s*\?\s*'self'\s*:\s*''$/.test(withoutPrefix)) {
    return "self";
  }

  if (/^&enc\[:2\]\s*==\s*"utf"\s*\?\s*"\u00a9"\s*:\s*"\(c\)"$/.test(withoutPrefix)) {
    return "(c)";
  }

  const strftime = /^strftime\(["']([^"']+)["']\)$/.exec(withoutPrefix);
  if (strftime) {
    return convertStrftimeFormat(strftime[1]);
  }

  if (/vim_snippets#Filename|Filename\(|expand\('%|fnamemodify\(bufname/.test(withoutPrefix)) {
    return "${TM_FILENAME_BASE}";
  }

  if (/^system\("grep/.test(withoutPrefix)) {
    return "author";
  }

  return expression;
}

function convertStrftimeFormat(format) {
  const tokenMap = new Map(
    Object.entries({
      "%Y": "${CURRENT_YEAR}",
      "%y": "${CURRENT_YEAR_SHORT}",
      "%m": "${CURRENT_MONTH}",
      "%B": "${CURRENT_MONTH_NAME}",
      "%b": "${CURRENT_MONTH_NAME_SHORT}",
      "%d": "${CURRENT_DATE}",
      "%H": "${CURRENT_HOUR}",
      "%M": "${CURRENT_MINUTE}",
      "%S": "${CURRENT_SECOND}"
    })
  );

  return format.replace(/%[YymBbdHMS]/g, (token) => tokenMap.get(token) || token);
}

function escapeLiteralDollars(line) {
  let output = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\\" && next === "$") {
      output += "\\$";
      index += 1;
      continue;
    }

    if (char !== "$") {
      output += char;
      continue;
    }

    if (/[0-9]/.test(next || "")) {
      output += "$";
      continue;
    }

    if (next === "{") {
      const rest = line.slice(index);
      if (/^\$\{[0-9]/.test(rest) || /^\$\{(?:TM|CURRENT|CLIPBOARD|WORKSPACE|RELATIVE|LINE|BLOCK|RANDOM|UUID)_?[A-Z0-9_]*\}/.test(rest)) {
        output += "$";
        continue;
      }
    }

    output += "\\$";
  }

  return output;
}

function toVSCodeSnippetObject(parsed) {
  const snippets = {};
  const usedNames = new Set();

  for (const snippet of parsed.snippets) {
    let name = snippet.description
      ? `${snippet.trigger} - ${snippet.description}`
      : snippet.trigger;

    if (!name) {
      name = `${parsed.filetype} snippet`;
    }

    if (usedNames.has(name)) {
      name = `${name} (${snippet.line})`;
    }
    usedNames.add(name);

    snippets[name] = {
      prefix: snippet.trigger,
      body: snippet.body,
      description: snippet.description || `vim-snippets/${snippet.source}:${snippet.line}`
    };
  }

  return snippets;
}

function buildSnippetContributions(parsedFiles, sourceByFiletype, generatedFiles) {
  const contributions = [];
  const contributionKeys = new Set();
  const parsedByRelativePath = new Map(parsedFiles.map((parsed) => [parsed.relativePath, parsed]));
  const globalPath = generatedFiles.get("_.snippets");

  const addContribution = (language, generatedPath) => {
    if (!language || !generatedPath) {
      return;
    }

    const key = `${language}\0${generatedPath}`;
    if (contributionKeys.has(key)) {
      return;
    }

    contributionKeys.add(key);
    contributions.push({ language, path: generatedPath });
  };

  for (const parsed of parsedFiles) {
    if (parsed.relativePath === "_.snippets" || parsed.snippets.length === 0) {
      continue;
    }

    const generatedPath = generatedFiles.get(parsed.relativePath);
    for (const language of languagesForFiletype(parsed.filetype)) {
      addContribution(language, generatedPath);

      for (const inherited of inheritedSources(parsed, sourceByFiletype, parsedByRelativePath)) {
        addContribution(language, generatedFiles.get(inherited.relativePath));
      }
    }
  }

  const languages = [...new Set(contributions.map((contribution) => contribution.language))].sort();
  if (globalPath) {
    for (const language of ["plaintext", ...languages]) {
      addContribution(language, globalPath);
    }
  }

  return contributions.sort((left, right) => {
    const languageCompare = left.language.localeCompare(right.language);
    if (languageCompare !== 0) {
      return languageCompare;
    }
    return left.path.localeCompare(right.path);
  });
}

function inheritedSources(parsed, sourceByFiletype, parsedByRelativePath, seen = new Set()) {
  const inherited = [];

  for (const extendedFiletype of parsed.extendsFiletypes) {
    if (seen.has(extendedFiletype)) {
      continue;
    }
    seen.add(extendedFiletype);

    for (const source of sourceByFiletype.get(extendedFiletype) || []) {
      if (source.relativePath === "_.snippets") {
        continue;
      }

      if (source.snippets.length > 0) {
        inherited.push(source);
      }

      inherited.push(...inheritedSources(source, sourceByFiletype, parsedByRelativePath, seen));
    }
  }

  return inherited;
}

function groupByFiletype(parsedFiles) {
  const byFiletype = new Map();

  for (const parsed of parsedFiles) {
    const entries = byFiletype.get(parsed.filetype) || [];
    entries.push(parsed);
    byFiletype.set(parsed.filetype, entries);
  }

  return byFiletype;
}

function languagesForFiletype(filetype) {
  if (filetype === "_" || filetype === "all") {
    return [];
  }

  const alias = languageAliases.get(filetype);
  const languages = alias ? (Array.isArray(alias) ? alias : [alias]) : [filetype];
  return [...new Set(languages.map((language) => language.trim()).filter(Boolean))];
}

function generatedRelativePath(relativePath) {
  const parsed = path.posix.parse(relativePath);
  const directory = parsed.dir;
  const fileName = `${parsed.name}.json`;
  return directory ? path.posix.join(directory, fileName) : fileName;
}

function updatePackageJson(contributions) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  packageJson.contributes = packageJson.contributes || {};
  packageJson.contributes.snippets = contributions;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n");
}

function toPosix(value) {
  return value.split(path.sep).join(path.posix.sep);
}

main();
