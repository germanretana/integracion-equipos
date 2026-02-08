import { Navigate } from "react-router-dom";
import { adminAuth } from "../services/admin";

export default function AdminProtectedRoute({ children }) {
  if (!adminAuth.isLoggedIn()) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}
