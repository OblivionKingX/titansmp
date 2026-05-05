/**
 * TitanNetwork Advanced Rich Text Utility
 * Supports Minecraft color codes, stacking, hex colors, and font sizes.
 */

window.formatRichText = function (text) {
    if (!text) return '';

    // 1. Convert & to § for internal processing if needed
    let html = text.replace(/&/g, '§');

    // 2. Handle Hex Codes §x§r§r§g§g§b§b (standard Minecraft hex)
    // Also handles §xRRGGBB or &#RRGGBB styles
    html = html.replace(/§x§([0-9a-f])§([0-9a-f])§([0-9a-f])§([0-9a-f])§([0-9a-f])§([0-9a-f])/gi, '§#$1$2$3$4$5$6');
    html = html.replace(/§x([0-9a-f]{6})/gi, '§#$1');
    html = html.replace(/&#([0-9a-f]{6})/gi, '§#$1');

    const colors = {
        '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
        '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
        '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
        'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
    };

    let output = '';
    let i = 0;
    let activeStyles = { color: null, bold: false, italic: false, underline: false, strikethrough: false };

    function closeSpan() {
        let count = 0;
        if (activeStyles.color) count++;
        if (activeStyles.bold) count++;
        if (activeStyles.italic) count++;
        if (activeStyles.underline) count++;
        if (activeStyles.strikethrough) count++;
        return '</span>'.repeat(count);
    }

    function openSpan() {
        let span = '';
        if (activeStyles.color) span += `<span style="color: ${activeStyles.color}">`;
        if (activeStyles.bold) span += `<span style="font-weight: bold;">`;
        if (activeStyles.italic) span += `<span style="font-style: italic;">`;
        if (activeStyles.underline) span += `<span style="text-decoration: underline;">`;
        if (activeStyles.strikethrough) span += `<span style="text-decoration: line-through;">`;
        return span;
    }

    while (i < html.length) {
        if (html[i] === '§' && i + 1 < html.length) {
            const code = html[i + 1].toLowerCase();
            
            // Handle Hex Code §#RRGGBB (pre-converted above)
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

            // Handle Standard Codes
            if (colors[code]) {
                output += closeSpan();
                activeStyles.color = colors[code];
                activeStyles.bold = false;
                activeStyles.italic = false;
                activeStyles.underline = false;
                activeStyles.strikethrough = false;
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
                activeStyles = { color: null, bold: false, italic: false, underline: false, strikethrough: false };
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

/**
 * BBCode Formatting Utils
 */
window.insertFormatTag = function (type, value = '') {
    // List of possible textareas to target across different pages
    const targetIds = ['news-content', 'thread-content', 'reply-content', 'post-thread-content'];
    let textarea = null;

    for (const id of targetIds) {
        const el = document.getElementById(id);
        if (el) {
            textarea = el;
            break;
        }
    }

    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);

    let tagStart = '';
    let tagEnd = '';

    switch (type) {
        case 'center': tagStart = '[center]'; tagEnd = '[/center]'; break;
        case 'right': tagStart = '[right]'; tagEnd = '[/right]'; break;
        case 'left': tagStart = '[left]'; tagEnd = '[/left]'; break;
        case 'bold': tagStart = '[b]'; tagEnd = '[/b]'; break;
        case 'italic': tagStart = '[i]'; tagEnd = '[/i]'; break;
        case 'underline': tagStart = '[u]'; tagEnd = '[/u]'; break;
        case 'reset': tagStart = ' [/color][/size][/b][/i][/u] '; tagEnd = ''; break;
        case 'size':
            const size = prompt('Enter font size (e.g. 24):', '20');
            if (!size) return;
            tagStart = `[size=${size}]`;
            tagEnd = '[/size]';
            break;
        case 'color':
            if (!value) return;
            tagStart = `[color=#${value}]`;
            tagEnd = '[/color]';
            break;
    }

    const newText = text.substring(0, start) + tagStart + selection + tagEnd + text.substring(end);
    textarea.value = newText;

    textarea.focus();
    if (selection.length > 0) {
        textarea.setSelectionRange(start + tagStart.length + selection.length + tagEnd.length, start + tagStart.length + selection.length + tagEnd.length);
    } else {
        textarea.setSelectionRange(start + tagStart.length, start + tagStart.length);
    }

    textarea.dispatchEvent(new Event('input'));
};

window.openColorPicker = function () {
    const picker = document.getElementById('news-color-picker') || document.getElementById('forum-color-picker');
    if (!picker) {
        // Create a temporary hidden picker if none exists
        const tempPicker = document.createElement('input');
        tempPicker.type = 'color';
        tempPicker.style.display = 'none';
        tempPicker.oninput = (e) => {
            const hex = e.target.value;
            if (hex) {
                window.insertFormatTag('color', hex.replace('#', ''));
            }
        };
        document.body.appendChild(tempPicker);
        tempPicker.click();
        setTimeout(() => tempPicker.remove(), 1000);
        return;
    }

    picker.oninput = (e) => {
        const hex = e.target.value;
        if (hex) {
            window.insertFormatTag('color', hex.replace('#', ''));
            picker.oninput = null; // Reset
        }
    };
    picker.click();
};


