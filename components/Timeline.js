import useSWR from 'swr'
import fetcher from '@/lib/fetcher'
import Goal from '@/components/Goal'

export default function Timeline() {
  const { data } = useSWR('/api/goals', fetcher)

  if (!data) {
    return null
  }

  const completedGoals = data.goals.filter((goal) => goal.status === 'Completed')
  const inProgressGoals = data.goals.filter((goal) => goal.status === 'In progress')
  const notStartedGoals = data.goals.filter((goal) => goal.status === 'Not started')

  // for completed tasks, get each year something was completed
  const yearsArr = completedGoals.map(({ updatedDate }) => new Date(updatedDate).getFullYear())
  let years = [...new Set(yearsArr)].sort().reverse()

  // organize tasks into timeline view for that year
  return (
    <>
      {years.map((year) => (
        <div key={year}>
          <h2 className="text-lg font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
            {year}
          </h2>
          {completedGoals
            .filter((goal) => new Date(goal.updatedDate).getFullYear() === year)
            .map((goal) => {
              return <Goal key={goal.name} {...goal} />
            })}
        </div>
      ))}
      <h2 className="text-lg font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
        In Progress
      </h2>
      {inProgressGoals.map((goal) => {
        return <Goal key={goal.name} {...goal} />
      })}
      <h2 className="text-lg font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
        Not Started
      </h2>
      {notStartedGoals.map((goal) => {
        return <Goal key={goal.name} {...goal} />
      })}
    </>
  )
}
