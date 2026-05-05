/**
 * BBCode Parser for TitanNetwork
 * Supports a wide variety of tags, fuzzy matching, and stylized tag labels.
 */

window.BBCode = (function () {
  const mediaFormatters = {
    youtube: (id) => `<div class="media-container"><iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe></div>`,
    spotify: (id) => `<div class="media-container"><iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe></div>`,
    vimeo: (id) => `<div class="media-container"><iframe src="https://player.vimeo.com/video/${id}" frameborder="0" allowfullscreen></iframe></div>`,
    twitch: (id) => `<div class="media-container"><iframe src="https://player.twitch.tv/?channel=${id}&parent=${window.location.hostname}" frameborder="0" allowfullscreen="true" scrolling="no" height="378" width="620"></iframe></div>`,
    tiktok: (id) => `<div class="media-container"><blockquote class="tiktok-embed" data-video-id="${id}" style="max-width: 605px;min-width: 325px;"><section></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script></div>`,
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
    if (/^(https?|mailto):/i.test(url) || url.startsWith('/')) return url;
    return '#';
  }

  function parse(text) {
    if (!text) return '';

    let html = escapeHTML(text);

    // --- STAGE 1: FUZZY TAG NORMALIZATION ---
    const keywords = [
      'CENTER', 'LEFT', 'RIGHT', 'BOLD', 'ITALIC', 'UNDERLINE', 'STRIKE',
      'COLOR', 'SIZE', 'FONT', 'INDENT', 'HEADING', 'QUOTE', 'SPOILER', 'CODE', 'TABLE', 'TR', 'TH', 'TD', 'IMG', 'URL', 'MEDIA'
    ];

    const normalize = (tagContent) => {
      const upper = tagContent.toUpperCase();
      // Closing
      if (upper.includes('/')) {
        const cleanName = upper.replace(/[^A-Z0-9]/g, '');
        for (const kw of keywords) if (cleanName.includes(kw)) return `/${kw}`;
        for (const char of ['B', 'I', 'U', 'S']) if (cleanName.includes(char) && cleanName.length < 8) return `/${char}`;
        return upper;
      }
      // Attributes
      if (upper.includes('=')) {
        const parts = tagContent.split('=');
        const tagName = parts[0].toUpperCase();
        const attr = parts.slice(1).join('=');
        for (const kw of keywords) if (tagName.includes(kw)) return `${kw}=${attr}`;
        for (const char of ['B', 'I', 'U', 'S']) if (tagName.includes(char) && tagName.length < 8) return `${char}=${attr}`;
        return tagContent;
      }
      // Standard
      for (const kw of keywords) if (upper.includes(kw)) return kw;
      for (const char of ['B', 'I', 'U', 'S']) if (upper.includes(char) && upper.length < 8) return char;
      return tagContent;
    };

    html = html.replace(/\[([^\]]+)\]/gi, (match, content) => `[${normalize(content)}]`);

    // --- STAGE 2: BBCODE CONVERSION (HIDE TAGS + APPLY FORMATTING) ---
    // Tags are converted to HTML and the original brackets are removed from the visible output.

    // Standard Styles
    html = html.replace(/\[B\](.*?)\[\/B\]/gis, '<strong>$1</strong>');
    html = html.replace(/\[I\](.*?)\[\/I\]/gis, '<em>$1</em>');
    html = html.replace(/\[U\](.*?)\[\/U\]/gis, '<u>$1</u>');
    html = html.replace(/\[S\](.*?)\[\/S\]/gis, '<strike>$1</strike>');

    html = html.replace(/\[COLOR=(.*?)\](.*?)\[\/COLOR\]/gis, '<span style="color: $1">$2</span>');
    html = html.replace(/\[SIZE=(.*?)\](.*?)\[\/SIZE\]/gis, (m, s, t) => {
      const size = isNaN(s) ? s : s + 'px';
      return `<span style="font-size: ${size}">${t}</span>`;
    });
    html = html.replace(/\[FONT=(.*?)\](.*?)\[\/FONT\]/gis, '<span style="font-family: $1">$2</span>');

    // Links & Media
    html = html.replace(/\[URL\](.*?)\[\/URL\]/gi, (m, u) => `<a href="${sanitizeURL(u)}" target="_blank" rel="noopener">${u}</a>`);
    html = html.replace(/\[URL=(.*?)\](.*?)\[\/URL\]/gi, (m, u, t) => `<a href="${sanitizeURL(u)}" target="_blank" rel="noopener">${t}</a>`);
    html = html.replace(/\[IMG\](.*?)\[\/IMG\]/gi, (m, u) => `<img src="${sanitizeURL(u)}" class="bb-image" alt="User Image">`);
    html = html.replace(/\[MEDIA=(.*?)\](.*?)\[\/MEDIA\]/gi, (m, s, id) => {
      const fmt = mediaFormatters[s.toLowerCase()] || mediaFormatters.generic;
      return fmt(id, s);
    });

    // Alignment (Nested)
    html = html.replace(/\[LEFT\](.*?)\[\/LEFT\]/gi, '<div style="text-align: left;">$1</div>');
    html = html.replace(/\[CENTER\](.*?)\[\/CENTER\]/gi, '<div style="text-align: center;">$1</div>');
    html = html.replace(/\[RIGHT\](.*?)\[\/RIGHT\]/gi, '<div style="text-align: right;">$1</div>');

    // Alignment (Open-ended fallback)
    const alignReset = '</div><div style="text-align: ';
    html = html.replace(/\[LEFT\]/gi, alignReset + 'left;">');
    html = html.replace(/\[CENTER\]/gi, alignReset + 'center;">');
    html = html.replace(/\[RIGHT\]/gi, alignReset + 'right;">');
    html = '<div>' + html + '</div>';

    // Layout
    html = html.replace(/\[INDENT\](.*?)\[\/INDENT\]/gi, '<div class="bb-indent">$1</div>');
    html = html.replace(/\[HEADING=([1-3])\](.*?)\[\/HEADING\]/gi, '<h$1>$2</h$1>');
    html = html.replace(/\[QUOTE=(.*?)\](.*?)\[\/QUOTE\]/gis, '<blockquote class="bb-quote"><div class="quote-header">$1 said:</div>$2</blockquote>');
    html = html.replace(/\[QUOTE\](.*?)\[\/QUOTE\]/gis, '<blockquote class="bb-quote">$1</blockquote>');

    // Tables & Lists
    html = html.replace(/\[TABLE\](.*?)\[\/TABLE\]/gis, '<div class="bb-table-wrapper"><table class="bb-table">$1</table></div>');
    html = html.replace(/\[TR\](.*?)\[\/TR\]/gis, '<tr>$1</tr>');
    html = html.replace(/\[TH\](.*?)\[\/TH\]/gis, '<th>$1</th>');
    html = html.replace(/\[TD\](.*?)\[\/TD\]/gis, '<td>$1</td>');

    html = html.replace(/\[LIST\](.*?)\[\/LIST\]/gis, (m, t) => {
      const items = t.split(/\[\*\]/); items.shift();
      return `<ul class="bb-list">${items.map(i => `<li>${i.trim()}</li>`).join('')}</ul>`;
    });
    html = html.replace(/\[LIST=1\](.*?)\[\/LIST\]/gis, (m, t) => {
      const items = t.split(/\[\*\]/); items.shift();
      return `<ol class="bb-list">${items.map(i => `<li>${i.trim()}</li>`).join('')}</ol>`;
    });

    // --- STAGE 3: LEGACY & CLEANUP ---
    // Legacy fallbacks (No labels for these as they aren't standard BBCode)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/&amp;#([0-9a-f]{6})/gi, '<span style="color: #$1;">');
    html = html.replace(/&amp;sz(\d+)/gi, '<span style="font-size: $1px;">');

    // Strip ALL remaining stray brackets (Unknown tags)
    // Since we used &lsqb; for our protected tags, this only catches "fake" text
    html = html.replace(/\[([^\]]+)\]/gi, '');

    // Final newlines
    html = html.replace(/\n/g, '<br>');

    // --- STAGE 4: MINECRAFT COLOR CODES ---
    // Process any remaining § or & color codes using the shared utility
    if (window.formatRichText) {
      html = window.formatRichText(html);
    }

    return html;
  }

  return { parse };
})();
