import {
  AlertTriangle,
  ExternalLink,
  LocateFixed,
  MapPin,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Area = {
  id: string;
  label: string;
  mapHint: string; // used in map search queries
};

// Focus: British Columbia (Canada). This page is designed to be usable
// without API keys or special permissions.
const BC_AREAS: Area[] = [
  { id: "metro-vancouver", label: "Metro Vancouver (Vancouver, Burnaby, Richmond)", mapHint: "Vancouver BC" },
  { id: "surrey", label: "Surrey / Delta / Langley", mapHint: "Surrey BC" },
  { id: "victoria", label: "Greater Victoria", mapHint: "Victoria BC" },
  { id: "fraser-valley", label: "Fraser Valley (Abbotsford, Chilliwack)", mapHint: "Abbotsford BC" },
  { id: "kelowna", label: "Central Okanagan (Kelowna)", mapHint: "Kelowna BC" },
  { id: "kamloops", label: "Thompson-Nicola (Kamloops)", mapHint: "Kamloops BC" },
  { id: "nanaimo", label: "Mid-Island (Nanaimo)", mapHint: "Nanaimo BC" },
  { id: "prince-george", label: "Northern BC (Prince George)", mapHint: "Prince George BC" },
  { id: "other", label: "Other (British Columbia)", mapHint: "British Columbia" },
];

function buildMapsEmbedSrc(query: string) {
  // Works without an API key for basic embed search.
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function buildMapsOpenHref(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-3 text-sm">{children}</div>
    </div>
  );
}

function LinkRow({
  href,
  label,
  sub,
}: {
  href: string;
  label: string;
  sub?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="chip rounded-2xl p-4 flex items-start justify-between gap-3 hover:opacity-95"
    >
      <div>
        <div className="font-semibold">{label}</div>
        {sub ? <div className="mt-1 subtle text-xs">{sub}</div> : null}
      </div>
      <ExternalLink size={16} className="mt-0.5" />
    </a>
  );
}

export default function Emergency() {
  const navigate = useNavigate();
  const [areaId, setAreaId] = useState<string>("metro-vancouver");
  const [postalOrCity, setPostalOrCity] = useState<string>("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("");

  const area = useMemo(() => BC_AREAS.find((a) => a.id === areaId) ?? BC_AREAS[0], [areaId]);

  const mapQuery = useMemo(() => {
    if (geo) return `emergency shelter near ${geo.lat},${geo.lng}`;
    const cleaned = postalOrCity.trim();
    if (cleaned) return `emergency shelter near ${cleaned}, British Columbia, Canada`;
    return `emergency shelter near ${area.mapHint}, British Columbia, Canada`;
  }, [area.mapHint, geo, postalOrCity]);

  const embedSrc = useMemo(() => buildMapsEmbedSrc(mapQuery), [mapQuery]);
  const openHref = useMemo(() => buildMapsOpenHref(mapQuery), [mapQuery]);

  function requestGeo() {
    setGeoStatus("");
    if (!("geolocation" in navigator)) {
      setGeoStatus("Location is not supported in this browser.");
      return;
    }
    setGeoStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("Using your current location.");
      },
      (err) => {
        setGeo(null);
        setGeoStatus(err.message || "Could not access location.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 2 * 60 * 1000 }
    );
  }

  function clearGeo() {
    setGeo(null);
    setGeoStatus("");
  }

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 soft-border">
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
            <div>
              <div className="text-2xl font-semibold">Emergency</div>
              <div className="mt-1 text-sm subtle">
                If you think you’re being scammed, pressured, or you already paid — do these steps now.
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <a
              href="tel:911"
              className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 focus-ring"
              title="Call 911 (works on mobile)"
            >
              <PhoneCall size={16} />
              Call 911
            </a>
            <button
              type="button"
              onClick={() => navigate("/report")}
              className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 focus-ring"
            >
              <ExternalLink size={16} />
              Open report workflow
            </button>
          </div>
        </div>

        {/* Callout (fixes light-mode readability by using slate text) */}
        <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-slate-900">
          <div className="text-sm font-semibold">If you are in immediate danger, call 911.</div>
          <div className="mt-1 text-sm text-slate-700">
            If you’re safe right now but it’s urgent, contact your local police non-emergency line.
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
            <a
              href="tel:911"
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold bg-white soft-border focus-ring"
            >
              <PhoneCall size={16} />
              Call 911
            </a>
            <button
              type="button"
              onClick={() => navigate("/report")}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold bg-white soft-border focus-ring"
            >
              <ExternalLink size={16} />
              Open report workflow
            </button>
          </div>
        </div>
      </div>

      {/* Location + Map */}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Find shelters near you</div>
              <div className="mt-1 text-sm subtle">
                Choose your area (or use your current location). This opens a map search for nearby emergency shelters.
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs font-semibold subtle">Location (BC)</span>
              <select
                className="input focus-ring"
                value={areaId}
                onChange={(e) => {
                  setAreaId(e.target.value);
                  setGeo(null);
                }}
              >
                {BC_AREAS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-1">
              <span className="text-xs font-semibold subtle">Use my location</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={requestGeo}
                  className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 focus-ring"
                >
                  <LocateFixed size={16} />
                  Detect
                </button>
                <button
                  type="button"
                  onClick={clearGeo}
                  className="btn-secondary inline-flex items-center justify-center rounded-2xl px-3 py-2 focus-ring"
                  title="Clear"
                >
                  ✕
                </button>
              </div>
            </div>

            <label className="grid gap-1 md:col-span-3">
              <span className="text-xs font-semibold subtle">Optional: Postal code or city</span>
              <input
                value={postalOrCity}
                onChange={(e) => {
                  setPostalOrCity(e.target.value);
                  setGeo(null);
                }}
                className="input focus-ring"
                placeholder="e.g., V6B 1A1 or 'Burnaby'"
              />
              {geoStatus ? <div className="text-xs subtle mt-1">{geoStatus}</div> : null}
            </label>
          </div>

          <div className="mt-5 rounded-2xl overflow-hidden soft-border" style={{ background: "var(--sr-surface)" }}>
            <div className="aspect-[16/9]">
              <iframe
                title="Nearby shelters map"
                src={embedSrc}
                className="h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={openHref}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 focus-ring"
            >
              <MapPin size={16} />
              Open in Maps
            </a>

            <a
              href="https://smap.bchousing.org/"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 focus-ring"
            >
              <ExternalLink size={16} />
              BC Housing Shelter Map
            </a>

            <a
              href="https://bc.211.ca/shelter-lists/"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 focus-ring"
            >
              <ExternalLink size={16} />
              BC 211 Shelter List
            </a>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck size={18} />
              Do this in order
            </div>
            <div className="mt-2 text-sm subtle">
              Fast actions that improve your chance of stopping payment and documenting evidence.
            </div>

            <ol className="mt-4 grid gap-2 text-sm">
              {[
                "Stop payment: call your bank/credit card immediately (e-transfer, card, bank transfer, wire).",
                "Save evidence: screenshots of the listing, chats, receipts, email headers, and URLs with timestamps.",
                "File a report and get a case/file number (helps banks and platforms take action).",
                "Do not meet in person or share more documents until identity/ownership is verified.",
              ].map((x, i) => (
                <li key={i} className="chip rounded-2xl p-3">
                  <span className="font-semibold mr-2">{i + 1}.</span>
                  {x}
                </li>
              ))}
            </ol>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="text-lg font-semibold">Critical resource hub</div>
            <div className="mt-2 text-sm subtle">Free, confidential help (BC-wide). If you’re unsure where to start, start here.</div>
            <div className="mt-4 grid gap-2">
              <LinkRow
                href="https://bc.211.ca/"
                label="BC 211 (Dial or text 2-1-1)"
                sub="Help finding shelters, food, medical, legal, and other urgent supports."
              />
              <LinkRow
                href="https://victimlinkbc.ca/"
                label="VictimLinkBC (call/text 1-800-563-0808)"
                sub="24/7 support for victims of crime and trauma across BC and Yukon."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resources */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Immediate places to stay (tonight)">
          <div className="grid gap-2">
            <LinkRow
              href="https://bc.211.ca/shelter-lists/"
              label="BC 211 Shelter Lists"
              sub="Real-time-ish availability for some regions; call or text 2-1-1 for guidance."
            />
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/homelessness-services/emergency-shelter-program"
              label="BC Housing — Emergency Shelter Program"
              sub="How shelters work, eligibility, and what to expect."
            />
            <LinkRow
              href="https://smap.bchousing.org/"
              label="BC Housing Shelter Map"
              sub="Locate emergency shelters and Extreme Weather Response shelters across BC."
            />
          </div>
          <div className="mt-3 subtle text-xs">
            Tip: if beds are full, ask 2-1-1 about overflow spaces, warming centres, and drop-in centres.
          </div>
        </Section>

        <Section title="Women-only options">
          <div className="grid gap-2">
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/women-fleeing-violence/transition-houses-safe-homes"
              label="BC Housing — Transition Houses & Safe Homes"
              sub="Search a list of transition houses/safe homes in BC."
            />
            <LinkRow
              href="https://sheltersafe.ca/british-columbia/"
              label="ShelterSafe (BC)"
              sub="Map + directory for shelters and transition houses (women and children)."
            />
            <LinkRow
              href="https://victimlinkbc.ca/"
              label="VictimLinkBC"
              sub="Crisis support + referrals; call or text 1-800-563-0808."
            />
          </div>
        </Section>

        <Section title="Low-barrier shelters">
          <div className="grid gap-2">
            <LinkRow
              href="https://smap.bchousing.org/"
              label="BC Housing Shelter Map"
              sub="Use filters and call ahead when possible; policies can differ by site."
            />
            <LinkRow
              href="https://bc.211.ca/shelter-lists/"
              label="BC 211 Shelter Lists"
              sub="Ask 2-1-1 specifically for low-barrier and trans-inclusive options where available."
            />
          </div>
          <div className="mt-3 subtle text-xs">
            Note: “low-barrier” can mean different things by site (ID rules, sobriety rules, partners/pets, etc.).
          </div>
        </Section>

        <Section title="Safe “drop-in” spaces (daytime / short stays)">
          <div className="grid gap-2">
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/homelessness-services/drop-in-centres"
              label="BC Housing — Drop-in Centres"
              sub="Daytime spaces for meals, hygiene, laundry, and referrals."
            />
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/homelessness-services/find-homeless-outreach-worker"
              label="Find a Homeless Outreach Worker"
              sub="Connect with outreach support in your community."
            />
          </div>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Shelter options by need">
          <div className="grid gap-2">
            <div className="chip rounded-2xl p-4">
              <div className="font-semibold">Youth (Ages 16–24)</div>
              <div className="mt-1 subtle text-xs">Start with 2-1-1 and ask for youth beds / youth-specific shelters.</div>
              <a
                href="https://bc.211.ca/shelter-lists/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold"
              >
                Open Shelter Lists <ExternalLink size={14} />
              </a>
            </div>

            <div className="chip rounded-2xl p-4">
              <div className="font-semibold">Women and women-led families</div>
              <div className="mt-1 subtle text-xs">Transition houses/safe homes + ShelterSafe directory.</div>
              <div className="mt-3 grid gap-2">
                <a href="https://www.bchousing.org/housing-assistance/women-fleeing-violence/transition-houses-safe-homes" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold">
                  Transition houses <ExternalLink size={14} />
                </a>
                <a href="https://sheltersafe.ca/british-columbia/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold">
                  ShelterSafe (BC) <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="chip rounded-2xl p-4">
              <div className="font-semibold">All adults (low-barrier & trans-inclusive)</div>
              <div className="mt-1 subtle text-xs">Ask 2-1-1 to match you to the best-fit site and current availability.</div>
              <a href="https://bc.211.ca/contact-us/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">
                Contact 2-1-1 <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </Section>

        <Section title="Medium-term stays">
          <div className="grid gap-2">
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/housing-with-support/supportive-housing"
              label="Supportive Housing (BC Housing)"
              sub="Subsidized housing with on-site supports for people at risk of or experiencing homelessness."
            />
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/homelessness-services/homeless-prevention-program"
              label="Homeless Prevention Program"
              sub="Portable rent supplements + support services for some at-risk groups."
            />
          </div>
        </Section>

        <Section title="Long-term stays">
          <div className="grid gap-2">
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/rental-housing/subsidized-housing"
              label="Subsidized Housing (BC Housing)"
              sub="Program overview + application pathways."
            />
            <LinkRow
              href="https://www.bchousing.org/housing-assistance/rental-housing/housing-listings/housing-listings-pdfs"
              label="Housing Listings (PDF directories)"
              sub="Includes second-stage and long-term housing provider lists."
            />
          </div>
        </Section>
      </div>

      {/* Footer note */}
      <div className="glass rounded-2xl p-5">
        <div className="text-sm font-semibold">Important</div>
        <div className="mt-2 text-sm subtle">
          Shelter availability changes quickly. For the most accurate, real-time guidance, call or text 2-1-1.
          If you are in immediate danger, call 911.
        </div>
      </div>
    </div>
  );
}
