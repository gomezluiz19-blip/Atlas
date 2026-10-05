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
  Building, TreeDeciduous, Coffee, Handshake, Ban, Hospital, Package, Zap, Box, Camera, Bell, LeafyGreen, NotebookPen, Umbrella, TreePalm, ShoppingBasket,
  Briefcase, ShoppingCart, CircleDot, Turtle, Library, Palette, Shirt, Scissors, Tv, IdCard, Salad, Carrot, Luggage, Flower, Flower2, Backpack, Apple,
  MessageCircle, Croissant, Dog, Cat, Church, Image, Monitor, Flag, Flashlight, Rewind, Bean, Cherry, Newspaper, Soup, Link, Star, Martini, Rabbit, Snail,
  Worm, Shell, Feather, Egg, Grape, Pizza, IceCreamCone, Beer, Wine, Banana, Citrus, CookingPot, Candy, Fuel, Battery, Plug, SatelliteDish,
  Gamepad2, FileText, Lock, BrickWall, Calendar, Volleyball, Store, Receipt, Sofa, CloudFog, Sparkle, PlaneLanding, PlaneTakeoff, Phone, Smile, Frown, Meh, Route,
  Laugh, PenLine, Castle, Hammer, Printer, Gift, Glasses, Dumbbell, Pill, Magnet, Cog, TrendingDown, Ambulance, Siren, FireExtinguisher, TrafficCone,
  Megaphone, Vote, Trash2, Recycle, DoorOpen, Shield, Wrench, Toolbox, Crown, Medal, Swords, PersonStanding, CircleX, Check, Sailboat, Hotel,
  Coins, Wallet, Hand, Signpost, Sunset, Play, Pause, Menu, Undo2, Headphones, Radio, Video, Brush, Bike as Bicycle,
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

// Everything else Terreno ever wrote as an emoji: buildings, food, animals, weather, feelings. Terreno draws its own
// icons (line icons in the current text colour) rather than borrowing a phone's emoji, which never match the type,
// the palette or each other.
const MORE: Record<string, IconNode> = {
  "🏢": Building, "🌳": TreeDeciduous, "☕": Coffee, "🤝": Handshake, "⛔": Ban, "🏥": Hospital, "📦": Package, "🏟": Landmark, "📐": Ruler, "⚡": Zap,
  "🧊": Box, "🐦": Bird, "📷": Camera, "🐋": Fish, "🔔": Bell, "🥬": LeafyGreen, "📝": NotebookPen, "🏖": Umbrella, "🧺": ShoppingBasket, "💼": Briefcase,
  "🛒": ShoppingCart, "✎": PenLine, "🏊": Waves, "🔴": CircleDot, "🐑": PawPrint, "🐢": Turtle, "🍄": Sprout, "📚": Library, "🎨": Palette, "🏘": House,
  "🧵": Scissors, "📺": Tv, "🛂": IdCard, "🧅": LeafyGreen, "🥗": Salad, "🥕": Carrot, "👗": Shirt, "🧳": Luggage, "🦉": Bird, "🌻": Flower, "🎒": Backpack,
  "🍎": Apple, "🏄": Waves, "💬": MessageCircle, "🥐": Croissant, "🐸": PawPrint, "🐕": Dog, "⛪": Church, "🌑": Moon, "🖼": Image, "🖥": Monitor, "🐈": Cat,
  "🚩": Flag, "🔦": Flashlight, "🔪": Utensils, "⏪": Rewind, "🍅": Apple, "🎃": Sprout, "🌽": Wheat, "🫛": Bean, "🥔": Sprout, "🍓": Cherry, "🗞": Newspaper,
  "🍲": Soup, "🔗": Link, "✊": Hand, "🌙": Moon, "🍸": Martini, "🥾": Footprints, "🎶": Music, "🦊": PawPrint, "🌵": Sprout, "🐝": Bug, "🌸": Flower2, "🎣": Fish,
  "🍷": Wine, "🌮": Utensils, "🏰": Castle, "🦎": PawPrint, "🌒": Moon, "🌓": Moon, "🌔": Moon, "🌕": Moon, "🌖": Moon, "🌘": Moon, "⛅": CloudSun, "✅": Check,
  "⏰": Clock, "🛬": PlaneLanding, "🛫": PlaneTakeoff, "🔋": Battery, "👤": Users, "📡": SatelliteDish, "🕹": Gamepad2, "📄": FileText, "🪶": Feather,
  "🛢": Fuel, "🔐": Lock, "🧱": BrickWall, "📅": Calendar, "🚓": Siren, "⚾": Trophy, "⚽": Volleyball, "🛍": ShoppingBasket, "🏆": Trophy, "🧾": Receipt,
  "🦁": PawPrint, "🦏": PawPrint, "🐻": PawPrint, "🐊": PawPrint, "🐧": Bird, "🦌": PawPrint, "🦩": Bird, "🐳": Fish, "🚉": TrainFront, "🛋": Sofa, "🪡": Scissors,
  "🐄": PawPrint, "🐔": Bird, "🐐": PawPrint, "🏺": Landmark, "🕒": Clock, "🌫": CloudFog, "🌶": Flame, "🍆": LeafyGreen, "🥒": LeafyGreen, "🫘": Bean, "🥦": LeafyGreen,
  "🟢": CircleDot, "🟣": CircleDot, "🧄": LeafyGreen, "🪱": Worm, "📞": Phone, "😣": Frown, "😕": Meh, "🙂": Smile, "😀": Laugh, "🤩": Sparkle, "✍": PenLine,
  "🏡": House, "🦅": Bird, "⭐": Star, "🎸": Music, "🐪": PawPrint, "🏝": TreePalm, "🍕": Pizza, "🍜": Soup, "🍣": Fish, "🍦": IceCreamCone, "🛝": Puzzle, "💦": Droplets,
  "♨": Flame, "🧗": Mountain, "⛺": Tent, "🛹": Activity, "🚻": Users, "🔌": Plug, "🟩": CircleDot, "🌇": Sunset, "🤞": Hand, "💤": Moon, "🏦": Landmark, "✂": Scissors,
  "💚": Heart, "🛡": Shield, "🧰": Toolbox, "🌬": Wind, "🍳": CookingPot, "🦺": HardHat, "🏬": Store, "🏕": Tent, "👷": HardHat, "♻": Recycle, "🚪": DoorOpen,
  "🚑": Ambulance, "🏚": House, "🚨": Siren, "🚒": FireExtinguisher, "🗑": Trash2, "🚦": TrafficCone, "📣": Megaphone, "🐘": PawPrint, "🦒": PawPrint, "🦍": PawPrint,
  "🐒": PawPrint, "🦜": Bird, "🐆": PawPrint, "🐺": PawPrint, "🦦": PawPrint, "🐠": Fish, "🪸": Shell, "🦧": PawPrint, "🐅": PawPrint, "🐼": PawPrint, "🦈": Fish,
  "🐬": Fish, "🐃": PawPrint, "🦀": Shell, "🗳": Vote, "📸": Camera, "🎁": Gift, "👠": Shirt, "💍": Gem, "🧥": Shirt, "🗿": Landmark, "🎮": Gamepad2, "🎳": Trophy,
  "⚕": Stethoscope, "🗼": Landmark, "🌉": Signpost, "🏤": Building, "💻": Monitor, "🔧": Wrench, "🏋": Dumbbell, "👟": Footprints, "🔎": Search, "🗒": NotebookPen,
  "🍇": Grape, "🧀": Utensils, "🍺": Beer, "🍯": CookingPot, "🧶": Scissors, "👜": ShoppingBasket, "👞": Footprints, "🪵": TreeDeciduous, "⚒": Hammer, "🪚": Hammer,
  "🖨": Printer, "🍑": Apple, "🍊": Citrus, "🥭": Apple, "🐖": PawPrint, "🐎": PawPrint, "🦙": PawPrint, "🦆": Bird, "🐇": Rabbit, "🦔": PawPrint, "🛩": Plane,
  "💫": Sparkle, "❌": CircleX, "⏭": Rewind, "👋": Hand, "🏨": Hotel, "🧲": Magnet, "⚙": Cog, "🍫": Candy, "📉": TrendingDown, "🌀": Tornado, "💊": Pill,
  "🚏": Signpost, "🏃": PersonStanding, "⛵": Sailboat, "🛥": Ship, "🏖️": Umbrella, "🏝️": TreePalm, "🧪": Lightbulb, "🎧": Headphones, "📻": Radio, "📹": Video,
  "🖌": Brush, "🛵": Bicycle, "🏍": Bicycle, "🦮": Dog, "🐩": Dog, "🐓": Bird, "🦃": Bird, "🕊": Bird, "🦢": Bird, "🐿": Squirrel, "🐌": Snail, "🐛": Bug, "🦟": Bug, "🕷": Bug,
  "🐞": Bug, "🦂": Bug, "🐍": Worm, "🐙": Fish, "🦑": Fish, "🦞": Shell, "🦐": Shell, "🐚": Shell, "🥚": Egg, "🍌": Banana, "🍋": Citrus, "🍐": Apple, "🍒": Cherry,
  "🫐": Grape, "🥑": Apple, "🌰": Sprout, "🥜": Bean, "🍞": Croissant, "🥖": Croissant, "🍰": Candy, "🍪": Candy, "🍩": Candy, "🍬": Candy, "🍭": Candy, "🍿": Candy,
  "🥤": Coffee, "🍵": Coffee, "🧃": Coffee, "🥛": Coffee, "🍾": Wine, "🥂": Wine, "🍹": Martini, "🍻": Beer, "🥃": Martini, "🧋": Coffee, "🌯": Utensils, "🥙": Utensils,
  "🍔": Utensils, "🍟": Utensils, "🌭": Utensils, "🥩": Utensils, "🍗": Utensils, "🍖": Utensils, "🥘": CookingPot, "🍝": Soup, "🍛": Soup, "🍚": Soup, "🍱": Utensils,
  "🥟": Utensils, "🦪": Shell, "🏪": Store, "🏣": Building, "🏩": Hotel, "🏯": Castle, "🕌": Landmark, "🕍": Landmark, "🛕": Landmark, "⛩": Landmark, "🗽": Landmark,
  "⛲": Droplets, "🎡": PartyPopper, "🎢": PartyPopper, "🎠": PartyPopper, "🏁": Flag, "🎪 ": Tent, "📌": MapPin, "📎": Link, "🔒": Lock, "🔓": Lock, "🗝": KeyRound,
  "🛎": Bell, "📬": Package, "📮": Package, "✉": MessageCircle, "📧": MessageCircle, "📨": MessageCircle, "💳": Wallet, "🪙": Coins, "💵": Banknote, "💸": Banknote,
  "📋": FileText, "📃": FileText, "📑": FileText, "🗂": FileText, "📁": FileText, "📂": FileText, "🗃": FileText, "🗄": FileText, "🧮": ChartLine, "📟": Smartphone,
  "⌚": Clock, "⏲": Timer, "🕰": Clock, "🌝": Moon, "🌚": Moon, "🌛": Moon, "🌜": Moon, "🌞": Sun, "🌠": Sparkle, "🌈": CloudSun, "⛱": Umbrella, "☔": CloudRain,
  "🌨": Snowflake, "🌩": CloudLightning, "⛄": Snowflake, "☃": Snowflake, "🌁": CloudFog, "🫧": Droplets, "🪴": Sprout, "🌺": Flower2, "🌷": Flower, "🥀": Flower,
  "🌹": Flower, "🍁": Leaf, "🍃": Leaf, "☘": Leaf, "🍀": Leaf, "🪨 ": Layers, "🏳": Flag, "🏴": Flag, "⛳": Flag, "🎾": Trophy, "🏀": Trophy, "🏈": Trophy, "🏉": Trophy,
  "🏐": Volleyball, "🏓": Trophy, "🏸": Trophy, "🥊": Trophy, "⛸": Trophy, "🎿": MountainSnow, "🏂": MountainSnow, "🏇": Trophy, "🚴": Bicycle, "🚵": Bicycle,
  "🤸": PersonStanding, "🧘": PersonStanding, "🏌": Flag, "🏹": Target, "🛷": MountainSnow, "🥇": Medal, "🥈": Medal, "🥉": Medal, "🎖": Medal, "👑": Crown,
  "⚔": Swords, "🗡": Swords, "🛠": Wrench, "🔨": Hammer, "🪓": Hammer, "🔩": Wrench, "⛓": Link, "🧯": FireExtinguisher, "🪜": Ruler, "🧹": Brush, "🧽": Droplets,
  "🧼": Droplets, "🚿": Droplets, "🛁": Droplets, "🚽": DoorOpen, "🛌": BedDouble, "🪑": Sofa, "🚧": TrafficCone, "⛽": Fuel, "🚂": TrainFront, "🚄": TrainFront,
  "🚅": TrainFront, "🚈": TrainFront, "🚊": TrainFront, "🚝": TrainFront, "🚞": TrainFront, "🚋": TrainFront, "🚃": TrainFront, "🚎": Bus, "🚐": Bus, "🚍": Bus,
  "🚘": Car, "🚖": CarTaxiFront, "🚙": Car, "🛻": Truck, "🚛": Truck, "🏎": Car, "🚁": Plane, "🛸": Orbit, "🛳": Ship, "⛴": Ship, "🛰 ": Orbit,
  "👨": Users, "👩": Users, "🧑": Users, "👪": Users, "👫": Users, "🙋": Hand, "🙌": Hand, "👏": Hand, "👍": Hand, "👎": Hand, "🤲": Hand, "🫶": Heart, "💪": Dumbbell,
  "🧠": Lightbulb, "👀": Eye, "🗣": Megaphone, "💭": MessageCircle, "🗯": MessageCircle, "💯": Check, "‼": TriangleAlert, "⁉": CircleHelp, "❗": TriangleAlert, "❕": TriangleAlert,
  "❔": CircleHelp, "🔵": CircleDot, "🟡": CircleDot, "🟠": CircleDot, "🟤": CircleDot, "⚫": CircleDot, "⚪": CircleDot, "🔶": CircleDot, "🔷": CircleDot, "🔸": CircleDot,
  "🔹": CircleDot, "🔺": CircleDot, "🔻": CircleDot, "🟥": CircleDot, "🟧": CircleDot, "🟨": CircleDot, "🟦": CircleDot, "🟪": CircleDot, "🟫": CircleDot, "⬛": CircleDot, "⬜": CircleDot,
  "💛": Heart, "💙": Heart, "💜": Heart, "🧡": Heart, "🖤": Heart, "🤍": Heart, "🤎": Heart, "💖": Heart, "💕": Heart, "💗": Heart, "💓": Heart, "💔": Heart,
  "😊": Smile, "😃": Laugh, "😄": Laugh, "😁": Laugh, "😆": Laugh, "😅": Laugh, "🤣": Laugh, "😂": Laugh, "😉": Smile, "😍": Heart, "🥰": Heart, "😎": Glasses,
  "🤔": CircleHelp, "😐": Meh, "😑": Meh, "😶": Meh, "🙁": Frown, "☹": Frown, "😞": Frown, "😟": Frown, "😢": Frown, "😭": Frown, "😤": Frown, "😠": Frown, "😡": Frown,
  "😱": TriangleAlert, "😨": TriangleAlert, "😰": TriangleAlert, "🥵": Thermometer, "🥶": Snowflake, "😴": Moon, "🤒": Thermometer, "🤧": Thermometer, "😷": Stethoscope,
  "🥳": PartyPopper, "🤯": Sparkle, "🙏": Hand, "✌": Hand, "🤙": Hand, "👌": Check, "🔜": Clock, "🔝": TrendingUp, "🆙": TrendingUp, "🆗": Check, "🆒": Sparkle,
  "📍 ": MapPin, "🔊": Music, "🔈": Music, "🔇": Music, "🎼": Music, "🎹": Music, "🥁": Music, "🎺": Music, "🎻": Music, "🪕": Music, "🎷": Music, "📽": Film,
  "🎥": Video, "📼": Video, "💿": Music, "📀": Music, "🕯": Flame, "🪔": Flame, "🏮": Lightbulb, "💡 ": Lightbulb, "🔭  ": Telescope, "🧬": Activity, "🦠": Bug,
  "🌡": Thermometer, "🛤": TrainFront, "🛣": Route, "🗾": Map, "🏗": HardHat, "🏛": Landmark, "🏞": Waves, "🏜": Sun, "🏔": MountainSnow, "⛰": Mountain,
};
// Typographic marks that some systems draw as colour emoji, kept as plain text.
const TEXT_MARK: Record<string, string> = { "♥": "♥", "♡": "♡", "★": "★", "☆": "☆", "✓": "✓", "✗": "✗", "✕": "✕", "✦": "✦", "↗": "↗", "➤": "›", "☰": "☰", "❚": "❚", "♀": "♀", "♂": "♂" };

const strip = (e: string) => e.replace(/[\uFE0E\uFE0F]/g, "").trim();
const lookup = (e: string): IconNode | undefined => BY_EMOJI[e.trim()] ?? BY_EMOJI[strip(e)] ?? BY_EMOJI[strip(e) + "\uFE0F"] ?? MORE[e.trim()] ?? MORE[strip(e)];

/** Terreno's own mark for anything without a better icon: a single tessera, a small square tile. */
export const TESSERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="SIZE" height="SIZE" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.75"/><rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" opacity=".55"/></svg>';

/** A country flag emoji as its two letters (pure): Terreno shows "FR", not a borrowed flag picture. */
export function flagCode(e: string): string | null {
  const cps = [...e].map((c) => c.codePointAt(0)!);
  if (cps.length === 2 && cps.every((c) => c >= 0x1f1e6 && c <= 0x1f1ff)) return String.fromCharCode(...cps.map((c) => c - 0x1f1e6 + 65));
  return null;
}

/** Characters a phone draws as a colour emoji (one emoji, a flag, or a joined sequence). */
export const EMOJI_RE = /(?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:\p{Extended_Pictographic}[\uFE0E\uFE0F]?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?)*)/gu;
/** Whether a character would show as an emoji picture rather than a text mark (pure). */
export function isEmoji(e: string): boolean {
  const s = strip(e);
  if (TEXT_MARK[s] !== undefined && !e.includes("\uFE0F")) return false;
  if (flagCode(e)) return true;
  return /\p{Emoji_Presentation}/u.test(s) || e.includes("\uFE0F") || /[\u{1F000}-\u{1FAFF}]/u.test(s);
}

/** Typographic marks used as a control's icon ("▶ Play", "◎ Hologram", a lone "▶"): their line icons. */
export const SYMBOL_ICON: Record<string, IconNode> = { "◎": Orbit, "♡": Heart, "♥": Heart, "▶": Play, "❚❚": Pause, "⑂": GitFork, "⌕": Search, "☰": Menu, "↺": Undo2, "⟲": Undo2, "✈": Plane, "⏱": Timer };
/** A leading symbol icon in a label, or a label that is only one (pure): "▶ Play" → ["▶", " Play"]. */
export function symbolLead(text: string): [string, string] | null {
  const t = text.replace(/^\s+/, "");
  for (const k of Object.keys(SYMBOL_ICON)) {
    if (t === k || t.startsWith(k + " ") || t.startsWith(k + "\u00a0")) return [k, t.slice(k.length)];
  }
  return null;
}

/** The line icon for a control's emoji, or null to keep the emoji (it's content). */
export const iconSvg = (emoji: string, size = 18): string | null => {
  const node = lookup(emoji);
  return node ? svgOf(node, size) : null;
};
/** Always an icon: the matching line icon, a flag's letters, or Terreno's tessera. */
export function anyIconHtml(emoji: string, size = 18): string {
  const svg = iconSvg(emoji, size);
  if (svg) return svg;
  const flag = flagCode(emoji.trim());
  if (flag) return `<span class="flag-code">${flag}</span>`;
  return TESSERA.replace(/SIZE/g, String(size));
}

/** A span holding the icon (or, for content emoji, the emoji itself). */
export function iconFor(emoji: string, size = 18, cls = "g"): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = cls;
  el.innerHTML = anyIconHtml(emoji, size);
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** "✈️ Fly" → [icon, " Fly"]: a label whose leading emoji becomes an icon. */
export function labelled(text: string, size = 16): (Node | string)[] {
  const m = /^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*|[〰〽♥⑂©]️?)\s*(.*)$/u.exec(text);
  if (!m || !iconSvg(m[1])) return [text];
  return [iconFor(m[1], size), m[2]];
}

/** A map pin for the globe: Terreno's icon for an emoji, in paper on a tile of the given colour, as a canvas. */
export function iconPin(emoji: string, color: string, size = 44): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size * 0.24, m = size * 0.08, w = size - 2 * m;
  g.beginPath(); g.roundRect(m, m, w, w, r); g.fillStyle = color; g.fill();
  g.lineWidth = size * 0.06; g.strokeStyle = "rgba(245,242,235,.95)"; g.stroke();
  const svg = anyIconHtml(emoji, Math.round(size * 0.52)).replace(/currentColor/g, "#f5f2eb");
  const html = svg.startsWith("<svg") ? svg : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><text x="50%" y="58%" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${size * 0.3}" fill="#f5f2eb">${flagCode(emoji.trim()) ?? ""}</text></svg>`;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => { const s = Math.round(size * 0.52); g.drawImage(img, (size - s) / 2, (size - s) / 2, s, s); resolve(c); };
    img.onerror = () => resolve(c);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(html);
  });
}
