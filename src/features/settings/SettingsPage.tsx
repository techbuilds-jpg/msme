import { useSearchParams } from 'react-router-dom'
import { Alert, PageHeader, Tabs } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { AuditLogPanel } from './AuditLogPanel'
import { BusinessProfilePanel } from './BusinessProfilePanel'
import { CategoriesPanel } from './CategoriesPanel'
import { PreferencesPanel } from './PreferencesPanel'
import { TeamPanel } from './TeamPanel'

type Tab = 'business' | 'team' | 'preferences' | 'categories' | 'audit'

export function SettingsPage() {
  const { can, writable } = useCurrentBusiness()
  const [params, setParams] = useSearchParams()
  const tabs: { value: Tab; label: string }[] = [
    { value: 'business', label: 'Business profile' },
    ...(can('team.manage') ? [{ value: 'team' as Tab, label: 'Team & permissions' }] : []),
    ...(can('settings.manage') ? [{ value: 'preferences' as Tab, label: 'Preferences' }] : []),
    ...(can('expenses.manage') ? [{ value: 'categories' as Tab, label: 'Expense categories' }] : []),
    ...(can('settings.manage') ? [{ value: 'audit' as Tab, label: 'Audit log' }] : []),
  ]
  const tab = tabs.find((t) => t.value === params.get('tab'))?.value ?? 'business'

  return (
    <>
      <PageHeader title="Settings" />
      {!writable && <Alert tone="warning" className="mb-4">Settings are read-only while the trial is ended or the account is suspended.</Alert>}
      <Tabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={tabs} />
      {tab === 'business' && <BusinessProfilePanel />}
      {tab === 'team' && <TeamPanel />}
      {tab === 'preferences' && <PreferencesPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'audit' && <AuditLogPanel />}
    </>
  )
}
