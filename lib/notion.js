import notion from '@/lib/utils/initNotion'

const goals_db_id = process.env.NOTION_GOALS_DATABASE_ID

export const getGoals = async () => {
  return notion.databases.query({
    database_id: goals_db_id,
    filter: {
      and: [
        {
          property: 'Public',
          checkbox: {
            equals: true,
          },
        },
        {
          property: 'Status',
          select: {
            does_not_equal: 'Not started',
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
