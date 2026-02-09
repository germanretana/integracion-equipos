import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";

import Questionnaires from "./pages/Questionnaires";
import C1 from "./pages/C1";
import C2 from "./pages/C2";

import AdminLogin from "./pages/admin/AdminLogin";
import ProcessesList from "./pages/admin/ProcessesList";
import ProcessDashboard from "./pages/admin/ProcessDashboard";
import MasterTemplates from "./pages/admin/MasterTemplates";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot" element={<ForgotPassword />} />

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
            element={<ProcessDashboard />}
          />
          <Route path="/admin/master-templates" element={<MasterTemplates />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
