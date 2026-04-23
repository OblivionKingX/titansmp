/**
 * TitanNetwork Advanced Rich Text Utility
 * Supports Minecraft color codes, stacking, hex colors, and font sizes.
 */

window.formatRichText = function (text) {
    if (!text) return '';

    const colors = {
        '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
        '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
        '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
        'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
    };

    // Pre-process alignment tags, newlines and standard markdown bold
    let html = text
        .replace(/\[center\](.*?)\[\/center\]/gs, '<div style="text-align: center; width: 100%; display: block;">$1</div>')
        .replace(/\[right\](.*?)\[\/right\]/gs, '<div style="text-align: right; width: 100%; display: block;">$1</div>')
        .replace(/\[left\](.*?)\[\/left\]/gs, '<div style="text-align: left; width: 100%; display: block;">$1</div>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');

    let output = '';
    let i = 0;

    // State management for stacking
    let activeStyles = {
        color: null,
        fontSize: null,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false
    };

    function closeSpan() {
        let count = 0;
        if (activeStyles.color) count++;
        if (activeStyles.fontSize) count++;
        if (activeStyles.bold) count++;
        if (activeStyles.italic) count++;
        if (activeStyles.underline) count++;
        if (activeStyles.strikethrough) count++;
        return '</span>'.repeat(count);
    }

    function openSpan() {
        let span = '';
        if (activeStyles.color) span += `<span style="color: ${activeStyles.color}">`;
        if (activeStyles.fontSize) span += `<span style="font-size: ${activeStyles.fontSize}">`;
        if (activeStyles.bold) span += `<span style="font-weight: bold;">`;
        if (activeStyles.italic) span += `<span style="font-style: italic;">`;
        if (activeStyles.underline) span += `<span style="text-decoration: underline;">`;
        if (activeStyles.strikethrough) span += `<span style="text-decoration: line-through;">`;
        return span;
    }

    while (i < html.length) {
        if (html[i] === '&' && i + 1 < html.length) {
            const code = html[i + 1].toLowerCase();
            
            // Handle Hex Code &#RRGGBB
            if (code === '#' && i + 7 < html.length) {
                const hex = html.substring(i + 2, i + 8);
                if (/^[0-9a-f]{6}$/i.test(hex)) {
                    output += closeSpan();
                    activeStyles.color = '#' + hex;
                    output += openSpan();
                    i += 8;
                    continue;
                }
            }

            // Handle Size Code &sz[num]
            if (code === 's' && i + 2 < html.length && html[i + 2].toLowerCase() === 'z') {
                let j = i + 3;
                let sizeStr = '';
                while (j < html.length && /[0-9]/.test(html[j])) {
                    sizeStr += html[j];
                    j++;
                }
                if (sizeStr.length > 0) {
                    output += closeSpan();
                    activeStyles.fontSize = sizeStr + 'px';
                    output += openSpan();
                    i = j;
                    continue;
                }
            }

            // Handle Standard Codes
            if (colors[code]) {
                output += closeSpan();
                activeStyles.color = colors[code];
                // Minecraft convention: color resets formatting
                activeStyles.bold = false;
                activeStyles.italic = false;
                activeStyles.underline = false;
                activeStyles.strikethrough = false;
                // Note: We keep fontSize state unless &r is used
                output += openSpan();
                i += 2;
                continue;
            } else if (code === 'l') {
                output += closeSpan();
                activeStyles.bold = true;
                output += openSpan();
                i += 2;
                continue;
            } else if (code === 'o') {
                output += closeSpan();
                activeStyles.italic = true;
                output += openSpan();
                i += 2;
                continue;
            } else if (code === 'n') {
                output += closeSpan();
                activeStyles.underline = true;
                output += openSpan();
                i += 2;
                continue;
            } else if (code === 'm') {
                output += closeSpan();
                activeStyles.strikethrough = true;
                output += openSpan();
                i += 2;
                continue;
            } else if (code === 'r') {
                output += closeSpan();
                activeStyles = { color: null, fontSize: null, bold: false, italic: false, underline: false, strikethrough: false };
                i += 2;
                continue;
            }
        }

        output += html[i];
        i++;
    }

    output += closeSpan();
    return output;
};
