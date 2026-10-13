import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '@/features/auth/AuthPages'
import { ProfilePage } from '@/features/auth/ProfilePage'
import { AcceptInvitePage } from '@/features/business/AcceptInvitePage'
import { BusinessProvider } from '@/features/business/BusinessProvider'
import { OnboardingPage } from '@/features/business/OnboardingPage'
import { SelectBusinessPage } from '@/features/business/SelectBusinessPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { NotBuiltYet } from '@/features/placeholder/NotBuiltYet'
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

            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/businesses" element={<SelectBusinessPage />} />
              <Route element={<RequireBusiness />}>
                <Route element={<AppShell />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="sales" element={<NotBuiltYet title="Sales & Collections" phase={2} />} />
                  <Route path="orders" element={<NotBuiltYet title="Orders & Operations" phase={2} />} />
                  <Route path="customers" element={<NotBuiltYet title="Customers" phase={2} />} />
                  <Route path="expenses" element={<NotBuiltYet title="Expenses" phase={2} />} />
                  <Route path="employees" element={<NotBuiltYet title="Employees" phase={3} />} />
                  <Route path="reports" element={<NotBuiltYet title="Reports" phase={3} />} />
                  <Route path="settings" element={<NotBuiltYet title="Settings" phase={3} />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route element={<RequirePlatformAdmin />}>
                    <Route path="admin" element={<NotBuiltYet title="Platform administration" phase={4} />} />
                  </Route>
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
