import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  ClipboardCheck,
  Coins,
  Droplets,
  FileCheck2,
  Filter,
  Gauge,
  Info,
  LayoutDashboard,
  Leaf,
  ListFilter,
  MapPin,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Recycle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Waves,
  X,
} from "lucide-react";

type Role = "Participant" | "Operator" | "Partner" | "Admin";
type Page = "Overview" | "Collections" | "Collection points" | "BlueBank" | "Impact" | "Admin";

type Collection = {
  id: string;
  material: string;
  weight: string;
  reward: number;
  date: string;
  point: string;
  status: "Verified" | "Pending" | "Rejected";
  icon: typeof Recycle;
  tone: string;
};

const initialCollections: Collection[] = [
  {
    id: "BL-240821",
    material: "PET bottles",
    weight: "4.2 kg",
    reward: 84,
    date: "Today, 09:42",
    point: "Eleko South Point",
    status: "Verified",
    icon: Recycle,
    tone: "blue",
  },
  {
    id: "BL-240816",
    material: "Aluminum",
    weight: "2.8 kg",
    reward: 70,
    date: "Aug 16, 14:18",
    point: "Eleko South Point",
    status: "Verified",
    icon: PackageCheck,
    tone: "teal",
  },
  {
    id: "BL-240809",
    material: "HDPE",
    weight: "6.4 kg",
    reward: 96,
    date: "Aug 09, 11:05",
    point: "Eleko Community Hub",
    status: "Verified",
    icon: Droplets,
    tone: "purple",
  },
  {
    id: "BL-240731",
    material: "Fishing plastics",
    weight: "3.1 kg",
    reward: 62,
    date: "Jul 31, 16:32",
    point: "Eleko South Point",
    status: "Pending",
    icon: Waves,
    tone: "amber",
  },
];

const materialOptions = [
  { label: "PET bottles", rate: 20, icon: Recycle, color: "blue" },
  { label: "HDPE", rate: 15, icon: Droplets, color: "purple" },
  { label: "Aluminum", rate: 25, icon: PackageCheck, color: "teal" },
  { label: "Fishing plastics", rate: 20, icon: Waves, color: "amber" },
];

const navItems: { label: Page; icon: typeof LayoutDashboard; roles?: Role[] }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Collections", icon: ClipboardCheck },
  { label: "Collection points", icon: MapPin },
  { label: "BlueBank", icon: Coins },
  { label: "Impact", icon: Leaf },
  { label: "Admin", icon: Settings2, roles: ["Admin"] },
];

const points = [
  {
    name: "Eleko South Point",
    area: "South beach access",
    hours: "Open until 18:00",
    status: "Open",
    materials: ["PET", "HDPE", "AL"],
    distance: "0.8 km",
    accent: "blue",
    coords: { left: "36%", top: "48%" },
  },
  {
    name: "Eleko Community Hub",
    area: "Community market",
    hours: "Open until 16:00",
    status: "Open",
    materials: ["PET", "HDPE"],
    distance: "1.7 km",
    accent: "teal",
    coords: { left: "62%", top: "32%" },
  },
  {
    name: "Lighthouse Station",
    area: "West shoreline",
    hours: "Opens tomorrow at 08:00",
    status: "Closed",
    materials: ["PET", "AL"],
    distance: "2.4 km",
    accent: "purple",
    coords: { left: "76%", top: "66%" },
  },
];

const roles: Role[] = ["Participant", "Operator", "Partner", "Admin"];

function App() {
  const [activePage, setActivePage] = useState<Page>("Overview");
  const [role, setRole] = useState<Role>("Participant");
  const [collections, setCollections] = useState(initialCollections);
  const [showCollection, setShowCollection] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [toast, setToast] = useState("");

  const balance = useMemo(
    () => collections.filter((item) => item.status === "Verified").reduce((sum, item) => sum + item.reward, 0) + 938,
    [collections],
  );

  const handleRole = (nextRole: Role) => {
    setRole(nextRole);
    if (nextRole === "Operator") setActivePage("Collections");
    else if (nextRole === "Partner") setActivePage("Impact");
    else if (nextRole === "Admin") setActivePage("Admin");
    else setActivePage("Overview");
    setShowMobileNav(false);
  };

  const addCollection = (collection: Collection) => {
    setCollections((current) => [collection, ...current]);
    setShowCollection(false);
    setToast("Collection verified — BlueBank balance updated");
    window.setTimeout(() => setToast(""), 3600);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${showMobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Waves size={20} strokeWidth={2.5} /></div>
          <div>
            <div className="brand-name">Blue<span>Loop</span></div>
            <div className="brand-caption">Coastal recovery network</div>
          </div>
          <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setShowMobileNav(false)}><X size={18} /></button>
        </div>

        <div className="pilot-switcher">
          <div className="pilot-icon"><MapPin size={15} /></div>
          <div className="pilot-copy">
            <span className="eyebrow">Active pilot</span>
            <strong>Eleko Beach, Lagos</strong>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-label">Workspace</div>
        <nav className="main-nav">
          {navItems.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
            const Icon = item.icon;
            const active = activePage === item.label;
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? "active" : ""}`}
                onClick={() => { setActivePage(item.label); setShowMobileNav(false); }}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
                <span>{item.label}</span>
                {item.label === "Collections" && role === "Operator" && <span className="nav-count">3</span>}
                {active && <span className="active-bar" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-lower">
          <div className="network-card">
            <div className="network-glow" />
            <div className="network-card-top">
              <span className="mini-label">NETWORK HEALTH</span>
              <span className="health-dot" />
            </div>
            <div className="network-value">Operational</div>
            <div className="network-meta"><span>All systems responding</span><span>99.9%</span></div>
            <div className="network-line"><span /></div>
          </div>
          <button className="help-link"><CircleHelp size={17} /><span>Help & field guide</span><ChevronRight size={15} /></button>
          <div className="profile-mini">
            <div className="avatar avatar-coral">AO</div>
            <div className="profile-copy"><strong>Amaka Okafor</strong><span>Participant ID · BL-0194</span></div>
            <MoreHorizontal size={17} className="muted-icon" />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setShowMobileNav(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>BlueLoop</span><ChevronRight size={13} /><strong>{activePage}</strong></div>
          <div className="topbar-actions">
            <div className="demo-badge"><span className="demo-dot" /> Demo workspace</div>
            <div className="role-select-wrap">
              <CircleUserRound size={17} />
              <select value={role} onChange={(event) => handleRole(event.target.value as Role)} aria-label="Preview role">
                {roles.map((option) => <option key={option}>{option}</option>)}
              </select>
              <ChevronDown size={14} className="select-arrow" />
            </div>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><span className="notification-dot" /></button>
            <div className="avatar avatar-coral avatar-top">AO</div>
          </div>
        </header>

        <div className="page-wrap">
          {activePage === "Overview" && <Overview role={role} balance={balance} collections={collections} onNewCollection={() => setShowCollection(true)} onPageChange={setActivePage} />}
          {activePage === "Collections" && <CollectionsPage role={role} collections={collections} onNewCollection={() => setShowCollection(true)} />}
          {activePage === "Collection points" && <CollectionPointsPage onNewCollection={() => setShowCollection(true)} />}
          {activePage === "BlueBank" && <BlueBankPage balance={balance} collections={collections} />}
          {activePage === "Impact" && <ImpactPage />}
          {activePage === "Admin" && <AdminPage />}
        </div>
      </main>

      {showCollection && <CollectionModal onClose={() => setShowCollection(false)} onSubmit={addCollection} />}
      {toast && <div className="toast"><div className="toast-icon"><Check size={16} /></div><span>{toast}</span><button onClick={() => setToast("")}><X size={14} /></button></div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow blue-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({ role, balance, collections, onNewCollection, onPageChange }: { role: Role; balance: number; collections: Collection[]; onNewCollection: () => void; onPageChange: (page: Page) => void }) {
  const totalWeight = 24.8 + (collections.length - initialCollections.length) * 2.6;
  return (
    <>
      <PageHeading
        eyebrow={`Friday, 28 August 2026 · ${role.toUpperCase()} VIEW`}
        title={role === "Participant" ? "Good morning, Amaka" : `${role} workspace`}
        description={role === "Participant" ? "Here’s the latest movement in your recovery journey." : "A focused view of the BlueLoop pilot network."}
        action={<button className="button button-primary" onClick={onNewCollection}><Plus size={17} /> Record a collection</button>}
      />

      <div className="headline-grid">
        <section className="balance-card">
          <div className="balance-pattern"><span /><span /><span /></div>
          <div className="balance-topline"><span className="card-kicker light-kicker"><Coins size={14} /> BLUEBANK BALANCE</span><button className="round-arrow"><ArrowUpRight size={16} /></button></div>
          <div className="balance-amount">{balance.toLocaleString()}<span> credits</span></div>
          <div className="balance-subtext"><span className="positive-pill"><ArrowUpRight size={12} /> 12.8%</span><span>vs. last month</span></div>
          <div className="balance-bottom"><div><span className="balance-label">This month</span><strong>+284 credits</strong></div><div><span className="balance-label">Next reward</span><strong>Open collection</strong></div><div className="balance-wave"><svg viewBox="0 0 180 42" role="img" aria-label="Balance trend"><path d="M0 34 C18 32 20 28 35 30 C51 32 56 19 72 23 C86 26 90 9 109 17 C126 25 134 12 146 12 C158 12 168 4 180 6" /></svg></div></div>
        </section>
        <section className="loop-card">
          <div className="section-heading compact-heading"><div><span className="card-kicker">THE RECOVERY LOOP</span><h2>From recovery to reuse</h2></div><span className="live-label"><span /> Live</span></div>
          <div className="loop-steps">
            {[
              { icon: Recycle, label: "Collect", caption: "Material recovered", done: true },
              { icon: ShieldCheck, label: "Verify", caption: "Operator confirms", done: true },
              { icon: Coins, label: "Reward", caption: "Credits issued", done: true },
              { icon: PackageCheck, label: "Recycle", caption: "Partner receives", done: false },
            ].map((step, index) => {
              const Icon = step.icon;
              return <div className="loop-step-wrap" key={step.label}><div className={`loop-step ${step.done ? "done" : ""}`}><div className="loop-icon"><Icon size={16} /></div><div><strong>{step.label}</strong><span>{step.caption}</span></div></div>{index < 3 && <div className={`loop-connector ${step.done ? "done" : ""}`} />}</div>;
            })}
          </div>
          <div className="loop-footer"><div className="tiny-progress"><span /></div><span>3 of 4 stages active</span><ChevronRight size={14} /></div>
        </section>
      </div>

      <div className="stats-grid">
        <StatCard icon={Recycle} label="Verified material" value={`${totalWeight.toFixed(1)} kg`} meta="+8.2% this month" tone="blue" trend="up" />
        <StatCard icon={ClipboardCheck} label="Collection runs" value="12" meta="4 this month" tone="purple" trend="up" />
        <StatCard icon={PackageCheck} label="Sent to recycling" value="18.4 kg" meta="74% of verified material" tone="teal" trend="up" />
        <StatCard icon={MapPin} label="Nearby points" value="3" meta="2 open right now" tone="amber" />
      </div>

      <div className="content-grid">
        <section className="panel activity-panel">
          <div className="section-heading"><div><span className="card-kicker">RECENT ACTIVITY</span><h2>Your recovery record</h2></div><button className="text-button" onClick={() => onPageChange("Collections")}>View all <ArrowUpRight size={15} /></button></div>
          <div className="activity-list">
            {collections.slice(0, 4).map((item) => <ActivityRow key={item.id} item={item} />)}
          </div>
          <div className="panel-footer"><Info size={15} /><span>Rewards are issued after an authorized operator verifies each collection.</span></div>
        </section>
        <MapPanel onViewPoints={() => onPageChange("Collection points")} />
      </div>

      <section className="points-strip">
        <div className="section-heading"><div><span className="card-kicker">COLLECTION NETWORK</span><h2>Find a nearby point</h2></div><button className="text-button" onClick={() => onPageChange("Collection points")}>Explore network <ArrowUpRight size={15} /></button></div>
        <div className="point-cards">
          {points.map((point) => <PointCard key={point.name} point={point} />)}
        </div>
      </section>
    </>
  );
}

function StatCard({ icon: Icon, label, value, meta, tone, trend }: { icon: typeof Recycle; label: string; value: string; meta: string; tone: string; trend?: "up" }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small className={trend ? "stat-positive" : ""}>{trend && <ArrowUpRight size={12} />}{meta}</small></div><MoreHorizontal size={17} className="stat-more" /></div>;
}

function ActivityRow({ item }: { item: Collection }) {
  const Icon = item.icon;
  return <div className="activity-row"><div className={`activity-icon ${item.tone}`}><Icon size={18} /></div><div className="activity-details"><strong>{item.material}</strong><span>{item.weight} · {item.point}</span></div><div className="activity-reward"><strong>+{item.reward}</strong><span>credits</span></div><div className={`status-badge ${item.status.toLowerCase()}`}><span />{item.status}</div><ChevronRight size={16} className="row-arrow" /></div>;
}

function MapPanel({ onViewPoints }: { onViewPoints: () => void }) {
  return <section className="panel map-panel"><div className="section-heading map-heading"><div><span className="card-kicker">FIELD ACTIVITY</span><h2>Eleko Beach network</h2></div><button className="map-filter"><Filter size={14} /> This month <ChevronDown size={13} /></button></div><div className="map-canvas"><div className="map-grid" /><div className="map-water-label">ATLANTIC OCEAN</div><div className="map-land"><span className="land-line land-line-one" /><span className="land-line land-line-two" /><span className="land-line land-line-three" /></div><div className="map-place place-eleko">Eleko Beach</div><div className="map-place place-market">Community market</div><div className="map-place place-west">West shoreline</div>{points.map((point) => <div className={`map-marker marker-${point.accent}`} key={point.name} style={point.coords}><span><MapPin size={14} /></span><div className="marker-tooltip">{point.name}</div></div>)}<div className="hotspot hotspot-one"><span /><i /></div><div className="hotspot hotspot-two"><span /><i /></div><div className="map-legend"><span><i className="legend-point blue" /> Collection point</span><span><i className="legend-point amber" /> Activity area</span></div></div><div className="map-footer"><div><strong>3 active collection points</strong><span>12 verified collection areas this month</span></div><button className="text-button" onClick={onViewPoints}>Open map <ArrowUpRight size={15} /></button></div></section>;
}

function PointCard({ point }: { point: typeof points[number] }) {
  return <div className="point-card"><div className="point-top"><div className={`point-icon ${point.accent}`}><MapPin size={17} /></div><div className={`open-status ${point.status === "Open" ? "open" : "closed"}`}><span />{point.status}</div></div><strong>{point.name}</strong><span className="point-area">{point.area}</span><div className="point-meta"><span><ClockIcon /> {point.hours}</span><span>{point.distance}</span></div><div className="material-tags">{point.materials.map((material) => <span key={material}>{material}</span>)}</div></div>;
}

function ClockIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>; }

function CollectionsPage({ role, collections, onNewCollection }: { role: Role; collections: Collection[]; onNewCollection: () => void }) {
  return <><PageHeading eyebrow={`${role.toUpperCase()} WORKSPACE · 12 TOTAL`} title="Collections" description={role === "Operator" ? "Verify incoming material and keep the recovery record moving." : "Every collection is recorded, verified, and connected to a reward."} action={<button className="button button-primary" onClick={onNewCollection}><Plus size={17} /> New collection</button>} /><div className="filter-row"><div className="search-box"><Search size={16} /><input placeholder="Search by transaction or material" /></div><button className="filter-button"><ListFilter size={15} /> All statuses <ChevronDown size={14} /></button><button className="filter-button date-filter">Aug 01 – Aug 28 <ChevronDown size={14} /></button></div><section className="panel collections-panel"><div className="table-head"><span>Transaction</span><span>Material</span><span>Point</span><span>Weight</span><span>Reward</span><span>Status</span></div>{collections.map((item) => <div className="collection-table-row" key={item.id}><div className="transaction-id"><div className={`activity-icon ${item.tone}`}><item.icon size={16} /></div><div><strong>{item.id}</strong><span>{item.date}</span></div></div><div className="material-cell">{item.material}</div><div className="point-cell"><MapPin size={14} /> {item.point}</div><strong>{item.weight}</strong><strong className="reward-cell">+{item.reward} <small>credits</small></strong><div className={`status-badge ${item.status.toLowerCase()}`}><span />{item.status}</div><MoreHorizontal size={18} className="muted-icon" /></div>)}</section><div className="mobile-collection-note"><Info size={15} /> Demo records are replaceable pilot data. Reward rates are configured by administrators.</div></>;
}

function CollectionPointsPage({ onNewCollection }: { onNewCollection: () => void }) {
  return <><PageHeading eyebrow="COLLECTION NETWORK · ELEKO BEACH" title="Collection points" description="Approved places where recovered material becomes a verified record." action={<button className="button button-primary" onClick={onNewCollection}><Plus size={17} /> Record collection</button>} /><div className="points-layout"><div className="points-list"><div className="list-toolbar"><strong>3 participating points</strong><button className="filter-button"><Filter size={15} /> Filter</button></div>{points.map((point) => <div className="point-list-card" key={point.name}><div className={`point-icon ${point.accent}`}><MapPin size={18} /></div><div className="point-list-copy"><div className="point-list-title"><strong>{point.name}</strong><div className={`open-status ${point.status === "Open" ? "open" : "closed"}`}><span />{point.status}</div></div><span>{point.area} · {point.distance} away</span><span className="hours-row"><ClockIcon /> {point.hours}</span><div className="material-tags">{point.materials.map((material) => <span key={material}>{material} accepted</span>)}</div></div><ChevronRight size={18} className="muted-icon" /></div>)}</div><div className="large-map-wrap"><MapPanel onViewPoints={() => undefined} /></div></div></>;
}

function BlueBankPage({ balance, collections }: { balance: number; collections: Collection[] }) {
  return <><PageHeading eyebrow="BLUEBANK · VERIFIED REWARDS" title="Your reward ledger" description="A transparent record of every credit earned through verified recovery." action={<button className="button button-secondary"><Info size={16} /> How rewards work</button>} /><div className="ledger-summary"><div className="ledger-balance"><div className="ledger-orbit"><Coins size={22} /></div><div><span>Available balance</span><strong>{balance.toLocaleString()} <small>credits</small></strong><p><ArrowUpRight size={13} /> 12.8% from last month</p></div></div><div className="ledger-stat"><span>Total earned</span><strong>1,284</strong><small>Since joining BlueLoop</small></div><div className="ledger-stat"><span>Pending</span><strong>62</strong><small>1 collection awaiting review</small></div><div className="ledger-stat"><span>Reward rate</span><strong>20 <small>/ kg</small></strong><small>PET bottles · active rule</small></div></div><div className="bank-grid"><section className="panel ledger-panel"><div className="section-heading"><div><span className="card-kicker">TRANSACTION LEDGER</span><h2>Credit activity</h2></div><button className="filter-button"><Filter size={14} /> Filter <ChevronDown size={14} /></button></div><div className="ledger-list">{collections.map((item) => <div className="ledger-row" key={item.id}><div className={`ledger-icon ${item.tone}`}>{item.reward > 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}</div><div><strong>{item.material} verified</strong><span>{item.id} · {item.date}</span></div><strong className="ledger-credit">+{item.reward}</strong><div className={`status-badge ${item.status.toLowerCase()}`}><span />{item.status}</div></div>)}</div></section><section className="panel rule-panel"><div className="section-heading"><div><span className="card-kicker">CURRENT RULE</span><h2>How PET rewards work</h2></div><div className="rule-tag">Active</div></div><div className="rule-visual"><div className="rule-circle"><Recycle size={22} /><span>PET</span></div><div className="rule-equals">×</div><div className="rule-number">20<span>credits / kg</span></div></div><div className="rule-copy"><p>Your reward is calculated from the verified weight and the active material rate. Rates are managed by BlueLoop administrators.</p><div className="rule-note"><ShieldCheck size={15} /><span>Rewards are only issued after operator verification.</span></div></div><button className="text-button">View all reward rules <ArrowUpRight size={15} /></button></section></div></>;
}

function ImpactPage() {
  return <><PageHeading eyebrow="IMPACT · VERIFIED PILOT DATA" title="Measure what moves" description="A clear view of recovery, transfer, and the places where activity is building." action={<button className="button button-secondary"><Filter size={16} /> This month <ChevronDown size={14} /></button>} /><div className="impact-kpis"><div className="impact-kpi primary"><div className="kpi-top"><span>Verified material recovered</span><TrendingUp size={17} /></div><strong>24.8 <small>kg</small></strong><div className="kpi-foot"><span>↑ 8.2% from last month</span><div className="mini-bars"><i /><i /><i /><i /><i /><i /></div></div></div><div className="impact-kpi"><div className="kpi-top"><span>Active collectors</span><Users size={17} /></div><strong>38</strong><div className="kpi-foot"><span>12 repeat participants</span></div></div><div className="impact-kpi"><div className="kpi-top"><span>Transferred to partners</span><PackageCheck size={17} /></div><strong>18.4 <small>kg</small></strong><div className="kpi-foot"><span>74% of verified material</span></div></div><div className="impact-kpi"><div className="kpi-top"><span>Rewarded through BlueBank</span><Coins size={17} /></div><strong>1,284</strong><div className="kpi-foot"><span>Credits issued in pilot</span></div></div></div><div className="impact-grid"><section className="panel chart-panel"><div className="section-heading"><div><span className="card-kicker">RECOVERY TREND</span><h2>Verified material over time</h2></div><span className="chart-legend"><i /> Kilograms</span></div><div className="chart-wrap"><div className="y-axis"><span>8kg</span><span>6kg</span><span>4kg</span><span>2kg</span><span>0</span></div><div className="chart-area"><div className="chart-lines"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 700 230" preserveAspectRatio="none" role="img" aria-label="Verified recovery trend chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3BA9D8" stopOpacity=".28" /><stop offset="100%" stopColor="#3BA9D8" stopOpacity="0" /></linearGradient></defs><path d="M0 193 C31 185 50 158 74 169 S116 160 142 174 S171 154 202 140 S240 154 268 130 S303 109 329 130 S370 105 399 109 S433 80 461 91 S489 107 523 72 S566 85 585 49 S625 62 650 36 S683 46 700 20 L700 230 L0 230Z" fill="url(#chartFill)" /><path d="M0 193 C31 185 50 158 74 169 S116 160 142 174 S171 154 202 140 S240 154 268 130 S303 109 329 130 S370 105 399 109 S433 80 461 91 S489 107 523 72 S566 85 585 49 S625 62 650 36 S683 46 700 20" fill="none" stroke="#168AC0" strokeWidth="3" strokeLinecap="round" /></svg><div className="x-axis"><span>Aug 01</span><span>Aug 08</span><span>Aug 15</span><span>Aug 22</span><span>Aug 28</span></div></div></div></section><section className="panel material-panel"><div className="section-heading"><div><span className="card-kicker">MATERIAL MIX</span><h2>What’s being recovered</h2></div><MoreHorizontal size={17} className="muted-icon" /></div><div className="donut-wrap"><div className="donut"><div><strong>24.8</strong><span>total kg</span></div></div><div className="donut-legend"><span><i className="dot-blue" />PET bottles <strong>42%</strong></span><span><i className="dot-purple" />HDPE <strong>25%</strong></span><span><i className="dot-teal" />Aluminum <strong>18%</strong></span><span><i className="dot-amber" />Other <strong>15%</strong></span></div></div></section></div><div className="content-grid impact-bottom"><MapPanel onViewPoints={() => undefined} /><section className="panel milestones-panel"><div className="section-heading"><div><span className="card-kicker">RECOVERY PIPELINE</span><h2>Material movement</h2></div></div><div className="milestone"><div className="milestone-icon blue"><Recycle size={16} /></div><div><strong>Recovered</strong><span>Material recorded at collection points</span></div><strong>24.8 kg</strong></div><div className="milestone"><div className="milestone-icon teal"><ShieldCheck size={16} /></div><div><strong>Verified</strong><span>Confirmed by authorized operators</span></div><strong>24.8 kg</strong></div><div className="milestone"><div className="milestone-icon purple"><PackageCheck size={16} /></div><div><strong>Transferred</strong><span>Sent to recycling partners</span></div><strong>18.4 kg</strong></div><div className="milestone muted-milestone"><div className="milestone-icon gray"><Recycle size={16} /></div><div><strong>Received</strong><span>Partner receipt data pending</span></div><strong>—</strong></div><div className="pipeline-note"><Info size={15} /> BlueLoop only reports recycling outcomes when a partner confirms receipt.</div></section></div></>;
}

function AdminPage() {
  return <><PageHeading eyebrow="ADMINISTRATION · PILOT CONTROL" title="Keep the network trustworthy" description="Review operations, configure incentives, and protect the integrity of every record." action={<button className="button button-secondary"><Settings2 size={16} /> Platform settings</button>} /><div className="admin-summary"><div className="admin-banner"><div className="admin-banner-icon"><Gauge size={21} /></div><div><span>NETWORK STATUS</span><strong>Healthy and operational</strong><p>All 3 collection points are connected. No critical anomalies detected.</p></div><div className="admin-health"><span>99.9%</span><small>uptime</small></div></div></div><div className="admin-grid"><section className="panel admin-panel"><div className="section-heading"><div><span className="card-kicker">REVIEW QUEUE</span><h2>Needs attention</h2></div><span className="queue-count">3 open</span></div><div className="review-list"><div className="review-row"><div className="review-icon amber"><ClipboardCheck size={16} /></div><div><strong>1 collection awaiting verification</strong><span>BL-240731 · Fishing plastics · 3.1 kg</span></div><button className="small-button">Review <ChevronRight size={14} /></button></div><div className="review-row"><div className="review-icon blue"><MapPin size={16} /></div><div><strong>Collection point application</strong><span>New point submitted · 2 days ago</span></div><button className="small-button">Review <ChevronRight size={14} /></button></div><div className="review-row"><div className="review-icon purple"><ShieldCheck size={16} /></div><div><strong>Unusual activity detected</strong><span>Operator activity above weekly average</span></div><button className="small-button">Review <ChevronRight size={14} /></button></div></div></section><section className="panel admin-panel"><div className="section-heading"><div><span className="card-kicker">CONFIGURATION</span><h2>Platform controls</h2></div></div><div className="control-list"><button><div className="control-icon blue"><Coins size={16} /></div><div><strong>Reward rules</strong><span>4 active material rates</span></div><ChevronRight size={16} /></button><button><div className="control-icon teal"><Recycle size={16} /></div><div><strong>Waste categories</strong><span>8 configured categories</span></div><ChevronRight size={16} /></button><button><div className="control-icon purple"><Users size={16} /></div><div><strong>Users & roles</strong><span>42 registered participants</span></div><ChevronRight size={16} /></button><button><div className="control-icon amber"><FileCheck2 size={16} /></div><div><strong>Audit log</strong><span>All important actions recorded</span></div><ChevronRight size={16} /></button></div></section></div></>;
}

function CollectionModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (collection: Collection) => void }) {
  const [step, setStep] = useState(1);
  const [material, setMaterial] = useState(materialOptions[0]);
  const [weight, setWeight] = useState("");
  const reward = (Number(weight) || 0) * material.rate;
  const canContinue = step === 1 ? true : step === 2 ? !!weight && Number(weight) > 0 : true;

  const submit = () => onSubmit({ id: `BL-${Math.floor(100000 + Math.random() * 899999)}`, material: material.label, weight: `${Number(weight).toFixed(1)} kg`, reward, date: "Just now", point: "Eleko South Point", status: "Verified", icon: material.icon, tone: material.color });

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="collection-modal"><div className="modal-top"><div><span className="eyebrow blue-eyebrow">BLUEBANK TRANSACTION</span><h2>Record a collection</h2><p>Verify material at an approved collection point.</p></div><button className="icon-button" onClick={onClose} aria-label="Close collection form"><X size={18} /></button></div><div className="modal-steps"><span className={step >= 1 ? "active" : ""}><b>1</b> Participant</span><i /><span className={step >= 2 ? "active" : ""}><b>2</b> Material</span><i /><span className={step >= 3 ? "active" : ""}><b>3</b> Confirm</span></div>{step === 1 && <div className="modal-body"><label className="field-label">Select participant <span>Required</span></label><div className="participant-select"><div className="avatar avatar-coral">AO</div><div><strong>Amaka Okafor</strong><span>Participant ID · BL-0194</span></div><Check size={17} className="selected-check" /></div><div className="participant-select subdued"><div className="avatar avatar-blue">KB</div><div><strong>Kelechi Bello</strong><span>Participant ID · BL-0211</span></div></div><div className="field-hint"><Info size={14} /> Participant identity is recorded with every verified transaction.</div></div>}{step === 2 && <div className="modal-body"><label className="field-label">Material category <span>Required</span></label><div className="material-option-grid">{materialOptions.map((option) => { const Icon = option.icon; return <button key={option.label} className={`material-option ${material.label === option.label ? "selected" : ""}`} onClick={() => setMaterial(option)}><div className={`activity-icon ${option.color}`}><Icon size={17} /></div><span>{option.label}</span><small>{option.rate} credits / kg</small>{material.label === option.label && <div className="option-check"><Check size={12} /></div>}</button>; })}</div><label className="field-label weight-label">Verified weight <span>Required</span></label><div className="weight-input"><input type="number" inputMode="decimal" min="0" step="0.1" placeholder="0.0" value={weight} onChange={(event) => setWeight(event.target.value)} autoFocus /><strong>kg</strong></div><div className="field-hint"><Info size={14} /> Enter the weight confirmed by the collection-point operator.</div></div>}{step === 3 && <div className="modal-body confirmation-body"><div className="confirm-icon"><Check size={25} /></div><span className="eyebrow blue-eyebrow">READY TO VERIFY</span><h3>{Number(weight).toFixed(1)} kg {material.label}</h3><p>BlueBank reward for Amaka Okafor</p><div className="confirm-reward"><span>Calculated reward</span><strong>+{reward.toLocaleString()} <small>credits</small></strong></div><div className="confirm-meta"><span><MapPin size={14} /> Eleko South Point</span><span><ShieldCheck size={14} /> Operator verified</span></div></div>}<div className="modal-footer"><button className="button button-secondary" onClick={step === 1 ? onClose : () => setStep((current) => current - 1)}>{step === 1 ? "Cancel" : "Back"}</button><button className="button button-primary" disabled={!canContinue} onClick={step === 3 ? submit : () => setStep((current) => current + 1)}>{step === 3 ? <><ShieldCheck size={16} /> Confirm verification</> : <>Continue <ChevronRight size={16} /></>}</button></div></div></div>;
}

export default App;