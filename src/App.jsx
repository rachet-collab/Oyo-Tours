import { lazy, Suspense } from 'react'
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppStore.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import Login from './pages/Login.jsx'

// Route components are code-split so the initial download is small and the heavy
// bits (bulk-upload/XLSX, forms, detail pages) only load when first visited.
// Landing pages (Packages/Explore) load first; everything else lazily.
const Packages = lazy(() => import('./pages/Packages.jsx'))
const PackageDetail = lazy(() => import('./pages/PackageDetail.jsx'))
const PackageForm = lazy(() => import('./pages/PackageForm.jsx'))
const Checkout = lazy(() => import('./pages/Checkout.jsx'))
const Bookings = lazy(() => import('./pages/Bookings.jsx'))
const BookingDetail = lazy(() => import('./pages/BookingDetail.jsx'))
const Guests = lazy(() => import('./pages/Guests.jsx'))
const Settings = lazy(() => import('./pages/Team.jsx'))
const Inventory = lazy(() => import('./pages/Inventory.jsx'))
const InventoryList = lazy(() => import('./pages/InventoryList.jsx'))
const InventoryDetail = lazy(() => import('./pages/InventoryDetail.jsx'))
const InventoryForm = lazy(() => import('./pages/InventoryForm.jsx'))
const BulkUpload = lazy(() => import('./pages/BulkUpload.jsx'))
const Airlines = lazy(() => import('./pages/Airlines.jsx'))
const Finance = lazy(() => import('./pages/Finance.jsx'))
const FinanceAnalytics = lazy(() => import('./pages/FinanceAnalytics.jsx'))
const Vendors = lazy(() => import('./pages/Vendors.jsx'))
const Operations = lazy(() => import('./pages/Operations.jsx'))

// Single-file build uses an in-memory router (works from file:// or a sandboxed
// preview). Normal builds use real URL routing.
const Router = import.meta.env.VITE_SINGLEFILE ? MemoryRouter : BrowserRouter

// Lightweight fallback while a route chunk loads.
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

// Where each role lands after sign-in.
const HOME = { admin: '/packages', operations: '/packages', sales: '/packages' }

function RequireRole({ roles, children }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  return roles.includes(user.role) ? children : <Navigate to={HOME[user.role] || '/packages'} replace />
}

function Home() {
  const { user } = useApp()
  return <Navigate to={HOME[user?.role] || '/packages'} replace />
}

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />

            {/* Ops back-office — Admin & Operations */}
            <Route path="/overview" element={<Navigate to="/inventory" replace />} />
            <Route path="/finance" element={<RequireRole roles={['admin', 'operations']}><Finance /></RequireRole>} />
            <Route path="/finance/analytics" element={<RequireRole roles={['admin', 'operations']}><FinanceAnalytics /></RequireRole>} />
            <Route path="/operations" element={<RequireRole roles={['admin', 'operations']}><Operations /></RequireRole>} />

            {/* Inventory — Admin & Operations (airline seat blocks + hotel room blocks in one view) */}
            <Route path="/inventory" element={<RequireRole roles={['admin', 'operations']}><Inventory /></RequireRole>} />
            <Route path="/inventory/flights" element={<RequireRole roles={['admin', 'operations']}><InventoryList type="airline" /></RequireRole>} />
            <Route path="/inventory/hotels" element={<RequireRole roles={['admin', 'operations']}><InventoryList type="hotel" /></RequireRole>} />
            <Route path="/inventory/bulk-upload" element={<RequireRole roles={['admin', 'operations']}><BulkUpload /></RequireRole>} />
            <Route path="/inventory/new" element={<RequireRole roles={['admin', 'operations']}><InventoryForm type="airline" /></RequireRole>} />
            <Route path="/inventory/:id/edit" element={<RequireRole roles={['admin', 'operations']}><InventoryForm /></RequireRole>} />
            <Route path="/inventory/:id" element={<RequireRole roles={['admin', 'operations']}><InventoryDetail /></RequireRole>} />
            <Route path="/airlines" element={<RequireRole roles={['admin', 'operations']}><Airlines /></RequireRole>} />
            <Route path="/vendors" element={<RequireRole roles={['admin', 'operations']}><Vendors /></RequireRole>} />

            {/* Hotel records share the same framework; the list now lives under /inventory. */}
            <Route path="/hotels" element={<Navigate to="/inventory" replace />} />
            {/* Hotel blocks are created only from packages — manual add is disabled. */}
            <Route path="/hotels/new" element={<Navigate to="/inventory/hotels" replace />} />
            <Route path="/hotels/:id/edit" element={<RequireRole roles={['admin', 'operations']}><InventoryForm /></RequireRole>} />
            <Route path="/hotels/:id" element={<RequireRole roles={['admin', 'operations']}><InventoryDetail /></RequireRole>} />

            {/* Packages / storefront */}
            <Route path="/packages" element={<Packages />} />
            <Route path="/packages/new" element={<RequireRole roles={['admin']}><PackageForm /></RequireRole>} />
            <Route path="/packages/:id/edit" element={<RequireRole roles={['admin']}><PackageForm /></RequireRole>} />
            <Route path="/packages/:id" element={<PackageDetail />} />

            {/* Bookings */}
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings/:id" element={<BookingDetail />} />

            {/* Directory & settings */}
            <Route path="/guests" element={<RequireRole roles={['admin', 'operations', 'sales']}><Guests /></RequireRole>} />
            <Route path="/settings" element={<RequireRole roles={['admin']}><Settings /></RequireRole>} />
            <Route path="/team" element={<Navigate to="/settings" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Router>
    </AppProvider>
  )
}
