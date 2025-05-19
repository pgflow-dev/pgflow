import { Json } from '@/supabase/functions/database-types';

export default function JSONHighlighter({ data }: { data: Json }) {
  // Safety check for undefined or null data
  if (data === undefined || data === null) {
    return (
      <pre className="bg-gray-500/5 rounded-md p-4 text-sm text-muted-foreground">
        <code>No data available</code>
      </pre>
    );
  }
  
  // SECURITY FIX: Replace dangerouslySetInnerHTML with safe React components
  // to prevent XSS vulnerabilities from untrusted JSON content
  
  // Safely convert the data to a string
  const jsonString = JSON.stringify(data, null, 2);
  
  // Parse the JSON to create stylized spans safely using React elements
  // instead of raw HTML strings
  const renderJSON = (str: string) => {
    // This regex matches JSON tokens (strings, numbers, booleans, null)
    const jsonTokens = str.match(
      /("(\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)|[\s{}[\],]+/g
    ) || [];
    
    return jsonTokens.map((token, index) => {
      // Determine the token type and apply appropriate styling
      let className = '';
      
      if (/^"/.test(token)) {
        // Check if it's a key (followed by a colon)
        if (jsonTokens[index + 1] && jsonTokens[index + 1].includes(':')) {
          className = 'text-blue-500'; // key
        } else {
          className = 'text-green-500'; // string value
        }
      } else if (/^-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(token)) {
        className = 'text-yellow-500'; // number
      } else if (/^true|false$/.test(token)) {
        className = 'text-blue-500'; // boolean
      } else if (/^null$/.test(token)) {
        className = 'text-red-500'; // null
      }
      
      return className 
        ? <span key={index} className={className}>{token}</span>
        : <span key={index}>{token}</span>;
    });
  };

  return (
    <pre className="bg-gray-500/5 rounded-md p-4 text-sm">
      <code className="whitespace-pre-wrap">
        {renderJSON(jsonString)}
      </code>
    </pre>
  );
}
