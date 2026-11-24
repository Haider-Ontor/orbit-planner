import {
  Sun, Target, ListOrdered, ListChecks, Repeat, FolderKanban, CalendarDays, NotebookPen, History,
  Sparkles, Settings, Mic, Plus, Check, Trash2, X, Ellipsis, Link, ChevronLeft, Menu, Flag, Cloud,
  Download, RefreshCw, LayoutGrid, TrendingUp, Layers, PenLine, Star, Circle, Clock, AlarmClock, ArrowDownUp, type LucideIcon,
} from 'lucide-react';

/* One icon family everywhere: Lucide outline icons, understated, always next to a label. */
const ICONS: Record<string, LucideIcon> = {
  today: Sun,
  goals: Target,
  flag: Target,
  matrix: ListOrdered,
  tasks: ListChecks,
  routine: Repeat,
  projects: FolderKanban,
  calendar: CalendarDays,
  notes: NotebookPen,
  history: History,
  check: Check,
  capture: Sparkles,
  settings: Settings,
  mic: Mic,
  plus: Plus,
  trash: Trash2,
  x: X,
  more: Ellipsis,
  link: Link,
  back: ChevronLeft,
  list: Menu,
  cloud: Cloud,
  update: Download,
  sync: RefreshCw,
  grid: LayoutGrid,
  pin: Flag,
  trend: TrendingUp,
  layers: Layers,
  pen: PenLine,
  star: Star,
  circle: Circle,
  clock: Clock,
  alarm: AlarmClock,
  sort: ArrowDownUp,
};

export function Icon({ name, size = 18, stroke = 1.75 }: { name: keyof typeof ICONS | string; size?: number; stroke?: number }) {
  const C = ICONS[name] ?? Ellipsis;
  return <C className="ico" size={size} strokeWidth={stroke} aria-hidden="true" />;
}
