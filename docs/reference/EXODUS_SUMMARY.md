# EXODUS — Complete Project Summary

*Repository: `C:\Users\Chris\Documents\GitHub\Exodus` · Summary compiled 2026-09-04 from a full read of the source tree, documentation, configuration, and git history.*

---

## 1. What EXODUS is, in one paragraph

EXODUS is a browser-based **spaceship command-bridge simulator**. It renders the bridge of a fictional "Odyssey-class" starship called **EXODUS 01** as a dark, cyan-glowing sci-fi HUD with roughly 45 functional consoles: a bridge dashboard with radar and avionics, 15 ship-systems consoles (power, oxygen, shields, quantum computer, and so on), a crew department with a real SQLite database behind it, maintenance and cargo management, a rocket-launch mission-control sequence with a 3D scene, communications, logs, and an emergency-broadcast panel. Woven through all of it is **ARIA-7**, an AI ship's officer who speaks with a cloud-synthesized voice run through a "subspace radio" filter, appears as a 3D lip-synced avatar, watches for anomalies, narrates a self-driving "autopilot" tour of the ship, and stages random emergencies that the operator must resolve before she fixes them herself. The ship's live state is held on a small Node backend and streamed to every connected screen, so several browsers or wall displays show the same ship at the same time. The interface is fully translated into Romanian, English, and French. It was built as an educational and demonstrative showpiece for the AI Hub of Universitatea Creștină "Dimitrie Cantemir" (UCDC) in Romania.

---

## 2. At a glance

| Item | Value |
|---|---|
| Product name | EXODUS (in-fiction: EXODUS 01, Odyssey class); the package is `exodus-lite` |
| Type | Single-page web app + small API backend, containerized |
| Purpose | Educational and demonstrative "mission control" experience with a generative-AI voice officer |
| Author | Sorin Zgura (sorin.zgura@ucdc.ro / szgura@gmail.com) |
| Licensee | UCDC has a free, non-exclusive, non-transferable right to install, run, teach with, and publicly present the app; it may not sell or sublicense it |
| Lineage | A trimmed "lite" build derived from a larger project called `star-skipper-portal` / "A Patra Lume" ("The Fourth World"); 83 routes reduced to 46 |
| Frontend | React 19, TypeScript 5.8, TanStack Start + Router (file-based routes), Vite 7, Tailwind CSS 4, shadcn/ui, three.js, i18next |
| Backend | Node 22, Hono, `ws`, better-sqlite3 |
| Database | SQLite in WAL mode, 23 tables, Drizzle ORM schema, auto-created and auto-seeded on first start |
| AI services | Google Gemini (text-to-speech model `gemini-2.5-flash-preview-tts`, live audio model `gemini-2.0-flash-exp`, chat model `gemini-2.5-flash`), ElevenLabs TTS (`eleven_multilingual_v2`), optional Lovable AI gateway fallback |
| Languages | English, Romanian, French (type-enforced key parity, about 520 keys each) |
| Size | ~41,600 lines of frontend TypeScript, ~1,040 lines of backend TypeScript, 46 route files, ~90 components, 309 tracked files |
| Deployment target | Docker Compose; production is served behind Traefik at `iaa.spacescience.ro/nv/`; a "lite" compose stack runs isolated on ports 3001 and 8081 |
| Estimated re-creation cost (from project docs) | 184 person-days, roughly 60,000 to 90,000 EUR |

---

## 3. Origin, authorship, and lineage

**Where it came from.** The code carries clear fingerprints of its history. The Vite configuration imports `@lovable.dev/vite-tanstack-config` and the root page's social-preview image points at a `lovable.app` URL, so the project began on the Lovable AI app-builder platform. The user agent string used for external API calls is `LovableStarSkipper/1.0 (+https://star-skipper-portal.lovable.app)`, giving the original project name: **Star Skipper Portal**. The Docker files and the show-director code refer to the immersive experience as **"A Patra Lume"** (Romanian for "The Fourth World"), a ten-minute scripted show with five wall screens, lighting cues, a Unitree humanoid "captain," and a VR capsule. That show is what the full version was built to run at the UCDC HUB.

**The lite cut.** The README-LITE explains that this repository is the "operational core" produced by copying the full project and deleting about 30 external space-data observatories (CelesTrak, Copernicus, Gaia, ESA missions, Mars, DISCOS, Earth-live, launches, hangar, star map, tactical, scan, warp, dock, astronauts) and the entire show pipeline (storyboards, portholes, mission player, 3D cockpit). The route count went from 83 to 46. Heavy assets were dropped as well: 3.8 GB of media and 142 MB of 3D models. What remains is the complete bridge, the ship systems, the crew and maintenance departments, mission launch, and the entire ARIA subsystem. Many library files from the full version were left in place (see section 15), so the codebase is larger than what the UI actually uses.

**Deployment history.** The production compose file publishes the frontend at `https://iaa.spacescience.ro/nv/` and the API at `/nv/api` through Traefik with Let's Encrypt certificates, on an external Docker network named `iaa_default`. Comments in the scripts say that instance occupies ports 3000 and 8080 on the author's laptop, so the lite stack was moved to 3001 and 8081 to coexist.

**Git history.** Four commits, all between 2 and 3 July 2026: an initial squashed drop of 303 files and 58,406 lines; a documentation commit adding README, LICENSE, and three Romanian documents; a README edit removing a "no right to sell" clause; and a LICENSE contact-email change. Three of the four commits list Claude as co-author.

**Documentation shipped in the repo (all in Romanian):**
- `docs/DOCUMENTATIE-TEHNICA.md`: technical documentation (architecture, modules, API, schema, ARIA, i18n, deployment, metrics).
- `docs/CAIET-DE-SARCINI-RASPUNS.md`: the project described as a response to a tender specification (requirements and how each is met, deliverables, operating environment, acceptance criteria).
- `docs/EVALUARE-COSTURI.md`: a bottom-up cost estimate, 184 person-days across six work packages.
- `README.md` and `README-LITE.md`: quick start, port notes, what was removed.

---

## 4. The fiction: setting and world

Everything in the interface is written in-character. The consistent world the app presents:

- **The ship:** EXODUS 01, Odyssey class, mission "EXPLORATION". The header shows a crew count of 7 and a ship clock whose date is always in the year **2247**. Log entries and cargo ledgers are dated April 2247.
- **The location:** the Alpha Centauri system, sector AC-12, heading for **AC-12 Station** 12.4 AU away, time to destination 02:17:34, cruising at 0.78 c. The radar shows Alpha Centauri A and B, Proxima Centauri, and a habitable-zone marker.
- **The crew:** Captain A. Marcus (Geneva, Lunar Naval Academy), Chief Engineer L. Park (Seoul, MIT), Navigation Officer T. Koval (Kyiv), Chief Medical Officer E. Rios (Buenos Aires, Johns Hopkins), plus two synthetics: **ARIA-7**, the AI flight copilot from "Helios AI Foundry" running a "UnifoLM-7 base, 1.2T parameter flight specialization," and **ATLAS-3**, a Unitree H2 humanoid EVA technician. Other officers appear in mock data: J. Nakamura, S. Volkov, M. Okonkwo, R. Chen, and Dr. Lane.
- **Other synthetics named in the text:** VESTA, ORION-8, SENTRY-14, MULE-11, ECHO.
- **Radio callsign:** UCDC-01. Channels: FLEET-01 (Fleet Command), AC-12 Station, PROXIMA relay, EARTH Sol Hub, and the EMERG band.
- **The robots:** a fleet of seven real-world Unitree humanoids (H2, H2 EDU, R1 AIR, R1, G1, G1 EDU, G1 EDU with Dex3-1 hand) with their actual published specifications and prices.
- **Ship systems:** propulsion, power, antimatter containment, antigravity, oxygen, potable water, food stores, shields, communications, sensors, weapons, and four "quantum" systems (quantum computer, quantum sensors, quantum comms, quantum teleport/QKD).

---

## 5. What a user experiences

1. **Entry.** The root page `/` is a console selector: five tiles (NAVIGATION, POWER, LIVE, COMMS, SECURITY) plus a "GO TO BRIDGE" link and a language switcher. Choosing a tile jumps straight to that console.
2. **The shell.** Every console renders inside `ShipShell`: a top header with the ship name and class, crew count, a live UTC clock, the language switcher, a sound toggle, a "SYSTEM STATUS: NOMINAL" indicator, the **ARIA status pill**, and quick icons for Comms, Logs, and Settings; a bottom navigation bar with Dashboard, Navigation, Launch, Systems, Telemetry, Crew, Cargo, Cargo Ctrl, Maintenance, Logs. Each page has its own ambient soundscape and UI click sounds.
3. **The first click arms audio.** Browser autoplay rules mean the sound system waits for a pointer or key event, then unlocks.
4. **The bridge.** The dashboard shows the live systems list, a warning card, an interactive radar, the Bridge Council vote, avionics instruments, the AI copilot panel, live telemetry sparklines, a live feed of European Southern Observatory images, and a bottom row with control-mode selector, quick actions, thrust control, and a red emergency button.
5. **ARIA comes alive.** On critical events she speaks through the radio filter. When her 3D avatar is loaded, it beams in with a transporter effect and lip-syncs to her words. Left idle for 90 seconds, she offers a context-aware suggestion in her insight feed.
6. **Autopilot.** Pressing "ENGAGE AUTOPILOT" hands the conn to ARIA. A ghost cursor appears, she navigates page to page (briefing, navigation, comms, launch, power, telemetry, crew, medbay, cargo, maintenance), narrates each station, clicks real buttons, arms and launches the rocket, and ends with a spoken flight report built from live instrument readings.
7. **Emergencies.** With "RANDOM PERTURBATIONS" switched on, the Incident Director degrades a random system every one to two minutes, ARIA announces it with a recommended action, and a countdown card gives the operator 25 to 40 seconds to click "APPLY RECOMMENDATION" before ARIA applies the fix herself in three visible steps. A second, independent "perturbation feed" narrates hull breaches, fires, epidemics, and other drills at a configurable interval.
8. **Multi-screen.** Any panel's menu offers EXPAND, OPEN IN NEW TAB, and OPEN AS HUD. The HUD mode strips the chrome and background so the panel floats over the desktop as a transparent bright-cyan overlay. The ARIA avatar can be popped out to its own window or embedded transparently in a video wall, and it mirrors every utterance over a BroadcastChannel.
9. **Hardware.** A gamepad, HOTAS stick, or the Thrustmaster TCA Airbus sidestick and throttle quadrant can fly the ship: the stick drives heading, pitch, and roll on the avionics displays, the throttle sets thrust, and buttons trigger warp, docking, red alert, waypoint editing, and radar zoom.

---

## 6. Functional modules in depth

### 6.1 Console selector (`/`)
Five cards with i18n titles and subtitles ("TRAJECTORY · STAR MAP · RADAR", "REACTOR · LOAD · DISTRIBUTION", "EARTH FEED · ORBITAL CAMS", "SUBSPACE · CHANNELS · ARIA", "TACTICAL · DEFENSE · ALERTS"), a link to the full dashboard, and an inline EN/RO/FR switcher. It lives outside the shell.

### 6.2 Bridge dashboard (`/dashboard`)
A 20/60/20 grid composed entirely of reusable widgets:

- **Systems panel:** 13 rows driven by the backend's live systems slice. Each row has an icon, a 16-block level bar, a percentage, and a status pill; values at or below 70 percent turn amber and read STANDBY.
- **Systems overview:** a decorative four-line trend chart with a −10 min / −5 min / NOW axis.
- **Warning card:** shows the first live warning (the default seeded one is "SHIELD CAPACITOR LOW") and links to Systems.
- **Navigation radar:** an 800×500 SVG tactical plot with range rings, orbit ellipses, a trajectory curve, the three Alpha Centauri stars, the AC-12 Station destination card, a rotating sweep wedge, and the ship glyph with a blinking core. Toolbar: pan mode, center on ship, layer toggles (orbits, trajectory, labels), zoom in and out (0.5× to 3×), target lock, 2D/3D label toggle, and tabs for NAVIGATION, STAR MAP, TACTICAL, SCAN. The zoom and center buttons carry `data-autopilot-target` hooks so the autopilot can click them. Gamepad actions for target lock and zoom are wired in.
- **Bridge Council:** a go/no-go vote on "TRANS-LUNAR INJECTION BURN, MANEUVER 4A, T-00:04:12" by five officers. Tapping a human officer's portrait cycles GO → HOLD → ABORT. ARIA-7's vote can only change via "REQUEST ARIA-7 RE-ANALYSIS," which picks one of five canned analyses (for example "Trajectory Monte-Carlo: 9,840 / 10,000 trials nominal. Risk acceptable." at 95 percent confidence), speaks it, and pushes it into her insight feed. Any ABORT yields an ABORTED verdict, any HOLD yields ON HOLD, otherwise PROCEED.
- **Avionics instruments:** an Airbus-style Navigation Display (heading tape, range rings, five named waypoints MCT01, ARGON, VEGA-7, ORION, DRACO, a traffic blip, VOR readouts) and a transparent Primary Flight Display (speed tape, attitude with roll scale and pitch ladder at 4 px per degree, altitude tape, vertical-speed bar). The whole panel is re-tinted green. Waypoints can be cycled with the gamepad hat switch.
- **Shuttle-style HSI:** a compass rose with 72 ticks, cardinal labels, a fixed course needle at 285°, and a KEAS readout.
- **Surface position indicator:** elevon, aileron, body-flap, rudder, and speedbrake gauges derived from stick position and throttle, with an idle oscillator so they "breathe" when no controller is attached.
- **AI Copilot panel:** a NOMINAL / ADVISORY / WARNING status selector (each spoken), the autopilot engage toggle, a "ROUTE OPTIMIZED, fuel saving 12.7%" card, four prediction rows, and three scripted "recommended actions" (ADJUST TRAJECTORY, SCAN ANOMALY AHEAD, PREPARE FOR WARP) that run multi-step narrated sequences with an animated progress bar.
- **Live telemetry widget:** six critical metrics (antimatter flow, oxygen, food, shields, engine temperature, comms latency) as sparklines over a 1, 5, or 15 minute window, turning red when a threshold is crossed.
- **Data2Dome widget:** a live feed of the European Southern Observatory's public RSS (images, news, announcements, videos), refreshed every five minutes, with a detail modal and an "OPEN ON ESO.ORG" link. This is the one genuinely live scientific data source still rendered in the lite build.
- **Control mode:** MANUAL, ASSISTED, AUTOMATIC (the last engages the autopilot), plus the **RANDOM PERTURBATIONS** switch that arms the Incident Director.
- **Quick actions:** WARP, SCAN, DOCK, COMM, SOS buttons, each spoken on the FLEET-01 channel (SOS on the EMERG band with degraded signal).
- **Thrust control:** ± buttons in steps of five, writing the value to the backend so every connected screen sees it; also fed by throttle-axis hardware with a 2 percent deadband.
- **Emergency button:** a pulsing red hazard-striped link to the emergency page.

### 6.3 Navigation (`/navigation`)
A large panel with tabs (STAR MAP, ROUTE, WAYPOINTS, HISTORY, where HISTORY jumps to Logs), a 2D/3D toggle switching between the SVG radar and a 520 px three.js scene (fogged grid floor, reference rings, a cone-shaped ship with engine glow, a tube trajectory through three octahedron waypoints to a red destination sphere, a 400-point starfield, and a slowly orbiting scripted camera). Actions: CLEAR ROUTE, ADD WAYPOINT (appends WP-nn with a random distance), AUTO ROUTE (restores the optimal plan and speaks "AI route computed"). Waypoints can be reordered by HTML5 drag and drop, each change spoken by the system voice. A ROUTE INFO panel lists origin, destination, 12.4 AU, 02:17:34, fuel required 2.34 t, fuel remaining 18.7 t (82 percent).

### 6.4 Ship systems (`/systems` and 15 consoles)
A sidebar lists the consoles; the content area stacks an **Anomaly Detector** scoped to the active console above the console itself. Every console uses the same `SystemLayout` chassis: a 16:9 stage with a hand-drawn SVG schematic, three headline stats, a primary percentage with a progress bar, a status pill, and a right-hand modules panel with ONLINE/STANDBY/ARMED/SECURED rows and resource bars.

| Console | Primary stat | Notable content |
|---|---|---|
| Propulsion | Core efficiency 93% | Hull wireframe with core and exhaust; fuel tanks hydrogen, deuterium, helium-3, antimatter (flagged contained) |
| Power | Reactor output 78% | Procedurally drawn reactor hub with six spokes; distribution in MW (shields draw 120 MW) |
| Antimatter | Containment field 96%, status WARNING | Red-glow core with crossed ellipses; ejection system ARMED; all three reserves flagged contained |
| Antigravity | Field stability 99% | Nested field ellipses; modules are decks 1 through 5 |
| Oxygen | O2 level 97% | Generator and scrubber flow diagram; 21.3 kPa partial pressure, 520 ppm CO2 |
| Potable water | Tank level 78% | Recycler and tank with liquid fills; 12,000 L capacity, 94% recycle rate |
| Food stores | Stores level 64%, status STANDBY | A 5×8 provision-rack grid; 84 days remaining, 2,840 kcal per day |
| Shields | Integrity 94% | Shield bubble around the hull; per-quadrant integrity |
| Communications | Signal integrity 88% | Dish with wavefronts; 12.4 Tb/s, 2.4 light-year range |
| Sensors | Sensor integrity 97% | Range rings with an active scan wedge and three contacts, one hostile-red |
| Weapons | Systems ready 88%, status STANDBY | Lasers ARMED, turrets STANDBY, missile bay SECURED |
| Quantum computer | Quantum volume 87% | Bloch-sphere rig with 12 qubits; 1,024 qubits, T2 412 µs, gate fidelity 99.84%; running jobs Grover pathfinding, VQE denoise, QKD renewal |
| Quantum sensors | Detection sensitivity 96% | Four-node entangled interferometer; **live "massive dataset feed"** counting real objects from the ATNF pulsar catalog, the Milliquas quasar catalog, the NASA Exoplanet Archive, and the Abell cluster catalog via TAP/ADQL queries |
| Quantum comms | Entanglement link 92% | Star topology to FLEET-01, FLEET-02, PROXIMA, EARTH relays |
| Quantum teleport / QKD | Teleport fidelity 95% | Alice/Bob teleportation diagram; BB84 online, E91 armed, post-quantum backup on standby |

The **Anomaly Detector** is an ARIA feature: a SCAN button flashes her into PROCESSING, waits 600 ms, then surfaces one or two findings from a pool keyed to the console (for example "Thrust vector drift exceeds tolerance, TVC-3 gimbal, 0.42° over 90 s, above the 0.25° abort line, switch to redundant chain B, confidence 88 to 95 percent"). The top finding is spoken and pushed into the insight feed. Findings can be filtered by severity and acknowledged.

### 6.5 Telemetry (`/telemetry`)
Eighteen sensor channels in four groups (propulsion and power, life support, defense and sensors, hull and structure), each a client-side random walk with realistic bounds, noise, optional drift (water and food slowly deplete), a dashed threshold line, a trend glyph, and a range selector of 1 minute, 5 minutes, 15 minutes, or 1 hour at 60 samples. The range buttons carry autopilot targets.

### 6.6 Crew (`/crew` and eight sub-consoles)
This is the department with a real database behind it. A generic CRUD toolkit (`useCrud`, `CrudDialog`, `CrudToolbar`) talks to four TanStack server functions (`dbList`, `dbInsert`, `dbUpdate`, `dbDelete`) that are whitelisted to the 23 schema tables and validated column names.

- **Overview:** a hand-drawn SVG donut of 32 crew across eight departments (COMMAND, PILOTING, ENGINEERING, SCIENCE, MEDICAL, SECURITY, AI AGENTS, HUMANOIDS), duty counts, and the six key-personnel portraits. Static.
- **Assignments:** the duty roster from `crew_members`, watch schedule (ALPHA 00:00 to 08:00 led by Marcus, BRAVO by Park, CHARLIE by Koval), full add/edit/delete with a 17-field form including biography, education, a 3D avatar file upload (.glb/.gltf/.fbx), and a per-crew Gemini voice selector over all 30 Gemini prebuilt voices. Clicking a portrait opens the **CV dialog**, which reads the officer's curriculum vitae aloud in a distinctive voice (Marcus in Charon, Park in Leda, Koval in Orus, Rios in Aoede) and animates their personal 3D avatar if one is uploaded. Generated audio is cached permanently on disk.
- **Health:** medbay averages for heart rate, oxygen saturation, and fatigue computed from the crew table; a vitals table with fatigue bars; untracked crew can be enrolled.
- **Training:** programs with instructor, enrolment, progress, and due date; certifications with issued counts. Both tables are empty until the user adds rows.
- **Simulations:** a "synthetic rehearsal runner" with five scenarios (EVA hull breach response, reactor coolant loop failure, first-contact comms handshake, medbay mass-casualty triage, perimeter intrusion response), each with participating units, difficulty, expected resource baselines, and six narrated steps. Running one animates a progress bar in real time, then produces jittered actual results compared against expectations in six metrics, with a run history and an auto-demo loop at 2.5× speed.
- **Synthetics:** roster of AI agents and humanoids with load, power, heat, efficiency, tasks and errors per 24 hours, SLA expectations, and resource needs for the next 72 hours.
- **Humanoids:** the seven seeded Unitree robots with full spec cards (DOF, payload, battery, compute, joint torque, dexterous hand, warranty, price), filtering by series, and a 23-field editor. Each robot has **simulated live KPIs** (CPU, temperature, battery, latency, success rate, tasks, fails, uptime) that random-walk every 1.5 seconds and raise alerts on thresholds (temperature above 78 °C is CRITICAL, CPU above 92 percent is ERROR, battery below 12 percent is ERROR, latency above 180 ms is WARN).
- **Humanoid monitor:** fleet aggregates, per-robot sparkline cards, and an **incident log persisted to SQLite** (`robot_incidents`): every alert is written at most once per 20 seconds per robot and metric, can be acknowledged or deleted, and the whole log can be cleared.
- **Recruitment:** open positions by department and priority, and an applicant pipeline with stages SCREENING, INTERVIEW, BACKGROUND, OFFER and scores.

### 6.7 Maintenance (`/maintenance` and five sub-consoles)
- **Diagnostics index:** a wireframe ship schematic with pulsing fault dots, seven system statuses (only SHIELDS in WARNING), and an active alert "SHIELD GENERATOR efficiency below optimal (64%)" with a START DIAGNOSTIC button.
- **Diagnostic:** a five-step scripted repair sequence (deep scan, signal analysis, frequency recalibration to 218.4 THz, integrity verification at 110 percent load, report generation) lasting 10.6 seconds with a live telemetry log console, abort capability, spoken start, completion ("efficiency restored to ninety-seven percent"), and abort messages via the browser's speech synthesis.
- **Repairs:** five work orders in the WO-2247 series with technician, priority, progress, and ETA, plus summary counts and crew utilization.
- **Schedule:** an "OCTOBER 2247" mini calendar with highlighted days and eight upcoming tasks (shield calibration, oxygen filter swap, reactor inspection, warp core overhaul, hull integrity scan, and so on).
- **Parts log:** eight spare-part SKUs with bin locations, stock versus minimum and maximum, two at CRITICAL, and recent in/out transactions.
- **Reports:** six generated reports with MTBF statistics per system, a GENERATE NEW REPORT button, and **real PDF export**. Each download builds a multi-page A4 PDF in the browser with jsPDF: dark themed, courier headers "EXODUS 01 · MAINTENANCE DIVISION", a metadata box, and one of seven detailed report templates (weekly health, incident root-cause analysis, quarterly review, technical calibration, hull inspection, monthly parts audit, daily shift report) with tables, callouts, and paginated footers.

### 6.8 Cargo (`/cargo`) and Cargo Control (`/cargo-control`)
- **Cargo:** four tabs. CARGO HOLD shows 674 of 1,200 tonnes deadweight used across machinery, electronics, food, medical, and raw materials with a glossary of "TDW". INVENTORY is a searchable, filterable manifest of ten SKUs with bay codes and statuses SECURED, STAGED, QUARANTINE. RESOURCES lists eight consumables with daily burn rates. TRADE LOG is a ledger of seven trades at Ceres Station, Europa Relay, Mars Dock 7, and Luna Gate with a net balance.
- **Cargo Control:** a departure-planning tool. A catalog of eight cargo types with unit volume and weight, availability (AVAILABLE, LIMITED, RESTRICTED), and priority (MISSION CRITICAL, RECOMMENDED, OPTIONAL). The operator sets quantities with steppers; the page computes volume against a 1,200 m³ limit and weight against an 850 t limit, checks that all four mission-critical items are loaded, and only then enables **REQUEST SECURITY CLEARANCE**. The clearance dialog asks for an officer ID, a clearance code, and an authorization checkbox citing "UCDC fleet regulations." The code is verified by a server function with a per-officer rate limit of five attempts per minute against an environment variable (default `UCDC-7741`). Every attempt, granted or denied, is written to a **security audit log** with masked codes.

### 6.9 Mission launch (`/mission/launch`)
A self-contained rocket launch simulator styled as Mission Control:
- A six-item pre-launch checklist (propulsion, GNC, power, range, comms, fuel), each toggled GO / NO-GO / PENDING; the vehicle can only be armed when everything is GO.
- A state machine IDLE → ARMED → COUNTDOWN → FLIGHT with HOLD and ABORT, starting at T−30 seconds, with a simulation speed slider from 0.25× to 8× and pause.
- Physics-flavored telemetry: acceleration, speed to a 28,000 km/h cap, altitude, and thrust with a MECO taper at T+162 s, kept as 120 frames for four sparkline metric cards.
- An eight-event ascent timeline (STARTUP, IGNITION, LIFTOFF, MAX-Q, MECO, STAGE SEP, SECO, ORBIT) drawn as a semicircular arc with a live position dot.
- **Spoken mission control** on the FLEET-01 channel: T−10 to T−1 countdown, "Liftoff. We have liftoff.", milestone callouts, altitude and velocity at 10, 50, and 100 km, plus arm, hold, resume, and abort phrases.
- A **three.js launch scene**: pad, flame trench, lattice tower that disappears once the rocket clears 4 km, a five-engine rocket with glowing reactor cores whose intensity follows thrust, an exhaust plume, and a starfield that fades in above 20 km. Five cameras (wide, tracking, main control room, reactor detail, onboard engine bay) plus an auto-director that cuts by phase and altitude and rotates cameras every 12 seconds during the long ascent.

### 6.10 Communications (`/comms`)
Five channels with signal strength and status, an inbox of four messages, and a transmit console with a 280-character composer, fifteen canned templates (SITREP, DOCKING REQUEST, MAYDAY with "souls on board: forty-eight," and so on), and a transcript. Sending a message calls a server function that prompts **Gemini 2.5 Flash** with one of five channel personas (Fleet Command Dispatch, AC-12 Station Ops, Proxima Relay Operator, Earth Sol Hub with an eight-minute lag, Emergency Band Control), instructs it to reply in the user's current interface language, and injects radio-static artifacts proportional to signal strength. The reply is played through the radio filter in the channel's voice. There is a per-channel rate limit of 12 transmissions per minute. An Anomaly Detector scoped to COMMS sits above the panels.

### 6.11 Logs (`/logs`)
Five log books (Event, Mission, System, Comm, Archive) with severity filters and counters, a detail card per book, and an **AI SUMMARY** button. The summary is produced by a deterministic rule-based synthesizer (volume and severity distribution, most severe event, source concentration) rather than a language model, presented as an "ARIA-7 BRIEF" with a confidence figure, spoken aloud, and pushed to her insight feed.

### 6.12 Emergency broadcast (`/emergency`)
Four protocols: MAYDAY, PAN-PAN, SÉCURITÉ, EVACUATION. A two-step arm-then-confirm flow with a five-second arming window. Broadcasting pushes an alert onto the global alert bus, which shows a toast and speaks the protocol phrase (the evacuation script is a full muster announcement directing sections to pods alpha through delta at specific frames). A banner shows "BROADCASTING on 121.5 MHz, 243 MHz, subspace" for six seconds. A static checklist and quick links complete the page.

### 6.13 Settings (`/settings`) and Controls (`/settings/controls`)
- **Settings:** HUD preferences (audio level, alerts, grid overlay, HUD color, sensor range; these are cosmetic and not persisted), a controller status card with gamepad detection and profile selection, the **ARIA avatar panel** (upload a .glb, test the avatar, clear it), the **Event Simulation** panel (perturbation feed on/off, interval slider 10 to 600 seconds with ±25 percent jitter, DRILL NOW and CRITICAL DRILL buttons), and the **Audio Systems** mixer (master, ambient, UI clicks, alerts, hover, and system-voice categories with volumes, a "critical ops only" switch, voice previews "SARAH" and "BRIAN," a UI sound preview row, and an ambient-preset preview list for every route).
- **Controls:** a live multi-controller view (axes bars and button grids per pad) and an **action binding editor** for 20 logical actions in eight groups (warp, navigation, dock, emergency, RCS, propulsion, PFD, surfaces). Rebinding listens for a button press or an axis moved through more than half its range on any connected pad and records the device by USB vendor and product ID so bindings stay attached to the right physical device.

### 6.14 ARIA stage (`/aria-stage`)
A chrome-free full-screen page showing only the ARIA avatar, intended for a second monitor or a signage embed. It receives every utterance from the main window over a BroadcastChannel, plays the audio, and lip-syncs. With `?transparent=1` or `?embed` it removes its background, auto-unlocks audio, and beams the avatar in and out per utterance so it can be composited onto a video wall.

---

## 7. ARIA-7, the AI officer

ARIA is the product's centerpiece and touches every module.

### 7.1 State model
A small publish/subscribe store holds her status (OBSERVING, PROCESSING, STANDBY, ALERT), her current task string, a ring buffer of the last eight insights (each with text, source, severity INFO / WATCH / CRITICAL, and timestamp), and a voice master switch persisted in local storage. Any component can push an insight; a CRITICAL insight also forces status to ALERT. Publishers include the Bridge Council, the Anomaly Detector, the log synthesizer, the idle check-in timer, the Incident Director, and the perturbation feed. The **status pill** in the header shows the status with a pulse, a task line that changes per route (for example "Plotting trajectory cross-checks" on Navigation, "Pre-flight risk model running" on Launch), and a popover with the recent insights and the voice toggle.

### 7.2 Voice: the text-to-speech pipeline
Speech requests go to the backend `POST /api/tts`, with a fallback to an equivalent TanStack server function if the backend is unreachable. The request names the text, a channel, an optional voice or provider and gender, a signal quality, and a voice profile.

- **Providers.** Google Gemini TTS is the default and returns PCM that the server wraps in a WAV header; ElevenLabs returns MP3. If Gemini fails (commonly the free-tier daily quota) and an ElevenLabs key exists, the backend fails over automatically so ARIA never goes silent. ARIA's own identity voice is Kore (female) or Charon (male) on Gemini and Rachel or Adam on ElevenLabs, selectable in local storage.
- **Channel voices.** FLEET-01 speaks in Charon (deep command), AC-12 in Puck, PROXIMA in Fenrir, EARTH in Aoede, EMERG in Orus, system announcements in Kore, alarms in Orus.
- **Caching.** Three layers: an in-memory map on the server (200 entries), a persistent on-disk cache keyed by SHA-256 of provider, voice, profile, signal, and text (so scripted lines cost API quota exactly once, ever, and survive container restarts), and a 60-entry memory cache in the server-function fallback. A global rate limiter allows 30 synth calls per minute.
- **The radio filter.** In the browser the decoded audio runs through Web Audio: high-pass at 500 Hz, band-pass at 1,800 Hz, low-pass at 3,200 Hz, a soft-clip waveshaper, a hiss layer of band-passed white noise, and a 60 Hz push-to-talk click before the voice starts. DEGRADED signal adds distortion and hiss; WEAK narrows the band further, raises the hiss, and slows browser-TTS speech. Ambient sound is ducked to a quarter while a voice plays.
- **Offline fallback.** A settings switch routes speech to the browser's built-in `speechSynthesis` instead of the cloud, with a heuristic that picks a local voice of the right gender and applies a per-voice pitch bias.
- **Two voices, two roles.** `useRadioTts` is ARIA and the radio channels; `useSystemVoice` is the ship computer, always browser speech synthesis, used for navigation confirmations, diagnostics, emergency alarms, and settings previews.

### 7.3 Voice arbitration
A single global "voice slot" prevents two utterances overlapping. Alerts outrank normal speech. Sequenced narrators (autopilot, incidents, perturbations) pass a preempt flag so the newest line always wins. A denied request degrades to a silent avatar mouth animation instead of audio.

### 7.4 Live two-way conversation
A complete Gemini Live client exists: it captures the microphone through an AudioWorklet that downsamples to 16 kHz PCM in 80 ms chunks, streams them over a WebSocket to the backend's `/api/live` proxy, which holds the API key and injects a system prompt ("You are ARIA-7, the conversational AI officer of the EXODUS 01 starship... Detect the language of the user and reply in the same language (English, Romanian, or French)"). Replies arrive as 24 kHz PCM, are resampled to the device rate, and played gaplessly; user barge-in flushes the queue. **The client hook is fully implemented but no UI component currently mounts it**, so the feature is dormant in this build.

### 7.5 The 3D avatar
Built on the `@met4citizen/talkinghead` library. An operator uploads a GLB (the repository ships one named `BiologV2.glb`, 13.6 MB, stored server-side so every browser gets the same file). The avatar renders on a transparent WebGL canvas in a draggable, resizable floating card that beams in and out with a Star Trek transporter effect (1.1 s materialize, 1.0 s dematerialize, synthesized energize sound). Lip-sync is viseme-based: audio duration is split across words proportionally to their character counts, then fed to the English or French lipsync processor (Romanian is routed through English as a phonetic approximation). The avatar stays mounted between utterances because creating a TalkingHead instance is expensive. The stage window and embed mode are described in section 6.14.

### 7.6 Ambient behaviors
- **Idle check-ins:** after 90 seconds without input, at most every three minutes, and only when the tab is visible, ARIA posts a route-aware suggestion, such as "PROXIMA relay packet loss has crept up. I can draft an alternate routing plan if it gets worse."
- **Critical announcements:** any CRITICAL insight is spoken as "Critical alert from {source}. {text}" unless the voice switch is off.
- **Bridge Council, Anomaly Detector, and log briefs:** described in section 6.

---

## 8. Simulation engines

### 8.1 Shared ship state over Server-Sent Events
The backend holds one in-memory ship state: flight (heading 270, pitch, roll, speed 240 kt, altitude 4,000, vertical speed, throttle), 13 system percentages, a thrust command, a warnings list, copilot predictions, and navigation. Any client can `POST` a partial deep-merge update; every client keeps an `EventSource` on `/api/ship/stream`, which polls at 10 Hz and only emits when the JSON changed. A 200 ms oscillator on the server drifts altitude and vertical speed sinusoidally and jitters oxygen by ±2 percent so an idle ship still looks alive. This is how multiple screens stay in lockstep.

### 8.2 Flight integrator
In the browser, a 60 Hz loop integrates gamepad input into heading (about 36° per second at full deflection), pitch (±12°), roll (±25°), and speed (60 to 460 knots from throttle). Local input wins while the stick is active and is pushed to the backend debounced at 200 ms; otherwise backend values win. Windows opened with `?solo=1` or `?hud=1` are passive viewers and skip the integrator.

### 8.3 Autopilot demo tour
The autopilot builds a "shift script" from a station pool tagged plan → launch → monitor → report, preferring stations not visited in the previous shift (tracked in session storage). Each station navigates to a route, speaks a line on the ARIA-7 channel, and fires scheduled actions against `data-autopilot-target` elements: it clicks radar zoom twice and recenters, tunes FLEET-01 and EARTH comm channels, hovers and clicks ARM then LAUNCH on the mission page, hovers WARP and DOCK quick actions, and cycles telemetry ranges. A ghost reticle animates to each target and pulses on click. The tour ends with a **flight report composed from live instruments**: "Flight report. Heading 270 degrees. Speed 240 knots. Altitude 4000 feet. Pitch 0, roll 0, level flight. Shift complete, captain." A top banner shows the current step and progress with a DISENGAGE button. Stations whose routes were removed in the lite cut are filtered out.

### 8.4 Incident Director
When armed (persisted in local storage), it waits 15 to 40 seconds for the first incident and then 45 to 110 seconds between incidents. It picks one of 12 perturbable systems (oxygen is excluded because the server oscillator would overwrite it), drops it by 20 to 60 points (CRITICAL below 40 percent, otherwise WATCH), writes the degraded value and a warning into the shared ship state so all screens see it, sets the copilot status to WARNING or ADVISORY, and speaks one of three announcement variants with a system-specific remedy (for example shields: "re-calibrating the emitters and shunting capacitor reserve to the forward arc"). A floating card counts down 25 to 40 seconds. If the operator clicks APPLY RECOMMENDATION, restoration is instant and ARIA acknowledges ("Good call."). If not, ARIA takes over and restores in three steps of 800 ms, narrating her intervention. Cross-tab safety: incident markers in the shared warnings prevent two tabs stacking failures, orphaned markers older than 90 seconds are reclaimed to seed defaults, and a `pagehide` beacon restores the system if the owning tab closes.

### 8.5 Perturbation feed
An independent drill generator with 13 categories (hull breach with evacuation to a numbered checkpoint, biohazard quarantine, fire, radiation, decompression, power fault, life support, reactor, coolant, comms, gravity, micrometeorite impact, security unrest), each with Romanian and English phrase pools and randomized compartment, zone, deck, and sector tokens. It fires every N seconds (default 45, ±25 percent jitter), speaks on ARIA-7 with preemption, and logs to her insight feed. Off by default.

### 8.6 Alert bus
A global `pushAlert` deduplicates by id within eight seconds and fans out to a single AlertCenter that picks the toast style by severity (info, ops, warning, critical, alarm) and speaks through the system voice.

### 8.7 Other simulations
Telemetry sparklines and robot KPIs are bounded random walks; the simulation runner jitters expected values per metric; the launch page uses simple polynomial curves; the maintenance diagnostic runs a timed script.

---

## 9. Input: gamepad and flight hardware

A polling loop on `requestAnimationFrame` reads every connected pad and dispatches through a typed action bus of 20 actions (warp factor up/down, engage, abort; target lock, zoom, add waypoint, clear route; docking clamps; red alert; RCS yaw and pitch axes; throttle slider and two engine levers; next/previous waypoint; rudder and speedbrake axes). Buttons fire on rising edge; axes apply a deadzone (default 0.1) and optional inversion. Five profiles ship: Generic Gamepad (Xbox/DualShock layout), WINCTRL Ursa Minor 32, Generic HOTAS, Thrustmaster TCA Airbus Sidestick, and Thrustmaster TCA Airbus Sidestick plus Throttle Quadrant. Profiles auto-detect from the pad id string and USB vendor:product codes (044f:0405 sidestick, 044f:0407 quadrant), and bindings can be pinned to a specific device so the quadrant's levers never drive the sidestick's axes. Bindings and the active profile persist in local storage. A collapsible debug overlay shows live axes, pressed buttons, and the last 12 actions fired. There is no vibration support.

---

## 10. Sound design

All sound is **synthesized in Web Audio at runtime**; there are no audio files. Five UI one-shots (click, hover, alert, success, warp whoosh), a transporter energize effect built from detuned sawtooths, a gated tremolo, and a filtered noise sweep, and 15 ambient beds (bridge, navigation, engineering, telemetry, crew, cargo, comms, emergency, settings, mission, and others) each made of two detuned low sines with a slow breathing LFO, a looping filtered noise layer, and optional jittered blips. Each route maps to a preset; the settings mixer controls six categories with per-category enable and volume, and ambient is ducked while voices speak. Hover sounds are off by default.

---

## 11. Multi-screen and HUD pop-out

Every panel registers itself in a runtime registry. Its menu offers EXPAND (a full-screen in-app modal), OPEN IN NEW TAB (`?solo=1#expand=<id>`, chrome stripped, original colors), and OPEN AS HUD (`?hud=1#expand=<id>` in a 720×480 popup with a transparent background, a brighter cyan palette, transparent panels, and dark text halos so the overlay is readable on top of any desktop). Combined with the SSE ship state, this lets an installation spread panels across many monitors that all reflect the same ship.

---

## 12. Internationalization

Three locales with about 520 keys each; Romanian and French are typed against the English tree so any missing key is a compile error. The default is English for server-render determinism, and the stored preference (`ucdc-lang`) is applied after hydration. Coverage is uneven: the shell, the whole crew module, the bridge HUD, the autopilot narration, and the incident phrases are translated, while systems consoles, maintenance, cargo, mission launch, logs, emergency, telemetry, and settings are hard-coded English. A few Romanian strings leak into the English UI (file-upload status in the CRUD dialog, the audio-unlock caption on the ARIA stage, the debug picker). The Gemini Live prompt and the comms reply prompt make the AI answer in the user's language; the perturbation feed generates Romanian or English text.

---

## 13. Architecture and technology

### 13.1 Frontend
React 19 with TanStack Start (server-side rendering plus server functions) and TanStack Router file-based routing with automatic code splitting per route. Tailwind CSS 4 with a custom design system in `styles.css`: all colors in OKLCH, a deep-space radial background, a fixed 60 px grid overlay and a six-dot starfield behind everything, glassmorphic `.panel` cards with corner brackets, scan-line textures, glow utilities, and fonts Orbitron, Rajdhani, and JetBrains Mono. shadcn/ui provides 46 Radix-based primitives (of which the sidebar and chart wrappers are unused). Charts are hand-drawn SVG rather than a chart library. three.js is used directly, without react-three-fiber. State is a handful of tiny module-level publish/subscribe stores with React hooks; there is no Redux or Zustand.

### 13.2 Backend API (Hono on Node 22, default port 3000)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness plus flags for whether Gemini, ElevenLabs, and an offline TTS endpoint are configured |
| POST | `/api/tts` | Dual-provider text-to-speech proxy with memory and disk caches, rate limiting, and Gemini-to-ElevenLabs failover |
| WS | `/api/live` | Transparent WebSocket proxy to Gemini Live with the ARIA system prompt; only this path upgrades |
| GET / POST | `/api/ship/state` | Read or deep-merge the canonical ship state |
| GET | `/api/ship/stream` | SSE stream of the full state, 100 ms poll, deduplicated |
| GET / POST / GET stream | `/api/flight/state`, `/api/flight/stream` | Legacy flight-only slice |
| GET / POST / DELETE | `/api/avatar`, `/api/avatar/file` | Single-slot 3D avatar storage (GLB/GLTF/FBX, 200 MB max) with metadata |
| GET | `/api/db/health` | SQLite connectivity probe listing tables |
| GET / POST | `/api/aria/*` | Stubs reserved for a future persistent chat and insight store |

Design principle stated in the code: API keys never reach the browser; the backend is the swap-in point for a self-hosted TTS engine (Piper or Coqui) via `TTS_ENDPOINT`.

Note that the crew CRUD, the comms AI reply, the clearance check, the crew CV speech, the ESO feed, and the astronomical catalog queries do **not** go through this backend. They are TanStack Start server functions running inside the frontend's Node process, which is why the frontend container also receives the Gemini key and mounts the database file.

### 13.3 Database
SQLite with WAL and foreign keys, created idempotently at startup from DDL that mirrors the Drizzle schema, with a narrow column-migration helper and an if-empty seeder.

| Domain | Tables |
|---|---|
| Crew and HR | `crew_members`, `training_programs`, `training_certifications`, `recruitment_openings`, `recruitment_pipeline` |
| Robotics and AI | `humanoid_robots`, `robot_incidents` (cascade delete), `synthetics` |
| Missions | `launch_events`, `launch_checklist`, `mission_scenarios`, `mission_steps`, `mission_crew` |
| Legacy display and cache | `hangar_favorites`, `hangar_dock_slots`, `porthole_layout_groups`, `porthole_layouts`, `astronauts_cache`, `launchers_cache` |
| Legacy show | `storyboards`, `storyboard_avatars`, `storyboard_scenes`, `storyboard_cues` |

Conventions: UUID text primary keys, ISO timestamps with auto-update, JSON text columns for flexible payloads, indexes on foreign keys and time queries. Only `crew_members`, `humanoid_robots`, `launch_events`, and `launch_checklist` are seeded; the launch tables are seeded but the launch page uses its own inline timeline.

### 13.4 Data flow

```
Browser (React 19, TanStack Start, three.js, Web Audio, Gamepad API, i18next)
  |  HTTP /nv/api/*  (REST + SSE)            |  WS /nv/api/live (bidirectional audio)
  v                                          v
Hono backend (Node 22)  --- better-sqlite3 (WAL) --->  data.db (23 tables)
  |  /api/tts  -> Gemini TTS / ElevenLabs (+ memory + disk cache, rate limit)
  |  /api/live -> Gemini Live (key stays here)
  |  /api/ship -> in-memory ship state, SSE fan-out to every screen
  |  /api/avatar -> avatars/ directory
Frontend server functions (same Vite/Node process) -> Gemini 2.5 Flash (comms), Gemini TTS (crew CV),
  ESO RSS, VizieR TAP, NASA Exoplanet Archive TAP, SQLite CRUD
```

### 13.5 Deployment and operations
- **Docker Compose (production):** two single-stage `node:22-bookworm-slim` images running in dev mode (Vite dev server with hot reload and `tsx watch`) for fast live-show iteration. Bind mounts for source, `data.db`, and `avatars/`; a named volume for the TTS disk cache; health checks on both; the frontend waits for a healthy backend. Traefik labels route `iaa.spacescience.ro/nv` and `/nv/api` with TLS. A commented-out `aria-tts` service documents the offline TTS sidecar.
- **Docker Compose (lite):** project name `exodus-lite`, host ports 3001 and 8081, no Traefik, no external network, otherwise identical.
- **Scripts:** `start-lite.sh` exports `.env`, sets `DB_PATH`, `AVATAR_DIR`, `PORT=3001`, `VITE_BACKEND_URL`, starts both servers with logs in `.run/`; `stop-lite.sh` kills them. `start.sh` / `stop.sh` manage a frontend-only dev server.
- **Environment variables:** `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_MALE`, `ELEVENLABS_VOICE_ID_FEMALE`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `TTS_ENDPOINT`, `TTS_CACHE_DIR`, `DB_PATH` / `SQLITE_PATH`, `AVATAR_DIR`, `PORT`, `VITE_BACKEND_URL`, `CLEARANCE_CODE`, `LOVABLE_API_KEY`; orphaned modules also reference `NASA_FIRMS_MAP_KEY`, `NASA_ADS_TOKEN`, `APRS_FI_API_KEY`, `MARINETRAFFIC_API_KEY`.
- **Path prefix:** the app is built with `base: "/nv/"` and every API URL is derived from it, so it runs behind a reverse-proxy prefix; the Vite dev proxy rewrites `/nv/api` to `/api` for the backend and forwards WebSocket upgrades.
- **Alternative target:** a `wrangler.jsonc` remains for a Cloudflare Workers build.

---

## 14. External data connectors

The `src/utils` directory holds 57 modules, most of them TanStack server functions wrapping real scientific and spaceflight APIs. This is the clearest window into what the **full** product did. Only ten are imported by the lite UI.

**Live in the lite build:** ESO public RSS (dashboard Data2Dome widget); VizieR TAP at CDS Strasbourg and the NASA Exoplanet Archive TAP (quantum-sensors catalog counts: ATNF pulsars, Milliquas quasars, exoplanets, Abell clusters, plus SDSS DR16, OB associations, CHEOPS, and PLATO catalogs defined); Gemini 2.5 Flash (comms replies); Gemini TTS and ElevenLabs (voice); the generic SQLite CRUD; the clearance verifier; the model uploader; the jsPDF report generator; and a Launch Library 2 birthday lookup used by an autopilot station that is itself filtered out.

**Orphaned but present (47 modules):** Launch Library 2 astronauts, launchers, and launches; SpaceX API; Spaceflight News; CelesTrak TLE groups, ISS ground track and pass prediction with SGP4 via satellite.js, Iridium constellation, and the SATCAT (as a DISCOS proxy); ESA Gaia DR3 TAP; ESA Hubble and Webb image archives; NASA GIBS and Worldview tile and snapshot layers for Earth and Sentinel/Copernicus atmospheric products; NASA EPIC/DSCOVR; NASA EONET natural events; NASA FIRMS fires; NASA DONKI space weather and SOHO imagery; NOAA SWPC K-index, solar wind, alerts, and GOES X-rays; NOAA GOES, Himawari, and Meteosat imagery; USGS earthquakes; JPL Horizons and SBDB/CAD close approaches plus MPC NEOCP; Rosetta/67P ephemeris; GWOSC gravitational-wave events; Fermi GBM bursts; IceCube neutrino alerts; Event Horizon Telescope catalog; CERN Open Data; arXiv; NASA ADS; data.nasa.gov datasets; NASA Image and Video Library; Open-Meteo air quality; Global Forest Watch; OpenSky aircraft; MarineTraffic ships; APRS.fi radio stations; a NASA 3D-model hangar catalog procedurally expanded to 5,200 vehicles; a periodic table; a moon-phase calculator; Cosmographia planet and spacecraft trajectory data; and Gemini-powered astronaut tributes and Q&A. Two CLI scripts (`scripts/sync-space.ts`, `scripts/rebuild-mission-crew.ts`) synchronize the Launch Library astronaut and launcher registries into SQLite with content hashing and local media mirroring.

Everything on the ship-systems surface that looks like live telemetry (sparklines, navigation distances, emergency status, launch curves) is locally simulated.

---

## 15. Seed content shipped in the database

- **Six crew members** with roles, departments, stations, shifts, biometrics for the organics (heart rate, blood pressure, SpO2, fatigue), full biographies, origins, education, experience, and skills; portraits under `public/crew/`.
- **Seven Unitree robots** with real specifications: H2 ($29,900, 31 DOF, 70 kg, 3 h battery, Intel i5), H2 EDU (Jetson AGX Thor up to 2070 TOPS), R1 AIR ($4,900, 20 DOF, 27 kg), R1 ($5,900, 26 DOF), G1 ($13,500, 23 DOF, 35 kg), G1 EDU (23 to 43 DOF, optional Dex3-1 hand), and G1 EDU with Dex3-1 tactile hand (43 DOF, on STANDBY).
- **Nine launch events** from STARTUP at T−3600 to SPLASHDOWN at T+540 and **ten checklist items** across propulsion, avionics, life support, guidance, range, and crew.
- One uploaded **ARIA avatar** GLB (13.6 MB) with its metadata file.

---

## 16. Developer tooling and quality

- TypeScript strict mode throughout; ESLint 9 with react-hooks and react-refresh plugins; Prettier at 100 columns with double quotes.
- Vitest with happy-dom; exactly one test file, covering the HUD toast rule that only info and error toasts speak their description and that they route through FLEET-01.
- A custom **typecheck watcher** (`scripts/typecheck-watch.mjs`) runs `tsc --noEmit` every 8 seconds and writes `public/typecheck-status.json`; a dev-only banner on the cargo-control page polls it every 5 seconds and shows live type errors in the UI.
- A dev-only **DebugPicker** (floating bug button or Alt+D) lets you click any element and copies a Markdown block with its tag, CSS path, nearest React component, props, state, and data attributes to the clipboard, intended for pasting into an AI assistant.
- The README-LITE notes six pre-existing type errors in the TanStack serialization of two utility files that do not affect the build or runtime; the committed typecheck status file reports zero errors as of April 2026.

---

## 17. Known gaps, stubs, and leftovers (as found in the code)

- **Dormant features:** the Gemini Live conversation client has no UI consumer; the astronaut portrait modal and astronaut AI functions are unreachable; the `/api/aria/chat` and `/api/aria/insight` endpoints are explicit stubs.
- **Stale links:** the radar tabs and the copilot scan and warp missions still point at `/star-map`, `/tactical`, `/scan`, and `/warp`, which were removed; the autopilot pool filters these but the widgets do not.
- **Decorative controls:** the settings page's HUD color, sensor range, audio level, and SAVE CONFIGURATION only raise toasts; the logs FILTERS button, the comms inbox, and the maintenance schedule calendar are static.
- **Dead code:** the shadcn sidebar and chart wrappers (about 1,075 lines), the IndexedDB avatar store superseded by server storage, the YouTube IFrame loader and types, the 2D `LaunchVisualizer`, the show director, scene-object factory, porthole layout CRUD and geometry, unused `discos` and `mars` locale sections, and 47 of 57 utility modules.
- **Mismatches worth knowing:** the Shuttle ADI component defines an attitude ball and side tapes that are never rendered; the telemetry page's threshold check only flags upward breaches on amber-colored rows; the food-stores console calls `Math.random()` during render; the launch page ignores the seeded launch tables; the default clearance code `UCDC-7741` is in source; the Docker build copies the 13.6 MB avatar into the image.
- **Mixed language:** Romanian strings in the CRUD file uploader, model-upload errors, the ARIA stage unlock caption, and the debug picker.

---

## 18. Effort and cost (from `docs/EVALUARE-COSTURI.md`)

The author's bottom-up estimate for re-creating the lite build at Romanian market rates (about 320 EUR per day blended):

| Package | Person-days | EUR |
|---|---|---|
| A. Foundation and architecture | 26 | 8,320 |
| B. Bridge and ship systems | 49 | 15,680 |
| C. Crew, robotics, administration | 32 | 10,240 |
| D. ARIA AI subsystem | 39 | 15,600 |
| E. Missions | 5 | 1,600 |
| F. Data, i18n, quality | 33 | 9,760 |
| Development total | 184 | 61,200 |
| With 10 percent project management and 8 percent risk | | about 72,200 |

Realistic range 60,000 to 90,000 EUR. Monthly operation is estimated at 340 to 900 EUR including hosting, Gemini and ElevenLabs usage, and corrective maintenance; an offline TTS engine would remove the API costs for a one-time 2,000 to 2,800 EUR integration.

---

## 19. Quick start

```bash
cp .env.example .env        # add GEMINI_API_KEY and ElevenLabs keys
./start-lite.sh             # backend on 3001, frontend on 8081
# open http://localhost:8081/nv/
./stop-lite.sh
```

Or with Docker:

```bash
docker compose -f docker-compose.lite.yml up --build
```

Development:

```bash
npm install && (cd backend && npm install)
npm run dev                 # Vite frontend with /api proxy
cd backend && npm run dev   # Hono backend with tsx watch
npm run typecheck && npm run lint && npx vitest
```

---

## 20. Repository map

```
Exodus/
  backend/src/            Hono server: server.ts, state.ts, routes/{tts,live,ship,flight,avatar,db,aria}.ts
  src/routes/             46 file-based routes (dashboard, navigation, systems.*, crew.*, maintenance.*, cargo, mission.launch, comms, logs, emergency, settings, aria-stage)
  src/components/ship/    HUD widgets, avionics, radar, ARIA controllers, autopilot, incident and perturbation engines, alert center, panel system
  src/components/crew/    Generic CRUD toolkit, robot KPI simulator, CV dialog, crew avatar stage
  src/components/sound/   Sound provider, radio TTS, system voice, HUD toasts, route ambience
  src/components/gamepad/ Gamepad provider and binding store
  src/components/mission/ three.js launch scene
  src/components/ui/      46 shadcn/ui primitives
  src/lib/                Pub/sub stores (aria, shipState, flightState, autopilot, incidentDirector, perturbations), Gemini Live client, TalkingHead glue, audio synth, voice priority, stage broadcast
  src/utils/              57 server functions and data modules (10 used by the lite UI)
  src/db/                 Drizzle schema (23 tables), SQLite client with DDL and migrations, seed data
  src/i18n/               en, ro, fr locales
  scripts/                Launch Library sync, mission-crew rebuild, typecheck watcher
  docs/                   Romanian technical documentation, tender response, cost evaluation
  avatars/                Uploaded ARIA avatar GLB and metadata
  public/                 Crew portraits, PCM recorder AudioWorklet, typecheck status
  docker-compose.yml, docker-compose.lite.yml, Dockerfile, start-lite.sh, stop-lite.sh, vite.config.ts, wrangler.jsonc
```
