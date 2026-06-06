import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";

import Questionnaires from "./pages/Questionnaires";
import C1 from "./pages/C1";
import C2 from "./pages/C2";

import AdminLogin from "./pages/admin/AdminLogin";
import ProcessesList from "./pages/admin/ProcessesList";
import ProcessDashboard from "./pages/admin/ProcessDashboard";
import ProcessEditor from "./pages/admin/ProcessEditor";
import ProcessRouter from "./pages/admin/ProcessRouter";
import MasterTemplates from "./pages/admin/MasterTemplates";
import ParticipantResponsesView from "./pages/admin/ParticipantResponsesView";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot" element={<Navigate to="/" replace />} />

        {/* Participant */}
        <Route
          path="/app/:processSlug/questionnaires"
          element={<Questionnaires />}
        />
        <Route path="/app/:processSlug/c1" element={<C1 />} />
        <Route path="/app/:processSlug/c2/:peerId" element={<C2 />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<AdminProtectedRoute />}>
          <Route path="/admin/processes" element={<ProcessesList />} />
          <Route
            path="/admin/processes/:processSlug"
            element={<ProcessRouter />}
          />
          <Route
            path="/admin/processes/new"
            element={<ProcessEditor mode="create" />}
          />
          <Route path="/admin/master-templates" element={<MasterTemplates />} />
          <Route
            path="/admin/processes/:processSlug/participants/:participantId/c1"
            element={<ParticipantResponsesView kind="c1" />}
          />
          <Route
            path="/admin/processes/:processSlug/participants/:participantId/c2/:peerId"
            element={<ParticipantResponsesView kind="c2" />}
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
