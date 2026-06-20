import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.js'
import TopBar from './TopBar.js'
import ToastContainer from './ToastContainer.js'

export default function Layout() {
  return (
    <div className="flex h-full min-h-0 w-full bg-gray-50">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="scrollbar-main flex-1 overflow-y-auto overscroll-contain p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
