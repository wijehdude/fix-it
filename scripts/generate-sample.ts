/**
 * Generates public/sample/sample-defects.xlsx — a synthetic, deterministic defect log for a
 * commercial building (≈300 rows across one sheet per legacy defect type).
 *
 * Deliberately messy: title rows, a blank row, a repeated header, a totals row, mixed date
 * formats per sheet, open records, duplicates, misfiled "Others" records and recurring issues.
 *
 *   npm run sample
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";

// ---------- deterministic PRNG ----------
let seed = 20250101;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

// ---------- time helpers (wall clock stored as UTC) ----------
const START = Date.UTC(2025, 0, 2);
const END = Date.UTC(2025, 5, 30);

function randomReportTime(): number {
  for (;;) {
    const day = Math.floor(between(0, (END - START) / 86_400_000));
    const base = START + day * 86_400_000;
    const dow = new Date(base).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    if (weekend && rand() < 0.6) continue;
    // Peaks at 08:00–11:00 and 13:00–17:00, occasional evening/night reports.
    const r = rand();
    const hour = r < 0.45 ? between(8, 11) : r < 0.85 ? between(13, 17.5) : r < 0.95 ? between(17.5, 23) : between(0, 7);
    return base + Math.floor(hour * 60) * 60_000;
  }
}

function toSerial(ms: number): number {
  return ms / 86_400_000 + 25569;
}
const pad = (n: number) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtSlash(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtMon(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}-${MON[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// ---------- vocabulary ----------
type Template = { text: string[]; locations: string[]; equipment?: string[]; action: string[]; weight?: number; respSlow?: number; tatSlow?: number };

const OFFICES = ["Level 5 Open Office", "L5 Open Office (Zone B)", "Level 6 Office Area", "L7 Finance Office", "Level 8 HR Office", "L3 Open Office"];
const MEETING = ["L3 Meeting Room 3-01", "Level 3 Meeting Rm 3-02", "L6 Conference Room", "L8 Training Room"];
const TOILETS = ["L4 Male Toilet", "Level 4 Male Toilet", "L2 Female Toilet", "L6 Male Toilet", "L7 Female Toilet", "B1 Accessible Toilet"];

const SHEETS: Record<string, Template[]> = {
  Aircon: [
    { text: ["Water dripping from FCU above meeting table", "FCU leaking water onto carpet", "Aircon dripping water, carpet wet", "water leak from aircon unit ceiling"], locations: ["L3 Meeting Room 3-01"], equipment: ["FCU-03-01"], action: ["Cleared choked condensate drain pipe", "Cleaned drain pan, monitoring", "Unchoked drain line"], weight: 3, tatSlow: 0.4 },
    { text: ["Aircon not cold", "Very warm, aircon not cooling", "Office too warm since morning", "Temperature too high, staff complaining"], locations: ["Level 5 Open Office", "L5 Open Office (Zone B)", "Level 5 open office"], equipment: ["AHU-05", "FCU-05-03"], action: ["Reset AHU, temperature restored", "Topped up refrigerant", "Adjusted thermostat setpoint"], weight: 4, tatSlow: 0.3 },
    { text: ["Aircon too cold", "Too cold in room, please adjust", "Freezing in conference room"], locations: [...MEETING, "L7 Finance Office"], action: ["Adjusted setpoint to 24C", "Thermostat recalibrated"], weight: 2 },
    { text: ["Noisy aircon vent", "Loud rattling noise from aircon", "Humming noise from FCU"], locations: OFFICES, equipment: ["FCU-06-02", "FCU-07-01"], action: ["Tightened loose panel", "Replaced fan bearing"], weight: 1.5 },
    { text: ["Smell from aircon vent", "Musty odour from air diffuser"], locations: [...OFFICES, ...MEETING], action: ["Cleaned filters and diffuser", "Replaced filter"], weight: 1 },
    { text: ["Server room aircon high temperature alarm", "CRAC unit tripped in server room, temp rising"], locations: ["L2 Server Room"], equipment: ["CRAC-02-A"], action: ["Reset CRAC unit, standby unit running", "Replaced faulty contactor"], weight: 1.2, tatSlow: 0.3 },
    { text: ["Thermostat display not working", "Thermostat panel blank"], locations: MEETING, action: ["Replaced thermostat battery"], weight: 0.8 },
  ],
  Lighting: [
    { text: ["Lights flickering at car park", "Flickering LED tubes near lots 20-30", "Car park lights blinking"], locations: ["B1 Car Park", "B1 Car Park Lot 20-30", "B1 car park lot 25"], action: ["Replaced LED driver", "Replaced 2 tubes"], weight: 3 },
    { text: ["Lamp not working", "Light not working", "Ceiling light spoilt", "LED panel no light"], locations: [...OFFICES, ...MEETING, "Level 2 Corridor"], action: ["Replaced LED panel", "Replaced lamp"], weight: 4 },
    { text: ["Exit sign not lit", "Emergency light faulty", "Emergency exit light not working"], locations: ["L1 Fire Exit Staircase A", "Level 6 staircase B", "L3 Fire Exit"], action: ["Replaced emergency light battery", "Replaced exit sign"], weight: 1.5, tatSlow: 0.3 },
    { text: ["Corridor very dark, several lights off", "Whole corridor lights off"], locations: ["Level 2 Corridor", "L4 Corridor"], action: ["Reset tripped MCB", "Replaced contactor"], weight: 1.2 },
    { text: ["Light switch spoilt", "Timer for lights not working, lights on overnight"], locations: [...MEETING, "L6 Pantry"], action: ["Replaced switch", "Reprogrammed timer"], weight: 1 },
  ],
  Cleaning: [
    { text: ["Pantry very dirty", "Pantry sink full of dirty cups, smell", "Pantry floor sticky"], locations: ["L6 Pantry", "Level 6 Pantry"], action: ["Cleaned pantry", "Informed cleaning supervisor"], weight: 3 },
    { text: ["Rubbish bin overflowing", "Bins not cleared", "Trash overflowing at lift lobby"], locations: ["L1 Lift Lobby", "Level 5 Pantry", "Loading Bay"], action: ["Cleared bins", "Increased bin clearance frequency"], weight: 2.5 },
    { text: ["Coffee spill on carpet", "Water spill on floor, slippery", "Stain on carpet"], locations: [...OFFICES, "Main Lobby"], action: ["Spot cleaned carpet", "Mopped floor, placed wet floor sign"], weight: 2 },
    { text: ["Dusty window ledge", "Floor not swept, litter"], locations: [...OFFICES, "Level 2 Corridor"], action: ["Cleaned"], weight: 1.5 },
    { text: ["Bad smell near loading bay", "Odour from refuse area"], locations: ["Loading Bay", "B1 Refuse Chamber"], action: ["Washed refuse area", "Deodorised"], weight: 1 },
  ],
  Toilet: [
    { text: ["Choked WC", "Toilet bowl choked", "WC choke, water overflowing", "toilet choked again"], locations: ["L4 Male Toilet", "Level 4 Male Toilet"], action: ["Rodded and cleared choke", "Cleared choke, found tissue build-up"], weight: 4, tatSlow: 0.25 },
    { text: ["Soap dispenser empty", "No soap", "Soap dispenser not working"], locations: ["L2 Female Toilet", "L7 Female Toilet"], action: ["Refilled soap", "Replaced dispenser"], weight: 3 },
    { text: ["Urinal flushing non-stop", "Urinal sensor faulty, no flush"], locations: ["L6 Male Toilet", "L4 Male Toilet"], action: ["Replaced flush sensor", "Adjusted flush valve"], weight: 2 },
    { text: ["Toilet dirty and smelly", "Wet floor in toilet, very dirty", "Toilet paper finished"], locations: TOILETS, action: ["Cleaned toilet", "Replenished toilet paper"], weight: 2.5 },
    { text: ["Tap leaking at basin", "Basin tap loose"], locations: TOILETS, action: ["Replaced tap cartridge"], weight: 1.2 },
  ],
  Security: [
    { text: ["Card reader not working at turnstile", "Turnstile card reader not reading cards", "Access card cannot tap at main entrance gantry"], locations: ["Main Entrance", "Main Entrance Turnstile 2"], equipment: ["CR-01-02"], action: ["Rebooted card reader", "Replaced card reader"], weight: 3, respSlow: 0.25 },
    { text: ["Server room door cannot lock", "Server room door access not locking, door left ajar", "Maglock at server room faulty"], locations: ["L2 Server Room"], equipment: ["ML-02-SR"], action: ["Realigned maglock", "Replaced maglock"], weight: 2, tatSlow: 0.4 },
    { text: ["CCTV camera offline", "CCTV no image at car park", "Camera at loading bay not recording"], locations: ["B1 Car Park", "Loading Bay", "Level 1 Security Command Centre"], equipment: ["CAM-B1-07", "CAM-LB-02"], action: ["Reset PoE switch", "Replaced camera"], weight: 2 },
    { text: ["Car park barrier stuck open", "Barrier arm not lifting"], locations: ["B1 Car Park", "B2 Car Park Lot 140"], action: ["Reset barrier controller"], weight: 1.2 },
    { text: ["Fire exit door alarm sounding", "Staircase door cannot close properly"], locations: ["L1 Fire Exit Staircase A", "L3 Fire Exit"], action: ["Adjusted door closer"], weight: 1 },
  ],
  Others: [
    // Misfiled records that belong to a specific category (to be reclassified).
    { text: ["Aircon leaking water", "water dripping from ceiling aircon grille"], locations: ["L3 Meeting Room 3-01", "L7 Finance Office"], action: ["Cleared condensate drain"], weight: 2 },
    { text: ["Light spoilt at corridor", "lights blinking"], locations: ["Level 2 Corridor", "B1 Car Park"], action: ["Replaced tube"], weight: 1.5 },
    { text: ["Toilet choked", "Male toilet urinal choked"], locations: ["L4 Male Toilet"], action: ["Cleared choke"], weight: 1.5 },
    { text: ["Door access card reader faulty", "Cannot exit, door release button faulty"], locations: ["Main Entrance", "L2 Server Room"], action: ["Replaced release button"], weight: 1.2 },
    { text: ["Pantry dirty, food waste left", "Spilled drinks at lobby"], locations: ["L6 Pantry", "Main Lobby"], action: ["Cleaned"], weight: 1 },
    // Genuine Others with sub-themes.
    { text: ["Lift 2 breakdown, passengers trapped briefly", "Lift door not closing properly", "Lift stuck at level 3", "Lift jerking when stopping"], locations: ["L1 Lift Lobby", "Lift Lobby A, Lift 2"], equipment: ["LIFT-02"], action: ["Lift contractor attended, reset controller", "Adjusted door sensor"], weight: 3, tatSlow: 0.5 },
    { text: ["Cockroach sighted in pantry", "Rats spotted near refuse area", "Ants in pantry cabinet"], locations: ["L6 Pantry", "Loading Bay", "Level 5 Pantry"], action: ["Pest control treatment done"], weight: 2, tatSlow: 0.6 },
    { text: ["Ceiling board stained and sagging", "Ceiling leak during heavy rain", "Water seepage from wall"], locations: ["Level 8 HR Office", "Roof Garden", "L9 Store"], action: ["Replaced ceiling board", "Sealed roof membrane"], weight: 2, tatSlow: 0.6 },
    { text: ["Office chair broken", "Table drawer cannot open", "Carpet torn, tripping hazard"], locations: OFFICES, action: ["Replaced chair", "Repaired drawer"], weight: 1.5 },
    { text: ["Wifi very slow", "Network port not working", "No internet at meeting room"], locations: [...MEETING, ...OFFICES], action: ["Referred to IT"], weight: 1.2 },
    { text: ["Signage missing at lift lobby", "Directional sign fallen"], locations: ["L1 Lift Lobby", "Main Lobby"], action: ["Reinstalled signage"], weight: 0.8 },
    { text: ["Pipe leaking at riser", "Water leak from pipe in ceiling", "Drain choked at loading bay"], locations: ["Level 6 riser", "B1 Electrical Switch Room", "Loading Bay"], action: ["Replaced pipe joint", "Cleared drain"], weight: 1.5, tatSlow: 0.5 },
    { text: ["Power socket sparking", "Power trip at office, no power to workstations"], locations: ["L7 Finance Office", "Level 6 Office Area"], action: ["Replaced socket", "Reset RCCB, found faulty kettle"], weight: 1 },
  ],
};

const COUNTS: Record<string, number> = { Aircon: 62, Lighting: 46, Cleaning: 38, Toilet: 46, Security: 36, Others: 66 };
const NAMES = ["Tan Wei Ming", "Siti Aminah", "Rajesh Kumar", "Lim Mei Ling", "John Lee", "Nur Hidayah", "Ahmad Faizal", "Grace Ong"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

const HEADERS = [
  "S/N",
  "Date/Time Reported",
  "Location",
  "Defect Description",
  "Equipment",
  "Reported By",
  "Response Date/Time",
  "Completion Date/Time",
  "Status",
  "Action Taken",
  "Priority",
];

type DateStyle = "serial" | "slash" | "mon";
const DATE_STYLE: Record<string, DateStyle> = {
  Aircon: "serial",
  Lighting: "slash",
  Cleaning: "serial",
  Toilet: "serial",
  Security: "mon",
  Others: "serial",
};

function weightedPick(templates: Template[]): Template {
  const total = templates.reduce((a, t) => a + (t.weight ?? 1), 0);
  let r = rand() * total;
  for (const t of templates) {
    r -= t.weight ?? 1;
    if (r <= 0) return t;
  }
  return templates[templates.length - 1];
}

function variant(text: string): string {
  const r = rand();
  if (r < 0.15) return text.toUpperCase();
  if (r < 0.3) return text.toLowerCase();
  if (r < 0.38) return `${text}. Pls attend asap`;
  if (r < 0.42) return `${text} - reported by tenant, call 9123 4567`;
  if (r < 0.46) return `  ${text}  `;
  return text;
}

function buildSheet(name: string): (string | number | null)[][] {
  const style = DATE_STYLE[name];
  const fmt = (ms: number | undefined): string | number | null => {
    if (ms === undefined) return null;
    if (style === "serial") return toSerial(ms);
    if (style === "slash") return fmtSlash(ms);
    return fmtMon(ms);
  };
  const rows: (string | number | null)[][] = [];
  const records: { reported: number; row: (string | number | null)[] }[] = [];
  for (let i = 0; i < COUNTS[name]; i++) {
    const t = weightedPick(SHEETS[name]);
    const reported = randomReportTime();
    const respSlow = rand() < (t.respSlow ?? 0.1);
    const respH = respSlow ? between(2.1, 6) : between(0.2, 1.9);
    const tatSlow = rand() < (t.tatSlow ?? 0.12);
    const tatH = Math.max(respH + 0.25, tatSlow ? between(4.2, 48) : between(respH + 0.3, 3.9));
    const open = rand() < 0.07;
    const responded = rand() < 0.04 ? undefined : reported + Math.round(respH * 60) * 60_000;
    const completed = open ? undefined : reported + Math.round(tatH * 60) * 60_000;
    const location = pick(t.locations);
    records.push({
      reported,
      row: [
        0,
        fmt(reported),
        rand() < 0.03 ? null : location,
        variant(pick(t.text)),
        t.equipment && rand() < 0.7 ? pick(t.equipment) : null,
        rand() < 0.1 ? `${pick(NAMES)} (x${Math.floor(between(1000, 9999))})` : pick(NAMES),
        fmt(responded),
        fmt(completed),
        open ? pick(["Open", "Pending", "In Progress"]) : pick(["Closed", "Completed", "closed"]),
        open ? null : pick(t.action),
        pick(PRIORITIES),
      ],
    });
  }
  records.sort((a, b) => a.reported - b.reported);
  // Exact duplicates: the same report logged twice within a few minutes.
  if (name === "Aircon" || name === "Toilet") {
    const src = records[10];
    const dup = [...src.row];
    const ms = src.reported + 4 * 60_000;
    dup[1] = fmt(ms);
    records.splice(11, 0, { reported: ms, row: dup });
  }
  records.forEach((r, i) => {
    r.row[0] = i + 1;
    rows.push(r.row);
  });
  return rows;
}

function main() {
  const wb = XLSX.utils.book_new();
  for (const name of Object.keys(SHEETS)) {
    const body = buildSheet(name);
    const aoa: (string | number | null)[][] = [];
    if (name === "Aircon" || name === "Others") {
      aoa.push([`${name.toUpperCase()} DEFECT LOG (JAN–JUN 2025)`]);
      aoa.push([]);
    }
    aoa.push(HEADERS);
    body.forEach((row, i) => {
      if (name === "Lighting" && i === 20) aoa.push([]);
      if (name === "Others" && i === 30) aoa.push(HEADERS);
      aoa.push(row);
    });
    if (name === "Cleaning") aoa.push([null, null, null, "TOTAL", null, null, null, null, `${body.length} cases`]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Apply a date number format to serial date columns.
    if (DATE_STYLE[name] === "serial") {
      const range = XLSX.utils.decode_range(ws["!ref"]!);
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (const c of [1, 6, 7]) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && typeof cell.v === "number" && cell.v > 1000) cell.z = "dd/mm/yyyy hh:mm";
        }
      }
    }
    ws["!cols"] = [6, 18, 26, 48, 12, 22, 18, 18, 12, 36, 10].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = path.join(process.cwd(), "public", "sample", "sample-defects.xlsx");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  XLSX.writeFile(wb, out);
  const total = Object.values(COUNTS).reduce((a, b) => a + b, 0) + 2;
  console.log(`Wrote ${out} (${total} records across ${Object.keys(SHEETS).length} sheets)`);
}

main();
