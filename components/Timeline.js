import useSWR from 'swr'
import fetcher from '@/lib/fetcher'
import Goal from '@/components/Goal'

export default function Timeline() {
  const { data } = useSWR('/api/goals', fetcher)

  if (!data) {
    return null
  }

  // for completed tasks, get each year something was completed
  const yearsArr = data.goals.map(({ updatedDate }) => new Date(updatedDate).getFullYear())
  yearsArr.push(2009, 2020, 2013)
  let years = [...new Set(yearsArr)].sort().reverse()

  console.log(years)

  // organize tasks into timeline view for that year
  return (
    <>
      <h2 className="text-xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
        {years}
      </h2>
      {data.goals.map((goal) => {
        return <Goal key={goal.name} {...goal} />
      })}
    </>
  )
}
