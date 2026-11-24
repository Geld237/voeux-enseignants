import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import MagicLinkLanding from './pages/MagicLinkLanding.jsx';
import TeacherWizard from './pages/TeacherWizard.jsx';
import DemoOutbox from './pages/DemoOutbox.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminTeachers from './pages/admin/AdminTeachers.jsx';
import AdminRepartition from './pages/admin/AdminRepartition.jsx';
import AdminCalendar from './pages/admin/AdminCalendar.jsx';
import AdminGroups from './pages/admin/AdminGroups.jsx';
import AdminRooms from './pages/admin/AdminRooms.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/acces/:token" element={<MagicLinkLanding />} />
      <Route path="/enseignant" element={<TeacherWizard />} />
      <Route path="/demo/boite" element={<DemoOutbox />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="enseignants" replace />} />
        <Route path="enseignants" element={<AdminTeachers />} />
        <Route path="repartition" element={<AdminRepartition />} />
        <Route path="calendrier" element={<AdminCalendar />} />
        <Route path="groupes" element={<AdminGroups />} />
        <Route path="salles" element={<AdminRooms />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
