import React from "react";
import { useParams } from "react-router-dom";
import { auth } from "../../services/auth";
import ProcessDashboard from "./ProcessDashboard";
import ProcessEditor from "./ProcessEditor";

export default function ProcessRouter() {
  const { processSlug } = useParams();
  const [process, setProcess] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    async function load() {
      try {
        const data = await auth.fetch(
          `/api/admin/processes/${processSlug}`
        );
        setProcess(data);
      } catch (e) {
        setError(e?.message || "No se pudo cargar el proceso.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [processSlug]);

  if (loading) return <div className="page"><div className="page-inner"><p className="sub">Cargando…</p></div></div>;
  if (error || !process) return <div className="page"><div className="page-inner"><div className="error">{error || "Proceso no encontrado."}</div></div></div>;

  if (process.status === "EN_PREPARACION") {
    return <ProcessEditor />;
  }

  return <ProcessDashboard />;
}
