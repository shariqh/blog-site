// scripts/agent/promote.ts
import { queryContentRows, createContentRow, addPageComment } from './lib/notion'
import { selectRowsNeedingPromotion, buildDerivativeRowInput } from './lib/promote'

async function main(): Promise<void> {
  const allRows = await queryContentRows({
    property: 'Stage',
    select: { does_not_equal: 'Abandoned' },
  })
  const toPromote = selectRowsNeedingPromotion(allRows, allRows)
  if (toPromote.length === 0) {
    console.log('Nothing to promote.')
    return
  }
  console.log(`Promoting ${toPromote.length} row(s)...`)
  for (const source of toPromote) {
    try {
      const input = buildDerivativeRowInput(source)
      const newId = await createContentRow(input)
      const newUrl = `https://www.notion.so/${newId.replace(/-/g, '')}`
      await addPageComment(source.id, `Created derivative blog row: ${newUrl}`)
      console.log(`✓ ${source.title} → ${newUrl}`)
    } catch (err) {
      console.error(`Failed to promote ${source.title}: ${(err as Error).message}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
