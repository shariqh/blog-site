const { Client } = require('@notionhq/client')

const client_token = process.env.NOTION_TOKEN

const notion = new Client({
  auth: client_token,
})

export default notion
