const API = {
  pages: "/api/v1/pages",
  search: "/api/v1/search",
};

/** @type {Array<{ slug: string; title: string; revision: number; updatedBy: string; updatedAt: string }>} */
let pages = [];
/** @type {{ slug: string; title: string; body: string; revision: number; updatedBy: string; updatedAt: string } | null} */
let currentPage = null;

const pageListEl = document.getElementById("page-list");
const pageMetaEl = document.getElementById("page-meta");
const pageRenderEl = document.getElementById("page-render");
const searchInputEl = document.getElementById("search-input");
const searchResultsEl = document.getElementById("search-results");
const viewModeEl = document.getElementById("view-mode");
const editModeEl = document.getElementById("edit-mode");
const editSlugEl = document.getElementById("edit-slug");
const editTitleEl = document.getElementById("edit-title");
const editBodyEl = document.getElementById("edit-body");
const editErrorEl = document.getElementById("edit-error");
const editBtn = document.getElementById("edit-btn");
const deleteBtn = document.getElementById("delete-btn");

document.getElementById("refresh-btn")?.addEventListener("click", () => {
  void loadPages();
});

document.getElementById("home-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  if (pages.some((page) => page.slug === ROOT_PAGE_SLUG)) {
    void loadPage(ROOT_PAGE_SLUG);
  }
});

document.getElementById("search-btn")?.addEventListener("click", () => {
  void runSearch();
});

searchInputEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void runSearch();
  }
});

editBtn?.addEventListener("click", () => {
  if (!currentPage) return;
  showEditMode(currentPage);
});

document.getElementById("cancel-btn")?.addEventListener("click", () => {
  hideEditMode();
});

document.getElementById("save-btn")?.addEventListener("click", () => {
  void savePage();
});

deleteBtn?.addEventListener("click", () => {
  void deleteCurrentPage();
});

document.getElementById("new-page-btn")?.addEventListener("click", () => {
  const slug = prompt("New page slug (e.g. projects/digital-worker):");
  if (!slug?.trim()) return;
  currentPage = {
    slug: slug.trim(),
    title: "",
    body: "## Overview\n\n",
    revision: 0,
    updatedBy: "operator",
    updatedAt: new Date().toISOString(),
  };
  showEditMode(currentPage, true);
});

const ROOT_PAGE_SLUG = "Home";

async function loadPages() {
  const response = await fetch(API.pages);
  if (!response.ok) {
    pageRenderEl.textContent = "Failed to load pages.";
    return;
  }
  const body = await response.json();
  pages = body.pages ?? [];
  renderPageTree();
}

function renderPageTree() {
  if (!pageListEl) return;
  pageListEl.innerHTML = "";
  const tree = buildPageTree(pages);
  const childNodes = sortTreeNodes([...tree.children.values()]);
  for (const node of childNodes) {
    pageListEl.appendChild(renderTreeNode(node));
  }
}

function buildPageTree(pageList) {
  const root = createTreeNode("");
  for (const page of pageList) {
    const segments = page.slug.split("/");
    let node = root;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i] ?? "";
      if (!node.children.has(segment)) {
        node.children.set(segment, createTreeNode(segment));
      }
      node = node.children.get(segment);
      if (i === segments.length - 1) {
        node.page = page;
      }
    }
  }
  return root;
}

function createTreeNode(name) {
  return { name, children: new Map(), page: null };
}

function sortTreeNodes(nodes) {
  return nodes.sort((a, b) => compareTreeNodes(a, b));
}

function compareTreeNodes(a, b) {
  if (a.name === ROOT_PAGE_SLUG) return -1;
  if (b.name === ROOT_PAGE_SLUG) return 1;
  if (a.name.startsWith("_") && !b.name.startsWith("_")) return 1;
  if (!a.name.startsWith("_") && b.name.startsWith("_")) return -1;
  const aIsFolder = a.children.size > 0;
  const bIsFolder = b.children.size > 0;
  if (aIsFolder && !bIsFolder) return -1;
  if (!aIsFolder && bIsFolder) return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function renderTreeNode(node) {
  const li = document.createElement("li");
  const hasChildren = node.children.size > 0;

  if (hasChildren) {
    const label = document.createElement(node.page ? "a" : "span");
    label.textContent = nodeLabel(node);
    if (node.page) {
      label.href = "#";
      label.classList.add("tree-folder-label", "is-page");
      label.dataset.slug = node.page.slug;
      if (currentPage?.slug === node.page.slug) {
        label.classList.add("active");
      }
      label.addEventListener("click", (event) => {
        event.preventDefault();
        void loadPage(node.page.slug);
      });
    } else {
      label.classList.add("tree-folder-label");
    }
    li.appendChild(label);

    const childList = document.createElement("ul");
    for (const child of sortTreeNodes([...node.children.values()])) {
      childList.appendChild(renderTreeNode(child));
    }
    li.appendChild(childList);
    return li;
  }

  const link = document.createElement("a");
  link.href = "#";
  link.textContent = nodeLabel(node);
  link.dataset.slug = node.page?.slug ?? node.name;
  if (currentPage?.slug === node.page?.slug) {
    link.classList.add("active");
  }
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (node.page) {
      void loadPage(node.page.slug);
    }
  });
  li.appendChild(link);
  return li;
}

function nodeLabel(node) {
  if (node.page?.title) {
    return node.page.title;
  }
  if (node.name.startsWith("_")) {
    return node.name.slice(1);
  }
  return node.name;
}

async function loadPage(slug) {
  hideSearchResults();
  const response = await fetch(`${API.pages}/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    pageRenderEl.textContent = `Failed to load ${slug}.`;
    return;
  }
  const body = await response.json();
  currentPage = body.page;
  renderCurrentPage();
  renderPageTree();
  updatePageActionButtons();
  history.replaceState(null, "", `#${encodeURIComponent(slug)}`);
}

function updatePageActionButtons() {
  const hasPage = Boolean(currentPage);
  if (editBtn) editBtn.disabled = !hasPage;
  if (deleteBtn) {
    deleteBtn.disabled = !hasPage || currentPage?.slug === ROOT_PAGE_SLUG;
  }
}

async function deleteCurrentPage() {
  if (!currentPage) return;
  const slug = currentPage.slug;
  const label = currentPage.title || slug;
  const confirmed = confirm(
    `Delete wiki page "${label}" (${slug})? This cannot be undone.`,
  );
  if (!confirmed) return;

  const response = await fetch(`${API.pages}/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deletedBy: "operator",
      ifRevision: currentPage.revision,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    alert(err?.error?.message ?? `Delete failed (${response.status})`);
    return;
  }

  currentPage = null;
  pageMetaEl.textContent = "";
  pageRenderEl.textContent = "Page deleted.";
  updatePageActionButtons();
  await loadPages();
  if (pages.some((page) => page.slug === ROOT_PAGE_SLUG)) {
    await loadPage(ROOT_PAGE_SLUG);
  }
}

function renderCurrentPage() {
  if (!currentPage) return;
  pageMetaEl.textContent = `${currentPage.title} · rev ${currentPage.revision} · ${currentPage.updatedBy} · ${formatDate(currentPage.updatedAt)}`;
  pageRenderEl.innerHTML = renderMarkdown(currentPage.body);
}

function showEditMode(page, isNew = false) {
  viewModeEl?.classList.add("hidden");
  editModeEl?.classList.remove("hidden");
  editSlugEl.value = page.slug;
  editSlugEl.readOnly = !isNew;
  editTitleEl.value = page.title;
  editBodyEl.value = page.body;
  editErrorEl?.classList.add("hidden");
}

function hideEditMode() {
  viewModeEl?.classList.remove("hidden");
  editModeEl?.classList.add("hidden");
}

async function savePage() {
  const slug = editSlugEl.value.trim();
  const title = editTitleEl.value.trim();
  const body = editBodyEl.value;
  if (!slug) return;

  const payload = {
    title: title || undefined,
    body,
    updatedBy: "operator",
  };
  if (currentPage && currentPage.revision > 0) {
    payload.ifRevision = currentPage.revision;
  }

  const response = await fetch(`${API.pages}/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    editErrorEl.textContent = err?.error?.message ?? `Save failed (${response.status})`;
    editErrorEl.classList.remove("hidden");
    return;
  }

  const saved = await response.json();
  currentPage = saved.page;
  hideEditMode();
  await loadPages();
  renderCurrentPage();
  renderPageTree();
}

async function runSearch() {
  const query = searchInputEl?.value.trim() ?? "";
  if (!query) {
    hideSearchResults();
    return;
  }
  const response = await fetch(
    `${API.search}?q=${encodeURIComponent(query)}&limit=20`,
  );
  if (!response.ok) return;
  const body = await response.json();
  const hits = body.hits ?? [];
  searchResultsEl.classList.remove("hidden");
  if (hits.length === 0) {
    searchResultsEl.innerHTML = `<p class="muted">No results for "${escapeHtml(query)}".</p>`;
    return;
  }
  searchResultsEl.innerHTML = hits
    .map(
      (hit) => `
      <div class="search-hit">
        <a href="#" data-slug="${escapeAttr(hit.slug)}">${escapeHtml(hit.slug)}</a>
        <span class="muted"> · ${escapeHtml(hit.section)}</span>
        <p>${escapeHtml(hit.content.slice(0, 200))}${hit.content.length > 200 ? "…" : ""}</p>
      </div>`,
    )
    .join("");

  searchResultsEl.querySelectorAll("a[data-slug]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const slug = link.getAttribute("data-slug");
      if (slug) void loadPage(slug);
    });
  });
}

function hideSearchResults() {
  searchResultsEl?.classList.add("hidden");
  if (searchResultsEl) searchResultsEl.innerHTML = "";
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderMarkdown(text) {
  return splitMarkdownBlocks(text)
    .map((block) =>
      block.type === "table"
        ? renderTable(block.lines)
        : renderTextBlock(block.text),
    )
    .join("\n");
}

function splitMarkdownBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let textBuffer = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ type: "text", text: textBuffer.join("\n") });
      textBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    if (isTableRow(line) && isTableSeparator(next)) {
      flushText();
      const tableLines = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        tableLines.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ type: "table", lines: tableLines });
      i -= 1;
      continue;
    }
    textBuffer.push(line);
  }

  flushText();
  return blocks;
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!isTableRow(trimmed)) {
    return false;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableCells(line) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines) {
  if (lines.length < 2) {
    return renderTextBlock(lines.join("\n"));
  }

  const headerCells = parseTableCells(lines[0] ?? "");
  const bodyLines = lines.slice(2);

  let html = '<table class="wiki-table"><thead><tr>';
  for (const cell of headerCells) {
    html += `<th>${renderInlineMarkdown(cell)}</th>`;
  }
  html += "</tr></thead><tbody>";

  for (const rowLine of bodyLines) {
    const cells = parseTableCells(rowLine);
    html += "<tr>";
    for (const cell of cells) {
      html += `<td>${renderInlineMarkdown(cell)}</td>`;
    }
    html += "</tr>";
  }

  html += "</tbody></table>";
  return html;
}

function renderTextBlock(text) {
  if (!text.trim()) {
    return "";
  }

  const lines = text.split("\n");
  const parts = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (isListLine(line)) {
      const listLines = [];
      while (index < lines.length && isListLine(lines[index] ?? "")) {
        const match = (lines[index] ?? "").match(/^(\s*)- (.+)$/);
        if (match) {
          listLines.push({ spaces: match[1].length, text: match[2] });
        }
        index += 1;
      }
      if (listLines.length > 0) {
        parts.push(renderListItems(listLines, 0, listLines[0].spaces).html);
      }
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (!current.trim() || isListLine(current)) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    if (paragraphLines.length > 0) {
      parts.push(renderParagraphLines(paragraphLines.join("\n")));
    }
  }

  return parts.join("\n");
}

function isListLine(line) {
  return /^(\s*)- .+/.test(line);
}

function renderListItems(items, start, parentSpaces) {
  let html = "<ul>";
  let index = start;

  while (index < items.length) {
    const item = items[index];
    if (!item || item.spaces < parentSpaces) {
      break;
    }
    if (item.spaces > parentSpaces) {
      index += 1;
      continue;
    }

    html += `<li>${renderInlineMarkdown(item.text)}`;
    index += 1;

    if (index < items.length && items[index].spaces > parentSpaces) {
      const nested = renderListItems(items, index, items[index].spaces);
      html += nested.html;
      index = nested.index;
    }

    html += "</li>";
  }

  html += "</ul>";
  return { html, index };
}

function renderParagraphLines(text) {
  let html = escapeHtml(text);
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = renderInlineMarkdownInHtml(html);
  html = html.replace(/\n\n+/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  return `<p>${html}</p>`;
}

function renderInlineMarkdown(text) {
  return renderInlineMarkdownInHtml(escapeHtml(text));
}

function renderInlineMarkdownInHtml(html) {
  return renderWikiLinks(html)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

function renderWikiLinks(html) {
  let result = html.replace(
    /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,
    (_match, target, label) => wikiLinkHtml(target.trim(), (label ?? target).trim()),
  );
  result = result.replace(
    /\[([^\]|]+)\|([^\]]+)\]/g,
    (_match, target, label) => wikiLinkHtml(target.trim(), label.trim()),
  );
  return result;
}

function wikiLinkHtml(slug, label) {
  const safeSlug = encodeURIComponent(slug);
  const text = label || slug;
  return `<a href="#${safeSlug}" class="wiki-link">${text}</a>`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

async function bootstrap() {
  await loadPages();
  const hashSlug = decodeHashSlug(location.hash);
  const initialSlug =
    hashSlug && pages.some((page) => page.slug === hashSlug)
      ? hashSlug
      : pages.some((page) => page.slug === ROOT_PAGE_SLUG)
        ? ROOT_PAGE_SLUG
        : pages[0]?.slug;
  if (initialSlug) {
    await loadPage(initialSlug);
  }
}

function decodeHashSlug(hash) {
  if (!hash || hash === "#") {
    return "";
  }
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return "";
  }
}

window.addEventListener("hashchange", () => {
  const slug = decodeHashSlug(location.hash);
  if (!slug || slug === currentPage?.slug) {
    return;
  }
  if (pages.some((page) => page.slug === slug)) {
    void loadPage(slug);
  }
});

void bootstrap();
