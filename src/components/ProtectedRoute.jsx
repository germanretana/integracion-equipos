import { Navigate } from "react-router-dom";
import { auth } from "../services/auth";

export default function ProtectedRoute({ children }) {
  const session = auth.getSession();
  if (!session) return <Navigate to="/" replace />;
  return children;
}
