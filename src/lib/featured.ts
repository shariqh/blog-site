export function pickFeatured<T extends { data: { date: Date; draft?: boolean } }>(
  posts: T[]
): T | undefined {
  return posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())[0]
}
