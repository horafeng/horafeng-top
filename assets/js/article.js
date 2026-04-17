import { escapeHtml, loadArticleDetail, setupPageTransition, setupSiteChrome, setupSplash } from "./common.js";
import { mountContentComments } from "./content-comments.js";

const LABEL_EXTERNAL_LINK = "\u5916\u90e8\u94fe\u63a5";
const LABEL_BOOKMARK = "\u4e66\u7b7e";
const LABEL_EMBED = "\u5d4c\u5165\u5185\u5bb9";
const LABEL_OPEN_EXTERNAL = "\u6253\u5f00\u5916\u90e8\u5185\u5bb9";
const LABEL_ARTICLE_IMAGE = "\u6587\u7ae0\u914d\u56fe";
const LABEL_FILE = "\u6587\u4ef6";
const LABEL_PUBLISHED_AT = "\u53d1\u5e03\u65f6\u95f4\uff1a";
const LABEL_CATEGORY = "\u5206\u7c7b\uff1a";
const LABEL_TAGS = "\u6807\u7b7e\uff1a";
const LABEL_EMPTY = "\u8fd9\u7bc7\u6587\u7ae0\u7684\u6b63\u6587\u6682\u65f6\u4e3a\u7a7a\u3002";
const LABEL_UNAVAILABLE = "\u5185\u5bb9\u4e0d\u53ef\u7528";
const LABEL_LOAD_FAILED = "\u52a0\u8f7d\u5931\u8d25";
const LABEL_ARTICLE_UNAVAILABLE = "\u6587\u7ae0\u4e0d\u53ef\u7528";
const DEFAULT_SITE_ORIGIN = "https://horafeng.top";

function escapeAttr(text) {
  return String(text ?? "").replaceAll('"', "&quot;");
}

function toAbsoluteUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return value;
  }
  return `${DEFAULT_SITE_ORIGIN}/${value.replace(/^\/+/, "")}`;
}

function setMetaTag({ property = "", name = "", content = "" } = {}) {
  const value = String(content || "").trim();
  if (!value) {
    return;
  }

  const selector = property ? `meta[property="${property}"]` : `meta[name="${name}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    if (property) {
      tag.setAttribute("property", property);
    } else {
      tag.setAttribute("name", name);
    }
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", value);
}

function applyArticleSeo(meta, item) {
  const slug = String(meta?.slug || "").trim();
  const url = slug ? `${DEFAULT_SITE_ORIGIN}/article.html?slug=${encodeURIComponent(slug)}` : `${DEFAULT_SITE_ORIGIN}/article.html`;
  const cover = toAbsoluteUrl(meta?.cover || meta?.images?.[0] || "");
  const seo = item?.seo || {};
  const title = String(seo.og_title || meta?.title || "文章").trim();
  const description = String(seo.og_description || meta?.summary || meta?.title || "").trim();
  const image = String(seo.og_image || cover).trim();

  setMetaTag({ property: "og:title", content: title });
  setMetaTag({ property: "og:description", content: description });
  setMetaTag({ property: "og:image", content: image });
  setMetaTag({ property: "og:url", content: String(seo.og_url || url) });
  setMetaTag({ property: "og:type", content: String(seo.og_type || "article") });
  setMetaTag({ name: "twitter:card", content: String(seo.twitter_card || (image ? "summary_large_image" : "summary")) });
  setMetaTag({ name: "twitter:title", content: String(seo.twitter_title || title) });
  setMetaTag({ name: "twitter:description", content: String(seo.twitter_description || description) });
  setMetaTag({ name: "twitter:image", content: String(seo.twitter_image || image) });
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
      const rawText = segment?.plain_text || segment?.text?.content || "";
      let html = escapeHtml(rawText).replaceAll("\n", "<br>");
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

      const href = segment?.href || segment?.text?.link || "";
      if (href) {
        html = `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
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
    const cleanHost = parsed.hostname.replace(/^www\./i, "");
    return {
      hostname: cleanHost,
      displayUrl: `${cleanHost}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search || ""}`,
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

function renderCaption(caption) {
  const text = String(caption || "").trim();
  return text ? `<figcaption>${escapeHtml(text)}</figcaption>` : "";
}

function getBookmarkMeta(block) {
  const metadata = block?.metadata || null;
  const urlMeta = getUrlMeta(block?.url || "");
  const title = String(metadata?.title || block?.caption || "").trim() || urlMeta.hostname || LABEL_EXTERNAL_LINK;
  const description = String(metadata?.description || "").trim();
  const siteName = String(metadata?.site_name || "").trim() || urlMeta.hostname;
  const image = String(metadata?.image || "").trim();
  const icon = String(metadata?.icon || "").trim();

  return {
    ...urlMeta,
    title,
    description,
    siteName,
    image,
    icon,
  };
}

function renderBookmarkPreview(meta) {
  if (meta.image) {
    return `<div class="article-bookmark-preview"><img src="${escapeAttr(meta.image)}" alt="${escapeAttr(meta.title)}" loading="lazy" /></div>`;
  }

  if (meta.icon) {
    return `<div class="article-bookmark-preview article-bookmark-preview-icon"><img src="${escapeAttr(meta.icon)}" alt="" loading="lazy" /></div>`;
  }

  const fallback = (meta.siteName || meta.title || "?").slice(0, 1).toUpperCase();
  return `<div class="article-bookmark-preview is-placeholder" aria-hidden="true">${escapeHtml(fallback)}</div>`;
}

function renderBookmarkBlock(block) {
  const meta = getBookmarkMeta(block);

  return `
    <a class="article-bookmark" href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">
      ${renderBookmarkPreview(meta)}
      <div class="article-bookmark-copy">
        <span class="article-bookmark-label">${escapeHtml(meta.siteName || LABEL_BOOKMARK)}</span>
        <strong class="article-bookmark-title">${escapeHtml(meta.title)}</strong>
        ${meta.description ? `<p class="article-bookmark-description">${escapeHtml(meta.description)}</p>` : ""}
        <span class="article-bookmark-url">${escapeHtml(meta.displayUrl)}</span>
      </div>
      <span class="article-bookmark-arrow" aria-hidden="true">&#8599;</span>
    </a>
  `;
}

function getEmbedProviderLabel(block) {
  const provider = String(block?.provider || "").trim().toLowerCase();
  if (provider === "youtube") return "YouTube";
  if (provider === "vimeo") return "Vimeo";
  if (provider === "bilibili") return "Bilibili";
  if (provider === "douyin") return "Douyin";

  const meta = getUrlMeta(block?.url || "");
  return meta.hostname || LABEL_EMBED;
}

function renderEmbedBlock(block) {
  const meta = getUrlMeta(block?.url || "");
  const embedUrl = String(block?.embed_url || "").trim();
  const providerLabel = getEmbedProviderLabel(block);

  if (embedUrl) {
    return `
      <figure class="article-embed">
        <div class="article-embed-frame">
          <iframe
            src="${escapeAttr(embedUrl)}"
            title="${escapeAttr(providerLabel)}"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
        <figcaption class="article-embed-meta">
          <span>${escapeHtml(providerLabel)}</span>
          <a href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(meta.displayUrl)}</a>
        </figcaption>
      </figure>
    `;
  }

  return `
    <a class="article-embed-link" href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">
      <span class="article-embed-label">${escapeHtml(providerLabel)}</span>
      <strong class="article-embed-title">${escapeHtml(meta.hostname || LABEL_OPEN_EXTERNAL)}</strong>
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
        <img src="${escapeAttr(block.url)}" alt="${escapeAttr(block.caption || block.text || LABEL_ARTICLE_IMAGE)}" loading="lazy" />
      </div>
      ${renderCaption(block.caption)}
    </figure>
  `;
}

function renderMediaLinkCard(block, label) {
  if (!block?.url) {
    return "";
  }

  const meta = getUrlMeta(block.url);
  return `
    <a class="article-embed-link" href="${escapeAttr(meta.href)}" target="_blank" rel="noopener noreferrer">
      <span class="article-embed-label">${escapeHtml(label)}</span>
      <strong class="article-embed-title">${escapeHtml(block.name || meta.hostname || label)}</strong>
      <span class="article-embed-url">${escapeHtml(meta.displayUrl)}</span>
    </a>
  `;
}

function renderVideoBlock(block) {
  if (!block?.url) {
    return "";
  }

  return `
    <figure class="article-embed article-video">
      <div class="article-video-frame">
        <video controls preload="metadata" playsinline src="${escapeAttr(block.url)}"></video>
      </div>
      ${renderCaption(block.caption)}
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

function renderCalloutIcon(block) {
  if (block?.icon?.type === "emoji" && block.icon.emoji) {
    return escapeHtml(block.icon.emoji);
  }

  if (block?.icon?.url) {
    return `<img src="${escapeAttr(block.icon.url)}" alt="" loading="lazy" />`;
  }

  return escapeHtml(block?.text || "*");
}

function renderCallout(block) {
  const text = getBlockHtmlText(block);
  const children = renderBlocks(block.children || []);
  return `
    <div class="article-callout">
      <div class="article-callout-icon">${renderCalloutIcon(block)}</div>
      <div class="article-callout-copy">${text ? `<p>${text}</p>` : ""}${children}</div>
    </div>
  `;
}

function renderParagraph(block) {
  const text = getBlockHtmlText(block);
  const children = renderBlocks(block.children || []);

  if (!text && !children) {
    return '<div class="article-spacer" aria-hidden="true"></div>';
  }

  return `${text ? `<p>${text}</p>` : ""}${children}`;
}

function renderBlock(block) {
  const text = getBlockHtmlText(block);

  switch (block?.type) {
    case "heading_1":
      return text ? `<h2 class="article-heading article-heading-1">${text}</h2>` : "";
    case "heading_2":
      return text ? `<h3 class="article-heading article-heading-2">${text}</h3>` : "";
    case "heading_3":
      return text ? `<h4 class="article-heading article-heading-3">${text}</h4>` : "";
    case "paragraph":
      return renderParagraph(block);
    case "quote":
      return `<blockquote>${text ? `<p>${text}</p>` : ""}${renderBlocks(block.children || [])}</blockquote>`;
    case "callout":
      return renderCallout(block);
    case "bookmark":
    case "link_preview":
      return renderBookmarkBlock(block);
    case "embed":
      return renderEmbedBlock(block);
    case "image":
      return renderImageBlock(block);
    case "video":
      return renderVideoBlock(block);
    case "pdf":
      return renderMediaLinkCard(block, "PDF");
    case "file":
      return renderMediaLinkCard(block, LABEL_FILE);
    case "code":
      return renderCodeBlock(block);
    case "divider":
      return '<hr class="article-divider" />';
    case "table_of_contents":
      return "";
    default:
      return renderParagraph(block);
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
  const cover = meta.images[0] || "";

  document.title = `${meta.title} | HoraFeng`;
  applyArticleSeo(meta, item);
  breadcrumb.textContent = meta.title;

  const metaBits = [
    meta.date ? `${LABEL_PUBLISHED_AT}${escapeHtml(meta.date)}` : "",
    meta.category ? `${LABEL_CATEGORY}${escapeHtml(meta.category)}` : "",
    meta.tags.length ? `${LABEL_TAGS}${meta.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}` : "",
  ].filter(Boolean);

  hero.innerHTML = `
    ${cover ? `<img class="article-cover" src="${escapeAttr(cover)}" alt="${escapeAttr(meta.title)}" loading="lazy" />` : ""}
    <h1 class="article-title">${escapeHtml(meta.title)}</h1>
    ${meta.summary ? `<p class="article-summary">${escapeHtml(meta.summary)}</p>` : ""}
    <div class="article-meta-line">${metaBits.map((bit) => `<span>${bit}</span>`).join("")}</div>
    <div class="chips">${meta.tags.map((tag) => `<a class="chip" href="index.html?tag=${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join("")}</div>
  `;

  const renderedBody = renderBlocks(item.blocks || []);
  body.innerHTML = renderedBody || `<div class="article-empty">${LABEL_EMPTY}</div>`;

  const commentsHost = document.getElementById("article-comments");
  mountContentComments({
    container: commentsHost,
    pageKey: `article:${meta.slug}`,
    mode: "article",
  });
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

  document.title = `${LABEL_ARTICLE_UNAVAILABLE} | HoraFeng`;
  breadcrumb.textContent = LABEL_UNAVAILABLE;
  hero.innerHTML = `<h1 class="article-title">${LABEL_UNAVAILABLE}</h1>`;
  body.innerHTML = `<div class="article-empty">${escapeHtml(error.message || LABEL_LOAD_FAILED)}</div>`;
});
