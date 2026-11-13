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
import { Challenge } from './pages/student/Challenge';
import { Host } from './pages/instructor/Host';
import { ChallengeScreen } from './pages/instructor/ChallengeScreen';

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
        <Route path="/challenge" element={<Challenge />} />
      </Route>

      <Route element={<RequireRole role="instructor"><InstructorLayout /></RequireRole>}>
        <Route path="/hub" element={<Hub />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/students/:id" element={<StudentRecordPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/challenge/host" element={<Host />} />
      </Route>

      {/* The projector page has no menus: it is meant to fill a classroom screen. */}
      <Route path="/challenge/screen/:id" element={<RequireRole role="instructor"><ChallengeScreen /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
