import { getGoals } from '@/lib/notion'

export default async (_, res) => {
  const response = await getGoals()
  const { results } = await response

  const goals = results.map((goal) => ({
    name: goal.properties?.Name?.title[0]?.plain_text,
    description: goal.properties?.Description?.rich_text[0]?.plain_text,
    status: goal.properties?.Status?.select?.name,
    link: goal.properties?.Link?.url,
    updatedDate: goal.last_edited_time,
  }))

  return res.status(200).json({ goals })
}
