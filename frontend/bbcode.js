/**
 * BBCode Parser for TitanNetwork
 * Optimized for XenForo/Minecraft community tags.
 */

window.BBCode = (function () {
  const mediaFormatters = {
    youtube: (id) => `<div class="media-container"><iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe></div>`,
    spotify: (id) => `<div class="media-container"><iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe></div>`,
    generic: (site, id) => `<div class="media-placeholder">Media embed from ${site} (ID: ${id})</div>`
  };

  function escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeURL(url) {
    if (!url) return '#';
    if (/^(https?|mailto|ftp):/i.test(url) || url.startsWith('/') || url.startsWith('#')) return url;
    return '#';
  }

  function parse(text, isRecursive = false) {
    if (!text) return '';

    let html = escapeHTML(text);

    // --- BBCODE CONVERSION ---

    // Basic Styles (Nested)
    html = html.replace(/\[B\](.*?)\[\/B\]/gis, '<strong>$1</strong>');
    html = html.replace(/\[I\](.*?)\[\/I\]/gis, '<em>$1</em>');
    html = html.replace(/\[U\](.*?)\[\/U\]/gis, '<u>$1</u>');
    html = html.replace(/\[S\](.*?)\[\/S\]/gis, '<strike>$1</strike>');

    // Colors & Sizes
    html = html.replace(/\[COLOR=(.*?)\](.*?)\[\/COLOR\]/gis, '<span style="color: $1">$2</span>');
    html = html.replace(/\[SIZE=(\d+)(?:px|pt)?\](.*?)\[\/SIZE\]/gis, (m, s, t) => `<span style="font-size: ${s}px">${t}</span>`);
    html = html.replace(/\[SIZE=\](.*?)\[\/SIZE\]/gis, '$1'); // Handle empty size tags
    html = html.replace(/\[FONT=(.*?)\](.*?)\[\/FONT\]/gis, '<span style="font-family: $1">$2</span>');

    // Headings
    html = html.replace(/\[HEADING=([1-6])\](.*?)\[\/HEADING\]/gis, '<h$1 class="bb-heading">$2</h$1>');

    // Mentions & Markers
    html = html.replace(/\[USER=(\d+)\](.*?)\[\/USER\]/gis, '<a href="/profile.html?id=$1" class="bb-user-link">@$2</a>');
    html = html.replace(/\[MARKER=(.*?)\](.*?)\[\/MARKER\]/gis, '<a id="$1" name="$1"></a>$2');

    // Links & Media
    html = html.replace(/\[URL\](.*?)\[\/URL\]/gi, (m, u) => `<a href="${sanitizeURL(u)}" target="_blank" rel="noopener" class="bb-url">${u}</a>`);
    html = html.replace(/\[URL=(.*?)\](.*?)\[\/URL\]/gi, (m, u, t) => `<a href="${sanitizeURL(u)}" target="_blank" rel="noopener" class="bb-url">${t}</a>`);
    html = html.replace(/\[IMG\](.*?)\[\/IMG\]/gi, (m, u) => `<img src="${sanitizeURL(u)}" class="bb-image" loading="lazy">`);
    html = html.replace(/\[MEDIA=(.*?)\](.*?)\[\/MEDIA\]/gi, (m, s, id) => {
      const fmt = mediaFormatters[s.toLowerCase()] || mediaFormatters.generic;
      return fmt(id, s);
    });

    // Alignment
    html = html.replace(/\[LEFT\](.*?)\[\/LEFT\]/gis, '<div style="text-align: left;">$1</div>');
    html = html.replace(/\[CENTER\](.*?)\[\/CENTER\]/gis, '<div style="text-align: center;">$1</div>');
    html = html.replace(/\[RIGHT\](.*?)\[\/RIGHT\]/gis, '<div style="text-align: right;">$1</div>');

    // Quotes
    html = html.replace(/\[QUOTE=(.*?)\](.*?)\[\/QUOTE\]/gis, '<blockquote class="bb-quote"><div class="quote-header">$1 said:</div><div class="quote-content">$2</div></blockquote>');
    html = html.replace(/\[QUOTE\](.*?)\[\/QUOTE\]/gis, '<blockquote class="bb-quote"><div class="quote-content">$1</div></blockquote>');

    // Lists
    html = html.replace(/\[LIST\](.*?)\[\/LIST\]/gis, (m, t) => {
      const items = t.split(/\[\*\]/); items.shift();
      return `<ul class="bb-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    });
    html = html.replace(/\[LIST=1\](.*?)\[\/LIST\]/gis, (m, t) => {
      const items = t.split(/\[\*\]/); items.shift();
      return `<ol class="bb-list">${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
    });

    // Final cleanup: Newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  return { parse };
})();
