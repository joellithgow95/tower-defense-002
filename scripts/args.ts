/** Tiny argument reader for the scripts: `--map three-crowns` or `--map=three-crowns`, plus plain words. */
export function readArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.match(/^--([a-z]+)=(.*)$/);
    if (eq) flags[eq[1]] = eq[2];
    else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? '';
    else words.push(a);
  }
  return { flags, words };
}
