import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import AppHome from "./pages/AppHome";
import Questionnaires from "./pages/Questionnaires";
import C1 from "./pages/C1";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot" element={<ForgotPassword />} />

        {/* App */}
        <Route path="/app" element={<Navigate to="/app/questionnaires" replace />} />
        <Route path="/app/home" element={<AppHome />} />
        <Route path="/app/questionnaires" element={<Questionnaires />} />
        <Route path="/app/c1" element={<C1 />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
