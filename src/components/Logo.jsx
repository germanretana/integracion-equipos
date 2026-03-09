export default function Logo({ compact = false }) {
  return (
    <img
      src="/brand/integracion-plateado.png"
      alt="Integración de Equipos Gerenciales"
      style={
        compact
          ? {
              display: "block",
              maxWidth: "180px",
              width: "100%",
              margin: 0,
            }
          : {
              display: "block",
              maxWidth: "420px",
              width: "100%",
              marginBottom: "32px",
            }
      }
    />
  );
}
