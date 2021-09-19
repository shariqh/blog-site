import notion from '@/lib/utils/initNotion'

const goals_db_id = process.env.NOTION_GOALS_DATABASE_ID

export const getGoals = async () => {
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
