import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { SearchPage } from './pages/SearchPage'
import { GraphPage } from './pages/GraphPage'
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
      </Route>
    </Routes>
  )
}
