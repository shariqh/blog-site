const { Client } = require('@notionhq/client')

const client_token = process.env.NOTION_TOKEN
const goals_db_id = process.env.NOTION_GOALS_DATABASE_ID

// const notion = new Client({
//   auth: client_token,
// })

export const getGoals = async () => {
  const notion = new Client({
    auth: client_token,
  })

  return notion.databases.query({
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
}
