import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function PageHeading({ title }: { title: string }) {
  useDocumentTitle(title)

  return <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
}
