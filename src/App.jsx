import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import AppHome from "./pages/AppHome";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/app" element={<AppHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
