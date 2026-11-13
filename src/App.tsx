import { Navigate, Route, Routes } from 'react-router-dom';
import { InstructorLayout, RequireRole, StudentLayout } from './components/Layouts';
import { useSession } from './data/context';
import { StudentSignIn } from './pages/student/SignIn';
import { Today } from './pages/student/Today';
import { Practice } from './pages/student/Practice';
import { Gradebook } from './pages/student/Gradebook';
import { Drills } from './pages/student/Drills';
import { InstructorSignIn } from './pages/instructor/SignIn';
import { Hub } from './pages/instructor/Hub';
import { Classes } from './pages/instructor/Classes';
import { StudentRecordPage } from './pages/instructor/StudentRecord';
import { Settings } from './pages/instructor/Settings';
import { Heatmap } from './pages/instructor/Heatmap';
import { Rolling } from './pages/instructor/Rolling';
import { Report } from './pages/instructor/Report';

function Home() {
  const { session } = useSession();
  if (session === undefined) return <p className="empty" style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  return <Navigate to={session.role === 'student' ? '/today' : '/hub'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<StudentSignIn />} />
      <Route path="/instructor/signin" element={<InstructorSignIn />} />

      <Route element={<RequireRole role="student"><StudentLayout /></RequireRole>}>
        <Route path="/today" element={<Today />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/gradebook" element={<Gradebook />} />
        <Route path="/drills" element={<Drills />} />
      </Route>

      <Route element={<RequireRole role="instructor"><InstructorLayout /></RequireRole>}>
        <Route path="/hub" element={<Hub />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/students/:id" element={<StudentRecordPage />} />
        <Route path="/students/:id/report" element={<Report />} />
        <Route path="/heatmap" element={<Heatmap />} />
        <Route path="/rolling" element={<Rolling />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
