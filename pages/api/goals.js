const { Client } = require('@notionhq/client')

const client_token = process.env.NOTION_TOKEN
const goals_db_id = process.env.NOTION_GOALS_DATABASE_ID

const notion = new Client({
  auth: client_token,
})

export default async function handler(_, res) {
  const response = await notion.databases.query({
    database_id: goals_db_id,
    filter: {
      or: [
        {
          property: 'Tags',
          multi_select: {
            contains: 'fitness',
          },
        },
        {
          property: 'Tags',
          multi_select: {
            contains: 'personal',
          },
        },
      ],
    },
    sorts: [
      {
        property: 'Status',
        direction: 'descending',
      },
      {
        property: 'Updated',
        direction: 'descending',
      },
    ],
  })
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
