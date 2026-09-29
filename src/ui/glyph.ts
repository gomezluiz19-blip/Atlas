// One consistent set of line icons (Lucide, ISC licence) for everything you
// press. Controls used to carry emoji; `iconFor` swaps a control's emoji for
// its matching line icon, and leaves emoji that are content (an animal's
// species, a flag) as they are.
import {
  Activity, Anchor, Baby, Banknote, BedDouble, Bike, Bird, BookOpen, Building2, Bus, CalendarDays, Car, CarTaxiFront, ChartLine, CircleHelp, Clapperboard, Clock, Cloud,
  CloudLightning, CloudRain, CloudSun, Compass, Copyright, Droplet, Droplets, Earth, Eye, Factory, Film, Flame, Footprints, GitFork, Globe, GraduationCap, Heart, HeartPulse,
  House, KeyRound, Landmark, Layers, Leaf, Lightbulb, Map, MapPin, Mic, Moon, Mountain, MountainSnow, Music, Orbit, PawPrint, Plane, Puzzle, Rocket, Rotate3d, RotateCw,
  Ruler, School, Search, Ship, Smartphone, Snowflake, Sparkles, Sprout, Stethoscope, Sun, Syringe, Tag, Target, Telescope, Tent, Thermometer, Timer, TrainFront, TreePine,
  TrendingUp, TriangleAlert, Users, Waves, Wheat, Wind, ZoomIn, ZoomOut, ArrowDownToLine, Hourglass, Pickaxe, Gem, Radiation, Ticket, Utensils, Tractor, HardHat,
  Truck, Bug, Fish, Squirrel, Sunrise, Tornado, Trophy, Drama, PartyPopper, Dices,
  type IconNode,
} from "lucide";

const esc = (v: string | number) => String(v).replace(/"/g, "&quot;");

/** An icon as an SVG string, drawn in the current text colour. */
export function svgOf(node: IconNode, size = 18, stroke = 1.75): string {
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v as string | number)}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Control emoji and the line icon that replaces them. */
const BY_EMOJI: Record<string, IconNode> = {
  "✈️": Plane, "🚆": TrainFront, "🚗": Car, "🚕": CarTaxiFront, "🚌": Bus, "⛴️": Ship, "🚢": Ship, "🚶": Footprints, "🚲": Bike, "🛏️": BedDouble, "📍": MapPin,
  "🏠": House, "🏫": School, "🎪": Tent, "⏱️": Timer, "🗓️": CalendarDays, "⛰️": Mountain, "🏔️": MountainSnow, "🌋": Flame, "🏞️": Waves, "🏜️": Sun, "☄️": Sparkles,
  "🧩": Puzzle, "〽️": Activity, "🪨": Layers, "📈": TrendingUp, "🕳️": ArrowDownToLine, "〰️": Waves, "🛶": Waves, "💧": Droplet, "🌧️": CloudRain, "⚓": Anchor,
  "🌡️": Thermometer, "❄️": Snowflake, "🌌": Sparkles, "🌲": TreePine, "🌿": Leaf, "🌼": Sprout, "🦓": PawPrint, "🦋": Bird, "🐾": PawPrint, "🔬": Search,
  "🚇": TrainFront, "🌃": Moon, "🛰️": Orbit, "🌊": Waves, "☁️": Cloud, "🗺️": Map, "🌗": Moon, "👥": Users, "✨": Sparkles, "🏙️": Building2, "🧒": Baby, "🧓": Users,
  "👶": Baby, "🔑": KeyRound, "❤️": HeartPulse, "🍼": Baby, "🩺": Stethoscope, "🚰": Droplets, "📱": Smartphone, "🌐": Globe, "💡": Lightbulb, "💰": Banknote,
  "🔄": RotateCw, "🔍": ZoomIn, "🔭": ZoomOut, "⬇️": ArrowDownToLine, "🌍": Earth, "🎙️": Mic, "🎵": Music, "🏷️": Tag, "©️": Copyright, "🎬": Clapperboard,
  "🔥": Flame, "🆕": Clock, "🏛️": Landmark, "🌦️": CloudSun, "🪐": Orbit, "🧭": Compass, "⑂": GitFork, "♥": Heart, "📖": BookOpen, "❓": CircleHelp, "🎯": Target,
  "🚀": Rocket, "🔭 ": Telescope, "💨": Wind, "⛈️": CloudLightning, "🌤️": CloudSun, "☀️": Sun, "🍂": Leaf, "🪰": Bug, "💉": Syringe, "🌾": Wheat, "🌱": Sprout,
  "🏗️": HardHat, "🚚": Truck, "⚠️": TriangleAlert, "📏": Ruler, "🎓": GraduationCap, "🎟️": Ticket, "🍽️": Utensils, "🚜": Tractor, "⏳": Hourglass, "⛏️": Pickaxe,
  "💎": Gem, "☢️": Radiation, "🏭": Factory, "🎞️": Film, "📊": ChartLine, "👁️": Eye, "🐟": Fish, "🐿️": Squirrel, "🌅": Sunrise, "🌪️": Tornado, "🌄": Rotate3d, "🏅": Trophy, "🎭": Drama, "🎉": PartyPopper, "🎤": Mic, "🎲": Dices,
};

/** The line icon for a control's emoji, or null to keep the emoji (it's content). */
export const iconSvg = (emoji: string, size = 18): string | null => {
  const node = BY_EMOJI[emoji.trim()];
  return node ? svgOf(node, size) : null;
};

/** A span holding the icon (or, for content emoji, the emoji itself). */
export function iconFor(emoji: string, size = 18, cls = "g"): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = cls;
  const svg = iconSvg(emoji, size);
  if (svg) el.innerHTML = svg;
  else el.textContent = emoji;
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** "✈️ Fly" → [icon, " Fly"]: a label whose leading emoji becomes an icon. */
export function labelled(text: string, size = 16): (Node | string)[] {
  const m = /^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*|[〰〽♥⑂©]️?)\s*(.*)$/u.exec(text);
  if (!m || !iconSvg(m[1])) return [text];
  return [iconFor(m[1], size), m[2]];
}
