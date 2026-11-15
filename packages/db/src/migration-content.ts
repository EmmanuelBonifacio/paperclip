export function normalizeMigrationContent(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}
