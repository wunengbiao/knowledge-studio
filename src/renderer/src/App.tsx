import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ChatPage } from './pages/ChatPage'
import { GraphPage } from './pages/GraphPage'
import { HomePage } from './pages/HomePage'
import { KBManagementPage } from './pages/KBManagementPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/kb/:kbId" element={<KnowledgeBasePage />} />
        <Route path="/kb/:kbId/search" element={<SearchPage />} />
        <Route path="/kb/:kbId/graph" element={<GraphPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
        <Route path="/kb-management" element={<KBManagementPage />} />
      </Route>
    </Routes>
  )
}
