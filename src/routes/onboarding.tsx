import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEPARTMENTS, POSITIONS } from "@/lib/constants";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Регистрация — Bereke AI" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [position, setPosition] = useState(POSITIONS[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, photoFile, { upsert: true });
        if (upErr) throw upErr;
        photo_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email ?? "",
        full_name: fullName.trim(),
        department,
        position,
        photo_url,
      });
      if (error) throw error;
      toast.success("Профиль сохранён");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-background/90 backdrop-blur border-b h-14 flex items-center justify-center">
        <h1 className="font-semibold">Регистрация</h1>
      </header>
      <form onSubmit={submit} className="px-5 py-6 space-y-5 pb-32">
        <Field label="ФИО" required>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Николай Петрович"
            className="input"
          />
        </Field>

        <Field label="Фото">
          <label className="block">
            {photoPreview ? (
              <div className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2">
                <img src={photoPreview} className="size-10 rounded-lg object-cover" />
                <span className="flex-1 text-sm truncate">{photoFile?.name}</span>
                <button type="button" onClick={(e) => { e.preventDefault(); setPhotoFile(null); setPhotoPreview(null); }}>
                  <X className="size-5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 bg-muted rounded-xl py-3 text-sm text-muted-foreground cursor-pointer tap">
                <Upload className="size-4" /> Загрузить фото
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        </Field>

        <Field label="Отдел" hint="Обязательно" required>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input">
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Должность" required>
          <select value={position} onChange={(e) => setPosition(e.target.value)} className="input">
            {POSITIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>

        <button
          disabled={saving}
          className="tap w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3.5 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Зарегистрироваться
        </button>
      </form>
      <style>{`.input { width: 100%; height: 46px; padding: 0 14px; background: var(--color-input); border-radius: 12px; font-size: 15px; outline: none; appearance: none; }
.input:focus { box-shadow: 0 0 0 2px var(--color-ring); }
select.input { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>"); background-repeat:no-repeat; background-position: right 14px center; padding-right: 36px; }`}</style>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold">{label}{required && <span className="text-destructive ml-0.5">*</span>}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
