import { Link } from 'react-router-dom'
import { PageContainer } from '../components/PageContainer'
import { PageHeading } from '../components/PageHeading'

export function HomePage() {
  return (
    <PageContainer>
      <PageHeading title="Календарь звонков" />
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        Выберите тип встречи и удобное свободное время — и запишитесь на звонок.
      </p>
      <div className="mt-8">
        <Link
          to="/book"
          className="inline-flex rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Записаться на звонок
        </Link>
      </div>
    </PageContainer>
  )
}
