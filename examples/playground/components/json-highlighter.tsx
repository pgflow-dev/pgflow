export default function JSONHighlighter({ data }: { data: object }) {
  const jsonString = JSON.stringify(data, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let className = 'text-yellow-500'; // number - using yellow-500 (#eab308)
        if (/^"/.test(match)) {
          className = match.endsWith(':')
            ? 'text-blue-500' // key - using blue-500 (#3b82f6)
            : 'text-green-500'; // string - using green-500 (#22c55e)
        } else if (/true|false/.test(match)) {
          className = 'text-blue-500'; // boolean - using blue-500 (#3b82f6)
        } else if (/null/.test(match)) {
          className = 'text-red-500'; // null - using red-500 (#ef4444)
        }
        return `<span class="${className}">${match}</span>`;
      },
    );

  return (
    <pre className="bg-gray-500/5 rounded-md p-4 text-sm">
      <code
        dangerouslySetInnerHTML={{ __html: jsonString }}
        className="whitespace-pre-wrap"
      />
    </pre>
  );
}
