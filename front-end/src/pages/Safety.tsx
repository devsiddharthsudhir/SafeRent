import React from "react";
import { ShieldCheck, CreditCard, Home, UserCheck, ScanSearch } from "lucide-react";

const tips = [
  { icon: Home, title: "Verify the unit first", text: "Do an in-person viewing when possible. If remote, request a verified video tour and confirm the unit address." },
  { icon: UserCheck, title: "Verify the landlord or agent", text: "Confirm they are authorized to rent the unit. Be cautious if they push you off-platform or avoid basic questions." },
  { icon: CreditCard, title: "Pay only after verification", text: "Avoid wire transfers, gift cards, and urgent e-transfer requests. Use traceable payments after a written lease is agreed." },
  { icon: ScanSearch, title: "Search the photos and address", text: "Reverse-image search photos and check the address online. Reused photos and mismatched details are red flags." },
  { icon: ShieldCheck, title: "Protect your identity", text: "Do not share your SIN, passport, or banking documents with unverified contacts. Share sensitive documents only when necessary and secure." },
];

export default function Safety() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="glass rounded-2xl p-6">
        <div className="text-2xl font-semibold">Safety tips for newcomers</div>
        <div className="mt-2 text-sm subtle">Use this checklist before you pay or share documents.</div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {tips.map((t, i) => (
            <div key={i} className="chip rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 soft-border">
                  <t.icon size={18} />
                </div>
                <div className="font-semibold">{t.title}</div>
              </div>
              <div className="mt-2 text-sm subtle">{t.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass rounded-2xl p-5">
          <div className="text-lg font-semibold">Quick red flags</div>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              "Deposit or fee before viewing",
              "Asks for SIN or ID early",
              "Price far below similar rentals",
              "Wire transfer, gift cards, or urgent e-transfer",
              "Refuses to share lease terms in writing",
              "Pressure tactics (today only, move in tomorrow)"
            ].map((x, i) => (
              <li key={i} className="chip rounded-xl p-3">{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
