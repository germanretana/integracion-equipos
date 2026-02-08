import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Questionnaires from "./pages/Questionnaires";
import C1 from "./pages/C1";
import C2 from "./pages/C2";

import AdminLogin from "./pages/AdminLogin";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import AdminProcesses from "./pages/AdminProcesses";
import AdminProcessNew from "./pages/AdminProcessNew";
import AdminProcessDetail from "./pages/AdminProcessDetail";
import AdminProcessTemplates from "./pages/AdminProcessTemplates";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Participants */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/app" element={<Navigate to="/app/questionnaires" replace />} />
        <Route path="/app/questionnaires" element={<Questionnaires />} />
        <Route path="/app/c1" element={<C1 />} />
        <Route path="/app/c2/:peer" element={<C2 />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <Navigate to="/admin/processes" replace />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/processes"
          element={
            <AdminProtectedRoute>
              <AdminProcesses />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/processes/new"
          element={
            <AdminProtectedRoute>
              <AdminProcessNew />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/processes/:processSlug"
          element={
            <AdminProtectedRoute>
              <AdminProcessDetail />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/processes/:processSlug/templates"
          element={
            <AdminProtectedRoute>
              <AdminProcessTemplates />
            </AdminProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
