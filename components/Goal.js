import Link from '@/components/Link'

export default function Goal(goal) {
  const Step = ({ title, link, children }) => {
    return (
      <li className="mb-4 ml-2">
        {goal.status === 'Completed' && (
          <div className="flex items-center mb-2 text-green-700 dark:text-green-300">
            <span className="sr-only">Check</span>
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </g>
            </svg>
            {goal.link ? (
              <Link href={goal.link}>
                <a className="font-medium text-gray-900 dark:text-gray-100">{title}</a>
              </Link>
            ) : (
              <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
            )}
          </div>
        )}
        {goal.status === 'In progress' && (
          <div className="flex items-center mb-2 text-yellow-500">
            <span className="sr-only">Stopwatch</span>
            <svg
              className="h-4 w-4 mr-2"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 19C10.067 19 8.31704 18.2165 7.05029 16.9498L12 12L12 5C15.866 5 19 8.13401 19 12C19 15.866 15.866 19 12 19Z"
                fill="currentColor"
              />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12ZM21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                fill="currentColor"
              />
            </svg>
            {goal.link ? (
              <Link href={goal.link}>
                <a className="font-medium text-gray-900 dark:text-gray-100">{title}</a>
              </Link>
            ) : (
              <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
            )}{' '}
          </div>
        )}
        {goal.status === 'Not started' && (
          <div className="flex items-center mb-2 text-red-600 dark:text-red-400">
            <span className="sr-only">Stop</span>
            <svg
              className="h-4 w-4 mr-2"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M15 9H9V15H15V9Z" fill="currentColor" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12ZM21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                fill="currentColor"
              />
            </svg>
            {goal.link ? (
              <Link href={goal.link}>
                <a className="font-medium text-gray-900 dark:text-gray-100">{title}</a>
              </Link>
            ) : (
              <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
            )}{' '}
          </div>
        )}
        <p className="text-gray-700 dark:text-gray-400 ml-6">{children}</p>
      </li>
    )
  }

  return (
    <ul>
      <Step title={goal.name} link={goal.link}>
        {goal.description}
      </Step>
    </ul>
  )
}
