import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import Tasks from './pages/Tasks';
import Links from './pages/Links';
import Templates from './pages/Templates';
import Rules from './pages/Rules';
import PushToSlack from './pages/PushToSlack';
import Settings from './pages/Settings';
import ReadingList from './pages/ReadingList';
import KnowledgeGraph from './pages/KnowledgeGraph';
import Mentions from './pages/Mentions';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="channels" element={<Channels />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="reading-list" element={<ReadingList />} />
          <Route path="knowledge-graph" element={<KnowledgeGraph />} />
          <Route path="mentions" element={<Mentions />} />
          <Route path="links" element={<Links />} />
          <Route path="templates" element={<Templates />} />
          <Route path="rules" element={<Rules />} />
          <Route path="push" element={<PushToSlack />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
