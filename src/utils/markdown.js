function escapeMarkdownHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function applyInlineStyles(value) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

function renderInlineMarkdown(value) {
  const tokens = [];
  const addToken = (html) => {
    const token = `@@VPBMD${tokens.length}@@`;
    tokens.push({ token, html });
    return token;
  };

  let source = String(value ?? "");
  source = source.replace(/`([^`\n]+)`/g, (_, code) => addToken(`<code>${escapeMarkdownHtml(code)}</code>`));
  source = source.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    if (!/^(https?:|mailto:)/i.test(href)) return match;
    return addToken(`<a href="${escapeMarkdownHtml(href)}" target="_blank" rel="noopener noreferrer">${applyInlineStyles(escapeMarkdownHtml(label))}</a>`);
  });

  let rendered = applyInlineStyles(escapeMarkdownHtml(source));
  tokens.forEach(({ token, html }) => {
    rendered = rendered.replace(token, html);
  });
  return rendered;
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isBlockStart(lines, index) {
  const line = lines[index] || "";
  if (!line.trim()) return true;
  if (/^\s*```/.test(line)) return true;
  if (/^\s{0,3}#{1,6}\s+/.test(line)) return true;
  if (/^\s*>\s?/.test(line)) return true;
  if (/^\s*[-+*]\s+/.test(line)) return true;
  if (/^\s*\d+[.)]\s+/.test(line)) return true;
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
  return line.includes("|") && isTableDivider(lines[index + 1] || "");
}

function renderListItem(value) {
  const task = value.match(/^\[([ xX])\]\s+(.+)$/);
  if (!task) return `<li>${renderInlineMarkdown(value)}</li>`;
  const checked = task[1].toLowerCase() === "x";
  return `<li class="markdown-task"><input type="checkbox" disabled ${checked ? "checked" : ""} /><span>${renderInlineMarkdown(task[2])}</span></li>`;
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` class="language-${escapeMarkdownHtml(fence[1])}"` : "";
      output.push(`<pre><code${language}>${escapeMarkdownHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      output.push("<hr />");
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${quote.map((item) => renderInlineMarkdown(item)).join("<br />")}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    if (unordered) {
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*[-+*]\s+(.+)$/);
        if (!match) break;
        items.push(renderListItem(match[1]));
        index += 1;
      }
      output.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(renderListItem(match[1]));
        index += 1;
      }
      output.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
      const headers = splitTableRow(line);
      const dividers = splitTableRow(lines[index + 1]);
      const alignments = dividers.map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left");
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const head = headers.map((cell, cellIndex) => `<th class="align-${alignments[cellIndex] || "left"}">${renderInlineMarkdown(cell)}</th>`).join("");
      const body = rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td class="align-${alignments[cellIndex] || "left"}">${renderInlineMarkdown(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("");
      output.push(`<div class="markdown-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return output.join("\n");
}

