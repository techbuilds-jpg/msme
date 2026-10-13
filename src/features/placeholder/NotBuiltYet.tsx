import { Construction } from 'lucide-react'
import { Card, EmptyState, PageHeader } from '@/components/ui'

/** Honest placeholder for modules scheduled in a later phase. Nothing on this page pretends to work. */
export function NotBuiltYet({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={<Construction className="size-6" aria-hidden />} title={`Not built yet (Phase ${phase})`}
          description="This module is planned but not implemented in this build. No data is read or saved here." />
      </Card>
    </>
  )
}
