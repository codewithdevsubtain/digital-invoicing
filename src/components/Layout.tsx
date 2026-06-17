import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.js'
import TopBar from './TopBar.js'
import ToastContainer from './ToastContainer.js'

export default function Layout() {
  return (
    <div className="flex h-full w-full bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
