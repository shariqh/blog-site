export interface BuiltItem {
  title: string
  desc: string
}
export interface Portrait {
  src: string
  alt: string
}

export const HOME = {
  tagline: 'I build things, break a few, and write it all down.',
  manifesto: {
    // Rendered as: Be a little <u>reckless</u> with new tools. <i>Disciplined</i> about everything else.
    lead: 'Be a little ',
    underline: 'reckless',
    mid: ' with new tools. ',
    italic: 'Disciplined',
    tail: ' about everything else.',
  },
  currently: 'lognote',
  tags: ['Engineer', 'Team lead', 'Sci-fi', 'Lifting'],
  rightNow: [
    'Shipping lognote.',
    'Leading a team through the AI shift.',
    'Lifting, sci-fi, over-engineering my desk.',
  ] as string[],
  built: [
    { title: 'lognote', desc: 'Local transcription & summarization. Private by default.' },
    { title: 'this site', desc: 'Astro rebuild — it drafts some of its own posts.' },
    { title: 'a drafting agent', desc: 'Pitches, writes & PRs posts on a cron.' },
  ] as BuiltItem[],
  portraits: [
    { src: '/static/images/home/portrait-1.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-2.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-3.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-4.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-5.jpg', alt: 'Shariq Hirani' },
  ] as Portrait[],
} as const
