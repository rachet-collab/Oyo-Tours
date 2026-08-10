import { BrowserRouter, MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppStore.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import Login from './pages/Login.jsx'
import Packages from './pages/Packages.jsx'
import PackageDetail from './pages/PackageDetail.jsx'
import PackageForm from './pages/PackageForm.jsx'
import Checkout from './pages/Checkout.jsx'
import Bookings from './pages/Bookings.jsx'
import BookingDetail from './pages/BookingDetail.jsx'
import Guests from './pages/Guests.jsx'
import Settings from './pages/Team.jsx'
import Inventory from './pages/Inventory.jsx'
import InventoryList from './pages/InventoryList.jsx'
import InventoryDetail from './pages/InventoryDetail.jsx'
import InventoryForm from './pages/InventoryForm.jsx'
import BulkUpload from './pages/BulkUpload.jsx'
import Airlines from './pages/Airlines.jsx'
import Overview from './pages/Overview.jsx'
import Finance from './pages/Finance.jsx'
import Vendors from './pages/Vendors.jsx'
import Operations from './pages/Operations.jsx'

// Single-file build uses an in-memory router (works from file:// or a sandboxed
// preview). Normal builds use real URL routing.
const Router = import.meta.env.VITE_SINGLEFILE ? MemoryRouter : BrowserRouter

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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />

            {/* Ops back-office — Admin & Operations */}
            <Route path="/overview" element={<Navigate to="/inventory" replace />} />
            <Route path="/finance" element={<RequireRole roles={['admin', 'operations']}><Finance /></RequireRole>} />
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
            <Route path="/hotels/new" element={<RequireRole roles={['admin', 'operations']}><InventoryForm type="hotel" /></RequireRole>} />
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
      </Router>
    </AppProvider>
  )
}
