import AnthemAdmin from "@/components/admin/AnthemAdmin";
import AppNav from "@/components/ui/AppNav";

export default function AdminAnthemsPage() {
  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <AnthemAdmin />
    </div>
  );
}
