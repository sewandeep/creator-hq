// Renders the assistant's simple markdown: **bold**, "- " bullets, line breaks.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

export function Md({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*[-*•] (.*)$/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      const h = line.match(/^#{1,6} (.*)$/);
      if (h) blocks.push(<p key={`h${blocks.length}`} className="mt-2 font-semibold">{inline(h[1])}</p>);
      else if (line.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1">{inline(line)}</p>);
    }
  }
  flush();
  return <div className="text-sm leading-relaxed">{blocks}</div>;
}
