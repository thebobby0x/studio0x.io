// Global sportOS family strip (owner 7/15): podiumMetrics is the platform
// product; quiet links cross-promote the sibling products. podiumSelect and
// podiumSchedule render greyed "coming soon" until their URLs are provided —
// swap the <span>s for <a>s when the owner supplies links.
export default function SportOSFooter() {
  return (
    <footer className="border-t border-brand-border bg-brand-dark py-6 text-center space-y-2">
      <div className="text-xs font-black text-slate-300 tracking-tight">
        podium<span className="text-brand-gold">Metrics</span>
        <span className="text-slate-600 font-medium"> — part of </span>
        sportOS
        <span className="text-slate-600 font-medium"> by studio0x</span>
      </div>
      <div className="flex items-center justify-center gap-4 text-[10px] uppercase tracking-widest text-slate-600">
        <span title="VIP sport travel — coming soon" className="cursor-default">
          podiumSelect
        </span>
        <span aria-hidden className="text-slate-700">·</span>
        <span title="Global sport calendar — coming soon" className="cursor-default">
          podiumSchedule
        </span>
      </div>
    </footer>
  );
}
