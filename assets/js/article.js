import { escapeHtml, loadArticleDetail, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";

function escapeAttr(text) {
  return String(text).replaceAll('"', "&quot;");
}

function getPlainText(richText = []) {
  return (Array.isArray(richText) ? richText : []).map((segment) => segment?.plain_text || "").join("");
}

function colorClassName(color) {
  const token = String(color || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]+/g, "");

  if (!token || token === "default") {
    return "";
  }

  return `article-rt-${token.replaceAll("_", "-")}`;
}

function wrapWithTag(html, condition, startTag, endTag) {
  return condition ? `${startTag}${html}${endTag}` : html;
}

function renderRichText(richText = []) {
  if (!Array.isArray(richText) || !richText.length) {
    return "";
  }

  return richText
    .map((segment) => {
      let html = escapeHtml(segment?.plain_text || "").replaceAll("\n", "<br>");
      const annotations = segment?.annotations || {};

      html = wrapWithTag(html, annotations.code, '<code class="article-inline-code">', "</code>");
      html = wrapWithTag(html, annotations.bold, "<strong>", "</strong>");
      html = wrapWithTag(html, annotations.italic, "<em>", "</em>");
      html = wrapWithTag(html, annotations.strikethrough, "<s>", "</s>");
      html = wrapWithTag(html, annotations.underline, "<u>", "</u>");

      const colorClass = colorClassName(annotations.color);
      if (colorClass) {
        html = `<span class="${colorClass}">${html}</span>`;
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

function getBlockPlainText(block) {
  if (Array.isArray(block?.rich_text) && block.rich_text.length) {
    return escapeHtml(getPlainText(block.rich_text));
  }

  if (typeof block?.text === "string" && block.text.trim()) {
    return escapeHtml(block.text);
  }

  return "";
}

function getUrlMeta(url) {
  try {
    const parsed = new URL(url);
    return {
      hostname: parsed.hostname.replace(/^www\./i, ""),
      displayUrl: `${parsed.hostname.replace(/^www\./i, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`,
      href: parsed.toString(),
    };
  } catch {
    return {
      hostname: "",
      displayUrl: url || "",
      href: url || "#",
    };
  }
}

function getBookmarkTitle(block) {
  const caption = String(block?.caption || "").trim();
  if (caption) {
    return caption;
  }

  const { hostname } = getUrlMeta(block?.url || "");
  return hostname || "\u5916\u90e8\u94fe\u63a5";
}

function getEmbedFrame(url) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, "");

    if (hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }

    if (hostname === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }

    if (hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }

    if (hostname.includes("bilibili.com")) {
      if (parsed.pathname.includes("/player.html")) {
        parsed.protocol = "https:";
        return parsed.toString();
      }
      const bvid = parsed.searchParams.get("bvid");
      if (bvid) {
        return `https://player.bilibili.com/player.html?isOutside=true&bvid=${encodeURIComponent(bvid)}&p=1`;
      }
    }
  } catch {
    return "";
  }

  return "";
}

function renderBookmarkBlock(block) {
  const meta = getUrlMeta(block.url || "");
  const title = getBookmarkTitle(block);

  return `
    <a class="article-bookmark" href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">
      <div class="article-bookmark-preview is-placeholder" aria-hidden="true">${escapeHtml((meta.hostname || title).slice(0, 1).toUpperCase())}</div>
      <div class="article-bookmark-copy">
        <span class="article-bookmark-label">\u4e66\u7b7e</span>
        <strong class="article-bookmark-title">${escapeHtml(title)}</strong>
        ${meta.hostname ? `<span class="article-bookmark-host">${escapeHtml(meta.hostname)}</span>` : ""}
        <span class="article-bookmark-url">${escapeHtml(meta.displayUrl)}</span>
      </div>
      <span class="article-bookmark-arrow" aria-hidden="true">\u2197</span>
    </a>
  `;
}

function renderEmbedBlock(block) {
  const meta = getUrlMeta(block.url || "");
  const embedFrame = getEmbedFrame(meta.href);

  if (embedFrame) {
    return `
      <figure class="article-embed">
        <div class="article-embed-frame">
          <iframe
            src="${escapeAttr(embedFrame)}"
            title="${escapeAttr(meta.hostname || "\u5d4c\u5165\u5185\u5bb9")}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
        <figcaption class="article-embed-meta">
          <span>\u5d4c\u5165\u5185\u5bb9</span>
          <a href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(meta.displayUrl)}</a>
        </figcaption>
      </figure>
    `;
  }

  return `
    <a class="article-embed-link" href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">
      <span class="article-embed-label">\u5d4c\u5165\u5185\u5bb9</span>
      <strong class="article-embed-title">${escapeHtml(meta.hostname || "\u6253\u5f00\u5916\u90e8\u5185\u5bb9")}</strong>
      <span class="article-embed-url">${escapeHtml(meta.displayUrl)}</span>
    </a>
  `;
}

function renderImageBlock(block) {
  if (!block?.url) {
    return "";
  }

  return `
    <figure class="article-image">
      <div class="article-image-frame">
        <img src="${escapeAttr(block.url)}" alt="${escapeAttr(block.caption || block.text || "\u6587\u7ae0\u914d\u56fe")}" loading="lazy" />
      </div>
      ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}
    </figure>
  `;
}

function renderCodeBlock(block) {
  const text = getBlockPlainText(block);
  if (!text) {
    return "";
  }

  return `
    <figure class="article-code-wrap">
      <figcaption class="article-code-label">${escapeHtml(block.language || "code")}</figcaption>
      <pre class="article-code"><code>${text}</code></pre>
    </figure>
  `;
}

function renderList(blocks = [], startIndex = 0, type = "bulleted_list_item") {
  const tagName = type === "numbered_list_item" ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < blocks.length && blocks[index]?.type === type) {
    const block = blocks[index];
    const text = getBlockHtmlText(block);
    const children = renderBlocks(block.children || []);
    items.push(`<li>${text ? `<div class="article-list-copy">${text}</div>` : ""}${children}</li>`);
    index += 1;
  }

  return {
    html: `<${tagName} class="article-list article-list-${tagName}">${items.join("")}</${tagName}>`,
    nextIndex: index,
  };
}

function renderCallout(block) {
  const text = getBlockHtmlText(block);
  const children = renderBlocks(block.children || []);
  return `
    <div class="article-callout">
      <div class="article-callout-icon">${escapeHtml(block.text || "\u2726")}</div>
      <div class="article-callout-copy">${text ? `<p>${text}</p>` : ""}${children}</div>
    </div>
  `;
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
      return `<blockquote>${text ? `<p>${text}</p>` : ""}${renderBlocks(block.children || [])}</blockquote>`;
    case "callout":
      return renderCallout(block);
    case "bookmark":
      return renderBookmarkBlock(block);
    case "embed":
      return renderEmbedBlock(block);
    case "image":
      return renderImageBlock(block);
    case "code":
      return renderCodeBlock(block);
    case "divider":
      return '<hr class="article-divider" />';
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
