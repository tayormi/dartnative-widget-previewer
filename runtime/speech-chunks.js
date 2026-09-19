export function splitSpeechText(text, maxLen = 300, { first = 80, growth = 1.5 } = {}) {
  if (typeof text !== 'string' || text.length > 10000)
    throw Error('Speech text must be at most 10,000 characters.');
  if (!Number.isInteger(maxLen) || maxLen < 20 || maxLen > 1000)
    throw Error('Speech chunk size must be between 20 and 1000 characters.');
  let remaining = text.trim(),
    budget = Math.min(first, maxLen);
  const chunks = [];
  while (remaining) {
    let end = Math.min(budget, remaining.length);
    if (end < remaining.length) {
      const window = remaining.slice(0, end),
        sentence = [...window.matchAll(/[.!?。！？;,]\s+/g)].at(-1);
      const boundary = sentence ? sentence.index + sentence[0].length : window.lastIndexOf(' ');
      if (boundary > 0) end = boundary;
      else if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    }
    const chunk = remaining.slice(0, end).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(end).trimStart();
    budget = Math.min(maxLen, Math.max(20, Math.ceil(chunk.length * growth)));
  }
  return chunks;
}
