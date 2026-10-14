import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AdminPage } from '@/features/admin/AdminPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '@/features/auth/AuthPages'
import { ProfilePage } from '@/features/auth/ProfilePage'
import { AcceptInvitePage } from '@/features/business/AcceptInvitePage'
import { BusinessProvider } from '@/features/business/BusinessProvider'
import { OnboardingPage } from '@/features/business/OnboardingPage'
import { SelectBusinessPage } from '@/features/business/SelectBusinessPage'
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { DemoPage } from '@/features/demo/DemoPage'
import { EmployeeDetailPage } from '@/features/employees/EmployeeDetailPage'
import { EmployeesPage } from '@/features/employees/EmployeesPage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { OrderDetailPage } from '@/features/orders/OrderDetailPage'
import { OrderFormPage } from '@/features/orders/OrderFormPage'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { NewSalePage } from '@/features/sales/NewSalePage'
import { SaleDetailPage } from '@/features/sales/SaleDetailPage'
import { SalesPage } from '@/features/sales/SalesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { PrivacyPage } from '@/features/placeholder/PrivacyPage'
import { supabaseConfigured } from '@/lib/supabase'
import { RequireAuth, RequireBusiness, RequirePlatformAdmin } from './guards'

export default function App() {
  if (!supabaseConfigured) {
    return (
      <main className="mx-auto max-w-lg p-8 text-sm">
        <h1 className="text-lg font-semibold">Configuration missing</h1>
        <p className="mt-2">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>) and restart.</p>
      </main>
    )
  }
  return (
    <BrowserRouter>
      <AuthProvider>
        <BusinessProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/invite" element={<AcceptInvitePage />} />
            <Route path="/demo" element={<DemoPage />} />

            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/businesses" element={<SelectBusinessPage />} />
              <Route element={<RequirePlatformAdmin />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
              <Route element={<RequireBusiness />}>
                <Route element={<AppShell />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="sales" element={<SalesPage />} />
                  <Route path="sales/new" element={<NewSalePage />} />
                  <Route path="sales/:id" element={<SaleDetailPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/new" element={<OrderFormPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                  <Route path="orders/:id/edit" element={<OrderFormPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="customers/:id" element={<CustomerDetailPage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route path="employees" element={<EmployeesPage />} />
                  <Route path="employees/:id" element={<EmployeeDetailPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BusinessProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
