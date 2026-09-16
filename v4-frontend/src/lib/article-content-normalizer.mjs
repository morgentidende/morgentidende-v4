const SAGEN_KORT_TEXT = /^sagen\s+kort$/i;
const MARKDOWN_LIST_ITEM = /^\s*(?:[-+*]|\d+[.)])\s+\S/;
const MARKDOWN_LIST_CONTINUATION = /^\s{2,}\S/;
const HTML_LIST_START = /^\s*<(ul|ol)\b[^>]*>/i;

const SECTION_DEFS = [
  {
    key: 'sagen_kort',
    markdownHeading: /^\s{0,3}(?:#{1,6}\s*)?sagen\s+kort\s*#*\s*$/i,
    htmlHeading: /<h([1-6])\b[^>]*>\s*sagen\s+kort\s*<\/h\1>/i
  },
  {
    key: 'kilder',
    markdownHeading: /^\s{0,3}(?:#{1,6}\s*)?kilder\s*#*\s*$/i,
    htmlHeading: /<h([1-6])\b[^>]*>\s*kilder\s*<\/h\1>/i
  },
  {
    key: 'laes_ogsaa',
    markdownHeading: /^\s{0,3}(?:#{1,6}\s*)?(?:læs|laes)\s+(?:også|ogsaa)\s*#*\s*$/i,
    htmlHeading: /<h([1-6])\b[^>]*>\s*(?:læs|laes)\s+(?:også|ogsaa)\s*<\/h\1>/i
  }
];

export function normalizeBriefPoints(value) {
  if (!Array.isArray(value)) return [];
  const points = value.map((point) => String(point ?? '').trim()).filter(Boolean);
  return points.length === 2 ? points : [];
}

function stripInlineHtmlSection(body, section) {
  let output = body;
  let removed = false;
  let searchFrom = 0;

  while (searchFrom < output.length) {
    const tail = output.slice(searchFrom);
    const match = section.htmlHeading.exec(tail);
    if (!match) break;

    const headingStart = searchFrom + match.index;
    const headingEnd = headingStart + match[0].length;
    const afterHeading = output.slice(headingEnd);
    const listStart = HTML_LIST_START.exec(afterHeading);
    let removeEnd = headingEnd;

    if (listStart && listStart.index === 0) {
      const tag = listStart[1].toLowerCase();
      const closeRe = new RegExp(`<\\/${tag}\\s*>`, 'i');
      const close = closeRe.exec(afterHeading.slice(listStart[0].length));
      if (close) {
        removeEnd = headingEnd + listStart[0].length + close.index + close[0].length;
      }
    }

    output = `${output.slice(0, headingStart)}${output.slice(removeEnd)}`;
    removed = true;
    searchFrom = headingStart;
  }

  return { bodyMarkdown: output, removed };
}

function stripMarkdownSection(body, section) {
  const normalized = body.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const kept = [];
  let removed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!section.markdownHeading.test(line)) {
      kept.push(line);
      continue;
    }

    removed = true;
    let cursor = i + 1;
    while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;

    if (cursor < lines.length && MARKDOWN_LIST_ITEM.test(lines[cursor])) {
      cursor += 1;
      while (cursor < lines.length) {
        const candidate = lines[cursor];
        if (!candidate.trim() || MARKDOWN_LIST_ITEM.test(candidate) || MARKDOWN_LIST_CONTINUATION.test(candidate)) {
          cursor += 1;
          continue;
        }
        break;
      }
      i = cursor - 1;
    }
  }

  if (!removed) return { bodyMarkdown: body, removed: false };
  return {
    bodyMarkdown: kept.join('\n').replace(/^\s*\n+/, '').replace(/\n{3,}/g, '\n\n'),
    removed: true
  };
}

function stripOneSection(value, section) {
  const original = String(value ?? '');
  const htmlPass = stripInlineHtmlSection(original, section);
  const markdownPass = stripMarkdownSection(htmlPass.bodyMarkdown, section);
  const removed = htmlPass.removed || markdownPass.removed;
  return {
    bodyMarkdown: removed ? markdownPass.bodyMarkdown : original,
    removed
  };
}

export function stripStructuredBodySections(value) {
  const original = String(value ?? '');
  let bodyMarkdown = original;
  const removedSections = [];

  for (const section of SECTION_DEFS) {
    const result = stripOneSection(bodyMarkdown, section);
    if (result.removed) removedSections.push(section.key);
    bodyMarkdown = result.bodyMarkdown;
  }

  return {
    bodyMarkdown: removedSections.length ? bodyMarkdown : original,
    removed: removedSections.length > 0,
    removedSections
  };
}

export function stripSagenKortSection(value) {
  return stripOneSection(value, SECTION_DEFS[0]);
}

export function containsSagenKortHeading(value) {
  const body = String(value ?? '');
  const section = SECTION_DEFS[0];
  if (section.htmlHeading.test(body)) return true;
  return body.replace(/\r\n?/g, '\n').split('\n').some((line) => section.markdownHeading.test(line));
}

export function isLiteralSagenKortText(value) {
  return SAGEN_KORT_TEXT.test(String(value ?? '').trim());
}
