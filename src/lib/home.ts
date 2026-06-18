export interface Portrait {
  src: string
  alt: string
}

export const HOME = {
  tagline: 'I build a few things, and break a lot of things.',
  manifesto: {
    // Rendered as: Be a little <u>reckless</u> with new tools. <i>Disciplined</i> about everything else.
    lead: 'Be a little ',
    underline: 'reckless',
    mid: ' with new tools. ',
    italic: 'Disciplined',
    tail: ' about everything else.',
  },
  currently: 'lognote',
  tags: ['Engineer', 'Founder'],
  portraits: [
    { src: '/static/images/home/portrait-1.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-2.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-3.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-4.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-5.jpg', alt: 'Shariq Hirani' },
  ] as Portrait[],
} as const
