function getLongestBacktickRun(content: string): number {
  const matches = content.match(/`+/g);
  if (!matches) {
    return 0;
  }
  return matches.reduce((max, run) => Math.max(max, run.length), 0);
}

export function buildFencedCodeBlock(content: string, language = ""): string {
  const normalizedLanguage = language.replace(/[`\r\n]/g, "").trim();
  const fenceLength = Math.max(3, getLongestBacktickRun(content) + 1);
  const fence = "`".repeat(fenceLength);
  return `${fence}${normalizedLanguage}\n${content}\n${fence}`;
}
