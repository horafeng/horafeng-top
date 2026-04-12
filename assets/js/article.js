import { escapeHtml, loadArticleDetail, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";

function escapeAttr(text) {
  return String(text).replaceAll('"', "&quot;");
}

function renderRichText(richText = []) {
  if (!Array.isArray(richText) || !richText.length) {
    return "";
  }

  return richText
    .map((segment) => {
      let html = escapeHtml(segment?.plain_text || "").replaceAll("\n", "<br>");
      const annotations = segment?.annotations || {};

      if (annotations.code) {
        html = `<code class="article-inline-code">${html}</code>`;
      }
      if (annotations.bold) {
        html = `<strong>${html}</strong>`;
      }
      if (annotations.italic) {
        html = `<em>${html}</em>`;
      }
      if (annotations.strikethrough) {
        html = `<s>${html}</s>`;
      }
      if (annotations.underline) {
        html = `<u>${html}</u>`;
      }
      if (segment?.href) {
        html = `<a href="${escapeAttr(segment.href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
      }

      return html;
    })
    .join("");
}

function getBlockHtmlText(block) {
  if (Array.isArray(block?.rich_text) && block.rich_text.length) {
    return renderRichText(block.rich_text);
  }

  if (typeof block?.text === "string" && block.text.trim()) {
    return escapeHtml(block.text).replaceAll("\n", "<br>");
  }

  return "";
}

function renderBookmarkBlock(block) {
  return `
    <a class="article-bookmark" href="${escapeAttr(block.url || "#")}" target="_blank" rel="noopener noreferrer">
      <span>\u4e66\u7b7e\u94fe\u63a5</span>
      <strong>${escapeHtml(block.url || "")}</strong>
    </a>
  `;
}

function renderEmbedBlock(block) {
  return `
    <a class="article-embed-link" href="${escapeAttr(block.url || "#")}" target="_blank" rel="noopener noreferrer">
      <span>\u5d4c\u5165\u5185\u5bb9</span>
      <strong>${escapeHtml(block.url || "")}</strong>
    </a>
  `;
}

function renderImageBlock(block) {
  if (!block?.url) {
    return "";
  }

  return `
    <figure class="article-image">
      <img src="${escapeAttr(block.url)}" alt="${escapeAttr(block.caption || block.text || "\u6587\u7ae0\u914d\u56fe")}" loading="lazy" />
      ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}
    </figure>
  `;
}

function renderCodeBlock(block) {
  const text = getBlockHtmlText(block);
  if (!text) {
    return "";
  }

  return `<pre class="article-code"><code data-language="${escapeAttr(block.language || "")}">${text}</code></pre>`;
}

function renderList(blocks = [], startIndex = 0, type = "bulleted_list_item") {
  const tagName = type === "numbered_list_item" ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < blocks.length && blocks[index]?.type === type) {
    const block = blocks[index];
    const text = getBlockHtmlText(block);
    const children = renderBlocks(block.children || []);
    items.push(`<li>${text ? `<p>${text}</p>` : ""}${children}</li>`);
    index += 1;
  }

  return {
    html: `<${tagName}>${items.join("")}</${tagName}>`,
    nextIndex: index,
  };
}

function renderBlock(block) {
  const text = getBlockHtmlText(block);

  switch (block?.type) {
    case "heading_1":
      return text ? `<h2>${text}</h2>` : "";
    case "heading_2":
      return text ? `<h3>${text}</h3>` : "";
    case "heading_3":
      return text ? `<h4>${text}</h4>` : "";
    case "paragraph":
      return text ? `<p>${text}</p>${renderBlocks(block.children || [])}` : renderBlocks(block.children || []);
    case "quote":
      return `<blockquote>${text || ""}${renderBlocks(block.children || [])}</blockquote>`;
    case "callout":
      return `
        <div class="article-callout">
          <div class="article-callout-icon">${escapeHtml(block.text || "\u2726")}</div>
          <div class="article-callout-copy">${renderBlocks(block.children || []) || (text ? `<p>${text}</p>` : "")}</div>
        </div>
      `;
    case "bookmark":
      return renderBookmarkBlock(block);
    case "embed":
      return renderEmbedBlock(block);
    case "image":
      return renderImageBlock(block);
    case "code":
      return renderCodeBlock(block);
    case "divider":
      return "<hr />";
    case "table_of_contents":
      return "";
    default:
      return text ? `<p>${text}</p>${renderBlocks(block.children || [])}` : renderBlocks(block.children || []);
  }
}

function renderBlocks(blocks = []) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return "";
  }

  const html = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    if (block?.type === "bulleted_list_item" || block?.type === "numbered_list_item") {
      const list = renderList(blocks, index, block.type);
      html.push(list.html);
      index = list.nextIndex;
      continue;
    }

    html.push(renderBlock(block));
    index += 1;
  }

  return html.filter(Boolean).join("");
}

function renderArticle(meta, item) {
  const breadcrumb = document.getElementById("article-breadcrumb-current");
  const hero = document.getElementById("article-hero");
  const body = document.getElementById("article-body");

  document.title = `${meta.title} | HoraFeng`;
  breadcrumb.textContent = meta.title;

  const metaBits = [
    meta.date ? `\u53d1\u5e03\u65f6\u95f4\uff1a${escapeHtml(meta.date)}` : "",
    meta.category ? `\u5206\u7c7b\uff1a${escapeHtml(meta.category)}` : "",
    meta.tags.length ? `\u6807\u7b7e\uff1a${meta.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}` : "",
  ].filter(Boolean);

  hero.innerHTML = `
    ${meta.images[0] ? `<img class="article-cover" src="${escapeAttr(meta.images[0])}" alt="${escapeAttr(meta.title)}" loading="lazy" />` : ""}
    <h1 class="article-title">${escapeHtml(meta.title)}</h1>
    ${meta.summary ? `<p class="article-summary">${escapeHtml(meta.summary)}</p>` : ""}
    <div class="article-meta-line">${metaBits.map((bit) => `<span>${bit}</span>`).join("")}</div>
    <div class="chips">${meta.tags.map((tag) => `<a class="chip" href="index.html?tag=${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join("")}</div>
  `;

  const renderedBody = renderBlocks(item.blocks || []);
  body.innerHTML = renderedBody || '<div class="article-empty">\u8fd9\u7bc7\u6587\u7ae0\u7684\u6b63\u6587\u6682\u65f6\u4e3a\u7a7a\u3002</div>';
}

async function main() {
  setupSplash();
  setupPageTransition();
  setupSiteChrome({
    scrollContainerSelector: ".flow-panel",
    useWindowScroll: true,
  });

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const detail = await loadArticleDetail(slug);
  renderArticle(detail.meta, detail.item);
}

main().catch((error) => {
  const breadcrumb = document.getElementById("article-breadcrumb-current");
  const hero = document.getElementById("article-hero");
  const body = document.getElementById("article-body");

  document.title = "\u6587\u7ae0\u4e0d\u53ef\u7528 | HoraFeng";
  breadcrumb.textContent = "\u5185\u5bb9\u4e0d\u53ef\u7528";
  hero.innerHTML = '<h1 class="article-title">\u5185\u5bb9\u4e0d\u53ef\u7528</h1>';
  body.innerHTML = `<div class="article-empty">${escapeHtml(error.message || "\u52a0\u8f7d\u5931\u8d25")}</div>`;
});
