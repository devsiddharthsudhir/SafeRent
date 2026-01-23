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
 * Terms of Use — Canada-first
 * IMPORTANT: This is a strong, comprehensive template. Ensure it matches your actual product,
 * data handling, and vendors before launching commercially. Consider a Canadian lawyer review.
 */
export default function Terms() {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="text-2xl font-semibold">Terms of Use</div>
      <div className="mt-2 text-sm subtle">
        Last updated: <span className="font-semibold">{LAST_UPDATED}</span>
      </div>

      <div className="mt-3 text-sm subtle">
        These Terms of Use (“Terms”) form a legally binding agreement between you (“you”, “your”) and SafeRent
        (“SafeRent”, “we”, “us”, “our”) governing your access to and use of our website, browser extension,
        and related services (collectively, the “Service”).
        <br />
        <br />
        By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
        <div className="text-sm font-semibold">Operator & Contact</div>
        <div className="mt-1 text-sm text-slate-700">
          Email: <span className="font-mono">dev.siddharthsudhir@gmail.com</span>
          <br />
          Website: <span className="font-mono">saferent.siddharthsudhir.com</span>
        </div>
        <div className="mt-2 text-xs text-slate-600">
          Legal notices and privacy requests should be sent to the email above with a clear subject line.
        </div>
      </div>

      {/* Table of contents */}
      <div className="mt-6">
        <div className="text-sm font-semibold">Contents</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TocLink href="#overview" label="1. Overview" />
          <TocLink href="#eligibility" label="2. Eligibility" />
          <TocLink href="#accounts" label="3. Accounts" />
          <TocLink href="#service" label="4. Service" />
          <TocLink href="#ai" label="5. AI outputs & no reliance" />
          <TocLink href="#user-content" label="6. Your content" />
          <TocLink href="#acceptable-use" label="7. Acceptable use" />
          <TocLink href="#third-parties" label="8. Third-party services" />
          <TocLink href="#fees" label="9. Fees" />
          <TocLink href="#ip" label="10. IP & licence" />
          <TocLink href="#disclaimers" label="11. Disclaimers" />
          <TocLink href="#liability" label="12. Limitation of liability" />
          <TocLink href="#indemnity" label="13. Indemnity" />
          <TocLink href="#termination" label="14. Termination" />
          <TocLink href="#law" label="15. Governing law" />
          <TocLink href="#changes" label="16. Changes" />
          <TocLink href="#contact" label="17. Contact" />
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <Section id="overview" title="1) Overview and definitions">
          <div className="space-y-3">
            <div>
              <span className="font-semibold">Service.</span> SafeRent provides informational tools intended to help users
              assess rental listings and lease clauses by generating risk signals, explanations, summaries, and suggested
              next steps.
            </div>
            <div>
              <span className="font-semibold">“Content”</span> means text, images, documents, links, and other materials.
              <span className="font-semibold"> “Your Content”</span> means Content you submit, upload, paste, or otherwise
              provide to the Service.
            </div>
            <div className="text-xs">
              <span className="font-semibold">Emergency.</span> SafeRent is not an emergency service. If you are in
              immediate danger, call 911.
            </div>
          </div>
        </Section>

        <Section id="eligibility" title="2) Eligibility and authority">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              You must be of the age of majority in your province/territory to use the Service, or use it with the
              involvement and consent of a parent/guardian who agrees to these Terms.
            </li>
            <li>
              If you use the Service on behalf of an organization, you represent you have authority to bind that
              organization, and “you” includes that organization.
            </li>
          </ol>
        </Section>

        <Section id="accounts" title="3) Accounts and security">
          <div className="space-y-3">
            <div>
              Some features may require you to create an account or provide contact information. You agree to provide
              accurate information and keep it current.
            </div>
            <div>
              You are responsible for safeguarding your credentials and for all activity that occurs under your account.
              Notify us promptly if you suspect unauthorized access.
            </div>
          </div>
        </Section>

        <Section id="service" title="4) The Service (what we do and do not do)">
          <div className="space-y-3">
            <div>
              SafeRent analyzes inputs you provide (for example, listing URLs, pasted text, images, or lease files) and may
              return a risk score, flags, simplified summaries, and guidance.
            </div>
            <div>
              <span className="font-semibold">We do not:</span>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>verify identity, ownership, licensing status, or legal compliance of any person or listing;</li>
                <li>guarantee a listing is safe or unsafe;</li>
                <li>provide legal advice, financial advice, or law-enforcement services;</li>
                <li>guarantee availability of emergency shelters or services.</li>
              </ul>
            </div>
            <div className="text-xs">
              You are solely responsible for your housing decisions. Always independently verify ownership and do not send
              deposits before viewing and signing with appropriate checks.
            </div>
          </div>
        </Section>

        <Section id="ai" title="5) AI outputs, uncertainty, and no reliance">
          <div className="space-y-3">
            <div>
              The Service may use automated systems (including AI/ML models) to generate outputs. Outputs are generated
              based on patterns and may be incomplete, inaccurate, or outdated.
            </div>
            <div>
              <span className="font-semibold">No reliance.</span> To the maximum extent permitted by law, you agree you will
              not rely on the Service as the sole basis for making decisions, including decisions involving money, safety,
              housing, or legal rights. You should verify information independently and seek professional advice where
              appropriate.
            </div>
            <div>
              <span className="font-semibold">Human-in-the-loop.</span> Where available, you should use redundancy features
              (e.g., re-check with different inputs, cross-platform comparison) and treat outputs as signals, not facts.
            </div>
          </div>
        </Section>

        <Section id="user-content" title="6) Your Content (ownership, permissions, and licence to us)">
          <div className="space-y-3">
            <div>
              You retain ownership of Your Content as between you and SafeRent. However, you grant SafeRent a limited,
              worldwide, non-exclusive, royalty-free licence to host, store, reproduce, process, modify (for formatting),
              analyze, and display Your Content solely to provide, maintain, secure, and improve the Service, and to comply
              with law and enforce these Terms.
            </div>
            <div>
              You represent and warrant that:
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>you have the right to submit Your Content and to grant the licence above;</li>
                <li>Your Content does not violate applicable laws or third-party rights (privacy, copyright, etc.);</li>
                <li>
                  you will not upload highly sensitive identity documents (passport, SIN, bank statements) unless strictly
                  necessary and you accept the risks of doing so.
                </li>
              </ul>
            </div>
            <div className="text-xs">
              If you submit third-party personal information (e.g., a landlord’s phone number), you are responsible for
              ensuring you have a lawful basis to share it with us.
            </div>
          </div>
        </Section>

        <Section id="acceptable-use" title="7) Acceptable use (what you must not do)">
          <div className="space-y-3">
            <div>You agree not to, and not to assist others to:</div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>use the Service for unlawful, harmful, or fraudulent purposes;</li>
              <li>upload malware, attempt to probe, scan, or test the vulnerability of the Service;</li>
              <li>attempt to reverse engineer, copy, or exploit the Service except as permitted by law;</li>
              <li>scrape, harvest, or collect data from the Service at scale without our written consent;</li>
              <li>interfere with or disrupt the Service (including bypassing rate limits);</li>
              <li>submit content that is defamatory, harassing, hateful, or that violates others’ privacy rights;</li>
              <li>misrepresent yourself or impersonate another person or organization.</li>
            </ul>
            <div className="text-xs">
              We may suspend or terminate access if we reasonably believe your use violates these Terms or creates risk for
              the Service or others.
            </div>
          </div>
        </Section>

        <Section id="third-parties" title="8) Third-party services and links">
          <div className="space-y-3">
            <div>
              The Service may link to, integrate with, or embed third-party services (e.g., maps, listing platforms).
              Third-party services are governed by their own terms and privacy policies, and we are not responsible for
              them.
            </div>
            <div>
              If you choose to open external links (for example, emergency resources, map searches, or listing sites), you
              do so at your own risk.
            </div>
          </div>
        </Section>

        <Section id="fees" title="9) Fees, trials, and changes">
          <div className="space-y-3">
            <div>
              The Service may be offered free, paid, or as a beta. If we introduce paid features, we will present pricing
              and billing terms before you are charged.
            </div>
            <div>
              We may change, suspend, or discontinue features at any time. Where reasonable, we will provide notice for
              material changes, but you acknowledge the Service may evolve rapidly.
            </div>
          </div>
        </Section>

        <Section id="ip" title="10) Intellectual property and licence to you">
          <div className="space-y-3">
            <div>
              The Service, including its software, design, text, graphics, logos (excluding Your Content), and all related
              intellectual property, is owned by SafeRent or its licensors and protected by applicable laws.
            </div>
            <div>
              Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable licence to access
              and use the Service for your personal or internal business purposes.
            </div>
            <div className="text-xs">
              All rights not expressly granted are reserved. You may not use our branding without prior written consent.
            </div>
          </div>
        </Section>

        <Section id="disclaimers" title="11) Disclaimers (important)">
          <div className="space-y-3">
            <div>
              <span className="font-semibold">Service provided “as is”.</span> To the maximum extent permitted by law, the
              Service is provided on an “as is” and “as available” basis, without warranties of any kind, whether express,
              implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose,
              and non-infringement.
            </div>
            <div>
              We do not warrant that the Service will be uninterrupted, error-free, secure, or that outputs will be
              accurate or complete.
            </div>
            <div className="text-xs">
              Some jurisdictions do not allow the exclusion of certain warranties; in that case, exclusions apply only to
              the extent permitted.
            </div>
          </div>
        </Section>

        <Section id="liability" title="12) Limitation of liability">
          <div className="space-y-3">
            <div>
              To the maximum extent permitted by applicable law, SafeRent and its affiliates, founders, contractors, and
              service providers will not be liable for any indirect, incidental, special, consequential, or punitive
              damages, or for any loss of profits, revenues, data, goodwill, or business opportunities, arising out of or
              related to your use of (or inability to use) the Service.
            </div>
            <div>
              To the maximum extent permitted by law, SafeRent’s total aggregate liability for all claims arising out of or
              related to the Service will not exceed the greater of (a) CAD $100 and (b) the amounts you paid to SafeRent
              for the Service in the 3 months before the event giving rise to the claim.
            </div>
            <div className="text-xs">
              This limitation applies even if a remedy fails of its essential purpose, and even if we were advised of the
              possibility of such damages. Nothing in these Terms excludes liability that cannot be excluded under
              applicable law.
            </div>
          </div>
        </Section>

        <Section id="indemnity" title="13) Indemnity">
          <div className="space-y-2">
            <div>
              You agree to indemnify and hold harmless SafeRent and its affiliates, founders, contractors, and service
              providers from and against claims, liabilities, damages, losses, and expenses (including reasonable legal
              fees) arising out of or related to:
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Your Content, including any allegation it infringes rights or violates law;</li>
              <li>your misuse of the Service;</li>
              <li>your violation of these Terms.</li>
            </ul>
          </div>
        </Section>

        <Section id="termination" title="14) Suspension and termination">
          <div className="space-y-3">
            <div>
              We may suspend or terminate your access to the Service at any time if we reasonably believe you violated
              these Terms, or if necessary to protect the Service, users, or the public.
            </div>
            <div>
              You may stop using the Service at any time. Sections that by their nature should survive termination
              (including IP, disclaimers, limitation of liability, indemnity, and governing law) will survive.
            </div>
          </div>
        </Section>

        <Section id="law" title="15) Governing law and venue (Canada)">
          <div className="space-y-3">
            <div>
              These Terms are governed by the laws of the Province of British Columbia and the federal laws of Canada
              applicable therein, without regard to conflict of law principles.
            </div>
            <div>
              Except where prohibited by law, you agree that any dispute, claim, or proceeding arising out of or related to
              these Terms or the Service will be brought exclusively in the courts located in Vancouver, British Columbia,
              and you submit to the personal jurisdiction of those courts.
            </div>
            <div className="text-xs">
              If you are a consumer, you may have additional rights under applicable consumer protection laws that cannot
              be waived by contract; nothing in these Terms is intended to limit those rights where they apply.
            </div>
          </div>
        </Section>

        <Section id="changes" title="16) Changes to these Terms">
          <div className="space-y-2">
            <div>
              We may update these Terms from time to time. We will post the updated Terms and update the “Last updated”
              date. If changes are material, we may provide additional notice in the Service.
            </div>
            <div className="text-xs">
              Continued use of the Service after updated Terms take effect constitutes acceptance of the updated Terms.
            </div>
          </div>
        </Section>

        <Section id="contact" title="17) Contact">
          <div className="space-y-2">
            <div>
              For questions about these Terms, contact: <span className="font-mono">dev.siddharthsudhir@gmail.com</span>
            </div>
            <div>
              Service URL: <span className="font-mono">saferent.siddharthsudhir.com</span>
            </div>
            <div className="text-xs">
              If you’re reporting a security issue, include steps to reproduce and any relevant logs/screenshots.
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
