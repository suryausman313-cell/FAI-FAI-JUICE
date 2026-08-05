interface FaiFaiWordmarkProps {
  name?: string | null;
  compact?: boolean;
  className?: string;
}

export default function FaiFaiWordmark({ name, compact = false, className = '' }: FaiFaiWordmarkProps) {
  const displayName = (name || 'Fai Fai Juice').trim();

  if (displayName.toLowerCase() !== 'fai fai juice') {
    return <span className={`font-black text-white ${className}`}>{displayName}</span>;
  }

  return (
    <span
      aria-label="Fai Fai Juice"
      className={`inline-flex items-baseline justify-center whitespace-nowrap font-serif font-black italic tracking-tight ${className}`}
      style={{ textShadow: '0 2px 10px rgba(0,0,0,0.55)' }}
    >
      <span className="text-white">Fai</span>
      <span className="ml-[0.18em] text-[#f04a22]">Fai</span>
      <span className={`${compact ? 'ml-[0.16em]' : 'ml-[0.12em]'} text-white`}>Juice</span>
    </span>
  );
}
