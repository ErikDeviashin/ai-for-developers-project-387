import { Link } from 'react-router-dom'
import { PageContainer } from '../components/PageContainer'
import { PageHeading } from '../components/PageHeading'

export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeading title="Страница не найдена" />
      <div className="mt-8">
        <Link
          to="/"
          className="font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900"
        >
          На главную
        </Link>
      </div>
    </PageContainer>
  )
}
