import React from "react";

const LAST_UPDATED = "2026-01-19";

function TocLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="chip rounded-2xl px-3 py-2 text-xs font-semibold hover:opacity-95 focus-ring inline-flex"
    >
      {label}
    </a>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="chip rounded-2xl p-5 scroll-mt-28">
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-3 text-sm leading-6 subtle">{children}</div>
    </section>
  );
}

/**
 * Privacy Policy — Canada-first (PIPEDA + provincial private-sector laws where applicable)
 * Notes:
 * - This page is written as a comprehensive privacy notice/contractual policy for a Canadian launch.
 * - You MUST ensure the statements match your actual backend + vendors before production.
 */
export default function Privacy() {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="text-2xl font-semibold">Privacy Policy</div>
      <div className="mt-2 text-sm subtle">
        Last updated: <span className="font-semibold">{LAST_UPDATED}</span>
      </div>

      <div className="mt-3 text-sm subtle">
        This Privacy Policy explains how SafeRent (“SafeRent”, “we”, “us”, “our”) collects, uses, discloses, and
        safeguards personal information when you use our website, browser extension, and related services
        (collectively, the “Service”). By using the Service, you acknowledge you have read this Policy.
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
        <div className="text-sm font-semibold">Contact (Privacy Officer)</div>
        <div className="mt-1 text-sm text-slate-700">
          Email: <span className="font-mono">dev.siddharthsudhir@gmail.com</span>
          <br />
          Website: <span className="font-mono">saferent.siddharthsudhir.com</span>
        </div>
        <div className="mt-2 text-xs text-slate-600">
          If you are requesting access, correction, or deletion, include enough detail for us to verify your request
          (and to locate the relevant records).
        </div>
      </div>

      {/* Table of contents */}
      <div className="mt-6">
        <div className="text-sm font-semibold">Contents</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TocLink href="#scope" label="1. Scope" />
          <TocLink href="#info-we-collect" label="2. What we collect" />
          <TocLink href="#how-we-use" label="3. How we use info" />
          <TocLink href="#consent" label="4. Consent & choices" />
          <TocLink href="#sharing" label="5. Sharing" />
          <TocLink href="#transfers" label="6. International transfers" />
          <TocLink href="#retention" label="7. Retention" />
          <TocLink href="#security" label="8. Safeguards" />
          <TocLink href="#ai" label="9. AI & automated decisions" />
          <TocLink href="#third-parties" label="10. Third-party services" />
          <TocLink href="#rights" label="11. Your rights" />
          <TocLink href="#children" label="12. Children" />
          <TocLink href="#changes" label="13. Changes" />
          <TocLink href="#contact" label="14. Contact" />
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <Section id="scope" title="1) Scope and applicable law (Canada)">
          <div>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                This Policy is designed for a Canada-first launch. Our handling of personal information is intended to
                align with the federal Personal Information Protection and Electronic Documents Act (“PIPEDA”) and, where
                applicable, substantially similar provincial private-sector privacy laws (for example, in British Columbia
                and Alberta) and Quebec privacy requirements.
              </li>
              <li>
                “Personal information” generally means information about an identifiable individual (for example: your
                email address, IP address, or a document you upload that contains your name). Some information you submit
                may be about third parties (for example, a landlord’s phone number shown in a listing). You are responsible
                for ensuring you have the right to share that information with us.
              </li>
              <li>
                This Policy applies to the Service only. It does not apply to third-party websites or platforms you visit
                (for example, a listing site). Those services have their own privacy practices.
              </li>
            </ol>
          </div>
        </Section>

        <Section id="info-we-collect" title="2) Personal information we collect">
          <div className="space-y-3">
            <div>
              <div className="font-semibold">2.1 Information you provide (you choose what to submit)</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <span className="font-semibold">Listing inputs:</span> listing URL(s), title/description text you paste,
                  and any notes you add.
                </li>
                <li>
                  <span className="font-semibold">Files you upload:</span> photos and/or lease documents you submit for
                  analysis. These may contain personal information if you upload documents with names, signatures, email
                  addresses, phone numbers, addresses, or bank details.
                </li>
                <li>
                  <span className="font-semibold">Feedback labels:</span> signals you optionally provide (for example:
                  “scam”, “predatory terms”, “not sure”) to improve accuracy.
                </li>
                <li>
                  <span className="font-semibold">Report workflow:</span> information you type into any reporting forms,
                  including your contact details if you choose to provide them.
                </li>
              </ul>
              <div className="mt-2 text-xs">
                <span className="font-semibold">Do not upload sensitive identity documents</span> (passport, driver’s
                licence, SIN, bank statements). If you upload them anyway, you consent to our processing of that content
                for the purposes in this Policy.
              </div>
            </div>

            <div>
              <div className="font-semibold">2.2 Information collected automatically (for security and reliability)</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <span className="font-semibold">Log and device data:</span> IP address, timestamps, request metadata,
                  browser type, approximate region (derived from IP), and diagnostic events used for fraud prevention,
                  abuse detection, and service reliability.
                </li>
                <li>
                  <span className="font-semibold">Usage data:</span> pages viewed and feature interactions (for example,
                  which tools you run) in aggregate to understand performance and improve UX. Where feasible, we minimize
                  identifiers and prefer aggregated/anonymous metrics.
                </li>
                <li>
                  <span className="font-semibold">Local storage:</span> settings stored in your browser (for example, theme
                  preference). This stays on your device unless you clear browser data.
                </li>
              </ul>
            </div>

            <div>
              <div className="font-semibold">2.3 Location data (Emergency page)</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  If you choose “Use my location”, your browser may share approximate coordinates. We use this only to
                  render a nearby shelter map search. We do not require location to use the Service.
                </li>
                <li>
                  Unless explicitly stated in-product, we do not intentionally store precise device geolocation. Third-party
                  map providers may receive information via their embedded tools (see Section 10).
                </li>
              </ul>
            </div>

            <div>
              <div className="font-semibold">2.4 Browser extension data</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  When you activate analysis from the extension, the extension may extract the listing content you are
                  viewing (for example, the listing title, description, price, and image URLs) and send it to our Service
                  to produce a risk assessment. We do not need your browsing history; the extension processes only the page
                  you choose to analyze.
                </li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="how-we-use" title="3) How we use personal information (purposes)">
          <div>
            We use personal information only for purposes that a reasonable person would consider appropriate in the
            circumstances, including:
            <ol className="mt-3 list-decimal pl-5 space-y-2">
              <li>
                <span className="font-semibold">Provide the Service:</span> generate risk signals, explanations, and
                summaries for listings and leases you submit.
              </li>
              <li>
                <span className="font-semibold">Improve accuracy and safety:</span> quality evaluation, debugging, and
                model/heuristic improvements using aggregated patterns and optional user feedback.
              </li>
              <li>
                <span className="font-semibold">Security and abuse prevention:</span> rate limiting, fraud detection,
                defending against bots, and investigating misuse.
              </li>
              <li>
                <span className="font-semibold">Customer support:</span> respond to inquiries and handle privacy requests.
              </li>
              <li>
                <span className="font-semibold">Legal and compliance:</span> meet legal obligations, enforce our Terms, and
                maintain records where required.
              </li>
            </ol>
            <div className="mt-3 text-xs">
              We do not sell personal information. We do not use your uploaded documents to advertise third-party products.
            </div>
          </div>
        </Section>

        <Section id="consent" title="4) Consent, choices, and withdrawing consent">
          <div className="space-y-3">
            <div>
              <div className="font-semibold">4.1 Consent</div>
              <div className="mt-1">
                We generally rely on your consent to collect, use, and disclose personal information for the purposes
                described above. By submitting content (text, URLs, images, or documents) you consent to its processing for
                those purposes.
              </div>
            </div>

            <div>
              <div className="font-semibold">4.2 Optional fields and minimization</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>You can run many checks without uploading photos or leases.</li>
                <li>You can choose not to provide feedback labels.</li>
                <li>You can avoid including personal identifiers in free-text fields.</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold">4.3 Withdrawing consent</div>
              <div className="mt-1">
                You may withdraw consent (subject to legal/contractual restrictions) by contacting us at{" "}
                <span className="font-mono">dev.siddharthsudhir@gmail.com</span>. Withdrawing consent may mean we cannot
                provide some features (for example, we cannot analyze a lease if you do not provide it). We will explain
                the likely consequences when you make the request.
              </div>
            </div>
          </div>
        </Section>

        <Section id="sharing" title="5) When we share personal information">
          <div className="space-y-3">
            <div>
              We may disclose personal information in the following limited situations:
              <ol className="mt-3 list-decimal pl-5 space-y-2">
                <li>
                  <span className="font-semibold">Service providers (processors):</span> hosting, storage, analytics,
                  logging, security tooling, and AI processing providers who help us operate the Service. They may access
                  personal information only to perform services on our behalf, under contractual confidentiality and
                  security obligations.
                </li>
                <li>
                  <span className="font-semibold">Legal requirements:</span> if required to comply with applicable law,
                  regulation, subpoena, court order, or other lawful request.
                </li>
                <li>
                  <span className="font-semibold">Safety and integrity:</span> to detect, prevent, or investigate fraud,
                  abuse, security incidents, or technical issues; or to protect rights, property, and safety of users, the
                  public, and the Service.
                </li>
                <li>
                  <span className="font-semibold">Business changes:</span> if we are involved in a merger, acquisition,
                  financing, or sale of assets, information may be transferred as part of that transaction, subject to
                  appropriate safeguards.
                </li>
              </ol>
            </div>
            <div className="text-xs">
              If you use the Report workflow, you may choose to share evidence with third parties (for example, platforms,
              banks, or law enforcement). That sharing is controlled by you.
            </div>
          </div>
        </Section>

        <Section id="transfers" title="6) Storage and international transfers">
          <div className="space-y-2">
            <div>
              We may store and process information in Canada and/or other jurisdictions depending on our service providers
              and infrastructure. If information is processed outside your province or outside Canada, it may be subject to
              the laws of that jurisdiction, including lawful access requests by courts or governments.
            </div>
            <div className="text-xs">
              We take steps intended to ensure comparable protection through contracts and safeguards when using
              cross-border service providers.
            </div>
          </div>
        </Section>

        <Section id="retention" title="7) Retention (how long we keep information)">
          <div className="space-y-2">
            <div>
              We retain personal information only as long as necessary for the purposes described in this Policy, including
              providing the Service, improving accuracy, preventing abuse, and meeting legal obligations.
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <span className="font-semibold">Operational logs</span> are retained for a limited period to maintain
                security and reliability.
              </li>
              <li>
                <span className="font-semibold">Uploaded content</span> (images/leases) may be retained to support your
                analysis history and quality evaluation, unless you request deletion (and unless retention is required for
                legal or security reasons).
              </li>
            </ul>
            <div className="text-xs">
              If you want deletion, see Section 11. Some records may be retained in backups for a limited time and removed
              in accordance with our backup cycle.
            </div>
          </div>
        </Section>

        <Section id="security" title="8) Safeguards (how we protect information)">
          <div className="space-y-2">
            <div>
              We use reasonable administrative, technical, and physical safeguards designed to protect personal information
              against loss, theft, unauthorized access, disclosure, copying, use, or modification. Safeguards may include:
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Encryption in transit (TLS) and, where appropriate, encryption at rest.</li>
              <li>Access controls, least-privilege, and audit logging for privileged actions.</li>
              <li>Rate limiting and abuse prevention controls.</li>
              <li>Monitoring and incident response procedures.</li>
            </ul>
            <div className="text-xs">
              No method of transmission or storage is 100% secure. If we become aware of a breach that poses a real risk of
              significant harm, we will take steps required by applicable law, which may include notifying affected users
              and regulators.
            </div>
          </div>
        </Section>

        <Section id="ai" title="9) AI processing and automated risk scoring">
          <div className="space-y-3">
            <div>
              SafeRent may use automated systems (including machine learning/AI models) to generate a risk score and explain
              potential scam or predatory signals. The output is informational and may be incorrect. It does not verify
              ownership, identity, legal compliance, or intent.
            </div>
            <div>
              <div className="font-semibold">9.1 What AI sees</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Text you provide (listing description, lease text, messages you paste).</li>
                <li>Images you upload (or image URLs from a listing page you choose to analyze).</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold">9.2 Human review</div>
              <div className="mt-1">
                We may review a small subset of inputs and outputs for quality assurance, safety, and debugging, under
                access controls and confidentiality. We aim to minimize exposure of personal information during review.
              </div>
            </div>
            <div className="text-xs">
              If you do not want your content used for quality improvement, contact us and request an “opt-out of training”
              for your submissions (subject to technical feasibility and legal requirements).
            </div>
          </div>
        </Section>

        <Section id="third-parties" title="10) Third-party services, maps, and external links">
          <div className="space-y-3">
            <div>
              The Service may include embedded tools or links operated by third parties (for example, map embeds and links
              to emergency resources). When you interact with those tools, the third party may collect information under
              its own privacy practices.
            </div>

            <div>
              <div className="font-semibold">10.1 Maps</div>
              <div className="mt-1">
                The Emergency page may embed a map and/or open external map search results. Map providers can collect
                device/browser identifiers and usage data. If you do not want that, avoid loading the map embed and use
                non-map resource lists (for example, 2-1-1).
              </div>
            </div>

            <div>
              <div className="font-semibold">10.2 Listing platforms</div>
              <div className="mt-1">
                If you paste a listing URL or analyze a listing page via the extension, the listing content originates from
                a third-party platform. We do not control how those platforms collect or use your data.
              </div>
            </div>
          </div>
        </Section>

        <Section id="rights" title="11) Your rights and how to make requests">
          <div className="space-y-3">
            <div>
              Depending on where you live and which laws apply, you may have rights to access, correct, and withdraw consent
              for personal information we hold about you.
            </div>

            <div>
              <div className="font-semibold">11.1 Access and correction</div>
              <div className="mt-1">
                You can request access to personal information we hold about you and request corrections if it is
                inaccurate. Email{" "}
                <span className="font-mono">dev.siddharthsudhir@gmail.com</span> with the subject line “Privacy Request”.
              </div>
            </div>

            <div>
              <div className="font-semibold">11.2 Deletion</div>
              <div className="mt-1">
                You can request deletion of content you submitted (for example, an uploaded lease). We will delete it unless
                we need to retain it for legal, security, or operational reasons (for example, to investigate abuse or
                comply with record-keeping requirements). We will explain if an exception applies.
              </div>
            </div>

            <div>
              <div className="font-semibold">11.3 Complaints</div>
              <div className="mt-1">
                If you have a concern, contact our Privacy Officer first. You may also have the right to complain to a
                relevant privacy regulator in Canada (federal or provincial), depending on your circumstances.
              </div>
            </div>

            <div className="text-xs">
              We may need to verify your identity before fulfilling a request. We will not ask for sensitive ID unless it is
              necessary and proportionate.
            </div>
          </div>
        </Section>

        <Section id="children" title="12) Children’s privacy">
          <div className="space-y-2">
            <div>
              The Service is not intended for children. If you are under the age of majority in your province/territory, do
              not use the Service without a parent/guardian’s involvement.
            </div>
            <div className="text-xs">
              If you believe a child provided personal information to us, contact{" "}
              <span className="font-mono">dev.siddharthsudhir@gmail.com</span> and we will take appropriate steps.
            </div>
          </div>
        </Section>

        <Section id="changes" title="13) Changes to this Policy">
          <div className="space-y-2">
            <div>
              We may update this Policy from time to time. We will post the updated version on this page and revise the “Last
              updated” date. If changes are material, we may provide additional notice in the Service.
            </div>
          </div>
        </Section>

        <Section id="contact" title="14) Contact">
          <div className="space-y-2">
            <div>
              Privacy Officer: <span className="font-mono">dev.siddharthsudhir@gmail.com</span>
            </div>
            <div>
              Service: <span className="font-mono">saferent.siddharthsudhir.com</span>
            </div>
            <div className="text-xs">
              For faster handling, include: (1) what you want (access/correction/deletion), (2) the email you used (if any),
              and (3) URLs or timestamps related to your submission.
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
