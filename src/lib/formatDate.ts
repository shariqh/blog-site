const FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDate(d: Date): string {
  return FORMATTER.format(d)
}
