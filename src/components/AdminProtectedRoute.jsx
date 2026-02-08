import { Navigate, Outlet } from "react-router-dom";

function hasAdminToken() {
  return !!localStorage.getItem("integracion.admin.token");
}

export default function AdminProtectedRoute() {
  if (!hasAdminToken()) {
    return <Navigate to="/admin/login" replace />;
  }
  return <Outlet />;
}
