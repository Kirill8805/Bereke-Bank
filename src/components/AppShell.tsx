import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LayoutGrid, Star, User, Menu, X, BookOpen, MessageSquare, LogOut, Home, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AppShell({
  title,
  children,
  hideBottom = false,
  back,
}: {
  title?: string;
  children: ReactNode;
  hideBottom?: boolean;
  back?: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 h-14">
          {back ? (
            <Link to={back} className="tap text-2xl text-foreground/80 hover:text-primary">←</Link>
          ) : (
            <button onClick={() => setOpen(true)} className="tap p-1 -ml-1 text-foreground" aria-label="Меню">
              <Menu className="size-6" />
            </button>
          )}
          <h1 className="font-semibold text-base">{title}</h1>
          <span className="w-6" />
        </div>
      </header>

      <main className="flex-1 page-pad">{children}</main>

      {/* Bottom nav */}
      {!hideBottom && (
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-background border-t safe-bottom">
          <div className="grid grid-cols-3 max-w-md mx-auto">
            <NavTab to="/" icon={<LayoutGrid className="size-5" />} label="Главная" active={path === "/"} />
            <NavTab to="/rating" icon={<Star className="size-5" />} label="Рейтинг" active={path === "/rating"} />
            <NavTab to="/profile" icon={<User className="size-5" />} label="Профиль" active={path === "/profile"} />
          </div>
        </nav>
      )}

      {/* Burger drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 animate-in fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card shadow-2xl flex flex-col animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-bold text-lg">Bereke <span className="text-primary">AI</span></span>
              <button onClick={() => setOpen(false)} className="tap p-1"><X className="size-5" /></button>
            </div>
            <div className="flex-1 p-2 space-y-1">
            <DrawerLink to="/" icon={<Home className="size-5" />} label="Главная" active={path === "/"} onClick={() => setOpen(false)} />
            <DrawerLink to="/trainers" icon={<Brain className="size-5" />} label="ИИ тренажёры" active={path === "/trainers"} onClick={() => setOpen(false)} />
            <DrawerLink to="/tests" icon={<MessageSquare className="size-5" />} label="Тестирование с ИИ" active={path === "/tests"} onClick={() => setOpen(false)} />
            <DrawerLink to="/rating" icon={<Star className="size-5" />} label="Рейтинг сотрудников" active={path === "/rating"} onClick={() => setOpen(false)} />
            <DrawerLink to="/materials" icon={<BookOpen className="size-5" />} label="Обучающие материалы" active={path === "/materials"} onClick={() => setOpen(false)} />
            <DrawerLink to="/profile" icon={<User className="size-5" />} label="Профиль" active={path === "/profile"} onClick={() => setOpen(false)} />
            </div>
            <button onClick={logout} className="tap m-3 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium hover:bg-muted">
              <LogOut className="size-4" /> Выйти
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function NavTab({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link to={to} className={`tap flex flex-col items-center gap-1 py-2.5 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function DrawerLink({ to, icon, label, active, onClick }: { to: string; icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className={`tap flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${active ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
