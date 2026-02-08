import ReactMarkdown from "react-markdown";

export default function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown>{text || ""}</ReactMarkdown>
    </div>
  );
}
