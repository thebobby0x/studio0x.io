"use client";
import SegmentedBar, { SegmentedVersusBar } from "@/components/ui/SegmentedBar";

export default function P() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <h1 className="s0x-display-hero text-3xl font-black text-s0x-text">Segmented Bars</h1>

      <div className="space-y-3">
        <span className="s0x-eyebrow">Possession — opposing</span>
        <SegmentedVersusBar home={62} away={38} homeLabel="62%" awayLabel="38%" segments={28} height={18} circuit />
        <SegmentedVersusBar home={50} away={50} homeLabel="50%" awayLabel="50%" segments={28} height={18} circuit />
      </div>

      <div className="space-y-3">
        <span className="s0x-eyebrow">Win probability — draw is the unlit middle</span>
        <SegmentedVersusBar home={44} away={31} normalize={false} homeLabel="44%" awayLabel="31%" segments={28} height={16} circuit />
      </div>

      <div className="space-y-3">
        <span className="s0x-eyebrow">Single bars</span>
        <SegmentedBar value={73} label="73%" segments={20} height={16} color="cyan" circuit />
        <SegmentedBar value={41} label="41%" segments={20} height={16} color="red" circuit />
        <SegmentedBar value={88} direction="rtl" label="88%" segments={20} height={16} color="red" circuit />
        <SegmentedBar value={0} label="0%" segments={20} height={16} color="cyan" circuit />
      </div>

      <div className="space-y-2">
        <span className="s0x-eyebrow">Dense list rows (no frame)</span>
        {[92, 67, 45, 23, 8].map((v) => (
          <div key={v} className="flex items-center gap-3">
            <span className="s0x-mono text-[10px] text-s0x-muted w-10">R{v}</span>
            <div className="flex-1"><SegmentedBar value={v} segments={12} height={8} color="cyan" /></div>
            <span className="s0x-data text-xs w-8 text-right" style={{ color: "var(--seg-cyan)" }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <span className="s0x-eyebrow">Stat duels</span>
        {([["Shots", 14, 9], ["Corners", 6, 3], ["xG", 1.8, 0.6]] as [string, number, number][]).map(([l, h, a]) => (
          <div key={l} className="rounded-lg px-2.5 py-1.5" style={{ backgroundColor: "var(--seg-plate)" }}>
            <div className="s0x-data flex justify-between text-xs font-bold">
              <span style={{ color: "var(--seg-cyan)" }}>{h}</span>
              <span style={{ color: "var(--seg-red)" }}>{a}</span>
            </div>
            <div className="my-1"><SegmentedVersusBar home={h} away={a} segments={10} height={7} /></div>
            <div className="s0x-mono text-[8px] text-s0x-muted text-center">{l}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
