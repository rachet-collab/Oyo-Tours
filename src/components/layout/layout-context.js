import { createContext, useContext } from 'react'

// Lets the per-page TopBar open the mobile navigation drawer owned by AppLayout.
export const LayoutContext = createContext({ openNav: () => {} })

// eslint-disable-next-line react-refresh/only-export-components
export function useLayout() {
  return useContext(LayoutContext)
}
