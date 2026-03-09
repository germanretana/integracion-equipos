import Logo from "./Logo";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export default function ParticipantBrandBar({ process }) {
  if (!process) return null;

  const logoSrc = process.logoUrl ? `${API_BASE}${process.logoUrl}` : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        marginBottom: 18,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            minWidth: 180,
            maxWidth: 300,
            height: 84,
            padding: "10px 14px",
            borderRadius: 12,
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {logoSrc ? (
            <img
              src={logoSrc}
              alt="Logo del proceso"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                background: "transparent",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 8,
                background: "rgba(0,0,0,0.06)",
              }}
            />
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
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
          width: 220,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}
      >
        <Logo compact />
      </div>
    </div>
  );
}
