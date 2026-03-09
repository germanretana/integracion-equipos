import Logo from "./Logo";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export default function ParticipantBrandBar({ process }) {
  if (!process) return null;

  const logoSrc = process.logoUrl ? `${API_BASE}${process.logoUrl}` : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 20,
        marginBottom: 18,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          minWidth: 0,
        }}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt="Logo del proceso"
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              objectFit: "contain",
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.08)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              lineHeight: 1.2,
              color: "#fff",
            }}
          >
            {process.companyName} — {process.processName}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
          marginLeft: "auto",
        }}
      >
        <div
          style={{
            fontSize: 12,
            opacity: 0.72,
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          Proceso facilitado por
        </div>
        <div style={{ width: 180, maxWidth: "100%" }}>
          <Logo compact />
        </div>
      </div>
    </div>
  );
}
